window.addEventListener("load", initPage);

let ctx;
let firstPosition = null; /* Variabilă globală pentru a stoca prima poziție a click-ului pe canvas */
let canvasElement = null; /* Variabilă globală pentru a stoca referința la elementul canvas */

function initPage() { /* Funcția care inițializează pagina după ce aceasta a fost încărcată complet */
    const hasDate = document.getElementById("date");
    const hasTime = document.getElementById("time");

    if (hasDate || hasTime) {
        updateDateTime();
        setInterval(updateDateTime, 1000);
    }

    displayBrowserInfo();
    initCanvas();
    initTableControls();
    pozitioneazaFloriRandom();
}

function updateDateTime() { /* Funcția care actualizează data și ora curentă în elementele HTML corespunzătoare */
    const now = new Date();
    const dateElement = document.getElementById("date");
    const timeElement = document.getElementById("time");

    if (dateElement) {
        dateElement.textContent = "Data curentă: " + now.toLocaleDateString("ro-RO");
    }

    if (timeElement) {
        timeElement.textContent = "Ora curentă: " + now.toLocaleTimeString("ro-RO");
    }
}

function setTextIfExists(id, text) {
    const el = document.getElementById(id);
    if (el) {
        el.textContent = text;
    }
}

function displayBrowserInfo() {
    setTextIfExists("URL-address", "Adresa URL curentă: " + window.location.href);
    setTextIfExists("browser-name", "Browser: " + navigator.userAgent);
    setTextIfExists("browser-version", "Versiune browser: " + navigator.appVersion);
    setTextIfExists("os-name", "Sistem de operare: " + navigator.platform);

    const locationEl = document.getElementById("location");
    if (!locationEl) return;

    if (navigator.geolocation) {
        locationEl.textContent = "Locație curentă: se obține...";
        navigator.geolocation.getCurrentPosition(showPosition, showPositionError);
    } else {
        locationEl.textContent = "Locație curentă: geolocația nu este suportată de browser.";
    }
}

function showPosition(position) { /* Funcția care afișează latitudinea și longitudinea curentă în elementul HTML corespunzător */
    const lat = position.coords.latitude.toFixed(4);
    const lon = position.coords.longitude.toFixed(4);
    document.getElementById("location").textContent = `Locație curentă: latitudine ${lat}, longitudine ${lon}`;
}

function showPositionError() { /* Funcția care afișează un mesaj de eroare dacă obținerea poziției curente a eșuat */
    document.getElementById("location").textContent = "Locație curentă: accesul la geolocație nu a fost permis.";
}

function initCanvas() { /* Funcția care inițializează elementul canvas și configurează evenimentele pentru desenarea dreptunghiurilor */
    canvasElement = document.getElementById("my-canvas");
    if (!canvasElement) {
        return;
    }

    ctx = canvasElement.getContext("2d"); /* Obține contextul de desenare 2D pentru canvas */
    firstPosition = null; /* Resetează prima poziție pentru desenare */

    drawCanvasGuide(); /* Desenează grila de ghidaj pe canvas la inițializare */

    document.getElementById("clearCanvas").onclick = function () { /* Funcția care șterge conținutul canvas-ului și resetează starea pentru desenare */
        ctx.clearRect(0, 0, canvasElement.width, canvasElement.height);
        firstPosition = null;
        drawCanvasGuide();
        document.getElementById("status").textContent = "Canvas șters. Aștept primul click...";
    };

    canvasElement.onclick = drawRect; /* Configurează evenimentul de click pe canvas pentru a desena dreptunghiuri în funcție de pozițiile selectate */
}

function drawCanvasGuide() { /* Funcția care desenează o grilă de ghidaj pe canvas pentru a ajuta utilizatorul să poziționeze dreptunghiurile */
    if (!canvasElement || !ctx) { /* Verifică dacă elementul canvas și contextul de desenare sunt disponibile înainte de a încerca să deseneze */
        return;
    }

    ctx.fillStyle = "#fffaf5";
    ctx.fillRect(0, 0, canvasElement.width, canvasElement.height);

    ctx.strokeStyle = "#d9c6b0";
    ctx.lineWidth = 1;

    for (let x = 0; x <= canvasElement.width; x += 50) { /* Desenează linii verticale la fiecare 50 de pixeli pentru a crea o grilă de ghidaj */
        ctx.beginPath(); /* Începe o nouă cale pentru fiecare linie pentru a evita conectarea liniilor între ele */
        ctx.moveTo(x, 0); /* Mută punctul de pornire al liniei la coordonatele (x, 0) pentru a începe linia de sus */
        ctx.lineTo(x, canvasElement.height); /* Desenează linia verticală până la coordonatele (x, înălțimea canvas-ului) pentru a termina linia de jos */
        ctx.stroke(); /* Desenează linia pe canvas folosind stilul și grosimea specificate anterior */
    }

    for (let y = 0; y <= canvasElement.height; y += 50) { /* Desenează linii orizontale la fiecare 50 de pixeli pentru a completa grila de ghidaj */
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(canvasElement.width, y);
        ctx.stroke();
    }
}

