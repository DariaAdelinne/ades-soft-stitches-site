const FORMULAR_ENDPOINT = "https://europe-west1-ades-soft-stitches.cloudfunctions.net/trimiteComanda";
const REVIEW_ENDPOINT = "https://europe-west1-ades-soft-stitches.cloudfunctions.net/trimiteReview";
const REVIEW_UPLOAD_SIGNATURE_ENDPOINT = "https://europe-west1-ades-soft-stitches.cloudfunctions.net/semneazaUploadReview";
const REVIEW_PUBLIC_ENDPOINT = "https://europe-west1-ades-soft-stitches.cloudfunctions.net/reviewuriPublice";
const REVIEW_LIKE_ENDPOINT = "https://europe-west1-ades-soft-stitches.cloudfunctions.net/apreciazaReview";
const REVIEW_ADMIN_ENDPOINT = "https://europe-west1-ades-soft-stitches.cloudfunctions.net/adminReviewuri";
const PRODUCT_ADMIN_ENDPOINT = "https://europe-west1-ades-soft-stitches.cloudfunctions.net/adminProduse";
const PRODUCT_UPLOAD_SIGNATURE_ENDPOINT = "https://europe-west1-ades-soft-stitches.cloudfunctions.net/semneazaUploadProdus";

function logFetchError(context, endpoint, error, extra = {}) {
    console.error(`[Ade's Soft Stitches] ${context} a eșuat. Verifică endpointul, CORS/preflight și conexiunea.`, {
        endpoint,
        origin: window.location.origin,
        error,
        ...extra,
    });
}

function esteEroareRetea(error) {
    return error instanceof TypeError || /load failed|failed to fetch|network/i.test(String(error?.message || ""));
}

function marcheazaCampInvalid(camp) {
    if (!camp) return;
    camp.classList.add("camp-invalid");
    const container = camp.closest(".check, .rating-field, .camp-formular");
    container?.classList.add("camp-invalid-grup");

    const curata = () => {
        camp.classList.remove("camp-invalid");
        container?.classList.remove("camp-invalid-grup");
    };

    camp.addEventListener("input", curata, { once: true });
    camp.addEventListener("change", curata, { once: true });
}

function duLaPrimulCampInvalid(formular, mesaj) {
    const camp = formular.querySelector(":invalid");
    if (!camp) return false;

    const text = camp.validationMessage || "Te rog completează câmpurile obligatorii.";
    if (mesaj) {
        mesaj.textContent = text;
    }
    marcheazaCampInvalid(camp);

    const tinta = camp.closest(".check, .rating-field, .camp-formular") || camp;
    tinta.scrollIntoView({ behavior: "smooth", block: "center" });
    window.setTimeout(() => {
        try {
            camp.focus({ preventScroll: true });
        } catch {
            camp.focus();
        }
    }, 180);

    return true;
}

function activeazaValidareVizuala(formular, mesaj) {
    let invalidProgramat = false;
    formular.addEventListener("invalid", (event) => {
        event.preventDefault();
        if (invalidProgramat) return;
        invalidProgramat = true;
        window.requestAnimationFrame(() => {
            invalidProgramat = false;
            duLaPrimulCampInvalid(formular, mesaj);
        });
    }, true);
}

let colectii = [];
let produse = [];
let catalogIncarcat = false;
let eroareCatalog = "";
let paginaCurenta = "";
let indexGalerie = 0;
let schimbareGalerieSolicitata = 0;
let produsCurent = null;
let colectieCurenta = "";
let filtruCurent = "toate";
let sortareProduseCurenta = "ordine";
let previzualizareProdusCurent = null;
const cacheImaginiGalerie = new Map();
const REVIEW_CACHE_KEY = "reviewuriAprobateCache";
const REVIEW_CACHE_TTL = 5 * 60 * 1000;
let reviewuriAprobateCache = null;
let reviewuriAprobateCacheTimestamp = 0;
let reviewuriAprobatePromise = null;
const reviewCardNodeCache = new Map();
let adminProduseCatalog = { colectii: [], produse: [] };

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
    const catalog = await fetchCatalog(catalogUrl);
    produse = sorteazaProduse(Array.isArray(catalog.produse) ? catalog.produse : []);
    colectii = sorteazaColectii(Array.isArray(catalog.colectii) ? catalog.colectii : []);
    catalogIncarcat = true;
}

async function fetchCatalog(catalogUrl) {
    const url = String(catalogUrl || "/resurse/catalog-produse.json");
    if (/firebasedatabase\.app\/\.json$/i.test(url)) {
        const baza = url.replace(/\/\.json$/i, "");
        const [colectiiRaspuns, produseRaspuns] = await Promise.all([
            fetch(`${baza}/colectii.json`),
            fetch(`${baza}/produse.json`),
        ]);
        if (!colectiiRaspuns.ok || !produseRaspuns.ok) {
            throw new Error("Catalogul de produse nu a putut fi încărcat.");
        }
        return normalizeazaCatalog({
            colectii: await colectiiRaspuns.json(),
            produse: await produseRaspuns.json(),
        });
    }

    const raspuns = await fetch(url);
    if (!raspuns.ok) {
        throw new Error("Catalogul de produse nu a putut fi încărcat. Rulează generatorul: ./genereaza_catalog.sh");
    }

    return normalizeazaCatalog(await raspuns.json());
}

async function citesteCatalogUrl() {
    try {
        const raspuns = await fetch("/resurse/catalog-config.json", { cache: "no-store" });
        if (!raspuns.ok) return "/resurse/catalog-produse.json";

        const config = await raspuns.json();
        return config.catalogUrl || "/resurse/catalog-produse.json";
    } catch {
        return "/resurse/catalog-produse.json";
    }
}

