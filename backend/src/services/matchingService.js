'use strict';

// I-3 findMatches(newItem, candidates): pure, no I/O.
// Score = shared keywords (1 each, colors 0.5) after stop words and per-category synonyms.
// shortcut: keyword overlap only, misses items described with unrelated words (ST-06); upgrade to embeddings if accuracy matters.

const { categories, matching } = require('../../../shared/categories.json');

const COLORS = new Set(matching.colors);
const STOP = new Set([
  ...matching.genericWords,
  ...'a an and are at be by for from has have i in is it its my of on or the this that to was were with near inside beside'.split(' '),
]);
// category slug -> word -> canonical word (first word of its synonym group)
const SYNONYMS = Object.fromEntries(
  categories.map((c) => [c.slug, Object.fromEntries(c.synonyms.flatMap((group) => group.map((w) => [w, group[0]])))]),
);

function singular(word) {
  if (word.endsWith('sses')) return word.slice(0, -2);
  if (word.length > 3 && word.endsWith('s') && !/(ss|us|is)$/.test(word)) return word.slice(0, -1);
  return word;
}

function keywords(item) {
  const syn = SYNONYMS[item.category] || {};
  const words = `${item.title} ${item.description || ''}`.toLowerCase().match(/[a-z0-9]+/g) || [];
  const out = new Set();
  for (const raw of words) {
    const word = syn[raw] || syn[singular(raw)] || singular(raw);
    if (word.length > 1 && !STOP.has(word) && !STOP.has(raw)) out.add(word);
  }
  return out;
}

function score(a, b) {
  let total = 0;
  for (const word of a) if (b.has(word)) total += COLORS.has(word) ? matching.weights.color : matching.weights.keyword;
  return total;
}

function findMatches(newItem, candidates) {
  const mine = keywords(newItem);
  const min = matching.minScoreByCategory[newItem.category] ?? matching.minScore;
  return candidates
    .filter((c) => c.category === newItem.category && c.type !== newItem.type && c.status === 'open' && c.itemId !== newItem.itemId)
    .map((c) => ({ itemId: c.itemId, score: score(mine, keywords(c)) }))
    .filter((m) => m.score >= min)
    .sort((x, y) => y.score - x.score)
    .slice(0, matching.maxResults);
}

module.exports = { findMatches, keywords };
