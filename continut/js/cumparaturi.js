class Produs {
    constructor(id, nume, cantitate) {
        this.id = id;
        this.nume = nume;
        this.cantitate = cantitate;
    }
}

class StorageBase { /* Clasa de bază pentru serviciile de stocare, care definește metodele comune pentru obținerea tuturor produselor, adăugarea unui produs și obținerea următorului ID disponibil, dar nu implementează aceste metode, lăsând implementarea specifică pentru clasele derivate care vor folosi LocalStorage sau IndexedDB pentru a gestiona lista de cumpărături */
    async getAll() {
        throw new Error("Metoda getAll trebuie implementata.");
    }

    async add(produs) { 
        throw new Error("Metoda add trebuie implementata.");
    }

    async getNextId() {
        const produse = await this.getAll();
        return produse.length > 0 ? produse[produse.length - 1].id + 1 : 1;
    }
}

class LocalStorageService extends StorageBase { /* Clasa care implementează serviciul de stocare folosind LocalStorage, oferind metode pentru obținerea tuturor produselor, adăugarea unui produs și obținerea următorului ID disponibil, gestionând lista de cumpărături într-un format JSON stocat în LocalStorage sub o cheie specificată */
    constructor(key = "listaCumparaturi") {
        super();
        this.key = key;
    }

    async getAll() {
        const produseJSON = localStorage.getItem(this.key);
        return produseJSON ? JSON.parse(produseJSON) : [];
    }

    async add(produs) {
        const produse = await this.getAll();
        produse.push(produs);
        localStorage.setItem(this.key, JSON.stringify(produse));
    }
}

class IndexedDBService extends StorageBase { /* Clasa care implementează serviciul de stocare folosind IndexedDB, oferind metode pentru obținerea tuturor produselor, adăugarea unui produs și obținerea următorului ID disponibil, gestionând lista de cumpărături într-un obiect store specificat dintr-o bază de date IndexedDB, asigurându-se că baza de date și obiect store-ul sunt create și configurate corespunzător la deschiderea bazei de date */
    constructor() {
        super();
        this.dbName = "CumparaturiDB";
        this.storeName = "produse";
    }

    openDb() { /* Metoda care deschide conexiunea la baza de date IndexedDB, asigurându-se că baza de date și obiect store-ul sunt create și configurate corespunzător dacă nu există deja, și returnând o promisiune care se rezolvă cu instanța bazei de date deschise sau se respinge cu un mesaj de eroare în cazul în care deschiderea bazei de date eșuează */
        return new Promise((resolve, reject) => { /* Deschide conexiunea la baza de date IndexedDB cu numele specificat și versiunea 1, și configurează obiect store-ul pentru produse dacă este necesar, gestionând evenimentele de succes și eroare pentru a rezolva sau respinge promisiunea corespunzător */
            const request = indexedDB.open(this.dbName, 1);

            request.onupgradeneeded = (event) => { /* Eveniment care se declanșează atunci când baza de date este creată pentru prima dată sau când versiunea bazei de date este actualizată, asigurându-se că obiect store-ul pentru produse este creat dacă nu există deja, folosind "id" ca keyPath pentru a gestiona identificatorii produselor în baza de date */
                const db = event.target.result;
                if (!db.objectStoreNames.contains(this.storeName)) {
                    db.createObjectStore(this.storeName, { keyPath: "id" });
                }
            };

            request.onsuccess = (event) => { /* Eveniment care se declanșează atunci când conexiunea la baza de date IndexedDB este deschisă cu succes, rezolvând promisiunea cu instanța bazei de date deschise pentru a permite operațiuni ulterioare de citire și scriere în baza de date */
                resolve(event.target.result);
            };

            request.onerror = () => { /* Eveniment care se declanșează atunci când deschiderea conexiunii la baza de date IndexedDB eșuează, respingând promisiunea cu un mesaj de eroare pentru a informa utilizatorul despre problema întâmpinată la accesarea bazei de date */
                reject("Eroare la deschiderea bazei IndexedDB.");
            };
        });
    }