function normalizeazaCatalog(catalog) {
    if (!catalog || typeof catalog !== "object") {
        return { colectii: [], produse: [] };
    }

    const colectiiNormalizate = Array.isArray(catalog.colectii)
        ? catalog.colectii
        : Object.entries(catalog.colectii || {}).map(([id, colectie]) => ({ id, ...colectie }));
    const produseNormalizate = Array.isArray(catalog.produse)
        ? catalog.produse
        : Object.entries(catalog.produse || {}).map(([id, produs]) => ({ id, ...produs }));

    return {
        colectii: colectiiNormalizate,
        produse: produseNormalizate.filter((produs) => !produs.ascuns && produs.status !== "hidden"),
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
    const path = window.location.pathname.replace(/^\/+|\/+$/g, "");
    const segmente = path.split("/").filter(Boolean);
    let produsId = params.get("produs");
    let pagina = params.get("pagina") || (produsId ? "produs" : "acasa");

    if (!params.has("pagina") && !params.has("produs")) {
        if (!path || path === "index.html") {
            pagina = "acasa";
        } else if (segmente[0] === "produse" && segmente[1]) {
            pagina = "produs";
            produsId = decodeURIComponent(segmente[1]);
        } else if (["produse", "comanda", "review-uri", "despre", "admin-produse", "admin-review-uri"].includes(segmente[0])) {
            pagina = segmente[0];
        }
    }

    schimbaPagina(pagina, { produsId, updateUrl: false });
}

function urlPentruPagina(pagina, optiuni = {}) {
    if (pagina === "acasa") return "/";
    if (pagina === "produs") return `/produse/${encodeURIComponent(optiuni.produsId || "")}`;
    return `/${pagina}`;
}

async function schimbaPagina(pagina, optiuni = {}) {
    paginaCurenta = pagina;
    document.body.dataset.page = pagina;
    const continut = document.getElementById("continut");

    try {
        const raspuns = await fetch(`/${pagina}.html`);
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
            history.pushState({}, "", urlPentruPagina(pagina, optiuni));
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

    if (pagina === "review-uri") {
        initFormularReview();
        initReviewuriPublice("reviewuri-lista", 12, true);
    }

    if (pagina === "admin-review-uri") {
        initAdminReviewuri();
    }

    if (pagina === "admin-produse") {
        initAdminProduse();
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

function latimeImagineGalerie() {
    return window.innerWidth <= 600 ? 720 : 1000;
}

function preincarcaImagineGalerie(src, prioritate = "auto") {
    if (!src) return null;
    if (cacheImaginiGalerie.has(src)) {
        const imagineExistenta = cacheImaginiGalerie.get(src);
        if (prioritate === "high") imagineExistenta.fetchPriority = "high";
        return imagineExistenta;
    }

    const imagine = new Image();
    imagine.decoding = "async";
    imagine.fetchPriority = prioritate;
    imagine.src = src;
    cacheImaginiGalerie.set(src, imagine);

    if (typeof imagine.decode === "function") {
        imagine.decode().catch(() => {});
    }

    return imagine;
}

function preincarcaGaleriaProdusului() {
    if (!produsCurent || produsCurent.imagini.length < 2) return;

    const latime = latimeImagineGalerie();
    const total = produsCurent.imagini.length;
    const ordine = [
        (indexGalerie + 1) % total,
        (indexGalerie - 1 + total) % total,
        ...produsCurent.imagini.map((_, index) => index),
    ];

    [...new Set(ordine)].forEach((index, pozitie) => {
        const prioritate = pozitie < 2 ? "high" : "low";
        preincarcaImagineGalerie(imagineOptimizata(produsCurent.imagini[index], latime), prioritate);
    });
}

function incarcaImaginePrincipalaGalerie() {
    afiseazaImagineGalerieCandEsteGata(indexGalerie);
}

function afiseazaImagineGalerieCandEsteGata(indexSolicitat) {
    if (!produsCurent) return;

    const solicitare = ++schimbareGalerieSolicitata;
    const url = imagineOptimizata(produsCurent.imagini[indexSolicitat], latimeImagineGalerie());
    const imaginePregatita = preincarcaImagineGalerie(url, "high");
    if (!imaginePregatita) return;

    const aplicaImaginea = async () => {
        if (typeof imaginePregatita.decode === "function") {
            try {
                await imaginePregatita.decode();
            } catch {
                if (!imaginePregatita.complete || !imaginePregatita.naturalWidth) return;
            }
        }

        if (solicitare !== schimbareGalerieSolicitata || !produsCurent || indexGalerie !== indexSolicitat) return;
        const poza = document.getElementById("poza-produs");
        if (!poza) return;

        poza.src = url;
        poza.alt = `${produsCurent.nume} - poza ${indexSolicitat + 1}`;
    };

    if (imaginePregatita.complete && imaginePregatita.naturalWidth > 0) {
        void aplicaImaginea();
    } else {
        imaginePregatita.addEventListener("load", () => void aplicaImaginea(), { once: true });
    }
}

function pregatesteImagini(container) {
    const imagini = Array.from(container.querySelectorAll("img"));
    imagini.forEach((imagine, index) => {
        const esteCardColectie = imagine.closest(".colectii-preview, .colectii-grid, .colectie-card");
        const esteCardProdus = imagine.closest(".produs-card");
        const esteGalerieProdus = imagine.closest(".galerie-produs");

        if (esteGalerieProdus) {
            imagine.decoding = "async";
            return;
        }

        const latime = esteCardColectie || esteCardProdus ? 520 : 900;
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
    const selectSortare = document.getElementById("sortare-produse-select");

    if (!colectie || !sectiuneProduse || !titlu || !descriere || !listaProduse || !selectFiltru || !selectSortare) return;

    const produseColectie = sorteazaProduse(produse.filter((produs) => produs.colectie === colectie.id));
    colectieCurenta = colectie.id;

    document.querySelectorAll("[data-colectie]").forEach((card) => {
        card.classList.toggle("activ", card.dataset.colectie === colectie.id);
    });

    titlu.textContent = colectie.nume;
    descriere.textContent = colectie.descriere || "";
    actualizeazaSelectFiltre(selectFiltru);
    renderProduseFiltrate(produseColectie, colectie, listaProduse);

    selectFiltru.onchange = () => {
        filtruCurent = selectFiltru.value;
        renderProduseFiltrate(produseColectie, colectie, listaProduse);
    };
    selectSortare.value = sortareProduseCurenta;
    selectSortare.onchange = () => {
        sortareProduseCurenta = selectSortare.value;
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
    const produseAfisate = sorteazaProduseAfisate(produseFiltrate);

    if (!produseFiltrate.length) {
        listaProduse.innerHTML = `
            <div class="mesaj-catalog">
                <p>Nu sunt plușuri disponibile din această categorie.</p>
            </div>
        `;
    } else {
        listaProduse.innerHTML = produseAfisate.map(cardProdusHtml).join("");
    }

    leagaCarduriProduse(listaProduse);
    activeazaPreincarcareProduse(listaProduse);
}

function sorteazaProduseAfisate(lista) {
    if (sortareProduseCurenta === "pret-crescator") {
        return [...lista].sort((a, b) => pretNumeric(a) - pretNumeric(b) || String(a.nume || "").localeCompare(String(b.nume || ""), "ro"));
    }
    if (sortareProduseCurenta === "pret-descrescator") {
        return [...lista].sort((a, b) => pretNumeric(b) - pretNumeric(a) || String(a.nume || "").localeCompare(String(b.nume || ""), "ro"));
    }
    if (sortareProduseCurenta === "alfabetic") {
        return [...lista].sort((a, b) => String(a.nume || "").localeCompare(String(b.nume || ""), "ro"));
    }
    return sorteazaProduse(lista);
}

function cardProdusHtml(produs) {
    const imagineDetaliu = imagineOptimizata(produs.imagini[0], latimeImagineGalerie());
    return `
        <article class="produs-card">
            <button type="button" data-produs="${escapeHtml(produs.id)}" data-preload-imagine="${escapeHtml(imagineDetaliu)}" aria-label="Deschide ${escapeHtml(produs.nume)}">
                <span class="produs-imagine">
                    <img src="${escapeHtml(imagineOptimizata(produs.imagini[0], 520))}" alt="${escapeHtml(produs.nume)}" loading="lazy" decoding="async">
                </span>
            </button>
            <div class="produs-card-body">
                <h4>${escapeHtml(produs.nume)}</h4>
                <strong>${escapeHtml(produs.pret)}</strong>
            </div>
        </article>
    `;
}

function leagaCarduriProduse(container) {
    container.querySelectorAll("[data-produs]").forEach((buton) => {
        buton.onclick = () => {
            const imagine = buton.querySelector("img");
            deschideProdus(buton.dataset.produs, imagine?.currentSrc || imagine?.src || "");
        };
    });
}

function activeazaPreincarcareProduse(container) {
    const butoane = container.querySelectorAll("[data-preload-imagine]");

    if (!("IntersectionObserver" in window)) {
        butoane.forEach((buton) => preincarcaImagineGalerie(buton.dataset.preloadImagine));
        return;
    }

    const observator = new IntersectionObserver((intrari) => {
        intrari.forEach((intrare) => {
            if (!intrare.isIntersecting) return;
            preincarcaImagineGalerie(intrare.target.dataset.preloadImagine);
            observator.unobserve(intrare.target);
        });
    }, { rootMargin: "450px 0px" });

    butoane.forEach((buton) => observator.observe(buton));
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

function deschideProdus(produsId, imaginePrevizualizare = "") {
    previzualizareProdusCurent = {
        produsId,
        src: imaginePrevizualizare,
    };
    history.pushState({}, "", urlPentruPagina("produs", { produsId }));
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
    const imagineInitiala = previzualizareProdusCurent?.produsId === produsCurent.id && previzualizareProdusCurent.src
        ? previzualizareProdusCurent.src
        : imagineOptimizata(produsCurent.imagini[0], 520);
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
                <img id="poza-produs" src="${escapeHtml(imagineInitiala)}" alt="${escapeHtml(produsCurent.nume)}" loading="eager" decoding="async" fetchpriority="high">
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
        history.pushState({}, "", `/comanda?produs=${encodeURIComponent(produsCurent.id)}`);
        schimbaPagina("comanda", { produsId: produsCurent.id, updateUrl: false });
    });

    container.querySelectorAll("[data-gallery]").forEach((buton) => {
        buton.addEventListener("click", () => schimbaPoza(buton.dataset.gallery === "next" ? 1 : -1));
    });

    initSwipeGalerie();
    actualizeazaGalerie({ pastreazaImagine: true });
    incarcaImaginePrincipalaGalerie();
}

function actualizeazaGalerie(optiuni = {}) {
    const poza = document.getElementById("poza-produs");
    const puncte = document.getElementById("puncte-galerie");
    if (!poza || !puncte || !produsCurent) return;

    if (!optiuni.pastreazaImagine) {
        afiseazaImagineGalerieCandEsteGata(indexGalerie);
    }
    puncte.innerHTML = produsCurent.imagini.map((_, index) => `
        <button type="button" class="${index === indexGalerie ? "activ" : ""}" aria-label="Arată poza ${index + 1}" data-dot="${index}"></button>
    `).join("");

    puncte.querySelectorAll("[data-dot]").forEach((punct) => {
        punct.addEventListener("click", () => {
            indexGalerie = Number(punct.dataset.dot);
            actualizeazaGalerie();
        });
    });

    preincarcaGaleriaProdusului();
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

    activeazaValidareVizuala(formular, mesaj);

    formular.addEventListener("submit", async (event) => {
        event.preventDefault();

        if (!formular.checkValidity()) {
            duLaPrimulCampInvalid(formular, mesaj);
            return;
        }

        const butonSubmit = formular.querySelector('button[type="submit"]');
        const textInitialButon = butonSubmit ? butonSubmit.textContent : "";

        if (butonSubmit) {
            butonSubmit.disabled = true;
            butonSubmit.textContent = "Se trimite...";
        }

        mesaj.textContent = "";

        try {
            const raspuns = await fetch(FORMULAR_ENDPOINT, {
                method: "POST",
                body: new FormData(formular),
            });
            const rezultat = await raspuns.json().catch(() => ({}));

            if (!raspuns.ok || !rezultat.ok) {
                if (raspuns.status === 413) {
                    throw new Error("Imaginile sunt prea mari. Încearcă maximum 5 imagini, de cel mult 5 MB fiecare.");
                }
                if (raspuns.status === 429) {
                    throw new Error("Au fost trimise prea multe cereri. Te rog să încerci din nou peste câteva minute.");
                }
                throw new Error("Cererea nu a putut fi trimisă. Te rog să încerci din nou.");
            }

            if (rezultat.emailStatus === "failed") {
                console.warn("[Ade's Soft Stitches] Comanda a fost salvată, dar emailul nu a putut fi trimis. Verifică logurile Firebase Functions.", rezultat);
            }
            schimbaPagina("confirmare");
        } catch (error) {
            logFetchError("Trimiterea formularului de comandă", FORMULAR_ENDPOINT, error);
            mesaj.textContent = error.message || "A apărut o problemă la trimitere. Te rog să încerci din nou.";
            if (butonSubmit) {
                butonSubmit.disabled = false;
                butonSubmit.textContent = textInitialButon;
            }
        }
    });
}

function steleHtml(rating) {
    const valoare = Math.max(1, Math.min(Number(rating) || 5, 5));
    return Array.from({ length: 5 }, (_, index) => `<span aria-hidden="true">${index < valoare ? "★" : "☆"}</span>`).join("");
}

function renderReviewCard(review) {
    const produs = review.productName ? `<p class="review-produs">Produs: ${escapeHtml(review.productName)}</p>` : "";
    const mesaj = String(review.message || "");
    const poza = review.imageUrl ? `
        <div class="review-media">
            <img class="review-poza" src="${escapeHtml(imagineOptimizata(review.imageUrl, 520))}" alt="Poză atașată la review de ${escapeHtml(review.displayName)}" loading="lazy" decoding="async">
        </div>
    ` : "";
    const apreciat = reviewApreciat(review.id);
    const likesCount = Number(review.likesCount) || 0;

    return `
        <article class="review-card ${review.imageUrl ? "review-card-cu-poza" : ""}">
            <div class="review-card-body">
                <div class="review-stele" aria-label="${escapeHtml(review.rating)} din 5 stele">${steleHtml(review.rating)}</div>
                <h4>${escapeHtml(review.displayName)}</h4>
                ${produs}
                <p class="review-mesaj">${escapeHtml(mesaj)}</p>
                <div class="review-footer">
                    <button type="button" class="review-like" data-review-like="${escapeHtml(review.id)}" ${apreciat ? "disabled" : ""}>
                        <span aria-hidden="true">${apreciat ? "♥" : "♡"}</span>
                        <span>${likesCount}</span>
                    </button>
                </div>
            </div>
            ${poza}
        </article>
    `;
}

function semnaturaReviewCard(review) {
    return JSON.stringify({
        id: review.id,
        displayName: review.displayName,
        rating: review.rating,
        message: review.message,
        productName: review.productName,
        imageUrl: review.imageUrl,
        likesCount: review.likesCount,
    });
}

function aplicaStareLikePeCard(card, review) {
    const buton = card.querySelector("[data-review-like]");
    if (!buton) return;
    const apreciat = reviewApreciat(review.id);
    const spans = buton.querySelectorAll("span");
    buton.disabled = apreciat;
    if (spans[0]) spans[0].textContent = apreciat ? "♥" : "♡";
    if (spans[1]) spans[1].textContent = String(Number(review.likesCount) || 0);
}

function reviewCardNode(review) {
    const reviewId = String(review.id || "");
    const semnatura = semnaturaReviewCard(review);
    const cached = reviewCardNodeCache.get(reviewId);

    if (cached?.semnatura === semnatura) {
        aplicaStareLikePeCard(cached.node, review);
        return cached.node;
    }

    const template = document.createElement("template");
    template.innerHTML = renderReviewCard(review).trim();
    const node = template.content.firstElementChild;
    reviewCardNodeCache.set(reviewId, { node, semnatura });
    aplicaStareLikePeCard(node, review);
    return node;
}

function reviewApreciat(id) {
    const reviewId = String(id || "");
    try {
        const aprecieri = JSON.parse(localStorage.getItem("reviewLikes") || "[]");
        return Array.isArray(aprecieri) && aprecieri.map(String).includes(reviewId);
    } catch {
        return false;
    }
}

function marcheazaReviewApreciat(id) {
    const reviewId = String(id || "");
    try {
        const aprecieri = JSON.parse(localStorage.getItem("reviewLikes") || "[]");
        const lista = Array.isArray(aprecieri) ? aprecieri.map(String) : [];
        if (reviewId && !lista.includes(reviewId)) lista.push(reviewId);
        localStorage.setItem("reviewLikes", JSON.stringify(lista));
    } catch {
        localStorage.setItem("reviewLikes", JSON.stringify(reviewId ? [reviewId] : []));
    }
}

function normalizeazaReviewPublic(review) {
    return {
        id: String(review.id || ""),
        displayName: review.displayName || "Client Ade's Soft Stitches",
        rating: Math.max(1, Math.min(Number(review.rating) || 5, 5)),
        message: review.message || "",
        productName: review.productName || "",
        imageUrl: review.imageUrl || "",
        likesCount: Number(review.likesCount) || 0,
        createdAt: Number(review.createdAt) || 0,
    };
}

function citesteReviewuriDinSession() {
    try {
        const cache = JSON.parse(sessionStorage.getItem(REVIEW_CACHE_KEY) || "null");
        if (!cache || !Array.isArray(cache.reviews) || !Number.isFinite(cache.timestamp)) return null;
        return {
            reviews: cache.reviews.map(normalizeazaReviewPublic).filter((review) => review.id),
            timestamp: cache.timestamp,
        };
    } catch {
        return null;
    }
}

function salveazaReviewuriInSession(reviews, timestamp = Date.now()) {
    try {
        sessionStorage.setItem(REVIEW_CACHE_KEY, JSON.stringify({ reviews, timestamp }));
    } catch (error) {
        console.warn("[Ade's Soft Stitches] Cache-ul review-urilor nu a putut fi salvat în sessionStorage.", error);
    }
}

function seteazaReviewuriCache(reviews, timestamp = Date.now()) {
    reviewuriAprobateCache = reviews.map(normalizeazaReviewPublic).filter((review) => review.id);
    reviewuriAprobateCacheTimestamp = timestamp;
    salveazaReviewuriInSession(reviewuriAprobateCache, timestamp);
    const reviewIds = new Set(reviewuriAprobateCache.map((review) => review.id));
    reviewCardNodeCache.forEach((_, id) => {
        if (!reviewIds.has(id)) reviewCardNodeCache.delete(id);
    });
}

function reviewuriCacheDisponibil() {
    if (reviewuriAprobateCache) {
        return {
            reviews: reviewuriAprobateCache,
            timestamp: reviewuriAprobateCacheTimestamp,
        };
    }

    const cacheSession = citesteReviewuriDinSession();
    if (cacheSession) {
        reviewuriAprobateCache = cacheSession.reviews;
        reviewuriAprobateCacheTimestamp = cacheSession.timestamp;
        return cacheSession;
    }

    return null;
}

function sorteazaReviewuriPublice(reviews, sortare) {
    return [...reviews].sort((a, b) => {
        if (sortare === "images") {
            const diferentaImagini = Number(Boolean(b.imageUrl)) - Number(Boolean(a.imageUrl));
            if (diferentaImagini !== 0) return diferentaImagini;
        }
        if (sortare === "likes") {
            const diferentaLikes = (Number(b.likesCount) || 0) - (Number(a.likesCount) || 0);
            if (diferentaLikes !== 0) return diferentaLikes;
        }
        return (Number(b.createdAt) || 0) - (Number(a.createdAt) || 0);
    });
}

function renderReviewuriPublice(container, limita, sortare) {
    const reviews = sorteazaReviewuriPublice(reviewuriAprobateCache || [], sortare).slice(0, limita);
    activeazaLikeReviewuri(container);

    if (!reviews.length) {
        container.innerHTML = `<div class="mesaj-catalog"><p>Încă nu sunt review-uri publicate.</p></div>`;
        return;
    }

    container.replaceChildren(...reviews.map(reviewCardNode));
}

async function incarcaReviewuriAprobate(limita) {
    if (reviewuriAprobatePromise) return reviewuriAprobatePromise;

    reviewuriAprobatePromise = (async () => {
        const url = `${REVIEW_PUBLIC_ENDPOINT}?limit=${encodeURIComponent(limita)}&sort=recent&t=${Date.now()}`;
        const raspuns = await fetch(url, { cache: "no-store" });
        const rezultat = await raspuns.json().catch(() => ({}));

        if (!raspuns.ok || !rezultat.ok) {
            throw new Error("review-load-failed");
        }

        const reviewuri = Array.isArray(rezultat.reviews) ? rezultat.reviews : [];
        seteazaReviewuriCache(reviewuri);
        return reviewuriAprobateCache;
    })();

    try {
        return await reviewuriAprobatePromise;
    } finally {
        reviewuriAprobatePromise = null;
    }
}

async function initReviewuriPublice(containerId, limita, cuSortare = false) {
    const container = document.getElementById(containerId);
    if (!container) return;
    const selectSortare = cuSortare ? document.getElementById("sortare-reviewuri") : null;

    if (selectSortare && !selectSortare.dataset.initializat) {
        selectSortare.dataset.initializat = "true";
        selectSortare.addEventListener("change", () => {
            renderReviewuriPublice(container, limita, selectSortare.value || "recent");
        });
    }

    const sortare = selectSortare?.value || "recent";
    const cache = reviewuriCacheDisponibil();
    const cacheValid = cache && Date.now() - cache.timestamp < REVIEW_CACHE_TTL;

    if (cache?.reviews?.length) {
        renderReviewuriPublice(container, limita, sortare);
        if (cacheValid) {
            incarcaReviewuriAprobate(limita)
                .then(() => renderReviewuriPublice(container, limita, selectSortare?.value || sortare))
                .catch((error) => logFetchError("Actualizarea review-urilor publice", REVIEW_PUBLIC_ENDPOINT, error, { limita, sortare }));
            return;
        }
    } else {
        container.innerHTML = `<div class="mesaj-catalog"><p>Se încarcă review-urile...</p></div>`;
    }

    try {
        await incarcaReviewuriAprobate(limita);
        renderReviewuriPublice(container, limita, selectSortare?.value || sortare);
    } catch (error) {
        logFetchError("Încărcarea review-urilor publice", REVIEW_PUBLIC_ENDPOINT, error, { limita, sortare });
        if (!cache?.reviews?.length) {
            container.innerHTML = `<div class="mesaj-catalog"><p>Review-urile nu pot fi încărcate momentan.</p></div>`;
        }
    }
}

function actualizeazaLikeReviewInCache(id, likesCount) {
    const reviewId = String(id || "");
    const valoare = Number(likesCount) || 0;
    if (!reviewId) return;

    if (reviewuriAprobateCache) {
        reviewuriAprobateCache = reviewuriAprobateCache.map((review) => (
            review.id === reviewId ? { ...review, likesCount: valoare } : review
        ));
        reviewuriAprobateCacheTimestamp = Date.now();
        salveazaReviewuriInSession(reviewuriAprobateCache, reviewuriAprobateCacheTimestamp);
    }
}

function actualizeazaButoaneLike(id, likesCount) {
    const reviewId = String(id || "");
    document.querySelectorAll("[data-review-like]").forEach((buton) => {
        if (String(buton.dataset.reviewLike || "") !== reviewId) return;
        buton.disabled = true;
        const spans = buton.querySelectorAll("span");
        if (spans[0]) spans[0].textContent = "♥";
        if (spans[1]) spans[1].textContent = String(Number(likesCount) || 1);
    });
}

function activeazaLikeReviewuri(container) {
    if (container.dataset.likeInitializat) return;
    container.dataset.likeInitializat = "true";
    container.addEventListener("click", (event) => {
        const buton = event.target.closest("[data-review-like]");
        if (!buton || !container.contains(buton)) return;
        apreciazaReview(buton);
    });
}

async function apreciazaReview(buton) {
    const id = String(buton.dataset.reviewLike || "");
    if (!id || reviewApreciat(id)) return;

    buton.disabled = true;

    try {
        const raspuns = await fetch(REVIEW_LIKE_ENDPOINT, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ id }),
        });
        const rezultat = await raspuns.json().catch(() => ({}));

        if (!raspuns.ok || !rezultat.ok) {
            throw new Error("Like-ul nu a putut fi salvat.");
        }

        marcheazaReviewApreciat(id);
        const likesCount = Number(rezultat.likesCount) || 1;
        actualizeazaLikeReviewInCache(id, likesCount);
        actualizeazaButoaneLike(id, likesCount);
    } catch (error) {
        buton.disabled = false;
        logFetchError("Aprecierea review-ului", REVIEW_LIKE_ENDPOINT, error, { id });
    }
}

function tipImagineFisier(fisier) {
    const tip = String(fisier?.type || "").toLowerCase();
    if (tip) return tip;
    const nume = String(fisier?.name || "").toLowerCase();
    if (/\.(jpe?g)$/.test(nume)) return "image/jpeg";
    if (/\.png$/.test(nume)) return "image/png";
    if (/\.webp$/.test(nume)) return "image/webp";
    if (/\.heic$/.test(nume)) return "image/heic";
    if (/\.heif$/.test(nume)) return "image/heif";
    return "";
}

function fisierCuTipInferat(fisier) {
    const tip = tipImagineFisier(fisier);
    if (!tip || fisier.type === tip) return fisier;
    return new File([fisier], fisier.name || "review-image", {
        type: tip,
        lastModified: fisier.lastModified || Date.now(),
    });
}

function comprimaImagineReview(fisier) {
    return new Promise((resolve, reject) => {
        if (!fisier) {
            resolve(null);
            return;
        }

        const fisierPregatit = fisierCuTipInferat(fisier);
        const tip = tipImagineFisier(fisierPregatit);
        const tipuriAcceptate = ["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"];
        const esteHeic = tip === "image/heic" || tip === "image/heif";

        if (!tipuriAcceptate.includes(tip)) {
            reject(new Error("Poza trebuie să fie jpg, png, webp, heic sau heif."));
            return;
        }

        if (fisier.size > 5 * 1024 * 1024) {
            reject(new Error("Poza trebuie să aibă maximum 5 MB."));
            return;
        }

        if (esteHeic) {
            resolve(fisierPregatit);
            return;
        }

        const imagine = new Image();
        const url = URL.createObjectURL(fisierPregatit);

        imagine.onload = () => {
            URL.revokeObjectURL(url);
            const maxLatura = 1200;
            const scala = Math.min(1, maxLatura / Math.max(imagine.width, imagine.height));
            const canvas = document.createElement("canvas");
            canvas.width = Math.max(1, Math.round(imagine.width * scala));
            canvas.height = Math.max(1, Math.round(imagine.height * scala));

            const context = canvas.getContext("2d");
            context.drawImage(imagine, 0, 0, canvas.width, canvas.height);

            const calitati = [0.78, 0.68, 0.58];
            const incearcaCompresie = (index = 0) => {
                canvas.toBlob((blob) => {
                    if (!blob) {
                        console.warn("[Ade's Soft Stitches] Poza nu a putut fi comprimată local. Se încearcă uploadul original.");
                        resolve(fisierPregatit);
                        return;
                    }

                    if (blob.size > 1024 * 1024 && index < calitati.length - 1) {
                        incearcaCompresie(index + 1);
                        return;
                    }

                    resolve(new File([blob], "review.webp", { type: blob.type || "image/webp" }));
                }, "image/webp", calitati[index]);
            };

            incearcaCompresie();
        };

        imagine.onerror = () => {
            URL.revokeObjectURL(url);
            console.warn("[Ade's Soft Stitches] Browserul nu a putut decoda poza local. Se încearcă uploadul original.", {
                name: fisierPregatit.name,
                type: fisierPregatit.type,
                size: fisierPregatit.size,
            });
            resolve(fisierPregatit);
        };

        imagine.src = url;
    });
}

async function uploadImagineReviewCloudinary(fisier) {
    if (!fisier) return null;

    let semnaturaRaspuns;
    try {
        semnaturaRaspuns = await fetch(REVIEW_UPLOAD_SIGNATURE_ENDPOINT, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                contentType: fisier.type,
                fileSize: fisier.size,
            }),
        });
    } catch (error) {
        logFetchError("Pregătirea uploadului Cloudinary pentru review", REVIEW_UPLOAD_SIGNATURE_ENDPOINT, error);
        throw new Error("Uploadul pozei nu este disponibil momentan. Verifică dacă funcțiile Firebase au fost deploy-uite și dacă secretele Cloudinary sunt setate.");
    }

    const semnatura = await semnaturaRaspuns.json().catch(() => ({}));

    if (!semnaturaRaspuns.ok || !semnatura.ok) {
        logFetchError("Pregătirea uploadului Cloudinary pentru review", REVIEW_UPLOAD_SIGNATURE_ENDPOINT, new Error(semnatura.error || "cloudinary-signature-failed"), {
            status: semnaturaRaspuns.status,
        });
        if (semnaturaRaspuns.status === 429) {
            throw new Error("Ai încercat să încarci mai multe poze într-un timp scurt. Te rog încearcă din nou puțin mai târziu.");
        }
        throw new Error("Poza nu a putut fi pregătită pentru încărcare.");
    }
    if (!semnatura.cloudName || !semnatura.apiKey || !semnatura.timestamp || !semnatura.signature || !semnatura.folder) {
        console.error("[Ade's Soft Stitches] Semnătura Cloudinary este incompletă.", {
            hasCloudName: Boolean(semnatura.cloudName),
            hasApiKey: Boolean(semnatura.apiKey),
            hasTimestamp: Boolean(semnatura.timestamp),
            hasSignature: Boolean(semnatura.signature),
            hasFolder: Boolean(semnatura.folder),
        });
        throw new Error("Poza nu a putut fi pregătită pentru încărcare.");
    }

    const uploadData = new FormData();
    uploadData.append("file", fisier);
    uploadData.append("api_key", String(semnatura.apiKey));
    uploadData.append("timestamp", String(semnatura.timestamp));
    uploadData.append("signature", String(semnatura.signature));
    uploadData.append("folder", String(semnatura.folder));

    const cloudinaryEndpoint = `https://api.cloudinary.com/v1_1/${semnatura.cloudName}/image/upload`;
    let cloudinaryRaspuns;
    try {
        cloudinaryRaspuns = await fetch(cloudinaryEndpoint, {
            method: "POST",
            body: uploadData,
        });
    } catch (error) {
        console.error("[Ade's Soft Stitches] Conexiunea cu Cloudinary a eșuat.", {
            endpoint: cloudinaryEndpoint,
            error,
        });
        throw new Error("Poza nu a putut fi încărcată. Te rog încearcă din nou.");
    }

    const raspunsText = await cloudinaryRaspuns.text().catch(() => "");
    let rezultat = {};
    try {
        rezultat = raspunsText ? JSON.parse(raspunsText) : {};
    } catch {
        rezultat = {};
    }

    if (!cloudinaryRaspuns.ok || !rezultat.secure_url || !rezultat.public_id) {
        console.error("[Ade's Soft Stitches] Uploadul pozei review-ului în Cloudinary a eșuat.", {
            endpoint: cloudinaryEndpoint,
            status: cloudinaryRaspuns.status,
            statusText: cloudinaryRaspuns.statusText,
            error: rezultat.error,
            response: rezultat.error ? rezultat : raspunsText,
            signedFields: ["folder", "timestamp"],
            sentFolder: semnatura.folder,
        });
        throw new Error("Poza nu a putut fi încărcată. Te rog încearcă din nou.");
    }

    return {
        imageUrl: rezultat.secure_url,
        imagePublicId: rezultat.public_id,
        imageProvider: "cloudinary",
    };
}

