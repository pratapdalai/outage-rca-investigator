// Orchestration shared by the Rovo actions, the MCP tools and the UI resolvers.
import * as jira from './lib/jira.js';
import { changeGraphContext } from './lib/twg.js';
import { normaliseIssue, rankSuspects, blastRadius, buildTimeline, rcaComment, DEFAULTS } from './lib/correlate.js';
import { textToAdf } from './lib/text.js';
import { demoScenario, pickIssueType } from './lib/demo.js';

const KEY_RE = /^[A-Z][A-Z0-9_]+-\d+$/;

export class UserError extends Error {}

export function cleanKey(k) {
  const key = String(k || '').trim().toUpperCase();
  if (!KEY_RE.test(key)) throw new UserError(`"${k}" is not a valid Jira issue key (expected something like NOC-42).`);
  return key;
}

function clampWindow(h) {
  const n = Number(h);
  return Number.isFinite(n) && n > 0 ? Math.min(Math.max(n, 1), 720) : DEFAULTS.windowHours;
}

const projectClause = (projectKey) => (projectKey ? `project = "${projectKey.replace(/"/g, '')}" AND ` : '');

async function loadChanges(projectKey) {
  const scope = projectClause(projectKey);
  return jira.searchWithFallback(
    `${scope}(labels in ("network-change", "change") OR issuetype in ("Change")) AND created >= -45d ORDER BY created DESC`,
    `${scope}labels in ("network-change", "change") AND created >= -45d ORDER BY created DESC`,
    200
  );
}

async function loadIncidents(projectKey) {
  const scope = projectClause(projectKey);
  return jira.searchWithFallback(
    `${scope}(labels in ("outage", "incident") OR issuetype in ("Incident")) AND created >= -45d ORDER BY created DESC`,
    `${scope}labels in ("outage", "incident") AND created >= -45d ORDER BY created DESC`,
    200
  );
}

/** Load the outage plus all candidate changes and outages, normalised. */
async function loadWorld(issueKey, { projectKey } = {}) {
  const [siteUrl, raw] = await Promise.all([jira.getSiteUrl(), jira.getIssue(issueKey)]);
  const [rawChanges, rawIncidents] = await Promise.all([loadChanges(projectKey), loadIncidents(projectKey)]);
  const incident = normaliseIssue(raw, siteUrl);
  const changes = rawChanges.map((i) => normaliseIssue(i, siteUrl)).filter((c) => c.kind === 'change');
  const incidents = rawIncidents.map((i) => normaliseIssue(i, siteUrl)).filter((i) => i.kind === 'incident');
  return { siteUrl, incident, changes, incidents };
}

export async function analyseOutage({ issueKey, windowHours, projectKey, cloudId, withGraph = true }) {
  const key = cleanKey(issueKey);
  const world = await loadWorld(key, { projectKey });
  if (world.incident.kind === 'change') {
    return {
      note: `${key} is a change record, not an outage. Use the blast-radius tool to see which outages followed it.`,
      ...(await changeBlastRadius({ changeKey: key, windowHours, projectKey })),
    };
  }
  const result = rankSuspects(world.incident, world.changes, world.incidents, { windowHours: clampWindow(windowHours) });
  if (withGraph && result.suspects[0]) {
    const top = world.changes.find((c) => c.key === result.suspects[0].key);
    result.suspects[0].teamworkGraph = await changeGraphContext({ cloudId, change: top });
  }
  result.howToRead =
    'Score 0-100 = timing (30) + shared network elements/firmware/site (30) + other outages on the same elements since the change (20) + similar wording (10) + change risk (10). HIGH >= 70, MEDIUM >= 45.';
  return result;
}

export async function changeBlastRadius({ changeKey, windowHours, projectKey }) {
  const key = cleanKey(changeKey);
  const [siteUrl, raw] = await Promise.all([jira.getSiteUrl(), jira.getIssue(key)]);
  const change = normaliseIssue(raw, siteUrl);
  const incidents = (await loadIncidents(projectKey)).map((i) => normaliseIssue(i, siteUrl)).filter((i) => i.kind === 'incident');
  const b = blastRadius(change, incidents, { windowHours: clampWindow(windowHours) });
  return {
    change: { key: change.key, summary: change.summary, url: change.url, implementedAt: change.time ? new Date(change.time).toISOString() : null, entities: change.entities, rollbackPlan: change.rollbackPlan || null },
    outagesAfterChange: b.count,
    customersAffected: b.customers,
    outages: b.incidents.map((h) => ({
      key: h.incident.key,
      summary: h.incident.summary,
      url: h.incident.url,
      detectedAt: new Date(h.incident.time).toISOString(),
      minutesAfterChange: Math.round(h.afterChangeMs / 60000),
      sharedEntities: h.shared.map((s) => s.value),
      customersAffected: h.incident.customers,
    })),
  };
}

