import socket
import os
import threading
import gzip
import subprocess
import sys
from urllib.parse import unquote

director_continut = os.path.join(os.path.dirname(__file__), '..', 'continut')  # Stabilește de unde sunt servite fișierele
director_proiect = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))

tipuri_continut = {
    '.html': 'text/html; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.js': 'application/javascript; charset=utf-8',
    '.xml': 'application/xml; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.ico': 'image/ico',
    '.mp4': 'video/mp4'
}


def genereaza_catalog_la_pornire():
    script = os.path.join(director_proiect, 'scripts', 'genereaza_catalog.py')
    if not os.path.exists(script):
        print("AVERTISMENT: Nu am găsit generatorul catalogului.")
        return

    try:
        rezultat = subprocess.run(
            [sys.executable, script],
            cwd=director_proiect,
            text=True,
            capture_output=True,
            check=False
        )
        if rezultat.stdout:
            print(rezultat.stdout.strip())
        if rezultat.returncode != 0:
            print("AVERTISMENT: Catalogul produselor nu a putut fi generat.")
            if rezultat.stderr:
                print(rezultat.stderr.strip())
    except Exception as e:
        print(f"AVERTISMENT: Eroare la generarea catalogului: {e}")


def trimite_raspuns_text(clientsocket, cod, mesaj, content_type='text/plain; charset=utf-8'): # Funcție care trimite un răspuns HTTP text către client, construind antetul corespunzător cu codul de stare, lungimea conținutului și tipul de conținut specificat, și apoi trimițând acest antet împreună cu mesajul text către client pentru a oferi feedback despre starea operațiunii solicitate și pentru a îmbunătăți experiența utilizatorului prin furnizarea de informații clare și relevante în răspunsul HTTP
    header = f"HTTP/1.1 {cod}\r\n"
    header += f"Content-Length: {len(mesaj.encode('utf-8'))}\r\n"
    header += f"Content-Type: {content_type}\r\n"
    header += "X-Content-Type-Options: nosniff\r\n"
    header += "Referrer-Policy: strict-origin-when-cross-origin\r\n"
    header += "Connection: close\r\n\r\n"
    clientsocket.sendall(header.encode('utf-8') + mesaj.encode('utf-8'))


def citeste_cerere_completa(clientsocket): # Funcție care citește o cerere HTTP completă de la client, gestionând atât antetul cât și corpul cererii, asigurându-se că toate datele sunt citite corect și complet înainte de a returna cererea pentru procesare, oferind feedback despre starea operațiunii de citire a cererii pentru a îmbunătăți experiența utilizatorului și gestionând eventualele erori care pot apărea în timpul citirii datelor pentru a informa utilizatorul despre problemele întâmpinate la primirea cererii
    data = b'' # Inițializează un buffer pentru a stoca datele primite de la client

    while b'\r\n\r\n' not in data: # Continuă să citești date de la client până când întâlnește secvența de sfârșit a antetului HTTP, asigurându-se că toate datele antetului sunt citite complet înainte de a încerca să proceseze cererea, oferind feedback despre starea operațiunii de citire a antetului pentru a îmbunătăți experiența utilizatorului și gestionând eventualele erori care pot apărea în timpul citirii datelor pentru a informa utilizatorul despre problemele întâmpinate la primirea cererii
        bucata = clientsocket.recv(1024)
        if not bucata:
            break
        data += bucata

    if b'\r\n\r\n' not in data: # Dacă nu s-a găsit secvența de sfârșit a antetului, înseamnă că cererea este incompletă sau invalidă, așa că returnează datele primite până acum pentru a fi procesate ca o cerere incompletă, oferind feedback despre starea operațiunii de citire a cererii pentru a îmbunătăți experiența utilizatorului și gestionând eventualele erori care pot apărea în timpul citirii datelor pentru a informa utilizatorul despre problemele întâmpinate la primirea cererii
        return data

    header_bytes, body_initial = data.split(b'\r\n\r\n', 1) 
    header_text = header_bytes.decode('utf-8', errors='ignore')

    content_length = 0
    for linie in header_text.split('\r\n'): # Parcurge fiecare linie din antet pentru a găsi linia care specifică lungimea conținutului (Content-Length) și extrage această valoare pentru a ști cât de multe date trebuie să mai citească pentru corpul cererii, oferind feedback despre starea operațiunii de citire a antetului pentru a îmbunătăți experiența utilizatorului și gestionând eventualele erori care pot apărea în timpul citirii datelor pentru a informa utilizatorul despre problemele întâmpinate la primirea cererii
        if linie.lower().startswith('content-length:'):
            content_length = int(linie.split(':', 1)[1].strip())
            break

    while len(body_initial) < content_length: # Continuă să citești date de la client până când a citit întreaga cantitate de date specificată în Content-Length pentru corpul cererii, asigurându-se că toate datele corpului sunt citite complet înainte de a returna cererea pentru procesare, oferind feedback despre starea operațiunii de citire a corpului pentru a îmbunătăți experiența utilizatorului și gestionând eventualele erori care pot apărea în timpul citirii datelor pentru a informa utilizatorul despre problemele întâmpinate la primirea cererii
        bucata = clientsocket.recv(1024)
        if not bucata:
            break
        body_initial += bucata

    return header_bytes + b'\r\n\r\n' + body_initial


