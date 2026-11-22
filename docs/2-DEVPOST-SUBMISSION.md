# Devpost submission: text to paste

Fill in each Devpost field with the matching section below. Replace anything in `<angle brackets>`.

---

## Project name
Outage RCA Investigator

## Elevator pitch / tagline (max ~200 characters)
Telecom outage? A Rovo agent finds the network change that caused it, shows the evidence, sizes customer impact, names the owner and puts the rollback plan in front of the NOC.

## Category
**Apps for Specialized Industries** (telecom network operations)

## Bonus prize
- **Best Agents** (Rovo agent, skill and actions). This is the one bonus prize entered.

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
- **Quality**: 13 unit tests and an end-to-end test against a simulated Jira. The end-to-end test covers:
  - demo seeding: repeat seeding, and search that lags behind
  - analysis
  - Teamwork Graph available and unavailable
  - bad inputs
  - linking, including repeat confirmation
  - the project overview

  `forge lint` passes. The app has been tested live on a Jira Cloud site with Rovo: the issue panel, project page, Teamwork Graph owner lookup, link and comment, and the Rovo agent with its RCA report all work.

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
- Source code: https://github.com/pratapdalai/outage-rca-investigator
- Demo video: https://youtu.be/QJj-IWuww-I

---

## Installation link field
https://developer.atlassian.com/console/install/33a538da-1b01-4f7c-aa1f-fe44e71ff234?signature=AYABePQKa4bKHZZ94v7lMb%2BTAnsAAAADAAdhd3Mta21zAEthcm46YXdzOmttczp1cy13ZXN0LTI6NzA5NTg3ODM1MjQzOmtleS83MDVlZDY3MC1mNTdjLTQxYjUtOWY5Yi1lM2YyZGNjMTQ2ZTcAuAECAQB4CxqLTo9l4lqXuFjNim1xJM%2Bp%2F3TVP9xHS2BrU5DRRucBoXVxyOARQGrnInd19v%2F8yAAAAH4wfAYJKoZIhvcNAQcGoG8wbQIBADBoBgkqhkiG9w0BBwEwHgYJYIZIAWUDBAEuMBEEDHhbCe311oEnB54erQIBEIA7ssp3%2FwSvcHvfA%2Bb3qJv%2F4lWADyvkoBPiqAIgtsErsHcYwPwoETeAfuT1jDYi%2F5kHm9Ci0M3u9C8vYWMAB2F3cy1rbXMAS2Fybjphd3M6a21zOmV1LXdlc3QtMTo3MDk1ODc4MzUyNDM6a2V5LzQ2MzBjZTZiLTAwYzMtNGRlMi04NzdiLTYyN2UyMDYwZTVjYwC4AQICAHi9bVMAkme4qVQX1fQHo6ePw3H40A7cGfz7yrmSfBWMXgGzyrpVGDa3Zrwb43u02gInAAAAfjB8BgkqhkiG9w0BBwagbzBtAgEAMGgGCSqGSIb3DQEHATAeBglghkgBZQMEAS4wEQQMgwIPiQ1PgM91ZtoJAgEQgDt6Jg1acH4tGXsTm%2BobZZVNXDvRv3tKBnYJzcOGkQDMrfaJOPp4%2BeoeV39nwGMsWKpcYxMZdq%2BUETXZWAAHYXdzLWttcwBLYXJuOmF3czprbXM6dXMtZWFzdC0xOjcwOTU4NzgzNTI0MzprZXkvNmMxMjBiYTAtNGNkNS00OTg1LWI4MmUtNDBhMDQ5NTJjYzU3ALgBAgIAeDYASx0XCjkny4iLV6vz%2BKtEGSGT6kdt0QRpkn6D%2FlVEARId5SdDiIQvZYMMVJT1MB8AAAB%2BMHwGCSqGSIb3DQEHBqBvMG0CAQAwaAYJKoZIhvcNAQcBMB4GCWCGSAFlAwQBLjARBAwHHtzN44PiF8yo0boCARCAO5Lkk1EoHKc1cgmtZfjQ7IENVN8p0pgTutYwBKKVsX7384GN0evvjI3CP%2FyQXWHrFI26AueDrwWE7hvtAgAAAAAMAAAQAAAAAAAAAAAAAAAAAEkANotYFWnbjAKpMZRD3dH%2F%2F%2F%2F%2FAAAAAQAAAAAAAAAAAAAAAQAAADJ%2FD9IKXl11SLfxM4Acse126BUggh3U23ZUjGyWGzlxk5MaeszGb4Rm2bnoGu9RYLb3Jk5pwtwkMYrW%2BviyFIctT1U%3D&product=jira