function initFormularReview() {
    const formular = document.getElementById("formular-review");
    const mesaj = document.getElementById("mesaj-review");
    const inputPoza = document.getElementById("review-poza");
    const mesajReview = document.getElementById("review-mesaj");
    const counter = document.querySelector("[data-review-counter]");
    if (!formular || !mesaj) return;

    const actualizeazaCounter = () => {
        if (!mesajReview || !counter) return;
        counter.textContent = `${mesajReview.value.length}/350`;
    };
    mesajReview?.addEventListener("input", actualizeazaCounter);
    actualizeazaCounter();

    activeazaValidareVizuala(formular, mesaj);

    formular.addEventListener("submit", async (event) => {
        event.preventDefault();

        if (!formular.checkValidity()) {
            duLaPrimulCampInvalid(formular, mesaj);
            return;
        }

        const butonSubmit = formular.querySelector('button[type="submit"]');
        const textInitialButon = butonSubmit ? butonSubmit.textContent : "";

        if (butonSubmit) {
            butonSubmit.disabled = true;
            butonSubmit.textContent = "Se trimite...";
        }
        mesaj.textContent = "";

        try {
            if (mesajReview && mesajReview.value.trim().length > 350) {
                throw new Error("Review-ul poate avea maximum 350 de caractere.");
            }
            const formData = new FormData(formular);
            const pozaComprimata = await comprimaImagineReview(inputPoza?.files?.[0]);
            formData.delete("review_image");
            if (pozaComprimata) {
                const pozaCloudinary = await uploadImagineReviewCloudinary(pozaComprimata);
                formData.append("imageUrl", pozaCloudinary.imageUrl);
                formData.append("imagePublicId", pozaCloudinary.imagePublicId);
                formData.append("imageProvider", pozaCloudinary.imageProvider);
            }

            const raspuns = await fetch(REVIEW_ENDPOINT, {
                method: "POST",
                body: formData,
            });
            const rezultat = await raspuns.json().catch(() => ({}));

            if (!raspuns.ok || !rezultat.ok) {
                if (raspuns.status === 413) {
                    throw new Error("Poza este prea mare sau nu are formatul potrivit.");
                }
                if (raspuns.status === 429) {
                    throw new Error("Ai trimis mai multe review-uri într-un timp scurt. Te rog încearcă din nou puțin mai târziu.");
                }
                if (raspuns.status === 400 && rezultat.error === "invalid-review") {
                    throw new Error("Review-ul trebuie să aibă între 10 și 350 de caractere, un email valid, rating și acordul de publicare.");
                }
                throw new Error("Ups, review-ul nu a putut fi trimis momentan. Te rog încearcă din nou în câteva momente.");
            }

            if (rezultat.emailStatus === "failed") {
                console.warn("[Ade's Soft Stitches] Review-ul a fost salvat, dar notificarea email nu a putut fi trimisă. Verifică logurile Firebase Functions.", rezultat);
            }

            formular.reset();
            actualizeazaCounter();
            mesaj.textContent = "Mulțumesc mult pentru review! 💕 Mesajul tău a fost trimis și va apărea pe site după ce îl verific. Îți mulțumesc că susții creațiile Ade’s Soft Stitches. 🧶✨";
        } catch (error) {
            logFetchError("Trimiterea formularului de review", REVIEW_ENDPOINT, error);
            mesaj.textContent = esteEroareRetea(error)
                ? "Conexiunea cu serverul nu a reușit. Verifică dacă funcțiile Firebase sunt deploy-uite și încearcă din nou."
                : error.message || "Ups, review-ul nu a putut fi trimis momentan. Te rog încearcă din nou în câteva momente.";
        } finally {
            if (butonSubmit) {
                butonSubmit.disabled = false;
                butonSubmit.textContent = textInitialButon;
            }
        }
    });
}

