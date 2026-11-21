# Devpost submission: text to paste

Fill in each Devpost field with the matching section below. Replace anything in `<angle brackets>`.

---

## Project name
Outage RCA Investigator

## Elevator pitch / tagline (max ~200 characters)
Telecom outage? A Rovo agent finds the network change that caused it, shows the evidence, sizes customer impact, names the owner and puts the rollback plan in front of the NOC.

## Category
**Apps for Specialized Industries** (telecom network operations)

## Bonus prizes
- Best Agents (Rovo / assignable agents)
- Best app with Atlassian MCP
- Best apps with Teamwork Graph integration

---

## About the project (the "Story" field, Markdown)

### Inspiration
I've worked in telecom IT for 15 years, building incident, problem and change management for operators. In every major outage the Network Operations Centre asks the same question: **what changed?** Engineers open change records one by one, compare timestamps by hand, guess which firmware push or config change touched the failing equipment, and then hunt for the owner and the rollback plan, while thousands of customers have no internet.

The shortcut everyone reaches for, "blame the last change", is often wrong. A busy network has many changes a day. I wanted Jira to answer the question the way an experienced NOC engineer would, with evidence.

### What it does
Open any outage ticket in Jira or Jira Service Management. The **Outage root cause** panel and the **Outage RCA Investigator** Rovo agent:

- **Rank every recent change** by how likely it caused this outage (0–100, with HIGH / MEDIUM / LOW confidence and a verdict).
- **Show the evidence** for each score: how long before the outage the change was implemented, the network elements, firmware versions and sites both tickets share, other outages on the same equipment since the change, similar wording and the change's risk signals.
- **Rule out** changes that happened after the outage started or outside the window, and say why.
- **Size the blast radius**: every outage on the same equipment since the change and the total customers affected.
- **Name who to call**: the implementer's teams from **Teamwork Graph**, plus recent discussion on the change.
- **Show the rollback plan** from the change record.
- **Record the root cause** after a human confirms: link the change to the outage and post the evidence as a comment.
- **Draft the RCA report** through the agent (summary, timeline, root cause, impact, recovery, owner, follow-ups), using only facts the tools returned.

A project page shows every recent outage with its most likely cause, and a chart of which changes caused the most customer impact.

**The demo story:** a fibre-broadband operator has six changes and six outages. The most recent change before the main outage is an *emergency DNS patch*, so "blame the last change" picks it. Outage RCA Investigator ranks the **OLT firmware upgrade** first (74/100, HIGH). It touches the same OLT, the same firmware version appears in the tickets, and three more outages hit that OLT after the upgrade. The DNS patch is tied to the separate DNS outage. A single customer's faulty router gets no confident suspect at all.

### How I built it
- **Forge** app with UI Kit: a `jira:issuePanel` and a `jira:projectPage` (with a DynamicTable and a BarChart).
- **Rovo agent** (`rovo:agent`) with a NOC-engineer prompt and five **actions**: `find-root-cause-changes`, `get-outage-blast-radius`, `get-change-context`, `build-outage-timeline` (GET) and `link-root-cause-change` (UPDATE, only after the user confirms).
- **Rovo skill** (`rovo:skill`): `telecom-rca-playbook`, a reusable playbook with a scoring reference, so any agent can follow the same RCA method with the same tools.
- **MCP** (`rovo:mcp`): the four read tools exposed to Rovo Studio agents and third-party MCP clients. A NOC engineer can ask Claude or another assistant "what caused NOC-7?" and get the same evidence.
- **Teamwork Graph API**: curated queries (`atlassianUserInTeams`, `jiraWorkItemComments`) for owning teams and recent discussion on the suspect change, with operation names, ARIs, per-object scopes and graceful fallback when the graph is unavailable.
- **Correlation engine** in plain JavaScript: entity extraction tuned for telecom (network element IDs, firmware versions, sites), TF-IDF text similarity, exponential time decay, blast-radius clustering, risk patterns and a coincidence guard. It is deterministic, explainable and costs nothing per call. **No Forge LLM is used.**
- **Security**: every Jira and Teamwork Graph call runs `asUser`, so people only see data they already have access to. The write action needs explicit confirmation.
- **Quality**: 11 unit tests plus an end-to-end test against a simulated Jira (seeding, analysis, Teamwork Graph up and down, bad inputs, linking, project overview). The manifest is validated against the Forge schema and `forge lint`.

### Challenges I ran into
- **Teamwork Graph is in Preview.** Raw Cypher is no longer accepted, operation names must follow `[company]_[operation]`, every object type needs its own scope, and failures come back as HTTP 200 with an `errors` array. I built a small client that treats anything without data as a failure and never lets the graph block the main analysis.
- **Making scores trustworthy.** A naive model blames whatever changed last. I added entity overlap and blast-radius clustering so the engine finds the change that touched the failing equipment, plus a coincidence guard so timing alone never gives a confident answer.
- **Working on any Jira site.** Not every site has Change or Incident issue types. The app tries type-based JQL and falls back to labels, and the demo creates data with whatever issue types the project has.

