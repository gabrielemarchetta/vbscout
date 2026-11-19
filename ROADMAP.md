# Roadmap vbscout

Note per le prossime fasi, da riprendere dopo l'ottimizzazione dell'app.

## 1. Integrazione AI (OpenRouter) — in sospeso
- Account OpenRouter e chiave API creati a parte (chiave salvata in un password manager, mai nel codice).
- L'app è una PWA statica: una chiave inserita nel codice del browser è visibile a chiunque.
- Opzioni:
  1. Chiave inserita dall'utente nelle impostazioni (salvata solo sul suo dispositivo) — ok per uso personale.
  2. Proxy serverless (Cloudflare Worker / Vercel / Netlify) che custodisce la chiave — necessario se l'app è usata da altri.
  3. Nessun LLM nell'app, uso esterno sui dati esportati.
- Da decidere: cosa deve fare l'AI (analisi statistiche, suggerimenti tattici, report partita...).
- Limiti piano free OpenRouter da riverificare (indicativamente ~20 req/min, 50 req/giorno; ~1000/giorno con ≥10$ di crediti).

## 2. Protezione dell'app
- Nessuna chiave API lato client.
- Login + database per separare i dati di allenatori diversi (oggi tutto è locale/statico).
- GDPR: informativa privacy; dati di atleti minorenni → consenso dei genitori.

## 3. Test con altri allenatori
- Distribuzione via link (es. GitHub Pages) per raccogliere feedback, anche prima degli account.
- Partire con 3–5 allenatori conosciuti.
- Obiettivo: verificare uso settimanale reale.

## 4. Monetizzazione (solo dopo il punto 3)
- Abbonamento con Stripe, oppure licenza per società sportiva.
- Inquadramento fiscale (partita IVA o simili): sentire un commercialista.