function tokenAdminReview() {
    return sessionStorage.getItem("reviewAdminToken") || "";
}

function seteazaTokenAdminReview(token) {
    if (token) {
        sessionStorage.setItem("reviewAdminToken", token);
    } else {
        sessionStorage.removeItem("reviewAdminToken");
    }
}

function adminReviewData(review) {
    const produs = review.productName ? `<p><strong>Produs:</strong> ${escapeHtml(review.productName)}</p>` : "";
    const poza = review.imageUrl ? `<img src="${escapeHtml(review.imageUrl)}" alt="Poză review" loading="lazy" decoding="async">` : "";
    return `
        <article class="admin-review-card" data-review-id="${escapeHtml(review.id)}">
            ${poza}
            <div>
                <div class="review-stele">${steleHtml(review.rating)}</div>
                <h4>${escapeHtml(review.displayName || review.name || "Review")}</h4>
                ${produs}
                <p>${escapeHtml(review.message)}</p>
                <div class="actiuni admin-review-actiuni">
                    <button type="button" data-review-action="approve">Aprobă</button>
                    <button type="button" data-review-action="reject" class="btn-secundar">Respinge</button>
                    <button type="button" data-review-action="delete" class="btn-secundar">Șterge</button>
                </div>
            </div>
        </article>
    `;
}

