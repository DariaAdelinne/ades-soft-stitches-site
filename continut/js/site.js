const OWNER_EMAIL = "ades.soft.stitches@gmail.com";
const PRODUSE_PE_PAGINA = 12;

let colectii = [];
let produse = [];
let catalogIncarcat = false;
let eroareCatalog = "";
let paginaCurenta = "";
let indexGalerie = 0;
let produsCurent = null;
let colectieCurenta = "";
let filtruCurent = "toate";
let numarProduseVizibile = PRODUSE_PE_PAGINA;

document.addEventListener("DOMContentLoaded", async () => {
    document.querySelectorAll("[data-page]").forEach((buton) => {
        buton.addEventListener("click", () => schimbaPagina(buton.dataset.page));
    });

    window.addEventListener("popstate", () => incarcaDinUrl());
    pozitioneazaFlori();

    try {
        await incarcaCatalog();
    } catch (error) {
        eroareCatalog = error.message || "Catalogul nu a putut fi încărcat.";
        console.warn(eroareCatalog);
    }

    incarcaDinUrl();
});

async function incarcaCatalog() {
    const catalogUrl = await citesteCatalogUrl();
    const raspuns = await fetch(catalogUrl);
    if (!raspuns.ok) {
        throw new Error("Catalogul de produse nu a putut fi încărcat. Rulează generatorul: ./genereaza_catalog.sh");
    }

    const catalog = normalizeazaCatalog(await raspuns.json());
    produse = sorteazaProduse(Array.isArray(catalog.produse) ? catalog.produse : []);
    colectii = sorteazaColectii(Array.isArray(catalog.colectii) ? catalog.colectii : []);
    catalogIncarcat = true;
}

async function citesteCatalogUrl() {
    try {
        const raspuns = await fetch("resurse/catalog-config.json", { cache: "no-store" });
        if (!raspuns.ok) return "resurse/catalog-produse.json";

        const config = await raspuns.json();
        return config.catalogUrl || "resurse/catalog-produse.json";
    } catch {
        return "resurse/catalog-produse.json";
    }
}

function normalizeazaCatalog(catalog) {
    if (!catalog || typeof catalog !== "object") {
        return { colectii: [], produse: [] };
    }

    return {
        colectii: Array.isArray(catalog.colectii) ? catalog.colectii : Object.values(catalog.colectii || {}),
        produse: Array.isArray(catalog.produse) ? catalog.produse : Object.values(catalog.produse || {}),
    };
}

function sorteazaProduse(lista) {
    return [...lista].sort((a, b) => {
        const ordineA = Number.isFinite(Number(a.ordine)) ? Number(a.ordine) : Number.POSITIVE_INFINITY;
        const ordineB = Number.isFinite(Number(b.ordine)) ? Number(b.ordine) : Number.POSITIVE_INFINITY;
        if (ordineA !== ordineB) return ordineA - ordineB;
        return String(a.nume || "").localeCompare(String(b.nume || ""), "ro");
    });
}

function sorteazaColectii(lista) {
    const ordine = ["disponibile", "la-comanda"];
    return [...lista].sort((a, b) => {
        const ia = ordine.indexOf(a.id);
        const ib = ordine.indexOf(b.id);
        if (ia !== -1 || ib !== -1) {
            return (ia === -1 ? 999 : ia) - (ib === -1 ? 999 : ib);
        }
        return String(a.nume || "").localeCompare(String(b.nume || ""), "ro");
    });
}

function incarcaDinUrl() {
    const params = new URLSearchParams(window.location.search);
    const produsId = params.get("produs");
    const pagina = params.get("pagina") || (produsId ? "produs" : "acasa");
    schimbaPagina(pagina, { produsId, updateUrl: false });
}