    async getAll() {
        const db = await this.openDb();

        return new Promise((resolve, reject) => {
            const transaction = db.transaction(this.storeName, "readonly"); /* Creează o tranzacție de citire pentru obiect store-ul specificat și obține toate produsele stocate în baza de date IndexedDB, sortându-le după ID înainte de a rezolva promisiunea cu lista de produse sau respingând promisiunea cu un mesaj de eroare în cazul în care citirea datelor eșuează */
            const store = transaction.objectStore(this.storeName); /* Obține toate produsele stocate în obiect store-ul specificat din baza de date IndexedDB, gestionând evenimentele de succes și eroare pentru a rezolva sau respinge promisiunea corespunzător, și sortând lista de produse după ID înainte de a o returna pentru a asigura o afișare ordonată a produselor în interfața utilizatorului */
            const request = store.getAll();

            request.onsuccess = () => { /* Eveniment care se declanșează atunci când citirea tuturor produselor din obiect store-ul specificat din baza de date IndexedDB este realizată cu succes, sortând lista de produse după ID și rezolvând promisiunea cu această listă pentru a permite afișarea ordonată a produselor în interfața utilizatorului */
                const produse = request.result || [];
                produse.sort((a, b) => a.id - b.id);
                resolve(produse);
            };

            request.onerror = () => { /* Eveniment care se declanșează atunci când citirea datelor din obiect store-ul specificat din baza de date IndexedDB eșuează, respingând promisiunea cu un mesaj de eroare pentru a informa utilizatorul despre problema întâmpinată la accesarea datelor din baza de date */
                reject("Eroare la citirea produselor din IndexedDB.");
            };
        });
    }

    async add(produs) {
        const db = await this.openDb();

        return new Promise((resolve, reject) => {
            const transaction = db.transaction(this.storeName, "readwrite");
            const store = transaction.objectStore(this.storeName);
            const request = store.add(produs);

            request.onsuccess = () => resolve();
            request.onerror = () => reject("Eroare la salvarea produsului in IndexedDB.");
        });
    }
}

let workerCumparaturi = null; /* Variabilă globală pentru a stoca referința la worker-ul de cumpărături, care va fi utilizată pentru a comunica între thread-ul principal și worker pentru a gestiona adăugarea produselor în lista de cumpărături și actualizarea interfeței utilizatorului în mod asincron, asigurându-se că worker-ul este creat și configurat corespunzător la inițializarea funcționalității de cumpărături și că mesajele și erorile sunt gestionate corespunzător pentru a oferi feedback utilizatorului despre starea operațiunilor de adăugare a produselor */

function getStorageService() { /* Funcție care returnează o instanță a serviciului de stocare corespunzător în funcție de opțiunea selectată de utilizator pentru tipul de stocare, verificând valoarea selectată și creând o instanță a clasei LocalStorageService sau IndexedDBService pentru a gestiona lista de cumpărături în funcție de preferința utilizatorului, asigurându-se că interfața utilizatorului este actualizată corespunzător atunci când se schimbă opțiunea de stocare pentru a reflecta datele din noul serviciu de stocare selectat */
    const tipStocare = document.getElementById("tip-stocare").value;
    return tipStocare === "indexedDB"
        ? new IndexedDBService()
        : new LocalStorageService();
}