(Generated 21 Nov 2026 for the production environment, Jira only. If the app is re-shared, regenerate it in Developer Console → Distribution.)

## Testing instructions for judges (paste into the instructions field)

About 5 minutes. You need to be a site admin to install.

1. **Install:** open the installation link above, choose your site, pick **Jira**, and approve the permissions.
2. **Create a space** (Jira calls projects "spaces"): **Spaces → Create space → Software development → Kanban → Use template → Team-managed**. Use name `NOC Operations` and key `NOC`. Any existing team-managed space also works.
3. **Open the app page:** in the space, click the **`+`** at the end of the tabs (Summary, Board, …). Under **Apps**, choose **Outage RCA**, then **Add to navigation**. An **Outage RCA** tab appears.
4. Click **Create demo telecom scenario**. It creates 6 change records (label `network-change`) and 6 outage tickets (label `outage`), with times relative to now, and assigns the changes to you. If a demo already exists on the site, the app points to it instead of creating duplicates. The table and chart show each outage's most likely cause.
5. **Open the main outage** named in the message, "FTTH broadband down for customers in Patia". Under the ticket title, click the **Outage RCA hexagon icon**, then **Outage root cause**. The panel is added to the ticket, usually further down, below *Linked work items*, so scroll down to it. Expected result: **probable root cause, firmware upgrade on OLT-BBSR-07, 74/100, high confidence**, ahead of a more recent emergency DNS patch (44, low).
6. Click **Who owns this change?** It shows the implementer's teams from Teamwork Graph, if your account belongs to any Atlassian Teams. Then click **Confirm as root cause → Link and comment** and check the new link and comment on the ticket. Confirming again changes nothing.
7. Try the lookback selector (24h / 72h / 7d), and open other outages. For example, the Cuttack DNS outage is attributed to the DNS patch, and the single-customer router ticket gets no confident suspect.
8. **Rovo agent** (sites with Rovo): on the main outage, click **Ask Rovo**, switch the agent from **Rovo ⌄** to **Outage RCA Investigator**, and try the conversation starters: "Which change caused this outage?", "How many customers did this change affect?", "Who owns the suspect change and how do we roll it back?", "Draft the RCA report for this outage".

To use the app on your own data: label outage tickets `outage` (or use the Incident type) and change records `network-change` (or the Change type). Put `Implemented: <ISO time>` in change descriptions and `Detected: <ISO time>` in outage descriptions for exact timing; otherwise Jira dates are used. Optional lines such as `Network element: OLT-01`, `Site: EXCH-2` and `Customers affected: 120` improve matching and impact numbers.

## Explanation of how it meets the main technology requirement (paste)
The app is built entirely on Atlassian Forge (`manifest.yml` with Forge modules, Node.js 22 runtime, UI Kit). It integrates with Jira / Jira Service Management (issue panel, project page, JQL search, issue links and comments through the Jira REST API), Rovo (`rovo:agent`, five `action` modules, a `rovo:skill`), Atlassian MCP (`rovo:mcp` exposing four tools) and the Teamwork Graph API (curated queries `atlassianUserInTeams` and `jiraWorkItemComments` through `requestTeamworkGraph`, with per-object `read:graph:*` scopes).

## Bonus prize write-up: Best Agents

The **Outage RCA Investigator** agent (`rovo:agent`) does the hard part with facts, not guesses.

- **Five actions.** Four GET actions find the root cause, size the blast radius, find the owner and rollback plan, and build the timeline. One UPDATE action links the confirmed cause. Asked "which change caused this outage?", the agent calls the ranking action with the ticket it is opened on and explains the evidence. Asked for an RCA report, it combines the timeline, blast radius, owner and rollback tools into a structured report, using only facts the tools returned.
- **A reusable skill.** `telecom-rca-playbook` (`rovo:skill`) packages the whole RCA method: when to call each tool, how to read the scores, edge cases and safety rules. Any other agent can adopt the same method with the same tools, and the same four tools are also exposed through `rovo:mcp`.
- **Guardrails.** The agent never calls a LOW-confidence suspect the cause and never recommends an unconfirmed rollback. The only write action runs after the engineer explicitly confirms, and it is idempotent, so confirming twice changes nothing. Every call runs as the user, so the agent only sees what the engineer can see.
- **Teamwork Graph.** The agent names the owning teams of the change implementer, read from Teamwork Graph.
