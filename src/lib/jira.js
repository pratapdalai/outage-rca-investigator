// Thin Jira REST v3 client. All calls run as the current user (asUser), so the app only ever
// sees and changes what the person using it is allowed to see and change.
import api, { route } from '@forge/api';

const ISSUE_FIELDS = ['summary', 'description', 'labels', 'components', 'issuetype', 'status', 'created', 'resolutiondate', 'assignee', 'project'];

export class JiraError extends Error {
  constructor(status, body) {
    super(`Jira API ${status}: ${typeof body === 'string' ? body.slice(0, 300) : JSON.stringify(body).slice(0, 300)}`);
    this.status = status;
  }
}

async function call(r, { method = 'GET', body } = {}) {
  const res = await api.asUser().requestJira(r, {
    method,
    headers: { Accept: 'application/json', ...(body ? { 'Content-Type': 'application/json' } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  if (res.status === 204) return null;
  const text = await res.text();
  let json;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = text;
  }
  if (!res.ok) throw new JiraError(res.status, json);
  return json;
}

export async function getSiteUrl() {
  try {
    const info = await call(route`/rest/api/3/serverInfo`);
    return (info?.baseUrl || '').replace(/\/$/, '');
  } catch {
    return '';
  }
}

export async function getIssue(key) {
  return call(route`/rest/api/3/issue/${key}?fields=${ISSUE_FIELDS.join(',')}`);
}

/** JQL search using the enhanced search endpoint, following nextPageToken up to `limit` issues. */
export async function search(jql, limit = 200) {
  const out = [];
  let nextPageToken;
  do {
    const page = await call(route`/rest/api/3/search/jql`, {
      method: 'POST',
      body: { jql, fields: ISSUE_FIELDS, maxResults: Math.min(100, limit - out.length), ...(nextPageToken ? { nextPageToken } : {}) },
    });
    out.push(...(page?.issues || []));
    nextPageToken = page?.nextPageToken;
  } while (nextPageToken && out.length < limit);
  return out;
}

/**
 * Search with a preferred JQL that may reference an issue type that doesn't exist on this site
 * (e.g. "Change" outside Jira Service Management). On a 400, fall back to the labels-only JQL.
 */
export async function searchWithFallback(preferredJql, fallbackJql, limit) {
  try {
    return await search(preferredJql, limit);
  } catch (e) {
    if (e.status === 400) return search(fallbackJql, limit);
    throw e;
  }
}

export async function addComment(key, adfBody) {
  return call(route`/rest/api/3/issue/${key}/comment`, { method: 'POST', body: { body: adfBody } });
}

/** Keys of all issues linked to `key` (either direction, any link type). */
export async function getLinkedKeys(key) {
  const r = await call(route`/rest/api/3/issue/${key}?fields=issuelinks`);
  return (r?.fields?.issuelinks || []).map((l) => (l.inwardIssue || l.outwardIssue)?.key).filter(Boolean);
}

export async function getLinkTypes() {
  const r = await call(route`/rest/api/3/issueLinkType`);
  return r?.issueLinkTypes || [];
}

export async function linkIssues(typeName, keyA, keyB) {
  return call(route`/rest/api/3/issueLink`, {
    method: 'POST',
    body: { type: { name: typeName }, inwardIssue: { key: keyA }, outwardIssue: { key: keyB } },
  });
}

export async function getProjectIssueTypes(projectKey) {
  const r = await call(route`/rest/api/3/issue/createmeta/${projectKey}/issuetypes?maxResults=50`);
  return r?.issueTypes || r?.values || [];
}

export async function createIssue(fields) {
  return call(route`/rest/api/3/issue`, { method: 'POST', body: { fields } });
}
