// Text utilities: ADF flattening, telecom entity extraction, timestamp parsing, TF-IDF similarity.
// Pure functions only (no Forge APIs) so they can be unit-tested with plain Node.

export const CONTROL_LABELS = new Set(['outage', 'incident', 'network-change', 'change', 'rca-demo', 'rca-demo-main']);

/** Flatten Atlassian Document Format (ADF) or plain string into text with line breaks. */
export function adfToText(node) {
  if (node == null) return '';
  if (typeof node === 'string') return node;
  if (Array.isArray(node)) return node.map(adfToText).join('');
  if (node.type === 'text') return node.text || '';
  if (node.type === 'hardBreak') return '\n';
  const inner = adfToText(node.content || []);
  const blockTypes = new Set(['paragraph', 'heading', 'listItem', 'codeBlock', 'blockquote', 'tableRow', 'panel']);
  return blockTypes.has(node.type) ? inner + '\n' : inner;
}

/** Build a minimal ADF document from plain text (one paragraph per line). */
export function textToAdf(text) {
  const lines = String(text).split('\n');
  return {
    type: 'doc',
    version: 1,
    content: lines.map((line) =>
      line.trim() === ''
        ? { type: 'paragraph', content: [] }
        : { type: 'paragraph', content: [{ type: 'text', text: line }] }
    ),
  };
}

const ISSUE_KEY_RE = /^[A-Z][A-Z0-9]+-\d+$/;
const ELEMENT_RE = /\b[A-Z][A-Z0-9]{1,7}(?:-[A-Z0-9]{1,10}){1,4}\b/g;
const VERSION_RE = /\b(?:v|fw\s?|firmware\s+|version\s+|release\s+)(\d+\.\d+(?:\.\d+){0,2})\b/gi;
const BARE_VERSION_RE = /(?<![\d.])(\d+\.\d+\.\d+)(?![\d.])/g; // 3-part, avoids IPv4 (4 parts)

function listAfter(text, labels) {
  const out = [];
  const re = new RegExp(`^\\s*(?:${labels.join('|')})\\s*[:=]\\s*(.+)$`, 'gim');
  let m;
  while ((m = re.exec(text))) {
    m[1].split(/[,;]/).map((s) => s.trim()).filter(Boolean).forEach((s) => out.push(s.toUpperCase()));
  }
  return out;
}

/**
 * Extract telecom entities from free text plus Jira metadata.
 * Returns { elements, versions, sites, components, labels } as arrays of normalised strings.
 */
export function extractEntities(text = '', { components = [], labels = [] } = {}) {
  const elements = new Set();
  const versions = new Set();
  const sites = new Set();

  for (const m of text.matchAll(ELEMENT_RE)) {
    const v = m[0].toUpperCase();
    if (!ISSUE_KEY_RE.test(v)) elements.add(v);
  }
  listAfter(text, ['affected ci', 'ci', 'cis', 'network element', 'network elements', 'element', 'elements', 'node', 'nodes', 'device', 'devices'])
    .forEach((e) => elements.add(e));

  for (const m of text.matchAll(VERSION_RE)) versions.add('V' + m[1]);
  for (const m of text.matchAll(BARE_VERSION_RE)) versions.add('V' + m[1]);

  listAfter(text, ['site', 'sites', 'exchange', 'region', 'pop', 'location']).forEach((s) => sites.add(s));

  return {
    elements: [...elements],
    versions: [...versions],
    sites: [...sites],
    components: components.map((c) => String(c).toUpperCase()),
    labels: labels.filter((l) => !CONTROL_LABELS.has(String(l).toLowerCase())).map((l) => String(l).toUpperCase()),
  };
}

const ENTITY_WEIGHTS = { elements: 1.0, versions: 0.7, sites: 0.5, components: 0.6, labels: 0.3 };

/** Shared entities between two entity sets, with a weighted overlap total. */
export function sharedEntities(a, b) {
  const shared = [];
  let weight = 0;
  for (const kind of Object.keys(ENTITY_WEIGHTS)) {
    const setB = new Set(b[kind] || []);
    for (const v of a[kind] || []) {
      if (setB.has(v)) {
        shared.push({ kind, value: v });
        weight += ENTITY_WEIGHTS[kind];
      }
    }
  }
  return { shared, weight };
}

