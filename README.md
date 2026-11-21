# Outage RCA Investigator

**Find the network change that caused a telecom outage in seconds, not hours.**

A Forge app for Jira and Jira Service Management with a Rovo agent, reusable Rovo skill, MCP tools and Teamwork Graph integration. Built for Codegeist 2026, category **Apps for Specialized Industries (Telecom)**.

---

## The problem

When broadband goes down for a thousand homes, the first question in every Network Operations Centre (NOC) is the same: *what changed?* Engineers open dozens of change records, compare timestamps by hand, guess which firmware push or config change touched the failing equipment, and hunt for the owner and rollback plan. Many outages trace back to a recent change, and that hunt can take hours while customers wait.

The obvious shortcut, "blame the most recent change", is often wrong. A busy network has many changes a day.

## What the app does

Open any outage ticket in Jira. The **Outage root cause** panel (or the Rovo agent) immediately:

1. **Ranks every recent change** by how likely it caused this outage, with a score from 0 to 100 and a confidence level.
2. **Shows its evidence**: timing, shared network elements (e.g. `OLT-BBSR-07`), firmware versions (`v4.2.1`), sites, other outages on the same equipment since the change, similar wording and the change's risk signals.
3. **Rules out** changes that happened after the outage started or too long before, and says why.
4. **Sizes the blast radius**: every other outage on the same equipment since the change, and total customers affected.
5. **Names who to call**: the implementer's teams from **Teamwork Graph**, plus recent discussion on the change.
6. **Puts the rollback plan in front of the engineer**, straight from the change record.
7. **Records the root cause**: after an engineer confirms, links the change to the outage and posts the evidence as a comment.

The **Outage RCA** project page shows every recent outage with its most likely cause, and a chart of which changes caused the most customer impact.

### Example (the built-in demo scenario)

A fibre-broadband operator has six changes and six outage tickets. The most recent change before the main outage is an **emergency DNS patch**, so "blame the last change" would pick it. The app instead ranks the **OLT firmware upgrade** first (74/100, HIGH). It touches the same OLT, the same firmware version appears in the tickets, and three more outages hit that OLT after the upgrade. The DNS patch is correctly tied to the separate DNS outage in Cuttack. A single customer's faulty router gets no confident suspect at all.

## How it works

```
Outage ticket ──► entity extraction ──► candidate changes (JQL) ──► 5-factor score ──► verdict
                  (elements, versions,   within the lookback window    timing 30
                   sites, components)    + other outages               same elements 30
                                                                       other outages 20
                                                                       wording 10
                                                                       change risk 10
```

* **Deterministic and explainable.** Every point of the score has a written reason. A coincidence guard caps a change at 30 when only timing links it to the outage, so a lucky timestamp never produces a confident answer.
* **No paid LLM calls.** The correlation runs in plain JavaScript inside Forge. The language work (explaining results, drafting RCA reports) is done by Rovo through the agent. The app uses **no Forge LLM**.
* **Permission-safe.** All Jira and Teamwork Graph calls run as the current user (`asUser`), so people only see what they could already see.
* **Works on any Jira site.** Outages are tickets labelled `outage` (or the Incident type); changes are labelled `network-change` (or the Change type). It works in Jira Service Management and in plain Jira projects.

Scoring details: [`skills/telecom-rca-playbook/references/scoring.md`](skills/telecom-rca-playbook/references/scoring.md).

## Atlassian platform features used

| Feature | Module / API | What it does here |
|---|---|---|
| Rovo agent | `rovo:agent` | "Outage RCA Investigator": answers "which change caused this?", sizes impact, finds owners, drafts the RCA report |
| Rovo actions | `action` (4 × GET, 1 × UPDATE) | `find-root-cause-changes`, `get-outage-blast-radius`, `get-change-context`, `build-outage-timeline`, `link-root-cause-change` |
| Rovo skill | `rovo:skill` | `telecom-rca-playbook`: a reusable telecom RCA playbook that other agents can use with the same tools |
| MCP | `rovo:mcp` | The four read tools exposed as MCP tools for Rovo Studio agents and third-party AI clients |
| Teamwork Graph | `requestTeamworkGraph` (curated queries) | Owning teams of the change implementer (`atlassianUserInTeams`) and recent discussion on the change (`jiraWorkItemComments`) |
| Jira UI | `jira:issuePanel`, `jira:projectPage` (UI Kit) | Root-cause panel on every ticket; project overview with chart |
| Jira REST | search (JQL), issues, links, comments | Data source and writing back the confirmed root cause |

## Try it in 3 minutes (judges)

1. Install the app with the installation link from the Devpost submission. You need to be a site admin.
2. In Jira, create a team-managed Kanban space (Jira's new name for a project), for example `NOC Operations` with key `NOC`, or open any existing one.
3. In the space, click the **`+`** after the tabs, choose **Apps → Outage RCA**, then **Add to navigation**, and open the **Outage RCA** tab.
4. Click **Create demo telecom scenario**. It creates 6 change records and 6 outage tickets, or points to the existing demo if one is already there.
5. Open the ticket named in the message (*"FTTH broadband down for customers in Patia"*). Under the ticket title, click the **Outage RCA hexagon icon**, then **Outage root cause**. Scroll down to the panel (usually below *Linked work items*). It shows the verdict and ranked suspects.
6. Click **Who owns this change?**, then **Confirm as root cause**. The link and evidence comment appear on the ticket.
7. **Rovo** (if enabled on your site): click **Ask Rovo**, switch the agent to **Outage RCA Investigator**, and ask *"Which change caused this outage?"*, then *"Draft the RCA report for this outage"*.

Without Rovo, the panel and project page work fully; only the chat agent needs Rovo.

## Development

```bash
npm install
npm test            # unit tests for the engine + end-to-end test against a simulated Jira
npx forge lint      # Forge CLI 15 is a devDependency (needs Node ^22.23.4 or ^24.22.1)
npx forge deploy -e development
npx forge install -e development --site <your-site>.atlassian.net --product jira
```

Project layout:

```
manifest.yml                    Forge modules, scopes, Rovo agent, skill, MCP
prompts/agent-prompt.md         Rovo agent instructions
skills/telecom-rca-playbook/    Rovo skill (SKILL.md + scoring reference)
src/index.js                    Action handlers and UI resolver
src/service.js                  Orchestration (load, analyse, link, seed demo)
src/lib/correlate.js            Correlation engine (pure, unit-tested)
src/lib/text.js                 ADF parsing, entity extraction, TF-IDF
src/lib/jira.js                 Jira REST client (asUser)
src/lib/twg.js                  Teamwork Graph client (curated queries, graceful fallback)
src/lib/demo.js                 Demo telecom scenario
src/frontend/panel.jsx          Issue panel (UI Kit)
src/frontend/project.jsx        Project page (UI Kit)
test/                           node:test unit tests + integration test with a fake Jira
```

## License

MIT