export async function changeContext({ changeKey, cloudId }) {
  const key = cleanKey(changeKey);
  const [siteUrl, raw] = await Promise.all([jira.getSiteUrl(), jira.getIssue(key)]);
  const change = normaliseIssue(raw, siteUrl);
  const graph = await changeGraphContext({ cloudId, change });
  return {
    key: change.key,
    summary: change.summary,
    url: change.url,
    status: change.status,
    implementer: change.assignee?.displayName || null,
    implementedAt: change.time ? new Date(change.time).toISOString() : null,
    entities: change.entities,
    rollbackPlan: change.rollbackPlan || 'No rollback plan found in the change record.',
    teamworkGraph: graph,
    escalateTo: graph.ownerTeams.length ? graph.ownerTeams : change.assignee ? [change.assignee.displayName] : [],
  };
}

export async function outageTimeline({ issueKey, windowHours, projectKey }) {
  const key = cleanKey(issueKey);
  const world = await loadWorld(key, { projectKey });
  return { incident: world.incident.key, events: buildTimeline(world.incident, world.changes, world.incidents, { windowHours: clampWindow(windowHours) }) };
}

/** Link a confirmed root-cause change to an outage and post the evidence as a comment. */
export async function linkRootCause({ incidentKey, changeKey, windowHours, projectKey }) {
  const iKey = cleanKey(incidentKey);
  const cKey = cleanKey(changeKey);
  const world = await loadWorld(iKey, { projectKey });
  const analysis = rankSuspects(world.incident, world.changes, world.incidents, { windowHours: clampWindow(windowHours) });
  if (!world.changes.some((c) => c.key === cKey)) {
    throw new UserError(`${cKey} is not a change record (label it "network-change" or use a Change issue type).`);
  }
  const s = analysis.suspects.find((x) => x.key === cKey);
  // Idempotent: a second confirmation (double click, or the agent asked twice) must not add a
  // duplicate link and evidence comment.
  if ((await jira.getLinkedKeys(iKey)).includes(cKey)) {
    return {
      linked: true,
      alreadyLinked: true,
      incident: iKey,
      change: cKey,
      score: s?.score ?? null,
      confidence: s?.confidence ?? 'NOT_RANKED',
      message: `${cKey} is already linked to ${iKey}. Nothing was changed.`,
    };
  }
  const types = await jira.getLinkTypes();
  const type = types.find((t) => /^relates$/i.test(t.name)) || types.find((t) => /relat/i.test(t.name)) || types[0];
  if (!type) throw new UserError('No issue link types are available on this site.');
  await jira.linkIssues(type.name, iKey, cKey);
  await jira.addComment(iKey, textToAdf(rcaComment(analysis, cKey)));
  return {
    linked: true,
    alreadyLinked: false,
    incident: iKey,
    change: cKey,
    linkType: type.name,
    score: s?.score ?? null,
    confidence: s?.confidence ?? 'NOT_RANKED',
    message: `Linked ${cKey} to ${iKey} ("${type.name}") and posted the RCA evidence as a comment on ${iKey}.`,
  };
}

