# Demo video script (target 4:30, hard limit 5:00)

**Setup before recording**
- Demo site with the app installed, project **NOC**, demo scenario created **just before recording** (timestamps are relative to "now").
- Assign the firmware change to yourself and make sure you're in an Atlassian Team (for the owner lookup).
- Browser zoom 110–125%, close other tabs, turn notifications off.
- Record with OBS Studio (free) or the Windows Snipping Tool screen recorder. 1080p.
- **No background music** unless it's royalty-free with permission (contest rule). Voice only is fine.
- Upload to YouTube as **Public** (not Unlisted) and paste the link into Devpost.

---

| Time | Screen | What you say |
|---|---|---|
| **0:00–0:30** | Title slide or the Jira outage ticket | "When broadband goes down for a thousand homes, every Network Operations Centre asks: *what changed?* Engineers dig through change records by hand while customers wait. And 'blame the last change' is often wrong. I'm Pratap, I've built telecom IT systems for 15 years, and this is Outage RCA Investigator." |
| **0:30–0:50** | Project page **Outage RCA** (empty), click **Create demo telecom scenario** | "To try it, one click creates a realistic fibre-broadband scenario: six network changes and six outage tickets." |
| **0:50–1:10** | Overview table and bar chart | "The project page already shows every outage with its most likely cause, and which change hit the most customers." |
| **1:10–2:10** | Open the main outage ticket, show the **Outage root cause** panel | "Here's the main outage: 1,240 FTTH customers in Patia with no internet. The most recent change before it was an *emergency DNS patch*. A naive rule would blame that. The app ranks the **OLT firmware upgrade** first: 74 out of 100, high confidence. Here's why: it touched the same OLT, the same firmware version shows up in the ticket, and three more outages hit that OLT after the upgrade, 2,350 customers in total. The DNS patch scores low because it shares nothing with this outage. Every point of the score has a reason, and changes made after the outage started are ruled out." |
| **2:10–2:35** | Click **Who owns this change?** | "Who do I call? The app asks Teamwork Graph for the implementer's team and recent discussion on the change. And the rollback plan is right here, from the change record." |
| **2:35–2:55** | Click **Confirm as root cause → Link and comment**, show the comment | "When the engineer confirms, it links the change to the outage and posts the evidence as a comment, so the RCA trail is recorded." |
| **2:55–3:50** | Rovo chat → **Outage RCA Investigator** | Ask: "Which change caused this outage?" → "How many customers did that change affect?" → "Draft the RCA report". Say: "The same engine powers a Rovo agent. It explains the evidence, sizes the impact and drafts a full RCA report with timeline, root cause, recovery and follow-ups, using only facts its tools returned." |
| **3:50–4:15** | MCP client (e.g. Claude Desktop) calling **Outage RCA Tools**, or Rovo Studio showing the tools | "The four read tools are also exposed through Atlassian MCP, so any AI assistant can ask what caused an outage, with the user's own permissions. A reusable Rovo skill packages the whole RCA playbook for other agents." |
| **4:15–4:30** | README architecture or the panel again | "Forge, Rovo agent and skill, MCP and Teamwork Graph. Deterministic and explainable, no paid LLM calls, and every call runs as the user. Outage RCA Investigator turns hours of hunting into seconds. Thank you." |

**Tips**
- Practise twice before recording. Speak slowly; judges watch on mute too, so add on-screen captions (YouTube auto-captions plus a quick check is fine).
- If Rovo is slow, cut the waiting time in editing.
- The first 30 seconds matter most: lead with the problem and the result.
