# Demo video script (target 4:15, hard limit 5:00)

Everything shown here was tested live on 21 Nov 2026 with the **production** install. Show only what is in this script, because judges must be able to reproduce it.

## A. Prepare (about 15 minutes, once)

1. **Start with fresh demo data**, so the video can show the one-click setup and a first-time confirmation.
   - In Jira, open search, switch to **JQL**, and run: `labels = rca-demo`
   - Select all results, choose **Bulk change → Delete**, and confirm. This removes the 12 old demo tickets.
   - Open the **Outage RCA** tab in the NOC space. It should say "No outage tickets in this project yet".
2. **Create the demo data just before recording**, because the times are relative to "now". Do this in step 2 of the recording itself.
3. **Clean browser:**
   - Close every tab except Jira, so personal tab titles don't appear on screen.
   - Hide the bookmarks bar (Ctrl+Shift+B).
   - Set zoom to 110% (Ctrl and +).
4. **Quiet laptop:** turn on Windows **Do not disturb** and close chat apps.
5. **Microphone:** use a headset or earphones with a mic if you have one. Record in a quiet room.
6. **Practise once** without recording.

## B. Record (Windows 11, free tools)

- **Option 1: Clipchamp** (built into Windows 11). Open Clipchamp, choose **Record → Screen** (enable the microphone), and pick the browser window. You can trim and add captions in the same app.
- **Option 2: Snipping Tool.** Press **Win+Shift+R**, select the browser area, and switch on the microphone before starting.
- No background music: the contest rules allow only music you have rights to, and voice only is safest.
- Upload to YouTube as **Public**, then paste the link into Devpost.

Tips: speak slowly and calmly. If Rovo takes a while to answer, keep talking or cut the wait out later in Clipchamp.

## C. Script

| Time | What you do on screen | What you say |
|---|---|---|
| **0:00–0:25** | Show the **NOC Operations** space in Jira. | "When broadband goes down for a thousand homes, every network operations centre asks the same question: *what changed?* Engineers dig through change records by hand while customers wait. And blaming the most recent change is often wrong. I'm Pratap, I've built telecom IT systems for fifteen years, and this is **Outage RCA Investigator**, a Forge app for Jira with a Rovo agent." |
| **0:25–0:50** | Click the **Outage RCA** tab. Click **Create demo telecom scenario** and wait for the green message. | "To show it, one click creates a realistic fibre-broadband scenario: six network changes and six outage tickets, written the way NOC engineers really write them." |
| **0:50–1:10** | Scroll the project page: the four numbers, the bar chart and the table. | "The project page already correlates every outage with its most likely cause, and shows which change hurt the most customers. One firmware change explains four outages and more than two thousand customers." |
| **1:10–2:05** | Click **NOC-…**, "FTTH broadband down for customers in Patia". Click the **hexagon icon** under the title, then **Outage root cause**. Scroll down to the panel and point at the verdict, the score, the evidence lines and the #2 card. | "Here's the main outage: twelve hundred and forty customers in Patia with no internet. The most recent change before it was an *emergency DNS patch*, so a naive rule would blame that. The app ranks the **OLT firmware upgrade** first: 74 out of 100, high confidence. Every point has a reason. It touched the same OLT and exchange, the same firmware version appears in the ticket, and three more outages hit that OLT after the upgrade. The emergency DNS patch scores only 44, because it shares nothing with this outage. Changes made after the outage started are ruled out." |
| **2:05–2:30** | Click **Who owns this change?** Point at the escalation box and the rollback plan. | "Who do I call? The app asks Teamwork Graph for the implementer's teams. And the rollback plan comes straight from the change record." |
| **2:30–2:50** | Click **Confirm as root cause**, then **Link and comment**. Scroll up to the green message, then down to **Linked work items** and the new comment. | "Nothing is written until an engineer confirms. Then it links the change to the outage and posts the evidence as a comment, so the RCA trail is recorded." |
| **2:50–3:50** | Click **Ask Rovo**. Switch **Rovo ⌄** to **Outage RCA Investigator**. Click the starter **Which change caused this outage?** and wait. Then type **Draft the RCA report for this outage** and scroll through the report. | "The same engine powers a Rovo agent. I ask: which change caused this outage? The agent calls the app's tools and answers with the evidence, not a guess. Now: draft the RCA report. It builds the timeline, the root cause, the customer impact, the rollback steps and the owners, using only facts its tools returned." |
| **3:50–4:15** | Back on the panel, or the project page. | "Under the hood: a Forge app with a Rovo agent, a reusable Rovo skill, five actions, and Teamwork Graph. The scoring is deterministic and explainable, with no paid AI calls, and every call runs as the user, so people only see what they're allowed to see. Outage RCA Investigator turns hours of hunting into seconds. Thank you." |

## D. After recording

- Trim mistakes and long waits in Clipchamp. Keep the video **under 5:00**.
- Add captions, for example with YouTube's automatic captions; check and fix the telecom terms.
- Upload to YouTube as **Public**. Title: `Outage RCA Investigator – Codegeist 2026 (Forge, Rovo agent, Jira)`.