function initCumparaturi() { /* Funcție de inițializare pentru funcționalitatea de cumpărături, care configurează interfața utilizatorului și logica pentru gestionarea listei de cumpărături, inclusiv crearea și configurarea worker-ului pentru a gestiona adăugarea produselor în mod asincron, afișarea produselor stocate în funcție de opțiunea de stocare selectată, și gestionarea evenimentelor pentru adăugarea produselor și schimbarea opțiunii de stocare pentru a asigura o experiență fluidă și interactivă pentru utilizator */
    const formular = document.getElementById("formular-cumparaturi");
    const mesaj = document.getElementById("mesaj-cumparaturi");
    const selectorStocare = document.getElementById("tip-stocare");

    if (window.Worker) { /* Verifică dacă browserul suportă Web Workers și, dacă da, creează o instanță a worker-ului pentru a gestiona adăugarea produselor în mod asincron, configurând evenimentul onmessage pentru a primi răspunsuri de la worker și a actualiza interfața utilizatorului în consecință, și gestionând eventualele erori care pot apărea la încărcarea worker-ului pentru a oferi feedback utilizatorului despre starea funcționalității de cumpărături */
        workerCumparaturi = new Worker("/js/worker.js");

        workerCumparaturi.onmessage = async function (event) { /* Eveniment care se declanșează atunci când worker-ul trimite un mesaj înapoi către thread-ul principal, gestionând datele primite pentru a adăuga produsul în lista de cumpărături folosind serviciul de stocare corespunzător și actualizând interfața utilizatorului pentru a reflecta noul produs adăugat, oferind feedback despre starea operațiunii de adăugare a produsului pentru a îmbunătăți experiența utilizatorului și asigurându-se că comunicarea între thread-ul principal și worker este realizată corect pentru a actualiza interfața utilizatorului în mod asincron atunci când un produs este adăugat în lista de cumpărături */
            const produs = event.data.produs;
            const storage = getStorageService();

            try { /* Încearcă să adauge produsul primit de la worker în lista de cumpărături folosind serviciul de stocare corespunzător și actualizează interfața utilizatorului pentru a reflecta noul produs adăugat, oferind feedback despre starea operațiunii de adăugare a produsului pentru a îmbunătăți experiența utilizatorului și gestionând eventualele erori care pot apărea în timpul adăugării produsului pentru a informa utilizatorul despre problemele întâmpinate */
                await storage.add(produs);
                await afiseazaProduse();

                mesaj.textContent = `Produsul "${produs.nume}" a fost adăugat cu succes.`;
                mesaj.style.color = "green";
            } catch (eroare) {
                mesaj.textContent = eroare;
                mesaj.style.color = "red";
            }
        };

        workerCumparaturi.onerror = function (eroare) { /* Eveniment care se declanșează atunci când apare o eroare în worker-ul de cumpărături, gestionând eroarea pentru a oferi feedback utilizatorului despre problema întâmpinată la încărcarea worker-ului și pentru a informa utilizatorul că funcționalitatea de cumpărături nu este disponibilă din cauza acestei erori, asigurându-se că mesajul de eroare este afișat într-un mod vizibil și informativ pentru a îmbunătăți experiența utilizatorului în cazul în care apar probleme cu worker-ul */
            console.log("Eroare worker:", eroare);
            mesaj.textContent = "Worker-ul nu a putut fi încărcat.";
            mesaj.style.color = "red";
        };
    } else {
        mesaj.textContent = "Browserul nu suportă Web Workers.";
        mesaj.style.color = "red";
    }

    afiseazaProduse();

    selectorStocare.addEventListener("change", function () { /* Eveniment care se declanșează atunci când utilizatorul schimbă opțiunea de stocare pentru lista de cumpărături, gestionând această schimbare pentru a actualiza interfața utilizatorului și a afișa produsele stocate în funcție de noua opțiune de stocare selectată, oferind feedback despre starea operațiunii de schimbare a opțiunii de stocare pentru a îmbunătăți experiența utilizatorului și asigurându-se că interfața utilizatorului este actualizată corespunzător pentru a reflecta datele din noul serviciu de stocare selectat */
        afiseazaProduse();
        mesaj.textContent = `A fost selectată salvarea în ${selectorStocare.value}.`;
        mesaj.style.color = "blue";
    });

    formular.addEventListener("submit", async function (event) { /* Eveniment care se declanșează atunci când utilizatorul trimite formularul pentru a adăuga un produs în lista de cumpărături, gestionând această acțiune pentru a prelua datele introduse de utilizator, a valida aceste date și a le trimite către worker-ul de cumpărături pentru a fi adăugate în mod asincron în lista de cumpărături, oferind feedback despre starea operațiunii de adăugare a produsului pentru a îmbunătăți experiența utilizatorului și asigurându-se că comunicarea între thread-ul principal și worker este realizată corect pentru a actualiza interfața utilizatorului în mod asincron atunci când un produs este adăugat în lista de cumpărături */
        event.preventDefault();

        const numeInput = document.getElementById("nume-produs");
        const cantitateInput = document.getElementById("cantitate-produs");

        const nume = numeInput.value.trim();
        const cantitate = Number(cantitateInput.value);

        if (!nume) {
            mesaj.textContent = "Numele produsului nu poate fi gol.";
            mesaj.style.color = "red";
            return;
        }

        if (isNaN(cantitate) || cantitate <= 0) {
            mesaj.textContent = "Cantitatea trebuie să fie un număr pozitiv.";
            mesaj.style.color = "red";
            return;
        }

        try { /* Încearcă să obțină următorul ID disponibil pentru produsul nou folosind serviciul de stocare corespunzător și să creeze un obiect Produs cu aceste date, apoi trimite acest obiect către worker-ul de cumpărături pentru a fi adăugat în mod asincron în lista de cumpărături, oferind feedback despre starea operațiunii de adăugare a produsului pentru a îmbunătăți experiența utilizatorului și gestionând eventualele erori care pot apărea în timpul obținerii ID-ului sau adăugării produsului pentru a informa utilizatorul despre problemele întâmpinate */
            const storage = getStorageService();
            const idNou = await storage.getNextId();
            const produsNou = new Produs(idNou, nume, cantitate);

            if (workerCumparaturi) {
                workerCumparaturi.postMessage(produsNou);
            }
            numeInput.value = "";
            cantitateInput.value = "";
        } catch (eroare) {
            mesaj.textContent = eroare;
            mesaj.style.color = "red";
        }
    });
}

