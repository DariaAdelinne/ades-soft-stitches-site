#!/usr/bin/env python3
import json
import re
import unicodedata
from pathlib import Path
from urllib.parse import quote, urlparse


ROOT = Path(__file__).resolve().parents[1]
PRODUSE_DIR = ROOT / "continut" / "imagini" / "produse"
OUTPUT = ROOT / "continut" / "resurse" / "catalog-produse.json"
EXTENSII_IMAGINI = {".jpg", ".jpeg", ".png", ".webp", ".gif"}


def slugify(text):
    text = str(text).strip().replace("_", "-")
    text = re.sub(r"\s+", "-", text)
    normalized = unicodedata.normalize("NFKD", text)
    ascii_text = normalized.encode("ascii", "ignore").decode("ascii")
    ascii_text = ascii_text.lower()
    ascii_text = re.sub(r"[^a-z0-9-]+", "-", ascii_text)
    ascii_text = re.sub(r"-+", "-", ascii_text).strip("-")
    return ascii_text or "produs"


def nume_din_folder(nume_folder):
    text = re.sub(r"[_-]+", " ", nume_folder).strip()
    text = re.sub(r"\s+", " ", text)
    if not text:
        return "Produs"
    return text[0].upper() + text[1:]


def cheie_sortare_naturala(path):
    parti = re.split(r"(\d+)", path.name.lower())
    return [int(parte) if parte.isdigit() else parte for parte in parti]


def este_fisier_ignorat(path):
    return path.name.startswith(".") or not path.is_file()


def imagini_din_produs(folder_produs):
    imagini = []
    for path in folder_produs.iterdir():
        if este_fisier_ignorat(path):
            continue
        if path.suffix.lower() in EXTENSII_IMAGINI:
            imagini.append(path)
    return sorted(imagini, key=cheie_sortare_naturala)


def este_url_public(text):
    parsed = urlparse(str(text).strip())
    return parsed.scheme in {"http", "https"} and bool(parsed.netloc)


def imagini_remote_din_metadata(metadata):
    imagini = metadata.get("imagini", [])
    if isinstance(imagini, str):
        imagini = [imagini]
    if not isinstance(imagini, list):
        return []
    return [str(imagine).strip() for imagine in imagini if este_url_public(imagine)]


def cale_web(path):
    return "/".join(quote(parte) for parte in path.relative_to(ROOT / "continut").parts)


def citeste_json(path, avertismente):
    if not path.exists():
        return {}
    try:
        with path.open("r", encoding="utf-8") as f:
            data = json.load(f)
        if not isinstance(data, dict):
            avertismente.append(f"{path}: JSON-ul trebuie să conțină un obiect.")
            return {}
        return data
    except json.JSONDecodeError as exc:
        avertismente.append(f"{path}: JSON invalid ({exc}). Folosesc valori implicite.")
        return {}
    except OSError as exc:
        avertismente.append(f"{path}: nu poate fi citit ({exc}). Folosesc valori implicite.")
        return {}


def produs_din_folder(folder_categorie, folder_produs, id_categorie, avertismente, ignorate):
    metadata = citeste_json(folder_produs / "metadata.json", avertismente)

    if metadata.get("ascuns") is True:
        ignorate.append((folder_produs, "ascuns=true"))
        return None

    imagini_remote = imagini_remote_din_metadata(metadata)
    imagini_locale = [] if imagini_remote else imagini_din_produs(folder_produs)
    if not imagini_remote and not imagini_locale:
        ignorate.append((folder_produs, "nu conține imagini valide sau linkuri publice în metadata.imagini"))
        return None

    nume_folder = folder_produs.name
    nume = metadata.get("nume") or nume_din_folder(nume_folder)
    pret = metadata.get("pret") or "Preț la cerere"
    descriere = metadata.get("descriere") or "Produs handmade croșetat."
    specificatii = metadata.get("specificatii") if isinstance(metadata.get("specificatii"), dict) else {}
    filtre = metadata.get("filtre", [])
    if isinstance(filtre, str):
        filtre = [filtre]
    elif not isinstance(filtre, list):
        filtre = []

    produs = {
        "id": slugify(nume_folder),
        "colectie": id_categorie,
        "nume": str(nume),
        "pret": str(pret),
        "descriere": str(descriere),
        "filtre": [str(filtru) for filtru in filtre if str(filtru).strip()],
        "specificatii": {str(k): str(v) for k, v in specificatii.items()},
        "imagini": imagini_remote + [cale_web(path) for path in imagini_locale],
    }

    if isinstance(metadata.get("ordine"), int):
        produs["ordine"] = metadata["ordine"]

    return produs