async function schimbaPagina(pagina, optiuni = {}) {
    paginaCurenta = pagina;
    document.body.dataset.page = pagina;
    const continut = document.getElementById("continut");

    try {
        const raspuns = await fetch(`${pagina}.html`);
        if (!raspuns.ok) {
            throw new Error("Pagina nu a putut fi încărcată.");
        }

        continut.innerHTML = await raspuns.text();
        seteazaNavigatieActiva(pagina);
        initializeazaPagina(pagina, optiuni);
        pregatesteImagini(continut);
        continut.focus({ preventScroll: true });
        window.scrollTo({ top: 0, behavior: "smooth" });

        if (optiuni.updateUrl !== false) {
            const url = pagina === "acasa" ? "index.html" : `index.html?pagina=${pagina}`;
            history.pushState({}, "", url);
        }
    } catch (error) {
        continut.innerHTML = "<section><h2>Eroare</h2><p>Pagina nu a putut fi încărcată momentan.</p></section>";
    }
}

function initializeazaPagina(pagina, optiuni) {
    leagaActiuniInterne();

    if (pagina === "produse") {
        renderColectii(optiuni.colectieId);
    }

    if (pagina === "produs") {
        renderProdus(optiuni.produsId);
    }

    if (pagina === "comanda") {
        initFormularComanda(optiuni.produsId);
    }
}

function leagaActiuniInterne() {
    document.querySelectorAll("#continut [data-page]").forEach((buton) => {
        buton.addEventListener("click", () => schimbaPagina(buton.dataset.page));
    });

    document.querySelectorAll("[data-collection-link]").forEach((buton) => {
        buton.addEventListener("click", () => schimbaPagina("produse", { colectieId: buton.dataset.collectionLink }));
    });
}

function seteazaNavigatieActiva(pagina) {
    document.querySelectorAll("nav [data-page]").forEach((buton) => {
        buton.classList.toggle("activ", buton.dataset.page === pagina || (pagina === "produs" && buton.dataset.page === "produse"));
    });
}

