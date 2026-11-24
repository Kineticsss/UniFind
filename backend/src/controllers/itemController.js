'use strict';

// I-1 POST /api/items and the read endpoints. Validates every field at this trust boundary
// and reports all invalid fields at once (ST-02).

const { categories } = require('../../../shared/categories.json');
const { ValidationError } = require('../errors');

const SLUGS = categories.map((c) => c.slug);
const TYPES = ['lost', 'found'];

// Campus dates are Philippine dates, whatever time zone the server runs in.
const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila' }).format(new Date());

// Round-trip check rejects dates like 2026-02-31 that Date.parse silently rolls over.
const isDay = (v) => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v)) && new Date(`${v}T00:00:00Z`).toISOString().startsWith(v);

const str = (v) => (typeof v === 'string' ? v.trim() : v);

function validateReport(body, cloudName) {
  const b = body || {};
  const report = {
    type: b.type,
    title: str(b.title),
    category: b.category,
    description: str(b.description ?? ''),
    location: str(b.location ?? ''),
    date: b.date,
    imageUrl: str(b.imageUrl) || null,
  };
  const fields = {};

  if (!TYPES.includes(report.type)) fields.type = 'Choose lost or found.';
  if (typeof report.title !== 'string' || report.title.length < 3 || report.title.length > 100)
    fields.title = 'Title must be 3 to 100 characters.';
  if (!SLUGS.includes(report.category)) fields.category = 'Choose a category from the list.';
  if (typeof report.description !== 'string' || report.description.length > 500)
    fields.description = 'Description must be at most 500 characters.';
  if (typeof report.location !== 'string' || report.location.length > 100)
    fields.location = 'Location must be at most 100 characters.';
  if (!isDay(report.date))
    fields.date = 'Enter a valid date.';
  else if (report.date > today()) fields.date = 'Date cannot be in the future.';
  if (report.imageUrl !== null && !isProjectImage(report.imageUrl, cloudName))
    fields.imageUrl = "Photo must be uploaded through UniFind's image service.";

  if (Object.keys(fields).length) throw ValidationError(fields);
  return report;
}

// Host and cloud name, not just the extension (ST-08).
function isProjectImage(value, cloudName) {
  if (!cloudName || typeof value !== 'string') return false;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && url.hostname === 'res.cloudinary.com' && url.pathname.startsWith(`/${cloudName}/image/upload/`);
  } catch {
    return false;
  }
}

function createItemController({ itemService, cloudName }) {
  return {
    create: async (req, res) => {
      const report = validateReport(req.body, cloudName);
      res.status(201).json(await itemService.createItem(report, req.user.uid));
    },
    search: async (req, res) => {
      const { type, category, q, from, to } = req.query;
      const pick = (v, allowed) => (allowed.includes(v) ? v : undefined);
      const day = (v) => (isDay(v) ? v : undefined);
      const items = await itemService.search(
        { type: pick(type, TYPES), category: pick(category, SLUGS), q: typeof q === 'string' ? q.slice(0, 100) : '', from: day(from), to: day(to) },
        req.user.uid,
      );
      res.json({ items });
    },
    mine: async (req, res) => res.json({ items: await itemService.listMine(req.user.uid) }),
    get: async (req, res) => res.json(await itemService.getItem(req.params.id, req.user.uid)),
  };
}

module.exports = { createItemController, validateReport };
