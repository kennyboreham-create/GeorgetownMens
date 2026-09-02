const SECTIONS = [
  'team_rules',
  'backbone_pillars',
  'coaches_admin',
  'systems',
  'base_knowledge',
  'players',
  'links'
];

function sectionBoolDefaults() {
  return {
    team_rules: { type: Boolean, default: false },
    backbone_pillars: { type: Boolean, default: false },
    coaches_admin: { type: Boolean, default: false },
    systems: { type: Boolean, default: false },
    base_knowledge: { type: Boolean, default: false },
    players: { type: Boolean, default: false },
    links: { type: Boolean, default: false }
  };
}

function normalizeSectionOrder(order) {
  const seen = new Set();
  const result = [];
  if (Array.isArray(order)) {
    for (const key of order) {
      const section = String(key || '');
      if (SECTIONS.includes(section) && !seen.has(section)) {
        seen.add(section);
        result.push(section);
      }
    }
  }
  for (const key of SECTIONS) {
    if (!seen.has(key)) result.push(key);
  }
  return result;
}

function hiddenSectionsMap(playbook) {
  const map = {};
  for (const key of SECTIONS) {
    map[key] = Boolean(playbook?.hiddenSections?.[key]);
  }
  return map;
}

function applyHiddenSections(playbook, hiddenSections = {}) {
  if (!playbook.hiddenSections || typeof playbook.hiddenSections !== 'object' || Array.isArray(playbook.hiddenSections)) {
    playbook.hiddenSections = {};
  }
  for (const key of SECTIONS) {
    if (Object.prototype.hasOwnProperty.call(hiddenSections, key)) {
      playbook.hiddenSections[key] = Boolean(hiddenSections[key]);
    }
  }
  if (typeof playbook.markModified === 'function') {
    playbook.markModified('hiddenSections');
  }
  return hiddenSectionsMap(playbook);
}

function orderedSectionsFor(playbook) {
  return normalizeSectionOrder(playbook?.sectionOrder);
}

function visibleSectionsFor(playbook) {
  const hidden = hiddenSectionsMap(playbook);
  return orderedSectionsFor(playbook).filter((key) => !hidden[key]);
}

function normalizeItems(items) {
  if (!Array.isArray(items)) return [];
  return items
    .map((item) => ({ text: String(item?.text || item || '').trim() }))
    .filter((item) => item.text)
    .slice(0, 20);
}

function buildBlockPayload(body = {}) {
  const payload = {
    title: String(body.title || '').trim(),
    subtitle: String(body.subtitle || '').trim(),
    body: String(body.body || '').trim(),
    items: normalizeItems(body.items),
    name: String(body.name || '').trim(),
    experience: String(body.experience || '').trim(),
    jobScope: String(body.jobScope || '').trim(),
    email: String(body.email || '').trim(),
    subsection: String(body.subsection || '').trim(),
    url: String(body.url || '').trim(),
    label: String(body.label || '').trim()
  };
  if (body.layoutType && ['vertical_box', 'radial', 'horizontal_hierarchy'].includes(body.layoutType)) {
    payload.layoutType = body.layoutType;
  }
  return payload;
}

function normalizeHttpUrl(rawUrl) {
  const url = String(rawUrl || '').trim();
  if (!url) return { url: '' };
  const withProtocol = /^https?:\/\//i.test(url) ? url : `https://${url}`;
  try {
    const parsed = new URL(withProtocol);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return { error: 'Enter a valid http or https link.' };
    }
    return { url: parsed.href };
  } catch (_) {
    return { error: 'Enter a valid http or https link.' };
  }
}

module.exports = {
  SECTIONS,
  sectionBoolDefaults,
  normalizeSectionOrder,
  hiddenSectionsMap,
  applyHiddenSections,
  orderedSectionsFor,
  visibleSectionsFor,
  normalizeItems,
  buildBlockPayload,
  normalizeHttpUrl
};