function escapeHtml(valoare) {
    return String(valoare ?? "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
}

function imagineOptimizata(src, latime = 1200) {
    const url = String(src || "");
    const marker = "/image/upload/";
    if (!url.includes("res.cloudinary.com") || !url.includes(marker)) {
        return url;
    }

    const [prefix, rest] = url.split(marker);
    const parti = rest.split("/");
    const indexVersiune = parti.findIndex((parte) => /^v\d+$/.test(parte));
    const caleImagine = indexVersiune >= 0 ? parti.slice(indexVersiune).join("/") : rest;

    return `${prefix}${marker}f_auto,q_auto:eco,c_limit,w_${latime}/${caleImagine}`;
}

function pregatesteImagini(container) {
    const imagini = Array.from(container.querySelectorAll("img"));
    imagini.forEach((imagine, index) => {
        const esteCardColectie = imagine.closest(".colectii-preview, .colectii-grid, .colectie-card");
        const esteGalerieProdus = imagine.closest(".galerie-produs");
        const latime = esteGalerieProdus ? 1200 : (esteCardColectie ? 520 : 900);
        imagine.src = imagineOptimizata(imagine.getAttribute("src"), latime);
        imagine.decoding = "async";
        imagine.loading = index === 0 ? "eager" : "lazy";

        if (index === 0) {
            imagine.fetchPriority = "high";
        }
    });
}

function mesajCatalog() {
    if (eroareCatalog) {
        return `
            <div class="mesaj-catalog">
                <h3>Catalogul nu este pregătit</h3>
                <p>${escapeHtml(eroareCatalog)}</p>
            </div>
        `;
    }

    return `
        <div class="mesaj-catalog">
            <h3>Nu există produse încă</h3>
            <p>Adaugă produse în <code>continut/imagini/produse</code> și rulează generatorul catalogului.</p>
        </div>
    `;
}

function renderColectii(colectieInitiala) {
    const listaColectii = document.getElementById("colectii-lista");
    if (!listaColectii) return;

    if (!catalogIncarcat || !colectii.length || !produse.length) {
        listaColectii.innerHTML = mesajCatalog();
        const sectiuneProduse = document.getElementById("produse-colectie");
        if (sectiuneProduse) sectiuneProduse.hidden = true;
        return;
    }

    listaColectii.innerHTML = colectii.map((colectie) => `
        <button type="button" class="colectie-card" data-colectie="${escapeHtml(colectie.id)}">
            <img src="${escapeHtml(imagineOptimizata(colectie.imagine, 720))}" alt="${escapeHtml(colectie.nume)}" loading="lazy" decoding="async">
            <span>${escapeHtml(colectie.nume)}</span>
        </button>
    `).join("");

    listaColectii.querySelectorAll("[data-colectie]").forEach((card) => {
        card.addEventListener("click", () => afiseazaProduseColectie(card.dataset.colectie));
    });

    afiseazaProduseColectie(colectieInitiala || colectii[0].id);
}

function afiseazaProduseColectie(colectieId) {
    const colectie = colectii.find((item) => item.id === colectieId) || colectii[0];
    const sectiuneProduse = document.getElementById("produse-colectie");
    const titlu = document.getElementById("titlu-colectie");
    const descriere = document.getElementById("descriere-colectie");
    const listaProduse = document.getElementById("produse-lista");
    const selectFiltru = document.getElementById("filtru-produse-select");

    if (!colectie || !sectiuneProduse || !titlu || !descriere || !listaProduse || !selectFiltru) return;

    const produseColectie = sorteazaProduse(produse.filter((produs) => produs.colectie === colectie.id));
    colectieCurenta = colectie.id;

    document.querySelectorAll("[data-colectie]").forEach((card) => {
        card.classList.toggle("activ", card.dataset.colectie === colectie.id);
    });

    titlu.textContent = colectie.nume;
    descriere.textContent = colectie.descriere || "";
    numarProduseVizibile = PRODUSE_PE_PAGINA;
    actualizeazaSelectFiltre(selectFiltru);
    renderProduseFiltrate(produseColectie, colectie, listaProduse);

    selectFiltru.onchange = () => {
        filtruCurent = selectFiltru.value;
        numarProduseVizibile = PRODUSE_PE_PAGINA;
        renderProduseFiltrate(produseColectie, colectie, listaProduse);
    };

    sectiuneProduse.hidden = false;
}

function actualizeazaSelectFiltre(selectFiltru) {
    const filtre = filtreDisponibile();
    const existaFiltruCurent = filtruCurent === "toate" || filtre.some((filtru) => normalizareFiltru(filtru) === filtruCurent);

    if (!existaFiltruCurent || colectieCurenta !== selectFiltru.dataset.colectie) {
        filtruCurent = "toate";
    }

    selectFiltru.dataset.colectie = colectieCurenta;
    selectFiltru.innerHTML = `<option value="toate">Toate</option>` + filtre.map((filtru) => `
        <option value="${escapeHtml(normalizareFiltru(filtru))}">${escapeHtml(capitalizeFiltru(filtru))}</option>
    `).join("");
    selectFiltru.value = filtruCurent;
}

function filtreDisponibile() {
    const ordinePreferata = [
        "plușuri mici",
        "plușuri medii",
        "plușuri mari",
        "breloc",
        "animale cu accesorii",
        "personaje",
        "insecte",
        "animale marine",
        "dinozauri",
        "valentine",
        "halloween",
        "crăciun",
        "vară",
    ];
    const filtreAscunse = new Set(["animale", "cadouri", "seturi", "decor", "fructe", "mâncare"]);
    const set = new Set();
    produse.forEach((produs) => {
        (produs.filtre || []).forEach((filtru) => {
            const filtruCuratat = String(filtru).trim();
            if (filtruCuratat && !filtreAscunse.has(filtruCuratat.toLowerCase())) {
                set.add(filtruCuratat);
            }
        });
    });
    set.add("crăciun");

    return [...set].sort((a, b) => {
        const ia = ordinePreferata.indexOf(a.toLowerCase());
        const ib = ordinePreferata.indexOf(b.toLowerCase());
        if (ia !== -1 || ib !== -1) {
            return (ia === -1 ? 999 : ia) - (ib === -1 ? 999 : ib);
        }
        return a.localeCompare(b, "ro");
    });
}

function renderProduseFiltrate(produseColectie, colectie, listaProduse) {
    const produseFiltrate = filtruCurent === "toate"
        ? produseColectie
        : produseColectie.filter((produs) => (produs.filtre || []).some((filtru) => normalizareFiltru(filtru) === filtruCurent));
    const produseAfisate = sorteazaProduse(produseFiltrate);

    if (!produseFiltrate.length) {
        listaProduse.innerHTML = `
            <div class="mesaj-catalog">
                <p>Nu sunt plușuri disponibile din această categorie.</p>
            </div>
        `;
    } else {
        const produseVizibile = produseAfisate.slice(0, numarProduseVizibile);
        const maiExistaProduse = numarProduseVizibile < produseAfisate.length;

        listaProduse.innerHTML = produseVizibile.map(cardProdusHtml).join("") + butonMaiMulteHtml(maiExistaProduse);
    }

    leagaCarduriProduse(listaProduse);

    const butonMaiMulte = document.getElementById("incarca-mai-multe-produse");
    if (butonMaiMulte) {
        butonMaiMulte.addEventListener("click", () => {
            const start = numarProduseVizibile;
            numarProduseVizibile += PRODUSE_PE_PAGINA;
            const produseNoi = produseAfisate.slice(start, numarProduseVizibile);
            const containerButon = butonMaiMulte.closest(".produse-mai-multe");
            containerButon.insertAdjacentHTML("beforebegin", produseNoi.map(cardProdusHtml).join(""));
            leagaCarduriProduse(listaProduse);

            if (numarProduseVizibile >= produseAfisate.length) {
                containerButon.remove();
            }
        });
    }
}

function cardProdusHtml(produs) {
    return `
        <article class="produs-card">
            <button type="button" data-produs="${escapeHtml(produs.id)}" aria-label="Deschide ${escapeHtml(produs.nume)}">
                <img src="${escapeHtml(imagineOptimizata(produs.imagini[0], 520))}" alt="${escapeHtml(produs.nume)}" loading="lazy" decoding="async">
            </button>
            <div>
                <h4>${escapeHtml(produs.nume)}</h4>
                <strong>${escapeHtml(produs.pret)}</strong>
            </div>
        </article>
    `;
}

function butonMaiMulteHtml(afiseaza) {
    return afiseaza ? `
        <div class="actiuni produse-mai-multe">
            <button type="button" id="incarca-mai-multe-produse">Arată mai multe</button>
        </div>
    ` : "";
}

function leagaCarduriProduse(container) {
    container.querySelectorAll("[data-produs]").forEach((buton) => {
        buton.onclick = () => deschideProdus(buton.dataset.produs);
    });
}

function normalizareFiltru(filtru) {
    return String(filtru).trim().toLowerCase();
}

function capitalizeFiltru(filtru) {
    const text = String(filtru).trim();
    return text ? text[0].toUpperCase() + text.slice(1) : text;
}

function rezumatSpecificatie(produs, cheie) {
    return produs.specificatii && produs.specificatii[cheie] ? produs.specificatii[cheie] : "";
}

function esteCompletat(valoare) {
    const text = String(valoare || "").trim().toLowerCase();
    return text && text !== "completează aici";
}

function liniiDimensiune(produs) {
    const dimensiune = rezumatSpecificatie(produs, "Dimensiune");

    if (dimensiune) {
        const linii = String(dimensiune)
            .split(/\r?\n/)
            .map((linie) => linie.trim())
            .filter((linie) => linie && !linie.toLowerCase().includes("completează aici"));

        const valoriEtichetate = linii
            .map((linie) => linie.split(":").slice(1).join(":").trim())
            .filter(esteCompletat);

        if (valoriEtichetate.length) {
            return [valoriEtichetate.join(" x ")];
        }

        return linii;
    }

    return [
        ["Înălțime", rezumatSpecificatie(produs, "Înălțime")],
        ["Lungime", rezumatSpecificatie(produs, "Lungime")],
        ["Lățime", rezumatSpecificatie(produs, "Lățime")],
    ]
        .filter(([, valoare]) => esteCompletat(valoare))
        .map(([eticheta, valoare]) => `${eticheta}: ${valoare}`);
}

function rezumatDimensiuni(produs) {
    return liniiDimensiune(produs).join(" · ");
}

function pretNumeric(produs) {
    const potrivire = String(produs.pret || "").match(/\d+/);
    return potrivire ? Number(potrivire[0]) : Number.POSITIVE_INFINITY;
}

function deschideProdus(produsId) {
    history.pushState({}, "", `index.html?pagina=produs&produs=${encodeURIComponent(produsId)}`);
    schimbaPagina("produs", { produsId, updateUrl: false });
}

function renderProdus(produsId) {
    const container = document.getElementById("detaliu-produs");
    if (!container) return;

    if (!catalogIncarcat || !produse.length) {
        container.innerHTML = mesajCatalog();
        return;
    }

    produsCurent = produse.find((produs) => produs.id === produsId);
    if (!produsCurent) {
        container.innerHTML = `
            <div class="mesaj-catalog">
                <h3>Produsul nu a fost găsit</h3>
                <p>Produsul cerut nu mai există în catalog. Te poți întoarce la lista de produse.</p>
                <button type="button" data-page="produse">Înapoi la produse</button>
            </div>
        `;
        leagaActiuniInterne();
        return;
    }

    indexGalerie = 0;
    const dimensiuneHtml = liniiDimensiune(produsCurent)
        .map((linie) => `<span>${escapeHtml(linie)}</span>`)
        .join("");
    const specificatiiHtml = [
        dimensiuneHtml ? `<div><dt>Dimensiune</dt><dd class="spec-valoare">${dimensiuneHtml}</dd></div>` : "",
        rezumatSpecificatie(produsCurent, "Materiale")
            ? `<div><dt>Materiale</dt><dd>${escapeHtml(rezumatSpecificatie(produsCurent, "Materiale"))}</dd></div>`
            : "",
    ].join("");

    container.innerHTML = `
        <button type="button" class="link-inapoi" data-page="produse">Înapoi la produse</button>
        <h2 class="titlu-produs-mobile">${escapeHtml(produsCurent.nume)}</h2>
        <div class="detaliu-grid">
            <div class="galerie-produs">
                <button type="button" class="sageata stanga" aria-label="Poza anterioară" data-gallery="prev">&#8249;</button>
                <img id="poza-produs" src="${escapeHtml(imagineOptimizata(produsCurent.imagini[0], 1200))}" alt="${escapeHtml(produsCurent.nume)}" decoding="async">
                <button type="button" class="sageata dreapta" aria-label="Poza următoare" data-gallery="next">&#8250;</button>
                <div id="puncte-galerie" class="puncte-galerie"></div>
            </div>
            <div class="detalii-produs">
                <p class="eyebrow">produs handmade</p>
                <h2>${escapeHtml(produsCurent.nume)}</h2>
                <p class="pret-produs">${escapeHtml(produsCurent.pret)}</p>
                <p>${escapeHtml(produsCurent.descriere)}</p>
                <dl>${specificatiiHtml}</dl>
                <button type="button" id="comanda-produs">Comandă acest model</button>
            </div>
        </div>
        <aside class="nota-dimensiuni">
            Măsurătorile sunt aproximative. Prima valoare reprezintă înălțimea (sus-jos), a doua lungimea (față-spate), iar a treia lățimea (stânga-dreapta).
        </aside>
    `;

    document.querySelector(".link-inapoi").addEventListener("click", () => schimbaPagina("produse"));
    document.getElementById("comanda-produs").addEventListener("click", () => {
        history.pushState({}, "", `index.html?pagina=comanda&produs=${encodeURIComponent(produsCurent.id)}`);
        schimbaPagina("comanda", { produsId: produsCurent.id, updateUrl: false });
    });

    container.querySelectorAll("[data-gallery]").forEach((buton) => {
        buton.addEventListener("click", () => schimbaPoza(buton.dataset.gallery === "next" ? 1 : -1));
    });

    initSwipeGalerie();
    actualizeazaGalerie();
}

function actualizeazaGalerie() {
    const poza = document.getElementById("poza-produs");
    const puncte = document.getElementById("puncte-galerie");
    if (!poza || !puncte || !produsCurent) return;

    poza.src = imagineOptimizata(produsCurent.imagini[indexGalerie], 1200);
    poza.alt = `${produsCurent.nume} - poza ${indexGalerie + 1}`;
    puncte.innerHTML = produsCurent.imagini.map((_, index) => `
        <button type="button" class="${index === indexGalerie ? "activ" : ""}" aria-label="Arată poza ${index + 1}" data-dot="${index}"></button>
    `).join("");

    puncte.querySelectorAll("[data-dot]").forEach((punct) => {
        punct.addEventListener("click", () => {
            indexGalerie = Number(punct.dataset.dot);
            actualizeazaGalerie();
        });
    });
}

function schimbaPoza(directie) {
    if (!produsCurent || !produsCurent.imagini.length) return;
    indexGalerie = (indexGalerie + directie + produsCurent.imagini.length) % produsCurent.imagini.length;
    actualizeazaGalerie();
}

function initSwipeGalerie() {
    const galerie = document.querySelector(".galerie-produs");
    if (!galerie) return;

    let startX = 0;

    galerie.addEventListener("touchstart", (event) => {
        startX = event.touches[0].clientX;
    }, { passive: true });

    galerie.addEventListener("touchend", (event) => {
        const diferenta = event.changedTouches[0].clientX - startX;
        if (Math.abs(diferenta) > 45) {
            schimbaPoza(diferenta < 0 ? 1 : -1);
        }
    });
}

function initFormularComanda(produsId) {
    const formular = document.getElementById("formular-comanda");
    const select = document.getElementById("produs-selectat");
    const mesaj = document.getElementById("mesaj-formular");
    const campImagini = document.getElementById("camp-imagini");
    const labelDetalii = document.getElementById("label-detalii");
    const ajutorDetalii = document.getElementById("ajutor-detalii");
    const detalii = document.getElementById("detalii");
    const ambalareCadou = document.getElementById("ambalare-cadou");
    const detaliiCadou = document.getElementById("detalii-cadou");
    if (!formular || !select || !mesaj) return;

    if (!catalogIncarcat || !produse.length) {
        select.innerHTML = `<option value="Comandă personalizată">Comandă personalizată / model nou</option>`;
    } else {
        select.innerHTML = `<option value="Comandă personalizată">Comandă personalizată / model nou</option>` +
            [...produse]
                .sort((a, b) => pretNumeric(a) - pretNumeric(b) || a.nume.localeCompare(b.nume, "ro"))
                .map((produs) => `<option value="${escapeHtml(produs.nume)} - ${escapeHtml(produs.pret)}">${escapeHtml(produs.nume)} (${escapeHtml(produs.pret)})</option>`)
                .join("");
    }

    const produsAles = produse.find((produs) => produs.id === produsId);
    if (produsAles) {
        select.value = `${produsAles.nume} - ${produsAles.pret}`;
    }

    const actualizeazaTipComanda = () => {
        const esteModelDePeSite = select.value !== "Comandă personalizată";
        formular.classList.toggle("formular-produs-existent", esteModelDePeSite);
        formular.classList.toggle("formular-personalizat", !esteModelDePeSite);

        if (campImagini) campImagini.hidden = esteModelDePeSite;

        if (esteModelDePeSite) {
            if (labelDetalii) labelDetalii.textContent = "Doriți plușul în alte culori sau cu accesorii?";
            if (ajutorDetalii) ajutorDetalii.textContent = "Aceste modificări ar putea prelungi durata de livrare a plușului.";
            if (detalii) {
                detalii.required = false;
                detalii.placeholder = "Ex: aceleași culori ca în poză / aș vrea altă culoare / fără modificări.";
            }
        } else {
            if (labelDetalii) labelDetalii.textContent = "Descriere comandă";
            if (ajutorDetalii) ajutorDetalii.textContent = "Poți descrie forma, culorile, accesoriile, dimensiunea sau orice detaliu important.";
            if (detalii) {
                detalii.required = true;
                detalii.placeholder = "Ex: aș vrea un axolotl roz, mărime medie, cu fundiță albastră.";
            }
        }
    };

    select.addEventListener("change", actualizeazaTipComanda);
    actualizeazaTipComanda();

    if (eroareCatalog) {
        mesaj.textContent = eroareCatalog;
    }

    if (ambalareCadou && detaliiCadou) {
        const actualizeazaCadou = () => {
            detaliiCadou.disabled = !ambalareCadou.checked;
            detaliiCadou.required = ambalareCadou.checked;
            if (!ambalareCadou.checked) {
                detaliiCadou.value = "";
            }
        };

        ambalareCadou.addEventListener("change", actualizeazaCadou);
        actualizeazaCadou();
    }

    formular.action = `https://formsubmit.co/${OWNER_EMAIL}`;
    formular.target = "formular-comanda-frame";
    formular.addEventListener("submit", (event) => {

        if (OWNER_EMAIL.includes("adauga-emailul")) {
            event.preventDefault();
            mesaj.textContent = "Formularul este gata, dar trebuie setată adresa ta de email în continut/js/site.js.";
            return;
        }

        const butonSubmit = formular.querySelector('button[type="submit"]');
        const textInitialButon = butonSubmit ? butonSubmit.textContent : "";

        if (butonSubmit) {
            butonSubmit.disabled = true;
            butonSubmit.textContent = "Se trimite...";
        }

        mesaj.textContent = "";
        window.setTimeout(() => {
            schimbaPagina("confirmare");
        }, 700);
    });
}

function pozitioneazaFlori() {
    const fundal = document.querySelector(".flori-bg");
    if (!fundal) return;

    const totalDecoratiuni = 34;
    while (fundal.children.length < totalDecoratiuni) {
        fundal.appendChild(document.createElement("span"));
    }

    const simboluri = ["✦", "✧", "*", "✿"];
    const pozitii = [
        [5, 14], [18, 24], [31, 16], [47, 28], [63, 15], [78, 25], [92, 14],
        [9, 42], [23, 54], [38, 46], [55, 58], [71, 45], [87, 56],
        [4, 74], [16, 84], [29, 72], [43, 86], [58, 76], [72, 88], [90, 78],
        [11, 108], [27, 120], [44, 112], [60, 126], [76, 114], [93, 124],
        [7, 148], [21, 160], [36, 144], [52, 158], [67, 146], [81, 162], [95, 150], [14, 184],
    ];
    const flori = fundal.querySelectorAll("span");
    flori.forEach((floare, index) => {
        const [left, top] = pozitii[index % pozitii.length];
        floare.textContent = simboluri[index % simboluri.length];
        floare.style.left = `${left}%`;
        floare.style.top = `${top}%`;
        floare.style.fontSize = `${24 + (index % 5) * 7}px`;
        floare.style.opacity = `${0.24 + (index % 4) * 0.06}`;
        floare.style.transform = `rotate(${index % 2 ? 18 : -14}deg)`;
    });
}