### Accomplishments I'm proud of
- On the demo scenario, the engine picks the real cause over a more recent emergency change, and explains why in words an engineer trusts.
- One engine serves four surfaces: issue panel, project page, Rovo agent and MCP tools.
- A judge can go from install to a full demo in about three minutes with the one-click demo scenario.

### What I learned
Rovo agents are strongest when the tools give them hard, explainable facts. The agent's job is to explain and write, not to guess. I also learned the Teamwork Graph's identity model (ARIs) and scope model in detail.

### What's next
- A Teamwork Graph connector that pushes confirmed outage-to-change links back into the graph as organisational memory.
- Ingesting network monitoring alarms (for example from an NMS) as outage signals.
- Learning factor weights per operator from confirmed RCAs.
- Publishing to the Atlassian Marketplace.

---

## Built with
`forge` `atlassian-forge` `rovo` `rovo-agent` `rovo-skill` `mcp` `teamwork-graph` `jira` `jira-service-management` `ui-kit` `javascript` `node.js` `react`

## "Try it out" links
- Source code: `<https://github.com/you/outage-rca-investigator>`
- Demo video: `<YouTube link>`

---

## Installation link field
`<paste the installation link from developer.atlassian.com → your app → Distribution>`

## Testing instructions for judges (paste into the instructions field)

1. Install the app using the installation link above (Jira; approve the scopes).
2. Open any Jira project (a new team-managed Scrum/Kanban project works). In the project sidebar open **Outage RCA**.
3. Click **Create demo telecom scenario**. It creates 6 change records (label `network-change`) and 6 outage tickets (label `outage`) using the project's existing issue types, with timestamps relative to now. The change records are assigned to you.
4. Open the main outage ticket named in the green message ("FTTH broadband down for customers in Patia"). The **Outage root cause** panel shows the verdict and ranked suspects. If the panel is collapsed, open it from the issue's **Apps** button.
5. Try **Who owns this change?** (owning teams from Teamwork Graph; you'll see teams if your account belongs to an Atlassian Team), then **Confirm as root cause → Link and comment**.
6. Try the lookback window selector (24h / 72h / 7d) and open the second outage tickets to see different results (for example the Cuttack DNS outage is attributed to the DNS patch).
7. **Rovo agent** (sites with Rovo): open Rovo chat → **Outage RCA Investigator** → ask "Which change caused this outage?", "How many customers did that change affect?", "Who owns it and how do we roll it back?", "Draft the RCA report".
8. **MCP** (optional): in Atlassian Administration → Apps → Sites → your site → Connected apps → Outage RCA Investigator, enable MCP exposure, then connect an MCP client to `https://mcp.atlassian.com/forge/<appId>`.

To use the app on your own data: label outage tickets `outage` (or use the Incident type) and change records `network-change` (or the Change type). Put `Implemented: <ISO time>` in change descriptions and `Detected: <ISO time>` in outage descriptions for exact timing; otherwise Jira dates are used. Optional lines such as `Network element: OLT-01`, `Site: EXCH-2` and `Customers affected: 120` improve matching and impact numbers.

## Explanation of how it meets the main technology requirement (paste)
The app is built entirely on Atlassian Forge (`manifest.yml` with Forge modules, Node.js 22 runtime, UI Kit). It integrates with Jira / Jira Service Management (issue panel, project page, JQL search, issue links and comments through the Jira REST API), Rovo (`rovo:agent`, five `action` modules, a `rovo:skill`), Atlassian MCP (`rovo:mcp` exposing four tools) and the Teamwork Graph API (curated queries `atlassianUserInTeams` and `jiraWorkItemComments` through `requestTeamworkGraph`, with per-object `read:graph:*` scopes).

## Bonus prize write-ups

**Best Agents:** The Outage RCA Investigator agent (`rovo:agent`) uses five actions and the `telecom-rca-playbook` skill. Its four GET actions are reusable tools other agents can call; the skill packages the full RCA method (when to call each tool, how to read scores, edge cases, safety rules). The agent explains evidence instead of guessing, refuses to call LOW-confidence suspects the cause, and only links a root cause after explicit user confirmation.

**Best app with Atlassian MCP:** `rovo:mcp` exposes `find-root-cause-changes`, `get-outage-blast-radius`, `get-change-context` and `build-outage-timeline`. A NOC engineer can ask any MCP client (for example Claude) "what caused NOC-7?" and get the same evidence-backed ranking, with that user's own permissions. The skill's SKILL.md also works as an open playbook for third-party agents.

**Best Teamwork Graph integration:** For the suspect change, the app reads the implementer's teams (`atlassianUserInTeams`) and recent discussion on the change (`jiraWorkItemComments`) from Teamwork Graph, so the engineer knows which team to escalate to and whether the change is already being discussed. It handles Preview-specific behaviour: operation naming, ARIs, per-object scopes, errors inside HTTP 200, retries, and graceful fallback to Jira data.