/** Parse a labelled timestamp line such as "Implemented: 2026-11-20T08:15:00Z". */
export function parseLabelledTime(text, labels) {
  const re = new RegExp(`^\\s*(?:${labels.join('|')})(?:\\s+at)?\\s*[:=]\\s*(.+)$`, 'im');
  const m = re.exec(text || '');
  if (!m) return null;
  const t = Date.parse(m[1].trim());
  return Number.isNaN(t) ? null : t;
}

export const CHANGE_TIME_LABELS = ['implemented', 'implementation end', 'change window end', 'deployed', 'completed', 'executed'];
export const INCIDENT_TIME_LABELS = ['detected', 'outage start', 'start time', 'impact start', 'reported'];

/** Parse "Customers affected: 1,240" style lines. */
export function parseCustomersAffected(text) {
  const m = /^\s*(?:customers affected|affected customers|subscribers affected|impacted customers)\s*[:=]\s*([\d,]+)/im.exec(text || '');
  return m ? Number(m[1].replace(/,/g, '')) : 0;
}

/** Extract a labelled section such as "Rollback plan:" until a blank line or next "Label:" line. */
export function extractSection(text, label) {
  const lines = String(text || '').split('\n');
  const start = lines.findIndex((l) => new RegExp(`^\\s*${label}\\s*:`, 'i').test(l));
  if (start < 0) return '';
  const first = lines[start].replace(new RegExp(`^\\s*${label}\\s*:\\s*`, 'i'), '');
  const out = first ? [first] : [];
  for (let i = start + 1; i < lines.length; i++) {
    const l = lines[i];
    if (l.trim() === '' && out.length) break;
    if (/^\s*[A-Z][A-Za-z ]{2,30}:\s/.test(l) && !/^\s*\d+[.)]/.test(l)) break;
    if (l.trim()) out.push(l.trim());
  }
  return out.join('\n');
}

const STOPWORDS = new Set(
  'the and for are was were with from that this have has had not but all any can will into after before over under about their they them then than when what which while there here also been being per via out off our your you its it is on in at to of a an by or as be no yes'.split(' ')
);

export function tokenize(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/[^a-z0-9.\- ]+/g, ' ')
    .split(/\s+/)
    .map((t) => t.replace(/^[.\-]+|[.\-]+$/g, ''))
    .filter((t) => t.length >= 3 && !STOPWORDS.has(t));
}

/** Cosine similarity of TF-IDF vectors for `a` vs each doc in `docs`, with IDF over all docs incl. a. */
export function tfidfSimilarities(a, docs) {
  const all = [a, ...docs].map(tokenize);
  const df = new Map();
  for (const toks of all) for (const t of new Set(toks)) df.set(t, (df.get(t) || 0) + 1);
  const n = all.length;
  const vec = (toks) => {
    const tf = new Map();
    for (const t of toks) tf.set(t, (tf.get(t) || 0) + 1);
    const v = new Map();
    for (const [t, c] of tf) v.set(t, (c / toks.length) * Math.log(1 + n / (df.get(t) || 1)));
    return v;
  };
  const norm = (v) => Math.sqrt([...v.values()].reduce((s, x) => s + x * x, 0)) || 1;
  const va = vec(all[0]);
  const na = norm(va);
  return all.slice(1).map((toks) => {
    const vb = vec(toks);
    let dot = 0;
    for (const [t, x] of va) if (vb.has(t)) dot += x * vb.get(t);
    return dot / (na * norm(vb));
  });
}

export function formatDuration(ms) {
  const neg = ms < 0;
  let m = Math.round(Math.abs(ms) / 60000);
  const d = Math.floor(m / 1440);
  m -= d * 1440;
  const h = Math.floor(m / 60);
  m -= h * 60;
  const parts = [];
  if (d) parts.push(`${d}d`);
  if (h) parts.push(`${h}h`);
  if (m || !parts.length) parts.push(`${m}m`);
  return (neg ? '-' : '') + parts.join(' ');
}