function getCanvasCoordinates(event) { /* Funcția care calculează coordonatele exacte pe canvas în funcție de poziția click-ului și de dimensiunea reală a canvas-ului, pentru a asigura desenarea corectă indiferent de redimensionarea sau scalarea canvas-ului în pagină */
    const rect = canvasElement.getBoundingClientRect(); /* Obține dimensiunea și poziția canvas-ului în raport cu fereastra browser-ului pentru a calcula corect coordonatele click-ului în raport cu canvas-ul, ținând cont de eventualele margini, padding sau redimensionări ale canvas-ului în pagină */
    const scaleX = canvasElement.width / rect.width; /* Calculează factorul de scalare pe axa X pentru a converti coordonatele click-ului în coordonate reale pe canvas, ținând cont de diferența dintre dimensiunea reală a canvas-ului și dimensiunea sa afișată în pagină */
    const scaleY = canvasElement.height / rect.height; /* Calculează factorul de scalare pe axa Y pentru a converti coordonatele click-ului în coordonate reale pe canvas, ținând cont de diferența dintre dimensiunea reală a canvas-ului și dimensiunea sa afișată în pagină */

    return { /* Returnează coordonatele exacte pe canvas în funcție de poziția click-ului și de dimensiunea reală a canvas-ului, pentru a asigura desenarea corectă indiferent de redimensionarea sau scalarea canvas-ului în pagină */
        x: Math.round((event.clientX - rect.left) * scaleX),
        y: Math.round((event.clientY - rect.top) * scaleY)
    };
}

function drawRect(event) { /* Funcția care desenează un dreptunghi pe canvas în funcție de pozițiile selectate prin click-uri succesive, folosind culorile specificate în controalele de culoare și actualizând starea pentru a permite desenarea corectă a dreptunghiurilor în funcție de pozițiile selectate */
    const coords = getCanvasCoordinates(event); /* Obține coordonatele exacte pe canvas în funcție de poziția click-ului și de dimensiunea reală a canvas-ului, pentru a asigura desenarea corectă indiferent de redimensionarea sau scalarea canvas-ului în pagină */
    const x = coords.x;
    const y = coords.y;
    const status = document.getElementById("status"); /* Obține referința la elementul HTML unde se afișează starea curentă a desenării pentru a actualiza mesajele afișate utilizatorului în funcție de acțiunile sale și de starea desenării */

    if (firstPosition === null) { /* Dacă prima poziție nu a fost setată încă, setează prima poziție la coordonatele click-ului curent și actualizează starea pentru a aștepta al doilea click pentru a desena dreptunghiul */
        firstPosition = { x: x, y: y };
        status.textContent = `Primul colț selectat la (${x}, ${y}). Aștept al doilea click.`;
        return;
    }

    const colorFill = document.getElementById("colorFill").value;
    const colorStroke = document.getElementById("colorStroke").value;

    /* Calculează coordonatele și dimensiunile dreptunghiului în funcție de prima poziție și de poziția curentă, pentru a desena un dreptunghi corect indiferent de ordinea în care sunt selectate colțurile */
    const left = Math.min(firstPosition.x, x);
    const top = Math.min(firstPosition.y, y);
    const width = Math.abs(x - firstPosition.x);
    const height = Math.abs(y - firstPosition.y);

    /* Desenează dreptunghiul pe canvas folosind culorile specificate în controalele de culoare și actualizează starea pentru a permite desenarea corectă a dreptunghiurilor în funcție de pozițiile selectate */
    ctx.fillStyle = colorFill;
    ctx.strokeStyle = colorStroke;
    ctx.lineWidth = 2;
    ctx.fillRect(left, top, width, height);
    ctx.strokeRect(left, top, width, height);

    /* Resetează prima poziție pentru a permite desenarea unui nou dreptunghi la următoarele click-uri și actualizează starea pentru a afișa informații despre dreptunghiul desenat și pentru a pregăti utilizatorul pentru următoarea acțiune de desenare */
    status.textContent = `Dreptunghi desenat între punctele (${firstPosition.x}, ${firstPosition.y}) și (${x}, ${y}).`;
    firstPosition = null;
}

