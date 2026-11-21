// Forge entry points: Rovo actions (also exposed as MCP tools) and the UI Kit resolver.
import Resolver from '@forge/resolver';
import * as svc from './service.js';

/** Wrap an action so Rovo always receives a readable result instead of an exception. */
const action = (fn) => async (payload) => {
  try {
    const ctx = payload?.context || {};
    return await fn(payload || {}, ctx);
  } catch (e) {
    if (e instanceof svc.UserError) return { error: e.message };
    console.error(e);
    if (e?.status === 404) return { error: 'Issue not found, or you do not have permission to view it.' };
    if (e?.status === 401 || e?.status === 403) return { error: 'You do not have permission for this operation in Jira.' };
    return { error: 'The analysis failed unexpectedly. Please try again.' };
  }
};

// The issue the user is looking at, when the agent is opened from an issue.
const contextIssue = (ctx) => ctx?.jira?.issueKey || ctx?.jira?.issue?.key;

export const findRootCause = action((p, ctx) =>
  svc.analyseOutage({ issueKey: p.issueKey || contextIssue(ctx), windowHours: p.windowHours, projectKey: p.projectKey, cloudId: ctx.cloudId })
);

export const getBlastRadius = action((p, ctx) =>
  svc.changeBlastRadius({ changeKey: p.changeKey || contextIssue(ctx), windowHours: p.windowHours, projectKey: p.projectKey })
);

export const getChangeContext = action((p, ctx) => svc.changeContext({ changeKey: p.changeKey || contextIssue(ctx), cloudId: ctx.cloudId }));

export const getTimeline = action((p, ctx) =>
  svc.outageTimeline({ issueKey: p.issueKey || contextIssue(ctx), windowHours: p.windowHours, projectKey: p.projectKey })
);

export const linkRootCause = action((p, ctx) =>
  svc.linkRootCause({ incidentKey: p.incidentKey || contextIssue(ctx), changeKey: p.changeKey, windowHours: p.windowHours })
);

// ---- UI resolver (issue panel + project page) ----
const resolver = new Resolver();

const safe = (fn) => async (req) => {
  try {
    return { ok: true, data: await fn(req) };
  } catch (e) {
    if (!(e instanceof svc.UserError)) console.error(e);
    return { ok: false, error: e instanceof svc.UserError ? e.message : e?.status === 404 ? 'Issue not found or not visible to you.' : 'Something went wrong. Please retry.' };
  }
};

resolver.define(
  'analyse',
  safe(({ payload, context }) =>
    svc.analyseOutage({ issueKey: context.extension?.issue?.key, windowHours: payload?.windowHours, cloudId: context.cloudId })
  )
);

resolver.define(
  'linkCause',
  safe(({ payload, context }) => svc.linkRootCause({ incidentKey: context.extension?.issue?.key, changeKey: payload.changeKey, windowHours: payload?.windowHours }))
);

resolver.define('changeContext', safe(({ payload, context }) => svc.changeContext({ changeKey: payload.changeKey, cloudId: context.cloudId })));

resolver.define('overview', safe(({ payload, context }) => svc.projectOverview({ projectKey: context.extension?.project?.key, windowHours: payload?.windowHours })));

resolver.define('seedDemo', safe(({ context }) => svc.seedDemo({ projectKey: context.extension?.project?.key, accountId: context.accountId })));

export const resolverHandler = resolver.getDefinitions();
