// Correlation engine: ranks candidate changes as probable root causes of an outage.
// Pure, deterministic and explainable: every point of score comes with a human-readable reason.

import {
  adfToText,
  extractEntities,
  sharedEntities,
  parseLabelledTime,
  parseCustomersAffected,
  extractSection,
  tfidfSimilarities,
  formatDuration,
  CHANGE_TIME_LABELS,
  INCIDENT_TIME_LABELS,
} from './text.js';

export const DEFAULTS = {
  windowHours: 72, // how far back from the outage a change can be a suspect
  halfLifeHours: 6, // temporal score halves every 6h between change and outage
  graceMinutes: 15, // tolerance for clock skew (change logged slightly after detection)
  maxSuspects: 5,
};

export const WEIGHTS = { temporal: 30, entity: 30, blast: 20, text: 10, risk: 10 };

const RISK_PATTERNS = [
  { re: /\bemergency\b/i, w: 0.5, why: 'emergency change' },
  { re: /\brisk\s*[:=]\s*high\b|\bhigh[- ]risk\b/i, w: 0.5, why: 'rated high risk' },
  { re: /\brisk\s*[:=]\s*medium\b/i, w: 0.25, why: 'rated medium risk' },
  { re: /\b(failed|partially (?:applied|completed)|backed out|aborted|with warnings|with errors)\b/i, w: 0.4, why: 'implementation reported warnings or failures' },
  { re: /\bno rollback\b|\brollback\s*[:=]\s*(?:none|n\/a)\b/i, w: 0.3, why: 'no rollback plan' },
  { re: /\bfirmware|\bconfig(?:uration)? push|\bsoftware upgrade|\bmigration\b/i, w: 0.2, why: 'firmware/config/software change' },
];

/** Normalise a Jira REST issue (v3) into the record the engine works on. */
export function normaliseIssue(issue, siteUrl = '') {
  const f = issue.fields || {};
  const description = adfToText(f.description);
  const text = `${f.summary || ''}\n${description}`;
  const labels = f.labels || [];
  const components = (f.components || []).map((c) => c.name);
  const lowerLabels = labels.map((l) => l.toLowerCase());
  const typeName = f.issuetype?.name || '';
  const isChange = /change/i.test(typeName) || lowerLabels.includes('network-change') || lowerLabels.includes('change');
  const created = f.created ? Date.parse(f.created) : null;
  const resolved = f.resolutiondate ? Date.parse(f.resolutiondate) : null;
  const time = isChange
    ? parseLabelledTime(description, CHANGE_TIME_LABELS) ?? resolved ?? created
    : parseLabelledTime(description, INCIDENT_TIME_LABELS) ?? created;
  return {
    key: issue.key,
    id: issue.id,
    summary: f.summary || '',
    description,
    text,
    kind: isChange ? 'change' : 'incident',
    issueType: typeName,
    status: f.status?.name || '',
    statusCategory: f.status?.statusCategory?.key || '',
    labels,
    components,
    assignee: f.assignee ? { accountId: f.assignee.accountId, displayName: f.assignee.displayName } : null,
    created,
    time,
    timeIsExplicit: isChange
      ? parseLabelledTime(description, CHANGE_TIME_LABELS) != null
      : parseLabelledTime(description, INCIDENT_TIME_LABELS) != null,
    customers: parseCustomersAffected(description),
    rollbackPlan: extractSection(description, 'rollback plan') || extractSection(description, 'rollback'),
    entities: extractEntities(text, { components, labels }),
    url: siteUrl ? `${siteUrl}/browse/${issue.key}` : `/browse/${issue.key}`,
  };
}

export function riskOf(change) {
  let w = 0;
  const reasons = [];
  for (const p of RISK_PATTERNS) {
    if (p.re.test(change.text)) {
      w += p.w;
      reasons.push(p.why);
    }
  }
  return { score: Math.min(1, w), reasons };
}

/**
 * Outage cluster for a change: other incidents detected after the change (within the window)
 * that touch at least one of the change's elements/versions/sites.
 */