/** Project overview: recent outages in the project with their top suspect, for the project page. */
export async function projectOverview({ projectKey, windowHours }) {
  const siteUrl = await jira.getSiteUrl();
  const [rawChanges, rawIncidents] = await Promise.all([loadChanges(), loadIncidents()]);
  const changes = rawChanges.map((i) => normaliseIssue(i, siteUrl)).filter((c) => c.kind === 'change');
  const all = rawIncidents.map((i) => normaliseIssue(i, siteUrl)).filter((i) => i.kind === 'incident');
  const mine = all.filter((i) => i.key.startsWith(`${projectKey}-`)).slice(0, 12);
  const rows = mine.map((inc) => {
    const r = rankSuspects(inc, changes, all, { windowHours: clampWindow(windowHours) });
    const top = r.suspects[0];
    return {
      key: inc.key,
      summary: inc.summary,
      url: inc.url,
      detectedAt: inc.time ? new Date(inc.time).toISOString() : null,
      customers: inc.customers,
      topSuspect: top ? { key: top.key, summary: top.summary, score: top.score, confidence: top.confidence, url: top.url } : null,
      verdict: r.verdict.status,
    };
  });
  // Changes ranked by how many outages they explain (the "most damaging change" view).
  const blame = {};
  for (const row of rows) {
    if (row.topSuspect && row.topSuspect.confidence !== 'LOW') {
      const b = (blame[row.topSuspect.key] ||= { ...row.topSuspect, outages: 0, customers: 0 });
      b.outages += 1;
      b.customers += row.customers || 0;
    }
  }
  return {
    projectKey,
    changesTracked: changes.length,
    outagesTracked: mine.length,
    rows,
    topChanges: Object.values(blame).sort((a, b) => b.customers - a.customers || b.outages - a.outages).slice(0, 5),
  };
}

const DEMO_LABEL = 'rca-demo';
const DEMO_MAIN_LABEL = 'rca-demo-main';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Wait until Jira search returns all `expected` demo issues in the project. Search is eventually
 * consistent, so newly created issues can be missing for a few seconds. Gives up at `deadline`.
 */
async function waitForSearch(projectKey, expected, deadline, pollMs) {
  for (;;) {
    const found = await jira.search(`${projectClause(projectKey)}labels in ("${DEMO_LABEL}") ORDER BY created DESC`, 50);
    if (found.length >= expected) return true;
    if (Date.now() + pollMs > deadline) return false;
    await sleep(pollMs);
  }
}

/**
 * Create the demo FTTH scenario in a project so judges can try the app in two minutes.
 * Idempotent per site: if a demo scenario the user can see already exists, point to it instead of
 * creating a second copy (duplicates would tie with the originals and weaken every verdict).
 */
export async function seedDemo({ projectKey, accountId, pollMs = 1000, budgetMs = 18000 }) {
  if (!projectKey) throw new UserError('Open this page from a Jira project to create demo data.');
  const started = Date.now();
  const existing = await jira.search(`labels in ("${DEMO_MAIN_LABEL}") ORDER BY created DESC`, 1);
  if (existing.length) {
    const main = existing[0];
    return {
      alreadyExists: true,
      mainIncident: main.key,
      projectKey: main.fields?.project?.key || main.key.split('-')[0],
      changes: [],
      incidents: [],
      searchReady: true,
    };
  }
  const types = await jira.getProjectIssueTypes(projectKey);
  const changeType = pickIssueType(types, 'change');
  const incidentType = pickIssueType(types, 'incident');
  if (!changeType || !incidentType) throw new UserError(`Project ${projectKey} has no issue types you can create.`);
  const { changes, incidents } = demoScenario();
  const created = { changes: [], incidents: [], mainIncident: null };
  // Sequential on purpose: keeps issue numbering in story order and stays well inside rate limits.
  for (const c of changes) {
    const fields = {
      project: { key: projectKey },
      issuetype: { id: changeType.id },
      summary: c.summary,
      description: textToAdf(c.body.join('\n')),
      labels: ['network-change', DEMO_LABEL],
    };
    let r;
    try {
      // Assign demo changes to the person running the demo so the owner / Teamwork Graph lookup has data.
      r = await jira.createIssue(accountId ? { ...fields, assignee: { accountId } } : fields);
    } catch (e) {
      if (e.status !== 400 || !accountId) throw e;
      r = await jira.createIssue(fields); // user not assignable in this project: create unassigned
    }
    created.changes.push(r.key);
  }
  for (const i of incidents) {
    const r = await jira.createIssue({
      project: { key: projectKey },
      issuetype: { id: incidentType.id },
      summary: i.summary,
      description: textToAdf(i.body.join('\n')),
      labels: i.main ? ['outage', DEMO_LABEL, DEMO_MAIN_LABEL] : ['outage', DEMO_LABEL],
    });
    created.incidents.push(r.key);
    if (i.main) created.mainIncident = r.key;
  }
  const total = created.changes.length + created.incidents.length;
  const searchReady = await waitForSearch(projectKey, total, started + budgetMs, pollMs);
  return { ...created, projectKey, alreadyExists: false, searchReady, changeIssueType: changeType.name, incidentIssueType: incidentType.name };
}
