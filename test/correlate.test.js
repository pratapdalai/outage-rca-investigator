import test from 'node:test';
import assert from 'node:assert/strict';
import { demoScenario, pickIssueType } from '../src/lib/demo.js';
import { normaliseIssue, rankSuspects, blastRadius, buildTimeline, rcaComment } from '../src/lib/correlate.js';
import { extractEntities, adfToText, textToAdf, parseLabelledTime, extractSection, CHANGE_TIME_LABELS } from '../src/lib/text.js';

const NOW = Date.parse('2026-11-20T12:00:00Z');

// Turn the demo scenario into fake Jira REST issues (ADF descriptions), as the app would read them.
function fakeJira() {
  const { changes, incidents } = demoScenario(NOW);
  let n = 1;
  const mk = (spec, label, prefix) => ({
    key: `${prefix}-${n}`,
    id: String(10000 + n++),
    fields: {
      summary: spec.summary,
      description: textToAdf(spec.body.join('\n')),
      labels: [label, 'rca-demo'],
      components: [],
      issuetype: { name: 'Task' },
      status: { name: 'Done', statusCategory: { key: 'done' } },
      created: new Date(NOW - 60e3).toISOString(),
      resolutiondate: null,
      assignee: null,
    },
    ref: spec.ref,
  });
  const ch = changes.map((c) => mk(c, 'network-change', 'NOC'));
  const inc = incidents.map((i) => mk(i, 'outage', 'NOC'));
  const byRef = Object.fromEntries([...ch, ...inc].map((x) => [x.ref, x.key]));
  return {
    changes: ch.map((i) => normaliseIssue(i)),
    incidents: inc.map((i) => normaliseIssue(i)),
    byRef,
  };
}

test('ADF round trip keeps lines', () => {
  const text = 'Implemented: 2026-11-20T07:00:00Z\nRisk: High';
  assert.equal(adfToText(textToAdf(text)).trim(), text);
});

test('entity extraction finds elements, versions, sites and skips issue keys', () => {
  const e = extractEntities('OLT-BBSR-07 upgraded to v4.2.1, see NOC-12.\nSite: BBSR-EXCH-2\nIP 10.1.2.3');
  assert.ok(e.elements.includes('OLT-BBSR-07'));
  assert.ok(!e.elements.includes('NOC-12'));
  assert.ok(e.versions.includes('V4.2.1'));
  assert.ok(e.sites.includes('BBSR-EXCH-2'));
  assert.ok(!e.versions.some((v) => v.startsWith('V10.1')), 'IPv4 must not be read as a version');
});

test('control labels (outage, network-change, demo markers) are never matched as evidence', () => {
  const e = extractEntities('', { labels: ['outage', 'network-change', 'rca-demo', 'rca-demo-main', 'core-ring'] });
  assert.deepEqual(e.labels, ['CORE-RING']);
});

test('labelled time and rollback section parsing', () => {
  assert.equal(parseLabelledTime('Implemented: 2026-11-20T07:00:00Z', CHANGE_TIME_LABELS), Date.parse('2026-11-20T07:00:00Z'));
  const s = extractSection('Rollback plan:\n1) Revert image\n2) Reboot\n\nOther: x', 'rollback plan');
  assert.equal(s, '1) Revert image\n2) Reboot');
});

test('normalisation classifies changes and incidents and reads explicit times', () => {
  const { changes, incidents } = fakeJira();
  assert.ok(changes.every((c) => c.kind === 'change'));
  assert.ok(incidents.every((i) => i.kind === 'incident'));
  assert.equal(changes[0].time, NOW - 5 * 3600e3);
  assert.equal(incidents[0].customers, 1240);
  assert.match(changes[0].rollbackPlan, /standby image v4\.1\.9/);
});

test('OLT firmware upgrade beats the more recent emergency DNS patch', () => {
  const { changes, incidents, byRef } = fakeJira();
  const main = incidents.find((i) => i.key === byRef.I1);
  const r = rankSuspects(main, changes, incidents);
  const [first, second] = r.suspects;
  console.log(r.suspects.map((s) => `${s.key} ${s.score} ${s.confidence} ${JSON.stringify(s.breakdown)}`).join('\n'));
  assert.equal(first.key, byRef.C1, 'firmware change must rank first');
  assert.equal(first.confidence, 'HIGH');
  assert.equal(second.key, byRef.C3, 'DNS patch is the decoy in second place');
  assert.ok(first.score - second.score >= 15);
  assert.equal(r.verdict.status, 'PROBABLE_CAUSE');
  assert.equal(first.relatedOutages.length, 3);
  assert.equal(first.customersAffected, 1240 + 380 + 520 + 210);
  // future change and the 100h-old change are excluded with reasons
  const ex = Object.fromEntries(r.excluded.map((e) => [e.key, e.reason]));
  assert.match(ex[byRef.C5], /after the outage/);
  assert.match(ex[byRef.C6], /more than 72h/);
});

test('DNS outage is attributed to the DNS patch, not the OLT firmware', () => {
  const { changes, incidents, byRef } = fakeJira();
  const dns = incidents.find((i) => i.key === byRef.I5);
  const r = rankSuspects(dns, changes, incidents);
  assert.equal(r.suspects[0].key, byRef.C3);
});

test('unrelated customer-premises ticket gets no confident suspect', () => {
  const { changes, incidents, byRef } = fakeJira();
  const cpe = incidents.find((i) => i.key === byRef.I6);
  const r = rankSuspects(cpe, changes, incidents);
  assert.ok(r.suspects.every((s) => s.confidence === 'LOW'), JSON.stringify(r.suspects.map((s) => [s.key, s.score])));
  assert.equal(r.verdict.status, 'INCONCLUSIVE');
});

test('blast radius of the firmware change covers the four OLT outages', () => {
  const { changes, incidents, byRef } = fakeJira();
  const c1 = changes.find((c) => c.key === byRef.C1);
  const b = blastRadius(c1, incidents);
  assert.equal(b.count, 4);
  assert.equal(b.customers, 2350);
});

test('timeline is chronological and marks this outage', () => {
  const { changes, incidents, byRef } = fakeJira();
  const main = incidents.find((i) => i.key === byRef.I1);
  const t = buildTimeline(main, changes, incidents);
  const times = t.map((e) => Date.parse(e.at));
  assert.deepEqual(times, [...times].sort((a, b) => a - b));
  assert.ok(t.some((e) => e.type === 'THIS_OUTAGE' && e.key === main.key));
});

test('RCA comment includes evidence and rollback plan', () => {
  const { changes, incidents, byRef } = fakeJira();
  const main = incidents.find((i) => i.key === byRef.I1);
  const r = rankSuspects(main, changes, incidents);
  const c = rcaComment(r, byRef.C1);
  assert.match(c, /Evidence:/);
  assert.match(c, /Rollback plan/);
});

test('issue type picker prefers Change / Incident and falls back to Task', () => {
  const types = [{ name: 'Task' }, { name: 'Sub-task', subtask: true }, { name: 'Bug' }];
  assert.equal(pickIssueType(types, 'change').name, 'Task');
  assert.equal(pickIssueType(types, 'incident').name, 'Bug');
  assert.equal(pickIssueType([{ name: 'Change' }, { name: 'Incident' }], 'incident').name, 'Incident');
});
