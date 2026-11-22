# CLAUDE.md — Regole del progetto

## Chi sono e cosa costruisco
- Allenatore di pallavolo (Serie C, settore giovanile). Costruisco strumenti pratici per il coaching.
- Le app le uso io in palestra, da smartphone, spesso senza connessione.
- Parlami in italiano. Spiega le scelte tecniche in modo semplice e breve.

## Stack obbligatorio
- Solo HTML, CSS e JavaScript vanilla. Niente framework (React, Vue...) e niente build step (npm, bundler).
- Niente librerie da CDN. Le uniche librerie ammesse sono quelle già salvate in `vendor/` (jsPDF, html2canvas); per aggiungerne altre chiedimelo prima.
- Mobile-first: il layout parte dallo smartphone in verticale, poi si adatta a tablet e desktop.
- PWA offline: manifest.json + service worker. L'app deve funzionare completamente senza rete dopo il primo caricamento.
- Dati salvati in locale (localStorage o IndexedDB). Nessun backend.
- Ad ogni modifica dell'app incrementa `CACHE_VERSION` in `sw.js` (es. `vbscout-v21` → `vbscout-v22`). Se aggiungi un file, inseriscilo anche in `APP_SHELL`.

## Struttura
- `index.html` contiene HTML, CSS e JS dell'app (è già grande, quasi 3000 righe): non dividerlo in più file senza chiedermelo.
- `sw.js` = service worker, `manifest.json` = dati PWA, `vendor/` = librerie locali, icone PNG nella cartella principale.
- Prima di modificare `index.html`, cerca la sezione interessata invece di rileggere tutto il file.
- Nomi di variabili e funzioni in inglese, commenti e testi dell'interfaccia in italiano.

## Interfaccia
- Pulsanti grandi (almeno 44px), utilizzabili con un dito durante allenamento o partita.
- Contrasto alto: deve leggersi bene anche in palestra con luce forte.
- Nessuna azione distruttiva (cancellare dati, reset) senza conferma.

## Come lavorare con me
- Per modifiche grandi: prima un piano breve, aspetta il mio ok, poi scrivi il codice.
- Dammi sempre file completi e funzionanti, non frammenti da incollare.
- Raggruppa tutte le modifiche in un'unica consegna.
- Se una mia richiesta ha un errore tecnico o c'è una strada più semplice, dimmelo prima di eseguire.
- Indica quando una cosa è certa e quando è un'ipotesi.

## Verifica prima di consegnare
- Controlla che non ci siano errori in console.
- Verifica che l'app si apra e funzioni offline.
- Controlla il layout a 375px di larghezza (smartphone).
- Alla fine elenca in 3–5 righe cosa hai cambiato.

## Git
- Un commit per ogni modifica logica, messaggio in italiano chiaro (es. "Aggiunta statistica ricezione per rotazione").
- Lavora su un branch e apri una pull request; non fare push su `main` e non cancellare file senza chiedermelo.

## Note specifiche di VBScout
- App di scouting pallavolo: live e da video, con traiettorie, zone ed esiti.
- Report esportabili in PDF anche offline (jsPDF + html2canvas).
- Tutti i percorsi restano relativi (`./`): l'app è pubblicata da questo repo.
<!-- Aggiungi qui altre regole specifiche (scala di valutazione, roster, schermate...) -->
