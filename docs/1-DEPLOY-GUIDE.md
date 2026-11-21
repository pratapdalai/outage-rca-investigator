# Deploy guide: from zip file to working app

Follow these steps in order on your **personal laptop**. Allow about 60–90 minutes the first time. Each step says what it does, the exact command, and what you should see.

Commands work in **Windows PowerShell**, macOS Terminal or Linux. Run them one at a time.

---

## Step 0: Terms you'll meet

| Term | Meaning |
|---|---|
| **Node.js** | The JavaScript runtime. Forge apps and the Forge CLI run on it. |
| **npm** | Node's package installer. Comes with Node.js. |
| **Forge CLI** | Atlassian's command-line tool (`forge ...`) for registering, deploying and installing apps. |
| **API token** | A password-like key that lets the Forge CLI act as your Atlassian account. |
| **Register** | Gives your copy of the app a unique ID in Atlassian's cloud. |
| **Deploy** | Uploads your code to Atlassian's servers. |
| **Install** | Adds the deployed app to a specific Jira site. |
| **Environment** | Separate copies of your app: `development` for testing, `production` for judges. |
| **Demo site** | A free Jira site with Rovo turned on, created for you by `forge site provision`. |

---

## Step 1: Install Node.js 22

1. Go to https://nodejs.org and download the **22.x LTS** installer. Install it with the default options.
2. Open a **new** terminal and check:
   ```
   node -v
   npm -v
   ```
   You should see `v22.x.x` and a version number for npm.

## Step 2: Install the Forge CLI

```
npm install -g @forge/cli@latest
forge --version
```
You should see a version number (15.x or later).

## Step 3: Create an API token and log in

1. Open https://id.atlassian.com/manage/api-tokens and sign in with your **personal** Atlassian account.
2. Click **Create API token**, name it `forge`, and copy the token. Don't share it or paste it anywhere else.
3. In the terminal:
   ```
   forge login
   ```
   Enter your email, then paste the token when asked. You should see `Logged in as ...`.

## Step 4: Unzip the app and install its packages

1. Unzip `outage-rca-investigator.zip` into a folder, for example `C:\codegeist\outage-rca`.
2. In the terminal:
   ```
   cd C:\codegeist\outage-rca
   npm install
   npm test
   ```
   `npm test` runs 11 unit tests and the full simulated-Jira test. You should see `pass 11` and `INTEGRATION: ALL PASSED`. One `JiraError: 404` line in the output is expected: it comes from a test that checks a missing issue is handled.

## Step 5: Register the app (gives it your own ID)

```
forge register
```
Name it **Outage RCA Investigator**. When asked about developer terms, read and accept them. This replaces the placeholder `app.id` in `manifest.yml` with your app's real ID.

## Step 6: Check, then deploy

```
forge lint
forge deploy -e development
```
`forge lint` should report no errors. Deploy takes 1–3 minutes and ends with `Deployed outage-rca-investigator to the development environment`.

If deploy reports an error about a scope or a module, copy the full message and send it to me.

## Step 7: Get a Rovo-enabled test site

The free developer site may not show Rovo chat. A **demo site** includes Rovo:
```
forge site provision
```
Follow the prompts. Note the site URL it gives you (something like `yourname-demo.atlassian.net`).

## Step 8: Install the app on the demo site

```
forge install -e development --demo-site --product jira
```
(If the demo-site flag isn't offered, use `forge install -e development --site <your-site>.atlassian.net --product jira`.)

Approve the scopes when asked. The app reads Jira data and Teamwork Graph data and can write links and comments.

## Step 9: Test it end to end

1. Open your site and create a project: **Projects → Create project → Scrum or Kanban (team-managed)**, key **NOC**.
2. In the project sidebar, open **Outage RCA**. (If you don't see it, look under **Apps** in the project sidebar.)
3. Click **Create demo telecom scenario**. You should see "Demo scenario created" and the overview table fills with 6 outages.
4. Open the main outage ticket the message names. The **Outage root cause** panel should show:
   - Verdict: *"... is the probable root cause (74/100)"*
   - #1: Firmware upgrade OLT-BBSR-07 (HIGH), #2: Emergency DNS patch (LOW)
5. Click **Who owns this change?** The demo assigns the change records to you, so the app looks up your Atlassian Teams in Teamwork Graph. If you belong to no team, create one at **Teams** in the top bar (for example "Access Network Ops") and add yourself.
6. Click **Confirm as root cause → Link and comment**. Check the comment and link on the ticket.
7. Open **Rovo chat** (top bar), choose **Outage RCA Investigator**, open the main outage ticket and ask:
   - "Which change caused this outage?"
   - "How many customers did that change affect?"
   - "Draft the RCA report for this outage"

**Seeing logs** if anything misbehaves:
```
forge logs -e development
```

## Step 10: Deploy to production and create the judges' installation link

Judges install from an **installation link**, which uses the **production** environment.
```
forge deploy -e production
```
Then:
1. Open https://developer.atlassian.com/console/myapps/ and select **Outage RCA Investigator**.
2. Go to **Distribution** and click **Edit**. Choose **Sharing**, fill in the short form (app name, vendor = your name, privacy note: "The app stores no personal data; it reads Jira issues and Teamwork Graph data as the current user").
3. Save. Copy the **Installation link**.
4. Test the link yourself on a second site, or on the demo site after uninstalling the development copy.

## Step 11: Turn on MCP exposure (for the MCP bonus prize demo)

1. On your site go to **admin.atlassian.com → Apps → Sites → your site → Connected apps → Outage RCA Investigator**.
2. Enable external MCP exposure and turn on the four tools.
3. In an MCP client such as Claude Desktop, add a remote MCP server with this URL:
   `https://mcp.atlassian.com/forge/<appId>`
   `<appId>` is the UUID part of `app.id` in your `manifest.yml` (the text after `app/`).
4. Approve the consent screen. Then ask the client: *"Use Outage RCA Tools to find the root cause of NOC-7."*

Record this for 20–30 seconds of the demo video. If MCP exposure isn't available on your site, show the tools in **Rovo Studio** instead (create a custom agent and add the Outage RCA tools).

## Step 12: Upload code to GitHub (optional but recommended)

Judges like seeing the source code. Create a **public** repository on your personal GitHub, then:
```
git init
git add .
git commit -m "Outage RCA Investigator - Codegeist 2026"
git branch -M main
git remote add origin https://github.com/<you>/outage-rca-investigator.git
git push -u origin main
```
`.gitignore` already excludes `node_modules`.

---

## If something goes wrong

| Symptom | Fix |
|---|---|
| `forge deploy` says the app ID is invalid | Run `forge register` again (Step 5). |
| Panel says "Something went wrong" | Run `forge logs -e development` and send me the last 30 lines. |
| No Rovo chat / agent missing | Use the demo site from Step 7. After scope changes run `forge install -e development --demo-site --upgrade`. |
| Owner teams always empty | Normal if the change has no assignee or the user is in no Atlassian Team. Assign the change; create a Team at **Teams** in the top bar. |
| Overview table empty after demo data | Click **Refresh**. Jira search can take a few seconds to index new issues. |