export function blastRadius(change, incidents, opts = {}) {
  const o = { ...DEFAULTS, ...opts };
  const windowMs = o.windowHours * 3600e3;
  const graceMs = o.graceMinutes * 60e3;
  const hits = [];
  for (const inc of incidents) {
    if (inc.key === change.key || inc.time == null || change.time == null) continue;
    const dt = inc.time - change.time;
    if (dt < -graceMs || dt > windowMs) continue;
    const { shared } = sharedEntities(change.entities, inc.entities);
    const strong = shared.filter((s) => ['elements', 'versions', 'sites'].includes(s.kind));
    if (strong.length) hits.push({ incident: inc, shared: strong, afterChangeMs: dt });
  }
  hits.sort((a, b) => a.incident.time - b.incident.time);
  const customers = hits.reduce((s, h) => s + (h.incident.customers || 0), 0);
  return { count: hits.length, customers, incidents: hits };
}

function confidenceOf(score) {
  if (score >= 70) return 'HIGH';
  if (score >= 45) return 'MEDIUM';
  return 'LOW';
}

/**
 * Rank candidate changes for an incident.
 * @param incident normalised incident record
 * @param changes  normalised change records
 * @param incidents normalised incident records (for blast radius; may include the incident itself)
 */
export function rankSuspects(incident, changes, incidents, opts = {}) {
  const o = { ...DEFAULTS, ...opts };
  const windowMs = o.windowHours * 3600e3;
  const graceMs = o.graceMinutes * 60e3;
  const excluded = [];
  const eligible = [];

  for (const ch of changes) {
    if (ch.key === incident.key) continue;
    if (ch.time == null || incident.time == null) {
      excluded.push({ key: ch.key, reason: 'no implementation time' });
      continue;
    }
    const dt = incident.time - ch.time; // positive = change happened before the outage
    if (dt < -graceMs) {
      excluded.push({ key: ch.key, reason: `implemented ${formatDuration(-dt)} after the outage started` });
      continue;
    }
    if (dt > windowMs) {
      excluded.push({ key: ch.key, reason: `implemented more than ${o.windowHours}h before the outage` });
      continue;
    }
    eligible.push({ ch, dt });
  }

  const sims = tfidfSimilarities(incident.text, eligible.map((e) => e.ch.text));
  const allIncidents = incidents.some((i) => i.key === incident.key) ? incidents : [incident, ...incidents];

  const suspects = eligible.map(({ ch, dt }, idx) => {
    const evidence = [];
    const hoursBefore = Math.max(0, dt) / 3600e3;
    const temporal = Math.pow(0.5, hoursBefore / o.halfLifeHours);
    evidence.push({
      factor: 'temporal',
      text: `Implemented ${formatDuration(Math.max(0, dt))} before the outage was detected${ch.timeIsExplicit ? '' : ' (time taken from Jira dates)'}`,
    });

    const { shared, weight } = sharedEntities(incident.entities, ch.entities);
    const entity = Math.min(1, weight / 2);
    if (shared.length) {
      evidence.push({ factor: 'entity', text: `Touches the same ${describeShared(shared)}` });
    }

    const blast = blastRadius(ch, allIncidents, o);
    const others = blast.incidents.filter((h) => h.incident.key !== incident.key);
    const blastScore = 1 - Math.exp(-others.length / 3);
    if (others.length) {
      evidence.push({
        factor: 'blast',
        text: `${others.length} other outage ticket${others.length > 1 ? 's' : ''} on the same network elements since this change` +
          (blast.customers ? ` (${blast.customers.toLocaleString('en-US')} customers affected in total)` : ''),
      });
    }

    const text = Math.max(0, Math.min(1, sims[idx] || 0));
    if (text >= 0.15) evidence.push({ factor: 'text', text: `Similar wording to the outage description (${Math.round(text * 100)}% match)` });

    const risk = riskOf(ch);
    if (risk.reasons.length) evidence.push({ factor: 'risk', text: `Change risk signals: ${risk.reasons.join(', ')}` });

    const parts = {
      temporal: WEIGHTS.temporal * temporal,
      entity: WEIGHTS.entity * entity,
      blast: WEIGHTS.blast * blastScore,
      text: WEIGHTS.text * text,
      risk: WEIGHTS.risk * risk.score,
    };
    let score = Object.values(parts).reduce((s, x) => s + x, 0);

    // Guard against pure coincidence: timing alone must not produce a confident answer.
    const coincidental = !shared.length && text < 0.1 && !others.length;
    if (coincidental) {
      score = Math.min(score, 30);
      evidence.push({ factor: 'caveat', text: 'No shared network elements or similar wording: timing may be coincidental' });
    }
    score = Math.round(score);

    return {
      key: ch.key,
      summary: ch.summary,
      url: ch.url,
      status: ch.status,
      assignee: ch.assignee,
      implementedAt: new Date(ch.time).toISOString(),
      minutesBeforeOutage: Math.round(Math.max(0, dt) / 60000),
      score,
      confidence: confidenceOf(score),
      breakdown: Object.fromEntries(Object.entries(parts).map(([k, v]) => [k, Math.round(v)])),
      sharedEntities: shared.map((s) => s.value),
      relatedOutages: others.map((h) => ({ key: h.incident.key, summary: h.incident.summary, url: h.incident.url })),
      customersAffected: blast.customers,
      rollbackPlan: ch.rollbackPlan || null,
      evidence,
    };
  });

  suspects.sort((a, b) => b.score - a.score || a.minutesBeforeOutage - b.minutesBeforeOutage);
  const top = suspects.slice(0, o.maxSuspects);
  return {
    incident: {
      key: incident.key,
      summary: incident.summary,
      url: incident.url,
      detectedAt: incident.time ? new Date(incident.time).toISOString() : null,
      entities: incident.entities,
      customersAffected: incident.customers,
    },
    windowHours: o.windowHours,
    candidatesConsidered: changes.filter((c) => c.key !== incident.key).length,
    suspects: top,
    excluded: excluded.slice(0, 10),
    verdict: verdictOf(top),
  };
}

