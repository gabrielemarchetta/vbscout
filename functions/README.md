# Attivazione automatica delle licenze (webhook Stripe)

Quando qualcuno paga con il Payment Link, Stripe avvisa questa funzione (`stripeWebhook`), che:

1. controlla la firma dell'avviso (solo Stripe può attivare licenze);
2. trova l'account: prima con l'UID che l'app mette nel link, poi con l'email del pagamento;
3. scrive `licenze/{UID}` = `{piano: "stagione", scadenza: 30 giugno 23:59}` (le licenze `gold` non vengono toccate);
4. registra il pagamento in `pagamenti/{id}`. Se non trova l'account, lo mette in `pagamenti_da_abbinare/{id}` e la licenza va creata a mano;
5. con un **rimborso totale** fa scadere la licenza.

I pagamenti di prova (sandbox) vengono ignorati.

## Installazione (una volta sola, circa 15 minuti)

### 1. Piano Blaze di Firebase
Console Firebase → progetto **vbscout** → in basso a sinistra **Upgrade** → **Blaze**.
Poi, nella Console Google Cloud → Fatturazione → **Budget e avvisi**, crea un budget di 5 € con avviso via email.
Con i volumi di VBScout la spesa prevista è di 0 €: la quota gratuita copre 2 milioni di chiamate al mese.

### 2. Webhook in Stripe (modalità live)
Stripe → **Sviluppatori → Webhook → Aggiungi destinazione**:
- eventi: `checkout.session.completed` e `charge.refunded`;
- tipo: endpoint webhook;
- URL: `https://europe-west1-vbscout-2c7fb.cloudfunctions.net/stripeWebhook`

Apri la destinazione creata, sezione **Segreto di firma**, e copia il valore `whsec_...`. Non incollarlo in chat né altrove: serve solo al punto 3.

### 3. Pubblicare la funzione (Cloud Shell)
Vai su https://shell.cloud.google.com, con lo stesso account Google di Firebase, e incolla un comando alla volta:

```bash
git clone https://github.com/gabrielemarchetta/vbscout.git && cd vbscout && git checkout claude/epic-keller-tzjpx8
```
```bash
cd functions && npm ci && node test.js && cd ..
```
```bash
npx -y firebase-tools@latest functions:secrets:set STRIPE_WEBHOOK_SECRET --project vbscout-2c7fb
```
Incolla `whsec_...` quando lo chiede: non si vede mentre scrivi, è normale. Se chiede di abilitare un'API, rispondi **Y**.
```bash
npx -y firebase-tools@latest deploy --only functions --project vbscout-2c7fb
```
Alla fine stampa l'indirizzo della funzione.
Se è diverso da quello messo in Stripe (per esempio un indirizzo `...run.app`), copialo nella destinazione Stripe al posto del vecchio.

### 5. Prova
Fai un acquisto vero dall'app con un tuo account di prova. Entro pochi secondi:
- in Firestore compare `licenze/{UID}`;
- l'app mostra «Licenza attiva»;
- in Stripe → Webhook → la destinazione mostra la consegna con esito **200**.

Poi rimborsalo da Stripe: la licenza diventa scaduta. Nel log della funzione (Console Firebase → Functions → Log) trovi l'esito di ogni avviso.

## Se qualcosa va storto
- **Stripe mostra errori 400** → il segreto è sbagliato: ripeti gli ultimi due comandi del punto 3.
- **Stripe mostra errori 500** → guarda il log della funzione. Stripe riprova da solo per 3 giorni.
- **Pagamento in `pagamenti_da_abbinare`** → il cliente ha pagato con un'email diversa da quella dell'account. Crea la licenza a mano come prima.
- **Nuova stagione** → la scadenza si calcola da sola: da luglio diventa il 30 giugno dell'anno dopo.
