'use strict';

// In-memory ItemRepository for local dev and tests. Same interface as firestoreItemRepository.js.
// Data is lost on restart.

const { randomUUID } = require('node:crypto');

function createMemoryItemRepository() {
  const items = new Map();
  const copy = (item) => item && structuredClone(item);

  return {
    async create(fields) {
      const item = { ...fields, itemId: randomUUID(), createdAt: new Date().toISOString() };
      items.set(item.itemId, item);
      return copy(item);
    },
    async get(itemId) {
      return copy(items.get(itemId)) || null;
    },
    async getMany(ids) {
      return ids.map((id) => items.get(id)).filter(Boolean).map(copy);
    },
    async findOpen({ type, category } = {}) {
      return [...items.values()]
        .filter((i) => i.status === 'open' && (!type || i.type === type) && (!category || i.category === category))
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
        .map(copy);
    },
    async listByOwner(ownerUid) {
      return [...items.values()].filter((i) => i.ownerUid === ownerUid).sort((a, b) => b.createdAt.localeCompare(a.createdAt)).map(copy);
    },
    // Stores the matches on the new item and the reverse link on each matched item, so both owners see it.
    async saveMatches(itemId, matches) {
      items.get(itemId).matches = matches;
      for (const m of matches) items.get(m.itemId)?.matches.push({ itemId, score: m.score });
    },
    async update(itemId, patch) {
      Object.assign(items.get(itemId), patch);
    },
  };
}

module.exports = { createMemoryItemRepository };
