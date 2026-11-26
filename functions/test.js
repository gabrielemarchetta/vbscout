// Test della logica del webhook, senza rete né Firebase: `node test.js`
'use strict';
const assert = require('assert');
const crypto = require('crypto');
const { verifySignature, seasonEnd, handleWebhook } = require('./handler');

const SECRET = 'whsec_test_finto';
const sign = (body, t) => `t=${t},v1=` + crypto.createHmac('sha256', SECRET).update(`${t}.${body}`).digest('hex');
function fakeDb(users = {}) {
  const docs = {};
  return { docs,
    async get(p) { return docs[p] ? { ...docs[p] } : null; },
    async set(p, d) { docs[p] = { ...d }; },
    async findPaymentByIntent(pi) { for (const k in docs) if (k.startsWith('pagamenti/') && docs[k].payment_intent === pi) return { id: k.slice(10), data: { ...docs[k] } }; return null; },
    async getUser(uid) { return Object.values(users).find(u => u.uid === uid) || null; },
    async getUserByEmail(e) { return users[e] || null; } };
}
const NOW = new Date('2026-11-26T10:00:00Z'), T = Math.floor(NOW / 1000);
const session = (o = {}) => ({ id: 'cs_live_abc123', mode: 'payment', payment_status: 'paid', livemode: true,
  client_reference_id: 'UIDgiovanni0001', customer_details: { email: 'g@esempio.it' }, payment_intent: 'pi_1', amount_total: 1490, currency: 'eur', ...o });
const ev = (type, obj) => JSON.stringify({ id: 'evt_1', type, data: { object: obj } });
const call = (db, body, extra = {}) => handleWebhook({ rawBody: Buffer.from(body), signature: sign(body, T), secret: SECRET, db, now: NOW, ...extra });

