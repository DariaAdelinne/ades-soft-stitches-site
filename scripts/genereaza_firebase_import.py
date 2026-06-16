#!/usr/bin/env python3
import json
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
CATALOG = ROOT / "continut" / "resurse" / "catalog-produse.json"
OUTPUT = ROOT / "continut" / "resurse" / "firebase-import.json"


def indexeaza_dupa_id(lista):
    rezultat = {}
    for item in lista:
        item_id = str(item.get("id", "")).strip()
        if item_id:
            rezultat[item_id] = item
    return rezultat


def main():
    with CATALOG.open("r", encoding="utf-8") as f:
        catalog = json.load(f)

    firebase_data = {
        "colectii": indexeaza_dupa_id(catalog.get("colectii", [])),
        "produse": indexeaza_dupa_id(catalog.get("produse", [])),
    }

    with OUTPUT.open("w", encoding="utf-8") as f:
        json.dump(firebase_data, f, ensure_ascii=False, indent=2)
        f.write("\n")

    print(f"Firebase import generat: {OUTPUT}")
    print(f"Colectii: {len(firebase_data['colectii'])}")
    print(f"Produse: {len(firebase_data['produse'])}")


if __name__ == "__main__":
    main()
