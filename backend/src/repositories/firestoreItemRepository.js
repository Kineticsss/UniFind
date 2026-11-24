'use strict';

// ItemRepository backed by Cloud Firestore (collection "items"). Schema: README.md "Data model".
// Every Firestore failure becomes StorageError (503), never a hang or a 500 (ST-04).

const { FieldValue } = require('firebase-admin/firestore');
const { StorageError } = require('../errors');

const TIMEOUT_MS = 8000;

function createFirestoreItemRepository(db) {
  const col = db.collection('items');
  const toItem = (doc) => (doc.exists ? { ...doc.data(), itemId: doc.id } : null);

  // A wrong project ID or blocked network can make the SDK retry for a long time, so cap each call.
  async function run(work) {
    let timer;
    try {
      return await Promise.race([
        work(),
        new Promise((_, reject) => {
          timer = setTimeout(() => reject(new Error('Firestore timeout')), TIMEOUT_MS);
        }),
      ]);
    } catch (err) {
      console.error('[firestore]', err.message);
      throw StorageError();
    } finally {
      clearTimeout(timer);
    }
  }

  return {
    create: (fields) =>
      run(async () => {
        const data = { ...fields, createdAt: new Date().toISOString() };
        const ref = await col.add(data);
        return { ...data, itemId: ref.id };
      }),
    get: (itemId) => run(async () => toItem(await col.doc(itemId).get())),
    getMany: (ids) =>
      run(async () => (ids.length ? (await db.getAll(...ids.map((id) => col.doc(id)))).map(toItem).filter(Boolean) : [])),
    // shortcut: capped at 200 newest open reports, keyword and date filters run in memory; add pagination past a few thousand reports.
    findOpen: ({ type, category } = {}) =>
      run(async () => {
        let q = col.where('status', '==', 'open');
        if (type) q = q.where('type', '==', type);
        if (category) q = q.where('category', '==', category);
        return (await q.orderBy('createdAt', 'desc').limit(200).get()).docs.map(toItem);
      }),
    listByOwner: (ownerUid) =>
      run(async () => (await col.where('ownerUid', '==', ownerUid).orderBy('createdAt', 'desc').limit(100).get()).docs.map(toItem)),
    saveMatches: (itemId, matches) =>
      run(async () => {
        const batch = db.batch();
        batch.update(col.doc(itemId), { matches });
        for (const m of matches) batch.update(col.doc(m.itemId), { matches: FieldValue.arrayUnion({ itemId, score: m.score }) });
        await batch.commit();
      }),
    update: (itemId, patch) => run(() => col.doc(itemId).update(patch)),
  };
}

module.exports = { createFirestoreItemRepository };