async function incarcaAdminReviewuri(status = "pending") {
    const lista = document.getElementById("admin-reviewuri-lista");
    const mesaj = document.getElementById("mesaj-admin-review");
    const token = tokenAdminReview();
    if (!lista || !mesaj || !token) return;

    lista.innerHTML = `<div class="mesaj-catalog"><p>Se încarcă review-urile...</p></div>`;

    try {
        const raspuns = await fetch(`${REVIEW_ADMIN_ENDPOINT}?status=${encodeURIComponent(status)}`, {
            headers: { Authorization: `Bearer ${token}` },
        });
        const rezultat = await raspuns.json().catch(() => ({}));

        if (!raspuns.ok || !rezultat.ok) {
            throw new Error(raspuns.status === 401 ? "Tokenul admin nu este corect." : "Review-urile nu au putut fi încărcate.");
        }

        const reviewuri = Array.isArray(rezultat.reviews) ? rezultat.reviews : [];
        lista.innerHTML = reviewuri.length
            ? reviewuri.map(adminReviewData).join("")
            : `<div class="mesaj-catalog"><p>Nu există review-uri în această categorie.</p></div>`;

        lista.querySelectorAll("[data-review-action]").forEach((buton) => {
            buton.addEventListener("click", () => adminReviewAction(buton.closest("[data-review-id]")?.dataset.reviewId, buton.dataset.reviewAction, status));
        });
        mesaj.textContent = "";
    } catch (error) {
        logFetchError("Încărcarea review-urilor în admin", REVIEW_ADMIN_ENDPOINT, error, { status });
        lista.innerHTML = "";
        mesaj.textContent = error.message || "Review-urile nu au putut fi încărcate.";
    }
}