def prima_imagine_din_categorie(folder_categorie, produse_categorie, categorie_meta):
    folder_reprezentativ = categorie_meta.get("imagine")
    if folder_reprezentativ and este_url_public(folder_reprezentativ):
        return str(folder_reprezentativ).strip()

    if folder_reprezentativ:
        imagini = imagini_din_produs(folder_categorie / str(folder_reprezentativ))
        if imagini:
            return cale_web(imagini[0])

    if produse_categorie:
        return produse_categorie[0]["imagini"][0]

    return ""


def fa_id_uri_unice(produse, avertismente):
    aparitii = {}

    for produs in produse:
        id_initial = produs["id"]
        aparitii[id_initial] = aparitii.get(id_initial, 0) + 1
        if aparitii[id_initial] > 1:
            produs["id"] = f"{id_initial}-{aparitii[id_initial]}"
            avertismente.append(
                f"ID duplicat rezolvat: {id_initial} -> {produs['id']} pentru {produs['nume']}"
            )


def genereaza_catalog():
    avertismente = []
    ignorate = []
    colectii = []
    produse = []

    if not PRODUSE_DIR.exists():
        avertismente.append(f"Folderul de produse nu există: {PRODUSE_DIR}")
    else:
        foldere_categorii = sorted(
            [path for path in PRODUSE_DIR.iterdir() if path.is_dir() and not path.name.startswith(".")],
            key=lambda path: slugify(path.name),
        )

        for folder_categorie in foldere_categorii:
            id_categorie = slugify(folder_categorie.name)
            meta_categorie = citeste_json(folder_categorie / "categorie.json", avertismente)
            nume_categorie = meta_categorie.get("nume") or nume_din_folder(folder_categorie.name)
            descriere = meta_categorie.get("descriere") or ""

            produse_categorie = []
            foldere_produse = sorted(
                [path for path in folder_categorie.iterdir() if path.is_dir() and not path.name.startswith(".")],
                key=lambda path: slugify(path.name),
            )

            for folder_produs in foldere_produse:
                produs = produs_din_folder(folder_categorie, folder_produs, id_categorie, avertismente, ignorate)
                if produs:
                    produse_categorie.append(produs)

            produse_categorie.sort(key=lambda produs: (produs.get("ordine", 10**9), produs["nume"].lower()))
            colectii.append({
                "id": id_categorie,
                "nume": str(nume_categorie),
                "descriere": str(descriere),
                "imagine": prima_imagine_din_categorie(folder_categorie, produse_categorie, meta_categorie),
            })
            produse.extend(produse_categorie)

    fa_id_uri_unice(produse, avertismente)

    catalog = {
        "colectii": colectii,
        "produse": produse,
    }

    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    with OUTPUT.open("w", encoding="utf-8") as f:
        json.dump(catalog, f, ensure_ascii=False, indent=2)
        f.write("\n")

    print("Catalog generat.")
    print(f"Categorii găsite: {len(colectii)}")
    print(f"Produse valide: {len(produse)}")

    if ignorate:
        print("Produse ignorate:")
        for path, motiv in ignorate:
            print(f"  - {path.relative_to(ROOT)}: {motiv}")
    else:
        print("Produse ignorate: 0")

    if avertismente:
        print("Avertismente:")
        for avertisment in avertismente:
            print(f"  - {avertisment}")

    print(f"Fișier generat: {OUTPUT}")


if __name__ == "__main__":
    genereaza_catalog()
