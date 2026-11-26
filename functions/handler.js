// Logica del webhook Stripe → licenza VBScout (senza dipendenze: testabile con `node test.js`).
// Il database viene passato da index.js (db), così i test usano un finto database in memoria.
'use strict';
const crypto = require('crypto');

const PLAN = 'stagione';           // nome del piano scritto in licenze/{uid}.piano
const TOLERANCE_S = 300;           // firma Stripe valida per 5 minuti (protezione dai replay)

// Verifica l'intestazione Stripe-Signature: "t=TIMESTAMP,v1=FIRMA[,v1=...]"
function verifySignature(rawBody, header, secret, nowS = Math.floor(Date.now() / 1000)) {
  if (!header || !secret || rawBody == null) return false;
  let t = null; const sigs = [];
  for (const part of String(header).split(',')) {
    const i = part.indexOf('='); if (i < 0) continue;
    const k = part.slice(0, i).trim(), v = part.slice(i + 1).trim();
    if (k === 't') t = v; else if (k === 'v1') sigs.push(v);
  }
  if (!t || !/^\d+$/.test(t) || !sigs.length) return false;
  if (Math.abs(nowS - Number(t)) > TOLERANCE_S) return false;
  const body = Buffer.isBuffer(rawBody) ? rawBody : Buffer.from(String(rawBody), 'utf8');
  const expected = crypto.createHmac('sha256', secret)
    .update(Buffer.concat([Buffer.from(t + '.', 'utf8'), body])).digest();
  return sigs.some(s => {
    if (!/^[0-9a-f]{64}$/i.test(s)) return false;
    return crypto.timingSafeEqual(expected, Buffer.from(s, 'hex'));
  });
}

// Fine stagione: 30 giugno alle 23:59:59 (ora italiana, CEST = UTC+2).
// Da luglio in poi si vende la stagione successiva.
function seasonEnd(now = new Date()) {
  const y = now.getUTCMonth() >= 6 ? now.getUTCFullYear() + 1 : now.getUTCFullYear();
  return new Date(Date.UTC(y, 5, 30, 21, 59, 59));
}

// Trova l'utente Firebase: prima dall'UID passato dall'app, poi dall'email del pagamento
async function resolveUid(session, db) {
  const ref = typeof session.client_reference_id === 'string' ? session.client_reference_id.trim() : '';
  if (ref && /^[A-Za-z0-9]{10,128}$/.test(ref)) {
    const u = await db.getUser(ref); if (u) return { uid: u.uid, via: 'uid' };
  }
  const email = (session.customer_details && session.customer_details.email) || session.customer_email || '';
  if (email) { const u = await db.getUserByEmail(String(email).trim().toLowerCase()); if (u) return { uid: u.uid, via: 'email' }; }
  return null;
}

async function onCheckoutCompleted(session, db, opts) {
  if (session.mode !== 'payment' || session.payment_status !== 'paid') return { status: 'ignorato', why: 'non pagato' };
  if (session.livemode !== true && !opts.allowTest) return { status: 'ignorato', why: 'pagamento di prova' };
  const id = String(session.id || '');
  if (!/^cs_[A-Za-z0-9_]+$/.test(id)) return { status: 'ignorato', why: 'id sessione non valido' };
  if (await db.get(`pagamenti/${id}`)) return { status: 'già elaborato' };   // Stripe può reinviare lo stesso evento

  const email = (session.customer_details && session.customer_details.email) || session.customer_email || null;
  const base = { email, payment_intent: session.payment_intent || null, importo: session.amount_total ?? null,
    valuta: session.currency || null, ref: session.client_reference_id || null, data: opts.now, live: session.livemode === true };
  const who = await resolveUid(session, db);
  if (!who) {                       // nessun account trovato: lo abbini a mano dal pannello
    await db.set(`pagamenti_da_abbinare/${id}`, base);
    return { status: 'da abbinare' };
  }
  const lic = await db.get(`licenze/${who.uid}`);
  const end = seasonEnd(opts.now);
  if (lic && String(lic.piano || '').toLowerCase() === 'gold') {
    // licenza gold: non la tocco (non va mai declassata)
  } else {
    const old = lic && lic.scadenza instanceof Date ? lic.scadenza : null;
    await db.set(`licenze/${who.uid}`, { piano: PLAN, scadenza: old && old > end ? old : end });
  }
  await db.set(`pagamenti/${id}`, { ...base, uid: who.uid, via: who.via, stato: 'attiva' });
  return { status: 'attivata', uid: who.uid };
}

async function onChargeRefunded(charge, db, opts) {
  if (charge.refunded !== true) return { status: 'ignorato', why: 'rimborso parziale' };
  if (charge.livemode !== true && !opts.allowTest) return { status: 'ignorato', why: 'rimborso di prova' };
  const pi = charge.payment_intent; if (!pi) return { status: 'ignorato', why: 'senza payment_intent' };
  const pay = await db.findPaymentByIntent(String(pi));
  if (!pay) return { status: 'ignorato', why: 'pagamento non trovato' };
  if (pay.data.stato === 'rimborsata') return { status: 'già elaborato' };
  const lic = await db.get(`licenze/${pay.data.uid}`);
  if (lic && String(lic.piano || '').toLowerCase() !== 'gold') {
    await db.set(`licenze/${pay.data.uid}`, { piano: lic.piano || PLAN, scadenza: opts.now });
  }
  await db.set(`pagamenti/${pay.id}`, { ...pay.data, stato: 'rimborsata', rimborsoData: opts.now });
  return { status: 'disattivata', uid: pay.data.uid };
}

// Punto di ingresso: ritorna {code, body} da mandare a Stripe
async function handleWebhook({ rawBody, signature, secret, db, allowTest = false, now = new Date() }) {
  if (!verifySignature(rawBody, signature, secret, Math.floor(now.getTime() / 1000))) return { code: 400, body: 'firma non valida' };
  let event;
  try { event = JSON.parse(Buffer.isBuffer(rawBody) ? rawBody.toString('utf8') : rawBody); }
  catch (_) { return { code: 400, body: 'json non valido' }; }
  const obj = event && event.data && event.data.object;
  if (!obj) return { code: 400, body: 'evento vuoto' };
  const opts = { allowTest, now };
  let r;
  if (event.type === 'checkout.session.completed' || event.type === 'checkout.session.async_payment_succeeded') r = await onCheckoutCompleted(obj, db, opts);
  else if (event.type === 'charge.refunded') r = await onChargeRefunded(obj, db, opts);
  else r = { status: 'ignorato', why: 'tipo evento ' + event.type };
  return { code: 200, body: JSON.stringify(r) };
}

module.exports = { verifySignature, seasonEnd, handleWebhook, PLAN };
