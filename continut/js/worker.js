/* Worker JavaScript pentru gestionarea operațiunilor legate de cumpărături, care ascultă mesajele primite de la thread-ul principal și răspunde cu informații despre produsul adăugat în lista de cumpărături, asigurându-se că comunicarea între thread-ul principal și worker este realizată corect pentru a actualiza interfața utilizatorului în mod asincron atunci când un produs este adăugat în lista de cumpărături, și oferind feedback despre starea operațiunii de adăugare a produsului pentru a îmbunătăți experiența utilizatorului */
self.onmessage = function (event) { /* Eveniment care se declanșează atunci când worker-ul primește un mesaj de la thread-ul principal, gestionând datele primite pentru a răspunde cu informații despre produsul adăugat în lista de cumpărături și oferind feedback despre starea operațiunii de adăugare a produsului pentru a îmbunătăți experiența utilizatorului, asigurându-se că comunicarea între thread-ul principal și worker este realizată corect pentru a actualiza interfața utilizatorului în mod asincron atunci când un produs este adăugat în lista de cumpărături */
    console.log("Worker notificat: s-a apăsat butonul Adaugă.");

    const produs = event.data;

    self.postMessage({
        status: "ok",
        produs: produs
    });
};