function describeShared(shared) {
  const byKind = {};
  for (const s of shared) (byKind[s.kind] ||= []).push(s.value);
  const names = { elements: 'network element', versions: 'firmware/software version', sites: 'site', components: 'component', labels: 'label' };
  return Object.entries(byKind)
    .map(([k, v]) => `${names[k]}${v.length > 1 ? 's' : ''} ${v.join(', ')}`)
    .join('; ');
}

function verdictOf(top) {
  if (!top.length) return { status: 'NO_SUSPECT', text: 'No change was implemented in the lookback window. Look for non-change causes (fibre cut, power, hardware fault, upstream provider).' };
  const [first, second] = top;
  if (first.confidence === 'HIGH' && (!second || first.score - second.score >= 15)) {
    return { status: 'PROBABLE_CAUSE', key: first.key, text: `${first.key} is the probable root cause (${first.score}/100).` };
  }
  if (first.confidence !== 'LOW') {
    return { status: 'LIKELY_CAUSE', key: first.key, text: `${first.key} is the leading suspect (${first.score}/100); confirm before rollback.` };
  }
  return { status: 'INCONCLUSIVE', text: 'Changes exist in the window but none correlate strongly. Treat as unconfirmed.' };
}

/** Chronological timeline of changes and outages around an incident. */
export function buildTimeline(incident, changes, incidents, opts = {}) {
  const o = { ...DEFAULTS, ...opts };
  const from = incident.time - o.windowHours * 3600e3;
  const to = incident.time + 24 * 3600e3;
  const events = [];
  for (const c of changes) {
    if (c.time != null && c.time >= from && c.time <= to) {
      const { shared } = sharedEntities(incident.entities, c.entities);
      events.push({ at: c.time, type: 'CHANGE', key: c.key, summary: c.summary, related: shared.length > 0 });
    }
  }
  for (const i of incidents) {
    if (i.time != null && i.time >= from && i.time <= to) {
      const { shared } = sharedEntities(incident.entities, i.entities);
      events.push({ at: i.time, type: i.key === incident.key ? 'THIS_OUTAGE' : 'OUTAGE', key: i.key, summary: i.summary, related: i.key === incident.key || shared.length > 0 });
    }
  }
  events.sort((a, b) => a.at - b.at);
  return events.map((e) => ({ ...e, at: new Date(e.at).toISOString(), relativeToOutage: formatDuration(e.at - incident.time) }));
}

/** Plain-text RCA note posted to Jira when an engineer confirms a cause. */
export function rcaComment(result, changeKey) {
  const s = result.suspects.find((x) => x.key === changeKey);
  const lines = [
    `Root cause linked by Outage RCA Investigator: ${changeKey}${s ? ` (correlation ${s.score}/100, ${s.confidence})` : ''}.`,
  ];
  if (s) {
    lines.push('', 'Evidence:');
    s.evidence.forEach((e) => lines.push(`- ${e.text}`));
    if (s.rollbackPlan) lines.push('', 'Rollback plan from the change record:', s.rollbackPlan);
  }
  lines.push('', 'Confirmed by an engineer before linking. Scores are decision support, not proof.');
  return lines.join('\n');
}