def proceseaza_cererea(clientsocket, address): # Funcție care procesează o cerere HTTP primită de la client, citind cererea completă, extrăgând metoda și resursa solicitată, și apoi gestionând această cerere în funcție de metoda și resursa specificate, oferind feedback despre starea operațiunii de procesare a cererii pentru a îmbunătăți experiența utilizatorului și gestionând eventualele erori care pot apărea în timpul procesării datelor pentru a informa utilizatorul despre problemele întâmpinate la primirea cererii
    try: # Citește cererea completă de la client și verifică dacă datele au fost primite corect, oferind feedback despre starea operațiunii de citire a cererii pentru a îmbunătăți experiența utilizatorului și gestionând eventualele erori care pot apărea în timpul citirii datelor pentru a informa utilizatorul despre problemele întâmpinate la primirea cererii
        data = citeste_cerere_completa(clientsocket)
        if not data:
            clientsocket.close() 
            return

        separator = b'\r\n\r\n'
        parti = data.split(separator, 1) # Împarte datele primite în două părți: antetul (header) și corpul (body) cererii, folosind secvența de sfârșit a antetului ca separator, oferind feedback despre starea operațiunii de procesare a cererii pentru a îmbunătăți experiența utilizatorului și gestionând eventualele erori care pot apărea în timpul procesării datelor pentru a informa utilizatorul despre problemele întâmpinate la primirea cererii

        header_bytes = parti[0]
        cerere = header_bytes.decode('utf-8', errors='ignore')

        prima_linie = cerere.split('\r\n')[0]
        elemente = prima_linie.split(' ')
 
        if len(elemente) < 2: # Verifică dacă prima linie a cererii conține cel puțin două elemente (metoda și resursa), dacă nu, înseamnă că cererea este invalidă, așa că trimite un răspuns de eroare către client și închide conexiunea, oferind feedback despre starea operațiunii de procesare a cererii pentru a îmbunătăți experiența utilizatorului și gestionând eventualele erori care pot apărea în timpul procesării datelor pentru a informa utilizatorul despre problemele întâmpinate la primirea cererii
            clientsocket.close()
            return

        metoda = elemente[0]
        numeResursa = unquote(elemente[1].split('?')[0])

        print(f"Cerere pentru: {numeResursa}")

        if metoda == 'POST':
            trimite_raspuns_text(clientsocket, "405 Method Not Allowed", "Serverul local servește doar fișiere statice.")
            return

        if numeResursa == '/': # Dacă resursa solicitată este '/', setează numele resursei la '/index.html' pentru a servi pagina principală a site-ului, oferind feedback despre starea operațiunii de procesare a cererii pentru a îmbunătăți experiența utilizatorului și gestionând eventualele erori care pot apărea în timpul procesării datelor pentru a informa utilizatorul despre problemele întâmpinate la primirea cererii
            numeResursa = '/index.html'

        cale_fisier = os.path.abspath(os.path.join(director_continut, numeResursa.lstrip('/')))
        print(f"Cale completa: {cale_fisier}")

        if not cale_fisier.startswith(os.path.abspath(director_continut) + os.sep):
            trimite_raspuns_text(clientsocket, "403 Forbidden", "Acces interzis.")
            return

        if os.path.basename(cale_fisier).startswith('.'):
            trimite_raspuns_text(clientsocket, "404 Not Found", "Fișierul nu există.")
            return

        if os.path.exists(cale_fisier) and os.path.isfile(cale_fisier): # Verifică dacă fișierul solicitat există și este un fișier valid, și dacă da, încearcă să îl deschidă și să îl servească către client, oferind feedback despre starea operațiunii de procesare a cererii pentru a îmbunătăți experiența utilizatorului și gestionând eventualele erori care pot apărea în timpul procesării datelor pentru a informa utilizatorul despre problemele întâmpinate la primirea cererii
            _, extensie = os.path.splitext(cale_fisier)
            extensie = extensie.lower()

            content_type = tipuri_continut.get(extensie, 'application/octet-stream')

            with open(cale_fisier, 'rb') as f: # Deschide fișierul solicitat în modul binar pentru a citi conținutul acestuia, oferind feedback despre starea operațiunii de citire a fișierului pentru a îmbunătăți experiența utilizatorului și gestionând eventualele erori care pot apărea în timpul citirii datelor pentru a informa utilizatorul despre problemele întâmpinate la accesarea fișierului
                continut_fisier = f.read()

            suporta_gzip = 'Accept-Encoding' in cerere and 'gzip' in cerere
            extra_header = ""

            if suporta_gzip and extensie in ['.html', '.css', '.js']: # Dacă clientul acceptă codificare gzip și fișierul solicitat este de tip text (HTML, CSS sau JavaScript), comprimă conținutul fișierului folosind gzip pentru a reduce dimensiunea datelor trimise către client și adaugă un antet suplimentar pentru a indica că conținutul este codificat cu gzip, oferind feedback despre starea operațiunii de procesare a cererii pentru a îmbunătăți experiența utilizatorului și gestionând eventualele erori care pot apărea în timpul procesării datelor pentru a informa utilizatorul despre problemele întâmpinate la primirea cererii
                continut_final = gzip.compress(continut_fisier) 
                extra_header = "Content-Encoding: gzip\r\n"
            else:
                continut_final = continut_fisier

            # Construiește antetul HTTP pentru răspuns, incluzând codul de stare 200 OK, lungimea conținutului (care poate fi dimensiunea originală sau dimensiunea comprimată în funcție de suportul gzip), tipul de conținut corespunzător extensiei fișierului, orice antet suplimentar necesar pentru codificarea gzip, și alte antete standard precum Server și Connection, apoi trimite acest antet împreună cu conținutul fișierului către client pentru a servi fișierul solicitat și pentru a oferi feedback despre starea operațiunii de procesare a cererii pentru a îmbunătăți experiența utilizatorului și gestionând eventualele erori care pot apărea în timpul procesării datelor pentru a informa utilizatorul despre problemele întâmpinate la primirea cererii
            header = "HTTP/1.1 200 OK\r\n"
            header += "X-Content-Type-Options: nosniff\r\n"
            header += "Referrer-Policy: strict-origin-when-cross-origin\r\n"
            header += f"Content-Length: {len(continut_final)}\r\n"
            header += f"Content-Type: {content_type}\r\n"
            header += extra_header
            header += "Server: AdesSoftStitchesServer\r\n"
            header += "Connection: close\r\n\r\n"

            clientsocket.sendall(header.encode('utf-8') + continut_final)

        else: # Dacă fișierul solicitat nu există sau nu este un fișier valid, trimite un răspuns de eroare 404 către client pentru a informa că resursa solicitată nu a fost găsită, oferind feedback despre starea operațiunii de procesare a cererii pentru a îmbunătăți experiența utilizatorului și gestionând eventualele erori care pot apărea în timpul procesării datelor pentru a informa utilizatorul despre problemele întâmpinate la primirea cererii
            print(f"EROARE 404: Nu am gasit {cale_fisier}")

            mesaj_404 = "<h1>Eroare 404 - Semnal Pierdut</h1><p>Naveta s-a prabusit, nu putem gasi fisierul cerut.</p>"

            header_404 = "HTTP/1.1 404 Not Found\r\n"
            header_404 += f"Content-Length: {len(mesaj_404.encode('utf-8'))}\r\n"
            header_404 += "Content-Type: text/html; charset=utf-8\r\n"
            header_404 += "Connection: close\r\n\r\n"

            clientsocket.sendall(header_404.encode('utf-8') + mesaj_404.encode('utf-8'))

    except Exception as e: # Dacă apare o eroare în timpul procesării cererii, cum ar fi o problemă de conexiune sau o eroare neașteptată, prinde această excepție și afișează un mesaj de eroare în consolă pentru a informa despre problema întâmpinată, oferind feedback despre starea operațiunii de procesare a cererii pentru a îmbunătăți experiența utilizatorului și gestionând eventualele erori care pot apărea în timpul procesării datelor pentru a informa utilizatorul despre problemele întâmpinate la primirea cererii
        print(f"Eroare de conexiune: {e}")

    finally: # Închide conexiunea cu clientul după ce cererea a fost procesată, indiferent dacă a fost procesată cu succes sau dacă a apărut o eroare, pentru a elibera resursele și pentru a asigura că conexiunea este închisă corespunzător, oferind feedback despre starea operațiunii de închidere a conexiunii pentru a îmbunătăți experiența utilizatorului și gestionând eventualele erori care pot apărea în timpul închiderii conexiunii pentru a informa utilizatorul despre problemele întâmpinate la închiderea conexiunii
        clientsocket.close()

# Configurarea și pornirea serverului
genereaza_catalog_la_pornire()
serversocket = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
serversocket.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
serversocket.bind(('', 8888))
serversocket.listen(5)

print("=====================================================")
print("Serverul Ade's Soft Stitches este LIVE pe portul 8888!")
print(f"Serveste fisiere din: {director_continut}")
print("=====================================================")

while True: # Așteaptă conexiuni de la clienți și procesează fiecare cerere într-un fir separat pentru a permite gestionarea simultană a mai multor cereri, oferind feedback despre starea operațiunii de așteptare a conexiunilor pentru a îmbunătăți experiența utilizatorului și gestionând eventualele erori care pot apărea în timpul acceptării conexiunilor pentru a informa utilizatorul despre problemele întâmpinate la primirea cererii
    clientsocket, address = serversocket.accept()
    fir_executie = threading.Thread(target=proceseaza_cererea, args=(clientsocket, address))
    fir_executie.start()
