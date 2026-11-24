'use strict';

// I-2 createItem(report, uid). Throws ValidationError/StorageError, never throws on notify failure.

const { findMatches } = require('./matchingService');
const { NotFoundError } = require('../errors');

const OPPOSITE = { lost: 'found', found: 'lost' };

// Fields anyone signed in may see. ownerUid stays server-side (Data Privacy Act 2012).
function publicView(item, uid) {
  const { ownerUid, matches, ...rest } = item;
  return { ...rest, isMine: ownerUid === uid };
}

function createItemService({ repo, notifier }) {
  return {
    async createItem(report, uid) {
      const item = await repo.create({ ...report, ownerUid: uid, status: 'open', matches: [], notificationStatus: 'none' });
      // A 503 must mean nothing was saved (I-2), so undo the save if a later step fails.
      try {
        const candidates = await repo.findOpen({ type: OPPOSITE[item.type], category: item.category });
        const matches = findMatches(item, candidates);
        if (!matches.length) return { itemId: item.itemId, matchCount: 0, notificationStatus: 'none' };

        await repo.saveMatches(item.itemId, matches);
        const owners = new Map(candidates.map((c) => [c.itemId, c.ownerUid]));
        const message = `A ${item.type} report may match your item: "${item.title}". Tap to review.`;
        // Parallel, so a OneSignal outage costs one 5 s timeout, not one per match (LA3 ST-05).
        const results = await Promise.all(matches.map((m) => notifier.sendMatchAlert(owners.get(m.itemId), message, item.itemId)));
        // shortcut: pending_retry is recorded but nothing retries it yet; add a scheduled job if alerts must be guaranteed.
        const notificationStatus = results.every((r) => r === 'sent') ? 'sent' : 'pending_retry';
        await repo.update(item.itemId, { notificationStatus });
        return { itemId: item.itemId, matchCount: matches.length, notificationStatus };
      } catch (err) {
        await repo.remove(item.itemId).catch(() => {});
        throw err;
      }
    },

    async search({ type, category, q, from, to }, uid) {
      const words = (q || '').toLowerCase().split(/\s+/).filter(Boolean);
      const items = await repo.findOpen({ type, category });
      return items
        .filter((i) => (!from || i.date >= from) && (!to || i.date <= to))
        .filter((i) => words.every((w) => `${i.title} ${i.description} ${i.location || ''}`.toLowerCase().includes(w)))
        .map((i) => publicView(i, uid));
    },

    async getItem(itemId, uid) {
      const item = await repo.get(itemId);
      if (!item) throw NotFoundError();
      return publicView(item, uid);
    },

    // The reporter's own reports, each with its suggested matches (the in-app match list).
    async listMine(uid) {
      const mine = await repo.listByOwner(uid);
      const others = await repo.getMany([...new Set(mine.flatMap((i) => i.matches.map((m) => m.itemId)))]);
      const byId = new Map(others.map((o) => [o.itemId, publicView(o, uid)]));
      return mine.map((i) => ({
        ...publicView(i, uid),
        matches: i.matches.filter((m) => byId.has(m.itemId)).map((m) => ({ score: m.score, item: byId.get(m.itemId) })),
      }));
    },
  };
}

module.exports = { createItemService };
