import assert from 'node:assert/strict';
import { state } from './mocks/forge-api.js';
import * as app from '../src/index.js';
import * as svc from '../src/service.js';

const resolve = (name, payload, extension) => app.resolverHandler(name, { payload, context: { cloudId: 'cloud-1', accountId: 'acc-123', extension } });
const log = (...a) => console.log(...a);

// 1. Project page with no data → empty overview
let r = await resolve('overview', { windowHours: 72 }, { project: { key: 'NOC' } });
assert.equal(r.ok, true); assert.equal(r.data.rows.length, 0); log('✓ empty overview');

// 1b. Search never catches up within the time budget → seeding still succeeds but reports searchReady=false
state.indexLag = 1000;
let s = await svc.seedDemo({ projectKey: 'LAG', accountId: 'acc-123', pollMs: 5, budgetMs: 40 });
assert.equal(s.alreadyExists, false); assert.equal(s.searchReady, false); log('✓ seeding reports search not ready yet');
state.issues.length = 0; state.indexLag = 0; // reset the fake site

// 2. Seed demo data from the project page (site without Change/Incident issue types).
//    Search lags for 2 calls: seeding waits until all 12 tickets are searchable.
state.indexLag = 2;
r = await resolve('seedDemo', {}, { project: { key: 'NOC' } });
state.indexLag = 0;
assert.equal(r.ok, true, JSON.stringify(r)); assert.equal(r.data.changes.length, 6); assert.equal(r.data.incidents.length, 6);
assert.equal(r.data.changeIssueType, 'Task'); assert.equal(r.data.incidentIssueType, 'Bug');
assert.equal(r.data.alreadyExists, false); assert.equal(r.data.searchReady, true);
const main = r.data.mainIncident; const [C1, , C3] = r.data.changes; log('✓ seeded (waited for search)', main, r.data.changes.join(','));

// 2b. Seeding again (e.g. a judge clicks twice, or from another project) creates nothing new
const before = state.issues.length;
r = await resolve('seedDemo', {}, { project: { key: 'OPS' } });
assert.equal(r.ok, true); assert.equal(r.data.alreadyExists, true); assert.equal(r.data.mainIncident, main);
assert.equal(r.data.projectKey, 'NOC'); assert.equal(state.issues.length, before); log('✓ second seed reuses existing demo', r.data.mainIncident);

// 3. Issue panel analysis (JQL fallback path exercised: no "Change" issue type on this site)
r = await resolve('analyse', { windowHours: 72 }, { issue: { key: main } });
assert.equal(r.ok, true, JSON.stringify(r));
assert.equal(r.data.suspects[0].key, C1); assert.equal(r.data.suspects[1].key, C3);
assert.equal(r.data.verdict.status, 'PROBABLE_CAUSE');
assert.deepEqual(r.data.suspects[0].teamworkGraph.ownerTeams, ['Access Network Ops - Bhubaneswar']);
assert.ok(r.data.suspects[0].url.startsWith('https://demo.atlassian.net/browse/'));
log('✓ panel analysis', r.data.suspects.map((s) => `${s.key}:${s.score}`).join(' '));

// 4. Rovo action: issue key comes from the context (user is viewing the issue)
let a = await app.findRootCause({ context: { cloudId: 'cloud-1', jira: { issueKey: main } } });
assert.equal(a.suspects[0].key, C1); log('✓ action uses context issue key');

// 5. Teamwork Graph down → analysis still works with a note
state.twgMode = 'down';
a = await app.findRootCause({ issueKey: main.toLowerCase(), context: { cloudId: 'cloud-1' } });
assert.equal(a.suspects[0].key, C1); assert.equal(a.suspects[0].teamworkGraph.available, false);
assert.ok(a.suspects[0].teamworkGraph.notes.length > 0); state.twgMode = 'ok'; log('✓ graceful without Teamwork Graph; lowercase key accepted');

// 6. Blast radius, change context, timeline
a = await app.getBlastRadius({ changeKey: C1, context: {} });
assert.equal(a.outagesAfterChange, 4); assert.equal(a.customersAffected, 2350); log('✓ blast radius', a.outagesAfterChange, a.customersAffected);
a = await app.getChangeContext({ changeKey: C1, context: { cloudId: 'cloud-1' } });
assert.deepEqual(a.escalateTo, ['Access Network Ops - Bhubaneswar']); assert.match(a.rollbackPlan, /v4\.1\.9/); log('✓ change context');
a = await app.getTimeline({ issueKey: main, context: {} });
assert.ok(a.events.length >= 8); log('✓ timeline events', a.events.length);

// 7. Bad inputs come back as readable errors, not crashes
a = await app.findRootCause({ issueKey: 'not a key', context: {} }); assert.match(a.error, /not a valid Jira issue key/);
a = await app.findRootCause({ issueKey: 'NOC-999', context: {} }); assert.match(a.error, /not found/);
a = await app.linkRootCause({ incidentKey: main, changeKey: main, context: {} }); assert.match(a.error, /not a change record/);
log('✓ readable errors');

// 8. Confirm root cause from the panel → link + evidence comment
r = await resolve('linkCause', { changeKey: C1 }, { issue: { key: main } });
assert.equal(r.ok, true, JSON.stringify(r)); assert.equal(state.links.length, 1); assert.equal(state.links[0].type.name, 'Relates');
const c = JSON.stringify(state.comments[0].body); assert.match(c, /Evidence/); assert.match(c, /Rollback plan/);
log('✓ linked + commented:', r.data.message);

// 9. Panel opened on a change record shows blast radius
r = await resolve('analyse', {}, { issue: { key: C1 } });
assert.equal(r.data.outagesAfterChange, 4); log('✓ panel on a change record');

// 10. Project overview with data
r = await resolve('overview', { windowHours: 72 }, { project: { key: 'NOC' } });
assert.equal(r.data.rows.length, 6); assert.equal(r.data.topChanges[0].key, C1);
log('✓ overview rows', r.data.rows.length, 'top change', r.data.topChanges[0].key, r.data.topChanges[0].customers, 'customers');

console.log('\nINTEGRATION: ALL PASSED. Jira calls made:', state.calls.length);
