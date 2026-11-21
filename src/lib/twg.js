// Teamwork Graph (TWG) enrichment. Uses curated queries only (raw Cypher is no longer accepted),
// runs as the current user, and never blocks the main analysis: if TWG is unavailable the caller
// gets { available: false, note } and carries on with Jira data alone.
import api from '@forge/api';

const OP_PREFIX = 'outagerca_'; // TWG requires operation names shaped [company]_[operation]
const TRANSIENT = /RATE_LIMIT|THROTTL|429|502|503|504/i;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export const Q = {
  userTeams: `query OP($userId: ID!, $first: Int) {
    atlassianUserInTeams(userId: $userId, first: $first) {
      edges { node { ... on AtlassianTeam { id displayName } } }
    }
  }`,
  workItemComments: `query OP($id: ID!, $since: String!, $first: Int) {
    jiraWorkItemComments(id: $id, since: $since, first: $first) {
      edges { node { ... on JiraWorkItemComment { createdAt author { name } } } }
    }
  }`,
};

export async function twg(opName, query, variables) {
  const operationName = `${OP_PREFIX}${opName}`;
  const text = query.replace('query OP', `query ${operationName}`);
  for (let attempt = 0; ; attempt++) {
    let status = 0;
    let json = null;
    try {
      const res = await api.asUser().requestTeamworkGraph(text, variables, operationName);
      status = res.status;
      json = await res.json().catch(() => null);
    } catch (e) {
      json = { errors: [{ message: String(e?.message || e) }] };
    }
    const errors = Array.isArray(json?.errors) ? json.errors : [];
    const firstError = errors[0] ? String(errors[0].message).slice(0, 160) : status >= 400 ? `http-${status}` : null;
    // HTTP 200 is not success on its own: the API reports many failures inside `errors`.
    if (!firstError && json?.data) return { ok: true, data: json.data };
    if (attempt < 2 && TRANSIENT.test(`${firstError} ${status}`)) {
      await sleep(250 * 2 ** attempt);
      continue;
    }
    return { ok: false, error: firstError || 'no-data' };
  }
}

const edges = (d, field) => (d?.[field]?.edges || []).map((e) => e.node).filter(Boolean);

/** Owning teams of the change implementer and recent discussion on the change, from Teamwork Graph. */
export async function changeGraphContext({ cloudId, change }) {
  const notes = [];
  const result = { available: false, ownerTeams: [], recentComments: [], notes };
  if (!cloudId) {
    notes.push('Teamwork Graph skipped: site id not available in this context.');
    return result;
  }
  const calls = [];
  if (change.assignee?.accountId) {
    calls.push(
      twg('changeOwnerTeams', Q.userTeams, { userId: `ari:cloud:identity::user/${change.assignee.accountId}`, first: 10 }).then((r) => {
        if (r.ok) {
          result.available = true;
          result.ownerTeams = edges(r.data, 'atlassianUserInTeams').map((t) => t.displayName).filter(Boolean);
        } else notes.push(`Owner teams unavailable (${r.error}).`);
      })
    );
  } else {
    notes.push('Change has no assignee, so no owning team could be looked up.');
  }
  if (change.id) {
    calls.push(
      twg('changeComments', Q.workItemComments, { id: `ari:cloud:jira:${cloudId}:issue/${change.id}`, since: 'P7D', first: 25 }).then((r) => {
        if (r.ok) {
          result.available = true;
          result.recentComments = edges(r.data, 'jiraWorkItemComments').map((c) => ({ at: c.createdAt, author: c.author?.name || 'unknown' }));
        } else notes.push(`Recent discussion unavailable (${r.error}).`);
      })
    );
  }
  await Promise.all(calls);
  return result;
}
