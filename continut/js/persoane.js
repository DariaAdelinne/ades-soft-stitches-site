function incarcaPersoane() {
    console.log("A intrat in incarcaPersoane");

    var xhr = new XMLHttpRequest(); /* Creează o instanță a obiectului XMLHttpRequest pentru a efectua o cerere HTTP asincronă pentru a încărca fișierul XML care conține informațiile despre persoane, gestionând evenimentele de schimbare a stării pentru a verifica când cererea este completă și pentru a procesa răspunsul primit, asigurându-se că datele sunt afișate corect în interfața utilizatorului sau că se afișează un mesaj de eroare în cazul în care încărcarea fișierului XML eșuează */

    xhr.onreadystatechange = function () {
        if (this.readyState === 4) {
            console.log("XML status:", this.status);
            console.log("XML response:", this.responseXML);

            if (this.status === 200) {
                afiseazaPersoane(this.responseXML);
            } else {
                document.getElementById("continut").innerHTML =
                    "<p>Nu s-a putut încărca fișierul persoane.xml.</p>";
            }
        }
    };

    xhr.open("GET", "resurse/persoane.xml", true);
    xhr.send();
}

function afiseazaPersoane(xml) {
    console.log("A intrat in afiseazaPersoane", xml);

    var container = document.getElementById("continut");

    if (!xml || !xml.documentElement) {
        container.innerHTML = "<p>Fișier XML invalid.</p>";
        return;
    }

    var persoane = xml.getElementsByTagName("persoana");
    console.log("Numar persoane:", persoane.length);

    if (persoane.length === 0) {
        container.innerHTML = "<p>Nu există persoane în fișierul XML.</p>";
        return;
    }

    var html = "<h2>Persoane</h2>";
    html += "<table class='tabel-persoane'>";
    html += "<tr><th>Nume</th><th>Prenume</th><th>Vârstă</th><th>Email</th><th>Telefon</th></tr>";

    for (var i = 0; i < persoane.length; i++) {
        var nume = persoane[i].getElementsByTagName("nume")[0].textContent;
        var prenume = persoane[i].getElementsByTagName("prenume")[0].textContent;
        var varsta = persoane[i].getElementsByTagName("varsta")[0].textContent;
        var email = persoane[i].getElementsByTagName("email")[0].textContent;
        var telefon = persoane[i].getElementsByTagName("telefon")[0].textContent;

        html += "<tr>";
        html += "<td>" + nume + "</td>";
        html += "<td>" + prenume + "</td>";
        html += "<td>" + varsta + "</td>";
        html += "<td>" + email + "</td>";
        html += "<td>" + telefon + "</td>";
        html += "</tr>";
    }

    html += "</table>";
    container.innerHTML = html;
}