(async () => {
  let n = 0; const ok = m => { n++; console.log('✓', m); };
  const users = { 'g@esempio.it': { uid: 'UIDgiovanni0001' }, 'm@esempio.it': { uid: 'UIDmario000002' } };

  // firma
  const b = '{"a":1}';
  assert(verifySignature(b, sign(b, T), SECRET, T)); ok('firma valida');
  assert(!verifySignature(b, sign(b, T), 'whsec_altro', T)); ok('segreto sbagliato → rifiutata');
  assert(!verifySignature(b + ' ', sign(b, T), SECRET, T)); ok('corpo modificato → rifiutata');
  assert(!verifySignature(b, sign(b, T - 1000), SECRET, T)); ok('firma vecchia (replay) → rifiutata');
  assert(!verifySignature(b, 'garbage', SECRET, T) && !verifySignature(b, null, SECRET, T)); ok('intestazione assente/rotta → rifiutata');
  let r = await handleWebhook({ rawBody: Buffer.from(b), signature: 'x', secret: SECRET, db: fakeDb(), now: NOW });
  assert.strictEqual(r.code, 400); ok('webhook senza firma → 400');

  // fine stagione
  assert.strictEqual(seasonEnd(new Date('2026-11-26T00:00:00Z')).toISOString(), '2027-06-30T21:59:59.000Z');
  assert.strictEqual(seasonEnd(new Date('2027-07-02T00:00:00Z')).toISOString(), '2028-06-30T21:59:59.000Z');
  assert.strictEqual(seasonEnd(new Date('2027-06-15T00:00:00Z')).toISOString(), '2027-06-30T21:59:59.000Z'); ok('fine stagione 30 giugno (da luglio → anno dopo)');

  // attivazione con UID
  let db = fakeDb(users);
  r = await call(db, ev('checkout.session.completed', session()));
  assert.strictEqual(r.code, 200);
  assert.deepStrictEqual(db.docs['licenze/UIDgiovanni0001'], { piano: 'stagione', scadenza: new Date('2027-06-30T21:59:59Z') });
  assert.strictEqual(db.docs['pagamenti/cs_live_abc123'].via, 'uid'); ok('pagamento → licenza creata tramite UID');

  // evento ripetuto
  db.docs['licenze/UIDgiovanni0001'].piano = 'modificata-a-mano';
  r = await call(db, ev('checkout.session.completed', session()));
  assert.match(r.body, /già elaborato/); assert.strictEqual(db.docs['licenze/UIDgiovanni0001'].piano, 'modificata-a-mano'); ok('evento ripetuto → non riscrive');

  // fallback email (pagato dal link diretto, senza UID)
  db = fakeDb(users);
  await call(db, ev('checkout.session.completed', session({ client_reference_id: null, customer_details: { email: 'M@Esempio.it ' } })));
  assert(db.docs['licenze/UIDmario000002']); assert.strictEqual(db.docs['pagamenti/cs_live_abc123'].via, 'email'); ok('senza UID → trovato tramite email');

  // UID fasullo ma email giusta
  db = fakeDb(users);
  await call(db, ev('checkout.session.completed', session({ client_reference_id: 'UIDinesistente99' })));
  assert(db.docs['licenze/UIDgiovanni0001']); ok('UID sbagliato → ripiega sull\'email');

  // nessun account
  db = fakeDb(users);
  r = await call(db, ev('checkout.session.completed', session({ client_reference_id: null, customer_details: { email: 'sconosciuto@x.it' } })));
  assert.match(r.body, /da abbinare/); assert(db.docs['pagamenti_da_abbinare/cs_live_abc123']);
  assert(!Object.keys(db.docs).some(k => k.startsWith('licenze/'))); ok('nessun account → in "pagamenti_da_abbinare"');

  // gold non declassata, scadenza più lunga mantenuta
  db = fakeDb(users); db.docs['licenze/UIDgiovanni0001'] = { piano: 'gold', scadenza: new Date('2030-01-01') };
  await call(db, ev('checkout.session.completed', session()));
  assert.strictEqual(db.docs['licenze/UIDgiovanni0001'].piano, 'gold'); ok('licenza gold non toccata');
  db = fakeDb(users); db.docs['licenze/UIDgiovanni0001'] = { piano: 'stagione', scadenza: new Date('2029-01-01') };
  await call(db, ev('checkout.session.completed', session()));
  assert.strictEqual(db.docs['licenze/UIDgiovanni0001'].scadenza.toISOString(), '2029-01-01T00:00:00.000Z'); ok('scadenza già più lunga → mantenuta');

  // pagamenti di prova / non pagati
  db = fakeDb(users);
  r = await call(db, ev('checkout.session.completed', session({ livemode: false })));
  assert.match(r.body, /prova/); assert(!db.docs['licenze/UIDgiovanni0001']); ok('sandbox ignorata in produzione');
  await call(db, ev('checkout.session.completed', session({ livemode: false })), { allowTest: true });
  assert(db.docs['licenze/UIDgiovanni0001']); ok('sandbox accettata con ALLOW_TEST');
  db = fakeDb(users);
  await call(db, ev('checkout.session.completed', session({ payment_status: 'unpaid' })));
  assert(!db.docs['licenze/UIDgiovanni0001']); ok('pagamento non completato → niente licenza');
  r = await call(db, ev('customer.created', {})); assert.strictEqual(r.code, 200); ok('altri eventi → ignorati con 200');

  // rimborso
  db = fakeDb(users);
  await call(db, ev('checkout.session.completed', session()));
  await call(db, ev('charge.refunded', { refunded: false, livemode: true, payment_intent: 'pi_1' }));
  assert(db.docs['licenze/UIDgiovanni0001'].scadenza > NOW); ok('rimborso parziale → licenza resta');
  r = await call(db, ev('charge.refunded', { refunded: true, livemode: true, payment_intent: 'pi_1' }));
  assert.match(r.body, /disattivata/);
  assert.strictEqual(db.docs['licenze/UIDgiovanni0001'].scadenza.getTime(), NOW.getTime());
  assert.strictEqual(db.docs['pagamenti/cs_live_abc123'].stato, 'rimborsata'); ok('rimborso totale → licenza scaduta');

  // JSON rotto ma firmato
  r = await call(fakeDb(), '{rotto'); assert.strictEqual(r.code, 400); ok('json non valido → 400');

  console.log(`\nTutti i ${n} test superati`);
})().catch(e => { console.error('✗ TEST FALLITO\n', e); process.exit(1); });
