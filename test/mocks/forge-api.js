// In-memory fake of the Jira Cloud REST API + Teamwork Graph, for integration tests only.
// indexLag: newly created issues stay invisible to JQL search for this many search calls
// (real Jira search is eventually consistent).
export const state = { issues: [], seq: 0, links: [], comments: [], hasChangeType: false, twgMode: 'ok', calls: [], indexLag: 0 };

export function route(strings, ...vals) {
  return strings.reduce((s, str, i) => s + str + (i < vals.length ? encodeURIComponent(vals[i]) : ''), '');
}
const resp = (status, body) => ({ status, ok: status < 400, text: async () => (body == null ? '' : JSON.stringify(body)), json: async () => body });

function matchJql(jql, issue) {
  const pm = /project = "([^"]+)"/.exec(jql);
  if (pm && issue.fields.project.key !== pm[1]) return false;
  const lm = /labels in \(([^)]*)\)/.exec(jql);
  const labels = lm ? lm[1].split(',').map((s) => s.trim().replace(/"/g, '')) : [];
  const tm = /issuetype in \("([^"]+)"\)/.exec(jql);
  const byLabel = issue.fields.labels.some((l) => labels.includes(l));
  const byType = tm ? issue.fields.issuetype.name === tm[1] : false;
  return byLabel || byType;
}

async function requestJira(path, opts = {}) {
  const method = opts.method || 'GET';
  const body = opts.body ? JSON.parse(opts.body) : null;
  state.calls.push(`${method} ${path.split('?')[0]}`);
  const p = decodeURIComponent(path);
  if (p.startsWith('/rest/api/3/serverInfo')) return resp(200, { baseUrl: 'https://demo.atlassian.net' });
  if (method === 'POST' && p === '/rest/api/3/search/jql') {
    if (/issuetype in \("(Change|Incident)"\)/.test(body.jql) && !state.hasChangeType) return resp(400, { errorMessages: ["The value 'Change' does not exist for the field 'issuetype'."] });
    const visible = state.issues.filter((i) => {
      if (i.lag > 0) { i.lag -= 1; return false; }
      return true;
    });
    const hits = visible.filter((i) => matchJql(body.jql, i)).reverse();
    return resp(200, { issues: hits.slice(0, body.maxResults) });
  }
  let m;
  if ((m = /^\/rest\/api\/3\/issue\/createmeta\/([^/]+)\/issuetypes/.exec(p))) return resp(200, { issueTypes: [{ id: '1', name: 'Task' }, { id: '2', name: 'Bug' }, { id: '3', name: 'Sub-task', subtask: true }] });
  if (p === '/rest/api/3/issueLinkType') return resp(200, { issueLinkTypes: [{ name: 'Blocks' }, { name: 'Relates' }] });
  if (method === 'POST' && p === '/rest/api/3/issueLink') { state.links.push(body); return resp(201, null); }
  if (method === 'POST' && (m = /^\/rest\/api\/3\/issue\/([^/]+)\/comment$/.exec(p))) { state.comments.push({ key: m[1], body: body.body }); return resp(201, { id: '1' }); }
  if (method === 'POST' && p === '/rest/api/3/issue') {
    const f = body.fields;
    const id = String(10000 + ++state.seq);
    const key = `${f.project.key}-${state.seq}`;
    const types = { 1: 'Task', 2: 'Bug' };
    state.issues.push({ id, key, lag: state.indexLag, fields: { summary: f.summary, description: f.description, labels: f.labels || [], components: [], issuetype: { name: types[f.issuetype.id] }, status: { name: 'Open', statusCategory: { key: 'new' } }, created: new Date().toISOString(), resolutiondate: null, assignee: f.assignee ? { accountId: f.assignee.accountId, displayName: 'Demo User' } : null, project: { key: f.project.key } } });
    return resp(201, { id, key });
  }
  if (method === 'GET' && (m = /^\/rest\/api\/3\/issue\/([A-Z0-9_]+-\d+)/.exec(p))) {
    const i = state.issues.find((x) => x.key === m[1]);
    if (!i) return resp(404, { errorMessages: ['Issue does not exist or you do not have permission to see it.'] });
    // Jira reports each link from this issue's point of view: the *other* issue as inward/outward.
    const issuelinks = state.links
      .filter((l) => l.inwardIssue.key === i.key || l.outwardIssue.key === i.key)
      .map((l) => (l.inwardIssue.key === i.key ? { type: l.type, outwardIssue: l.outwardIssue } : { type: l.type, inwardIssue: l.inwardIssue }));
    return resp(200, { ...i, fields: { ...i.fields, issuelinks } });
  }
  return resp(500, { errorMessages: [`mock: unhandled ${method} ${p}`] });
}

async function requestTeamworkGraph(query, variables, operationName) {
  state.calls.push(`TWG ${operationName}`);
  if (!/^[a-z]{3,}_[A-Za-z]{4,}$/.test(operationName)) return resp(200, { errors: [{ message: 'bad operation name' }] });
  if (state.twgMode === 'down') return resp(200, { errors: [{ message: 'DataFetchingException: graph unavailable' }] });
  if (/atlassianUserInTeams/.test(query)) return resp(200, { data: { atlassianUserInTeams: { edges: [{ node: { id: 't1', displayName: 'Access Network Ops - Bhubaneswar' } }] } } });
  if (/jiraWorkItemComments/.test(query)) return resp(200, { data: { jiraWorkItemComments: { edges: [{ node: { createdAt: new Date().toISOString(), author: { name: 'Ravi Kumar' } } }] } } });
  return resp(200, { data: {} });
}

const api = { asUser: () => ({ requestJira, requestTeamworkGraph }), asApp: () => ({ requestJira }) };
export default api;