async function adminReviewAction(id, action, statusCurent) {
    const mesaj = document.getElementById("mesaj-admin-review");
    const token = tokenAdminReview();
    if (!id || !token || !mesaj) return;

    if (action === "delete" && !confirm("Sigur vrei să ștergi acest review?")) return;

    try {
        const raspuns = await fetch(REVIEW_ADMIN_ENDPOINT, {
            method: "POST",
            headers: {
                Authorization: `Bearer ${token}`,
                "Content-Type": "application/json",
            },
            body: JSON.stringify({ id, action }),
        });
        const rezultat = await raspuns.json().catch(() => ({}));

        if (!raspuns.ok || !rezultat.ok) {
            throw new Error("Acțiunea nu a putut fi salvată.");
        }

        await incarcaAdminReviewuri(statusCurent);
    } catch (error) {
        logFetchError("Acțiunea admin pentru review", REVIEW_ADMIN_ENDPOINT, error, { id, action });
        mesaj.textContent = error.message || "Acțiunea nu a putut fi salvată.";
    }
}

function initAdminReviewuri() {
    const formular = document.getElementById("formular-admin-review");
    const input = document.getElementById("admin-review-token");
    const uitaToken = document.getElementById("uita-token-review");
    let statusCurent = "pending";
    if (!formular || !input) return;

    input.value = tokenAdminReview();

    formular.addEventListener("submit", (event) => {
        event.preventDefault();
        seteazaTokenAdminReview(input.value.trim());
        incarcaAdminReviewuri(statusCurent);
    });

    uitaToken?.addEventListener("click", () => {
        input.value = "";
        seteazaTokenAdminReview("");
        document.getElementById("admin-reviewuri-lista").innerHTML = "";
    });

    document.querySelectorAll("[data-admin-status]").forEach((buton) => {
        buton.addEventListener("click", () => {
            statusCurent = buton.dataset.adminStatus;
            document.querySelectorAll("[data-admin-status]").forEach((item) => item.classList.toggle("activ", item === buton));
            incarcaAdminReviewuri(statusCurent);
        });
    });

    document.querySelector('[data-admin-status="pending"]')?.classList.add("activ");
    if (input.value) incarcaAdminReviewuri(statusCurent);
}

function tokenAdminProduse() {
    return sessionStorage.getItem("productAdminToken") || "";
}

function seteazaTokenAdminProduse(token) {
    if (token) {
        sessionStorage.setItem("productAdminToken", token);
    } else {
        sessionStorage.removeItem("productAdminToken");
    }
}

function adminAuthProduse() {
    return { Authorization: `Bearer ${tokenAdminProduse()}` };
}