async function afiseazaProduse() { /* Funcție asincronă care afișează produsele stocate în lista de cumpărături în interfața utilizatorului, obținând aceste produse folosind serviciul de stocare corespunzător și actualizând conținutul tabelului pentru a reflecta aceste produse, oferind feedback despre starea operațiunii de afișare a produselor pentru a îmbunătăți experiența utilizatorului și gestionând eventualele erori care pot apărea în timpul obținerii produselor pentru a informa utilizatorul despre problemele întâmpinate la accesarea datelor din baza de date */
    const corpTabel = document.getElementById("corp-tabel-cumparaturi");
    const storage = getStorageService();

    corpTabel.innerHTML = "";

    try {
        const produse = await storage.getAll();

        produse.forEach((produs) => {
            adaugaRandInTabel(produs);
        });
    } catch (eroare) {
        const mesaj = document.getElementById("mesaj-cumparaturi");
        mesaj.textContent = eroare;
        mesaj.style.color = "red";
    }
}

function adaugaRandInTabel(produs) { /* Funcție care adaugă un rând în tabelul de cumpărături pentru un produs dat, creând elementele necesare pentru a afișa ID-ul, numele și cantitatea produsului în tabel, și asigurându-se că noul rând este adăugat corect în corpul tabelului pentru a reflecta produsele stocate în lista de cumpărături în interfața utilizatorului */
    const corpTabel = document.getElementById("corp-tabel-cumparaturi");

    const rand = document.createElement("tr");

    const celulaId = document.createElement("td");
    celulaId.textContent = produs.id;

    const celulaNume = document.createElement("td");
    celulaNume.textContent = produs.nume;

    const celulaCantitate = document.createElement("td");
    celulaCantitate.textContent = produs.cantitate;

    rand.appendChild(celulaId);
    rand.appendChild(celulaNume);
    rand.appendChild(celulaCantitate);

    corpTabel.appendChild(rand);
}

document.getElementById("sterge-lista").addEventListener("click", async function () { /* Eveniment care se declanșează atunci când utilizatorul apasă butonul pentru a șterge lista de cumpărături, gestionând această acțiune pentru a șterge toate produsele stocate în lista de cumpărături folosind serviciul de stocare corespunzător și actualizând interfața utilizatorului pentru a reflecta faptul că lista a fost ștearsă, oferind feedback despre starea operațiunii de ștergere a listei pentru a îmbunătăți experiența utilizatorului și gestionând eventualele erori care pot apărea în timpul ștergerii datelor pentru a informa utilizatorul despre problemele întâmpinate la accesarea bazei de date */
    const storage = getStorageService();

    if (storage instanceof LocalStorageService) {
        localStorage.removeItem("listaCumparaturi");
    } else {
        indexedDB.deleteDatabase("CumparaturiDB");
    }

    document.getElementById("corp-tabel-cumparaturi").innerHTML = "";

    const mesaj = document.getElementById("mesaj-cumparaturi");
    mesaj.textContent = "Lista a fost ștearsă.";
    mesaj.style.color = "blue";
});