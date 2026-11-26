// Cloud Function: riceve gli avvisi (webhook) di Stripe e attiva/disattiva la licenza in Firestore.
// Il segreto del webhook (whsec_...) sta nel Secret Manager di Google, MAI nel codice.
'use strict';
const { onRequest } = require('firebase-functions/v2/https');
const { defineSecret } = require('firebase-functions/params');
const admin = require('firebase-admin');
const { handleWebhook } = require('./handler');

admin.initializeApp();
const STRIPE_WEBHOOK_SECRET = defineSecret('STRIPE_WEBHOOK_SECRET');

// Converte i Timestamp di Firestore in Date (e viceversa lo fa l'SDK da solo)
const toPlain = d => { const o = { ...d }; for (const k in o) if (o[k] && typeof o[k].toDate === 'function') o[k] = o[k].toDate(); return o; };

const db = {
  async get(path) { const s = await admin.firestore().doc(path).get(); return s.exists ? toPlain(s.data()) : null; },
  async set(path, data) { await admin.firestore().doc(path).set(data); },
  async findPaymentByIntent(pi) {
    const q = await admin.firestore().collection('pagamenti').where('payment_intent', '==', pi).limit(1).get();
    return q.empty ? null : { id: q.docs[0].id, data: toPlain(q.docs[0].data()) };
  },
  async getUser(uid) { try { return await admin.auth().getUser(uid); } catch (_) { return null; } },
  async getUserByEmail(email) { try { return await admin.auth().getUserByEmail(email); } catch (_) { return null; } },
};

exports.stripeWebhook = onRequest(
  { region: 'europe-west1', secrets: [STRIPE_WEBHOOK_SECRET], maxInstances: 2, memory: '256MiB', timeoutSeconds: 30 },
  async (req, res) => {
    if (req.method !== 'POST') { res.status(405).send('solo POST'); return; }
    try {
      const r = await handleWebhook({
        rawBody: req.rawBody, signature: req.get('stripe-signature'),
        secret: STRIPE_WEBHOOK_SECRET.value(), db,
        allowTest: process.env.ALLOW_TEST === '1',   // solo per prove con la sandbox
      });
      console.log('stripe', r.code, r.body);
      res.status(r.code).send(r.body);
    } catch (e) {
      console.error('errore webhook', e);
      res.status(500).send('errore');               // Stripe riprova da solo per 3 giorni
    }
  });