function initTableControls() { /* Funcția care inițializează controalele pentru adăugarea de rânduri și coloane în tabel, configurând evenimentele pentru butoanele corespunzătoare și asigurându-se că acestea sunt disponibile înainte de a încerca să le configureze */
    const addRowBtn = document.getElementById("addRowBtn");
    const addColBtn = document.getElementById("addColBtn");

    if (!addRowBtn || !addColBtn) {
        return;
    }

    addRowBtn.onclick = addRowAtPosition;
    addColBtn.onclick = addColumnAtPosition;
}

function addRowAtPosition() { /*  Funcția care adaugă un rând în tabel la poziția specificată de utilizator, folosind culoarea specificată în controalele de culoare și asigurându-se că poziția introdusă este validă și că tabelul are suficiente coloane pentru a adăuga un rând complet */
    const table = document.getElementById("my-table");
    const rowIndexInput = document.getElementById("rowIndex");
    const rowColor = document.getElementById("rowColor").value;
    const totalRows = table.rows.length;

    let rowIndex = parseInt(rowIndexInput.value, 10); /*  Parsează poziția introdusă de utilizator pentru rândul nou, asigurându-se că este un număr valid și că se încadrează în limitele tabelului pentru a evita erorile la adăugarea rândului */
    if (isNaN(rowIndex)) { /* Dacă poziția introdusă nu este un număr valid, setează poziția la sfârșitul tabelului pentru a adăuga rândul nou la final */
        rowIndex = totalRows;
    }
    rowIndex = Math.max(1, Math.min(rowIndex, totalRows)); /* Asigură că poziția introdusă este cel puțin 1 (pentru a nu adăuga rândul înainte de antet) și cel mult egală cu numărul total de rânduri pentru a nu depăși limitele tabelului */

    /* Obține numărul de celule din primul rând al tabelului pentru a asigura că noul rând are același număr de celule ca și celelalte rânduri din tabel, menținând astfel consistența aspectului tabelului și evitând erorile la adăugarea rândului */
    const referenceRow = table.rows[0];
    const cellsCount = referenceRow.cells.length;
    const newRow = table.insertRow(rowIndex);

    for (let i = 0; i < cellsCount; i++) { /* Adaugă celule în noul rând și setează conținutul și culoarea de fundal pentru fiecare celulă, asigurându-se că noul rând are același număr de celule ca și celelalte rânduri din tabel pentru a menține consistența aspectului tabelului */
        const cell = newRow.insertCell(i);
        cell.textContent = `Linie nouă ${rowIndex}, coloana ${i + 1}`;
        cell.style.backgroundColor = rowColor;
    }
}

function addColumnAtPosition() { /* Funcția care adaugă o coloană în tabel la poziția specificată de utilizator, folosind culoarea specificată în controalele de culoare și asigurându-se că poziția introdusă este validă și că tabelul are suficiente rânduri pentru a adăuga o coloană completă */
    const table = document.getElementById("my-table");
    const colIndexInput = document.getElementById("colIndex");
    const colColor = document.getElementById("colColor").value;
    const totalCols = table.rows[0].cells.length;

    let colIndex = parseInt(colIndexInput.value, 10);
    if (isNaN(colIndex)) {
        colIndex = totalCols;
    }
    colIndex = Math.max(0, Math.min(colIndex, totalCols));

    for (let i = 0; i < table.rows.length; i++) {
        const cellTag = i === 0 ? "th" : "td";
        const newCell = document.createElement(cellTag);
        newCell.style.backgroundColor = colColor;

        if (i === 0) {
            newCell.textContent = `Coloana ${colIndex + 1}`;
        } else {
            newCell.textContent = `Celulă ${i}, ${colIndex + 1}`;
        }

        const currentRow = table.rows[i];
        if (colIndex >= currentRow.cells.length) {
            currentRow.appendChild(newCell);
        } else {
            currentRow.insertBefore(newCell, currentRow.cells[colIndex]);
        }
    }
}