function normalizeazaCatalogAdmin(catalog) {
    if (!catalog || typeof catalog !== "object") return { colectii: [], produse: [] };
    const colectiiAdmin = Array.isArray(catalog.colectii)
        ? catalog.colectii
        : Object.entries(catalog.colectii || {}).map(([id, colectie]) => ({ id, ...colectie }));
    const produseAdmin = Array.isArray(catalog.produse)
        ? catalog.produse
        : Object.entries(catalog.produse || {}).map(([id, produs]) => ({ id, ...produs }));
    return {
        colectii: sorteazaColectii(colectiiAdmin),
        produse: sorteazaProduse(produseAdmin),
    };
}

function textLinii(valoare) {
    return Array.isArray(valoare) ? valoare.filter(Boolean).join("\n") : String(valoare || "");
}

function valoriDinTextarea(text) {
    return String(text || "")
        .split(/\r?\n/)
        .map((linie) => linie.trim())
        .filter(Boolean);
}

function completeazaSelectColectii() {
    const select = document.getElementById("admin-produs-colectie");
    if (!select) return;
    const colectiiAdmin = adminProduseCatalog.colectii.length
        ? adminProduseCatalog.colectii
        : [
            { id: "disponibile", nume: "Plușuri disponibile" },
            { id: "la-comanda", nume: "Plușuri disponibile la comandă" },
        ];
    select.innerHTML = colectiiAdmin.map((colectie) => `
        <option value="${escapeHtml(colectie.id)}">${escapeHtml(colectie.nume || colectie.id)}</option>
    `).join("");
}

function renderAdminProduseLista() {
    const lista = document.getElementById("admin-produse-lista");
    if (!lista) return;

    if (!adminProduseCatalog.produse.length) {
        lista.innerHTML = `<div class="mesaj-catalog"><p>Nu există produse în catalog.</p></div>`;
        return;
    }

    lista.innerHTML = adminProduseCatalog.produse.map((produs) => `
        <article class="admin-produs-card ${produs.ascuns || produs.status === "hidden" ? "produs-ascuns" : ""}">
            <img src="${escapeHtml(imagineOptimizata(produs.imagini?.[0] || "", 260))}" alt="${escapeHtml(produs.nume)}" loading="lazy" decoding="async">
            <div>
                <h4>${escapeHtml(produs.nume)}</h4>
                <p>${escapeHtml(produs.pret || "Fără preț")} · ${escapeHtml(produs.colectie || "fără colecție")}</p>
                <p>Ordine: ${escapeHtml(produs.ordine ?? "")} ${produs.ascuns || produs.status === "hidden" ? "· ascuns" : ""}</p>
                <div class="actiuni admin-review-actiuni">
                    <button type="button" data-edit-product="${escapeHtml(produs.id)}">Editează</button>
                    <button type="button" class="btn-secundar" data-toggle-product="${escapeHtml(produs.id)}">${produs.ascuns || produs.status === "hidden" ? "Publică" : "Ascunde"}</button>
                    <button type="button" class="btn-secundar" data-delete-product="${escapeHtml(produs.id)}">Șterge</button>
                </div>
            </div>
        </article>
    `).join("");

    lista.querySelectorAll("[data-edit-product]").forEach((buton) => {
        buton.addEventListener("click", () => editeazaProdusAdmin(buton.dataset.editProduct));
    });
    lista.querySelectorAll("[data-toggle-product]").forEach((buton) => {
        buton.addEventListener("click", () => toggleProdusAdmin(buton.dataset.toggleProduct));
    });
    lista.querySelectorAll("[data-delete-product]").forEach((buton) => {
        buton.addEventListener("click", () => stergeProdusAdmin(buton.dataset.deleteProduct));
    });
}

function resetFormProdusAdmin() {
    const formular = document.getElementById("formular-admin-produs");
    if (!formular) return;
    formular.reset();
    document.getElementById("admin-produs-id").value = "";
    document.getElementById("admin-produs-public-ids").value = "";
    document.getElementById("admin-produs-ordine").value = "9999";
    document.getElementById("admin-produs-disponibilitate").value = "în stoc";
    document.getElementById("admin-produs-ascuns").checked = false;
    completeazaSelectColectii();
    actualizeazaPreviewImaginiAdmin();
}

function editeazaProdusAdmin(id) {
    const produs = adminProduseCatalog.produse.find((item) => item.id === id);
    if (!produs) return;
    completeazaSelectColectii();
    document.getElementById("admin-produs-id").value = produs.id || "";
    document.getElementById("admin-produs-nume").value = produs.nume || "";
    document.getElementById("admin-produs-pret").value = produs.pret || "";
    document.getElementById("admin-produs-colectie").value = produs.colectie || "disponibile";
    document.getElementById("admin-produs-ordine").value = produs.ordine ?? 9999;
    document.getElementById("admin-produs-descriere").value = produs.descriere || "";
    document.getElementById("admin-produs-filtre").value = textLinii(produs.filtre);
    document.getElementById("admin-produs-dimensiune").value = produs.specificatii?.Dimensiune || "";
    document.getElementById("admin-produs-materiale").value = produs.specificatii?.Materiale || "";
    document.getElementById("admin-produs-disponibilitate").value = produs.specificatii?.Disponibilitate || "";
    document.getElementById("admin-produs-imagini").value = textLinii(produs.imagini);
    document.getElementById("admin-produs-public-ids").value = textLinii(produs.imagePublicIds);
    document.getElementById("admin-produs-ascuns").checked = Boolean(produs.ascuns || produs.status === "hidden");
    actualizeazaPreviewImaginiAdmin();
    document.getElementById("formular-admin-produs").scrollIntoView({ behavior: "smooth", block: "start" });
}

function actualizeazaPreviewImaginiAdmin() {
    const preview = document.getElementById("admin-produs-preview");
    const textarea = document.getElementById("admin-produs-imagini");
    if (!preview || !textarea) return;
    const imagini = valoriDinTextarea(textarea.value);
    preview.innerHTML = imagini.length
        ? imagini.map((url) => `<img src="${escapeHtml(imagineOptimizata(url, 180))}" alt="Preview imagine produs" loading="lazy">`).join("")
        : `<p>Nu există imagini încă.</p>`;
}

async function uploadImagineProdusCloudinary(fisier) {
    const token = tokenAdminProduse();
    const semnaturaRaspuns = await fetch(PRODUCT_UPLOAD_SIGNATURE_ENDPOINT, {
        method: "POST",
        headers: {
            ...adminAuthProduse(),
            "Content-Type": "application/json",
        },
        body: JSON.stringify({
            contentType: fisier.type,
            fileSize: fisier.size,
        }),
    });
    const semnatura = await semnaturaRaspuns.json().catch(() => ({}));
    if (!token || !semnaturaRaspuns.ok || !semnatura.ok) {
        throw new Error("Uploadul imaginii nu a putut fi pregătit. Verifică tokenul admin și funcțiile Firebase.");
    }

    const uploadData = new FormData();
    uploadData.append("file", fisier);
    uploadData.append("api_key", String(semnatura.apiKey));
    uploadData.append("timestamp", String(semnatura.timestamp));
    uploadData.append("signature", String(semnatura.signature));
    uploadData.append("folder", String(semnatura.folder));

    const endpoint = `https://api.cloudinary.com/v1_1/${semnatura.cloudName}/image/upload`;
    const raspuns = await fetch(endpoint, { method: "POST", body: uploadData });
    const rezultat = await raspuns.json().catch(() => ({}));
    if (!raspuns.ok || !rezultat.secure_url || !rezultat.public_id) {
        console.error("[Ade's Soft Stitches] Uploadul imaginii produsului a eșuat.", {
            status: raspuns.status,
            response: rezultat,
        });
        throw new Error("Imaginea produsului nu a putut fi încărcată.");
    }
    return { url: rezultat.secure_url, publicId: rezultat.public_id };
}

