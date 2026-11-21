---
name: telecom-rca-playbook
description: Playbook for telecom and network operations root-cause analysis. Use it when a user asks which network change caused an outage, wants the blast radius of a change, needs an escalation owner or rollback plan, or asks for an RCA / post-incident report for a broadband, mobile or core-network outage tracked in Jira.
compatibility: Jira Cloud or Jira Service Management. Outage tickets carry the label "outage" (or are Incident issues); change records carry the label "network-change" (or are Change issues).
allowed-tools: find-root-cause-changes get-outage-blast-radius get-change-context build-outage-timeline
metadata:
  domain: telecom-network-operations
  version: "1.0"
---

# Telecom outage root-cause playbook

Network outages are usually caused by a change: a firmware upgrade, a config push, a routing policy update. This playbook finds that change from Jira data and explains the evidence, so a NOC engineer can roll back with confidence.

## Step 1: Rank suspect changes

Call `find-root-cause-changes` with `issueKey` (the outage ticket). Optional: `windowHours` (default 72, max 720).

Read the result:
- `verdict.status`: `PROBABLE_CAUSE` (HIGH and clearly ahead), `LIKELY_CAUSE` (needs confirmation), `INCONCLUSIVE`, or `NO_SUSPECT`.
- `suspects[]`: ranked; each has `score` (0-100), `confidence`, `breakdown`, `evidence[]`, `relatedOutages[]`, `customersAffected`, `rollbackPlan`.
- `excluded[]`: changes ruled out, with the reason (after the outage started, or outside the window).

How the score is built is in `references/scoring.md`. Explain scores using the `evidence` texts, not your own reasoning.

## Step 2: Size the impact

Call `get-outage-blast-radius` with `changeKey` (the top suspect). It returns every outage on the same network elements, firmware versions or sites after that change, with customers affected. Use it to answer "how many customers?" and "is this one incident or many?".

## Step 3: Find the owner and the rollback

Call `get-change-context` with `changeKey`. It returns the implementer, the owning teams from Teamwork Graph (when available), recent discussion on the change and the rollback plan from the change record. If `teamworkGraph.available` is false, fall back to the implementer and say so.

## Step 4: Build the timeline (for reports)

Call `build-outage-timeline` with `issueKey`. Events are typed `CHANGE`, `OUTAGE` or `THIS_OUTAGE`, with `relativeToOutage` (negative = before). Events with `related: true` share network elements with the outage; lead with those.

## Edge cases

- **The key is a change, not an outage**: `find-root-cause-changes` returns the change's blast radius and a note. Explain that instead.
- **Two suspects within 15 points**: say the evidence is split and suggest checking both changes' implementation logs.
- **No suspects**: recommend checking non-change causes (fibre cut, power, hardware failure, upstream provider) and offer a wider window.
- **error in a result**: report it plainly; do not retry more than once.

## Safety

Never trigger or recommend an unconfirmed rollback. Linking a root cause is done by the agent's `link-root-cause-change` action only after the user confirms a specific change.