async function incarcaImaginiProdusAdmin() {
    const input = document.getElementById("admin-produs-upload");
    const textarea = document.getElementById("admin-produs-imagini");
    const publicIds = document.getElementById("admin-produs-public-ids");
    const fisiere = [...(input?.files || [])].slice(0, 6);
    if (!fisiere.length || !textarea || !publicIds) return;

    const imaginiExistente = valoriDinTextarea(textarea.value);
    const idsExistente = valoriDinTextarea(publicIds.value);
    if (imaginiExistente.length + fisiere.length > 6) {
        throw new Error("Poți avea maximum 6 imagini per produs.");
    }

    const rezultate = [];
    for (const fisier of fisiere) {
        const comprimat = await comprimaImagineReview(fisier);
        rezultate.push(await uploadImagineProdusCloudinary(comprimat));
    }

    textarea.value = [...imaginiExistente, ...rezultate.map((item) => item.url)].join("\n");
    publicIds.value = [...idsExistente, ...rezultate.map((item) => item.publicId)].join("\n");
    input.value = "";
    actualizeazaPreviewImaginiAdmin();
}

function produsDinFormAdmin() {
    const id = document.getElementById("admin-produs-id").value.trim();
    const nume = document.getElementById("admin-produs-nume").value.trim();
    return {
        id,
        nume,
        pret: document.getElementById("admin-produs-pret").value.trim(),
        colectie: document.getElementById("admin-produs-colectie").value,
        ordine: Number(document.getElementById("admin-produs-ordine").value) || 9999,
        descriere: document.getElementById("admin-produs-descriere").value.trim(),
        filtre: valoriDinTextarea(document.getElementById("admin-produs-filtre").value),
        specificatii: {
            Dimensiune: document.getElementById("admin-produs-dimensiune").value.trim(),
            Materiale: document.getElementById("admin-produs-materiale").value.trim(),
            Disponibilitate: document.getElementById("admin-produs-disponibilitate").value.trim(),
        },
        imagini: valoriDinTextarea(document.getElementById("admin-produs-imagini").value),
        imagePublicIds: valoriDinTextarea(document.getElementById("admin-produs-public-ids").value),
        ascuns: document.getElementById("admin-produs-ascuns").checked,
    };
}

async function incarcaAdminProduse() {
    const mesaj = document.getElementById("mesaj-admin-produse");
    const lista = document.getElementById("admin-produse-lista");
    if (!mesaj || !lista) return;

    lista.innerHTML = `<div class="mesaj-catalog"><p>Se încarcă produsele...</p></div>`;
    try {
        const raspuns = await fetch(PRODUCT_ADMIN_ENDPOINT, {
            headers: adminAuthProduse(),
        });
        const rezultat = await raspuns.json().catch(() => ({}));
        if (!raspuns.ok || !rezultat.ok) {
            throw new Error(raspuns.status === 401 ? "Tokenul pentru produse nu este corect." : "Produsele nu au putut fi încărcate.");
        }
        adminProduseCatalog = normalizeazaCatalogAdmin(rezultat);
        completeazaSelectColectii();
        renderAdminProduseLista();
        mesaj.textContent = "";
    } catch (error) {
        logFetchError("Încărcarea produselor în admin", PRODUCT_ADMIN_ENDPOINT, error);
        lista.innerHTML = "";
        mesaj.textContent = error.message || "Produsele nu au putut fi încărcate.";
    }
}

async function salveazaProdusAdmin(event) {
    event.preventDefault();
    const mesaj = document.getElementById("mesaj-admin-produse");
    const buton = event.currentTarget.querySelector('button[type="submit"]');
    const textInitial = buton?.textContent || "";
    if (buton) {
        buton.disabled = true;
        buton.textContent = "Se salvează...";
    }

    try {
        await incarcaImaginiProdusAdmin();
        const produs = produsDinFormAdmin();
        const raspuns = await fetch(PRODUCT_ADMIN_ENDPOINT, {
            method: "POST",
            headers: {
                ...adminAuthProduse(),
                "Content-Type": "application/json",
            },
            body: JSON.stringify({ action: "save", product: produs }),
        });
        const rezultat = await raspuns.json().catch(() => ({}));
        if (!raspuns.ok || !rezultat.ok) {
            throw new Error("Produsul nu a putut fi salvat. Verifică numele, prețul, descrierea și imaginile.");
        }
        mesaj.textContent = "Produsul a fost salvat.";
        await incarcaAdminProduse();
        editeazaProdusAdmin(rezultat.product.id);
    } catch (error) {
        logFetchError("Salvarea produsului", PRODUCT_ADMIN_ENDPOINT, error);
        mesaj.textContent = error.message || "Produsul nu a putut fi salvat.";
    } finally {
        if (buton) {
            buton.disabled = false;
            buton.textContent = textInitial;
        }
    }
}

async function toggleProdusAdmin(id) {
    const produs = adminProduseCatalog.produse.find((item) => item.id === id);
    if (!produs) return;
    const ascuns = !(produs.ascuns || produs.status === "hidden");
    await actiuneProdusAdmin({ action: "toggle", id, ascuns }, ascuns ? "Produsul a fost ascuns." : "Produsul a fost publicat.");
}

async function stergeProdusAdmin(id) {
    if (!confirm("Sigur vrei să ștergi acest produs? Imaginile încărcate prin admin vor fi șterse și din Cloudinary.")) return;
    await actiuneProdusAdmin({ action: "delete", id }, "Produsul a fost șters.");
    resetFormProdusAdmin();
}

async function actiuneProdusAdmin(payload, mesajSucces) {
    const mesaj = document.getElementById("mesaj-admin-produse");
    try {
        const raspuns = await fetch(PRODUCT_ADMIN_ENDPOINT, {
            method: "POST",
            headers: {
                ...adminAuthProduse(),
                "Content-Type": "application/json",
            },
            body: JSON.stringify(payload),
        });
        const rezultat = await raspuns.json().catch(() => ({}));
        if (!raspuns.ok || !rezultat.ok) {
            throw new Error("Acțiunea nu a putut fi salvată.");
        }
        if (mesaj) mesaj.textContent = mesajSucces;
        await incarcaAdminProduse();
    } catch (error) {
        logFetchError("Administrarea produsului", PRODUCT_ADMIN_ENDPOINT, error, payload);
        if (mesaj) mesaj.textContent = error.message || "Acțiunea nu a putut fi salvată.";
    }
}

function initAdminProduse() {
    const formularToken = document.getElementById("formular-admin-produse-token");
    const inputToken = document.getElementById("admin-produse-token");
    const uitaToken = document.getElementById("uita-token-produse");
    const formularProdus = document.getElementById("formular-admin-produs");
    const produsNou = document.getElementById("produs-nou");
    const produsAnuleaza = document.getElementById("produs-anuleaza");
    const imaginiTextarea = document.getElementById("admin-produs-imagini");
    const uploadInput = document.getElementById("admin-produs-upload");
    if (!formularToken || !inputToken || !formularProdus) return;

    inputToken.value = tokenAdminProduse();
    completeazaSelectColectii();
    actualizeazaPreviewImaginiAdmin();

    formularToken.addEventListener("submit", (event) => {
        event.preventDefault();
        seteazaTokenAdminProduse(inputToken.value.trim());
        incarcaAdminProduse();
    });
    uitaToken?.addEventListener("click", () => {
        seteazaTokenAdminProduse("");
        inputToken.value = "";
        adminProduseCatalog = { colectii: [], produse: [] };
        renderAdminProduseLista();
    });
    formularProdus.addEventListener("submit", salveazaProdusAdmin);
    produsNou?.addEventListener("click", resetFormProdusAdmin);
    produsAnuleaza?.addEventListener("click", resetFormProdusAdmin);
    imaginiTextarea?.addEventListener("input", actualizeazaPreviewImaginiAdmin);
    uploadInput?.addEventListener("change", () => incarcaImaginiProdusAdmin().catch((error) => {
        const mesaj = document.getElementById("mesaj-admin-produse");
        logFetchError("Upload imagini produs", PRODUCT_UPLOAD_SIGNATURE_ENDPOINT, error);
        if (mesaj) mesaj.textContent = error.message || "Imaginile nu au putut fi încărcate.";
    }));

    if (inputToken.value) incarcaAdminProduse();
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
