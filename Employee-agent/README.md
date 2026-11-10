# AskNova

**An AI teammate in Slack that answers employees' company-policy questions from the official handbook, in seconds, without making things up.**

DM the bot or mention `@AskNova` in a channel ("How many days of annual leave do I get?"), and it replies with a short, direct answer grounded in your approved policy PDF. If the handbook doesn't cover the question, it says so and points you to HR instead of guessing.

## Why I built it

Employees ask the same HR questions over and over: leave, benefits, onboarding, internal tools. The answers are in a long PDF handbook that few people read, so the questions land in HR's inbox or go unanswered.

AskNova puts the handbook where people already work, in Slack, and answers only from approved content. The design goals were:

- **Trustworthy:** policy answers come only from the approved PDF. No answering from general knowledge, no invented numbers.
- **Low friction:** plain one- or two-sentence answers, with no tool output, JSON or citation noise in the chat.
- **Minimal infrastructure:** no custom RAG pipeline, vector database or Slack event handler. Managed building blocks do the heavy lifting.

## How it works

```
Slack (DM or @mention)
        │  signed webhook
        ▼
Mastra agent "AskNova"  ──►  Lookio MCP: ask_assistant   (policy PDF, grounded answers)
   │  memory (LibSQL)   ──►  get_current_date            (local tool, company time zone)
   │                    ──►  Product docs MCP (optional)  (public product/API docs)
   ▼
Reply in the DM, or in the channel thread
```

- **[Mastra](https://mastra.ai)** runs the agent, conversation memory and the Slack channel integration (`@chat-adapter/slack`).
- **[Lookio](https://lookio.app)** stores and indexes the policy PDF. A Lookio assistant limited to that PDF answers questions over Lookio's hosted MCP server.
- **The model** (DeepSeek by default, configurable) decides which tool to use and writes the final reply.

### Behaviour worth knowing

- **Answer-only tool output.** The Lookio tool is wrapped so the model receives only the answer text: citations and `[1]`-style markers are stripped before the model sees them. Replies therefore never include sources. This was a deliberate product decision for a cleaner chat.
- **Silent tools in Slack.** `toolDisplay: 'hidden'` stops tool cards and raw JSON from being posted. The user sees a "checking the policy…" typing status, then the answer.
- **Honest fallback.** If Lookio can't support an answer, is unavailable, or is out of credits, the bot replies: *"I couldn't verify that in the approved policy. Please consider asking the HR Team."*
- **Date awareness.** A `get_current_date` tool returns today's date and time in the company time zone, so "how many days until…" questions are calculated, not guessed.
- **Small talk.** Greetings, jokes and fun facts are answered directly, without touching the policy tools.
- **Threads and memory.** Channel answers go in a thread. Follow-ups in the same thread or DM keep context; the last 20 messages are remembered.

## Project structure

```
src/mastra/
  index.ts             Mastra server, storage, local test-chat routes
  agents/asknova.ts    The agent: tools, Lookio wrapper, Slack adapter settings
  prompts/constant.ts  System prompt (tone, tool selection, source rules, privacy)
  tools/date.ts        get_current_date tool
  test-ui.ts           Local browser test chat (localhost only)
docs/PRD.md            Product requirements and acceptance criteria
```

## Getting started

### Prerequisites

- Node.js **22.18+**
- A [Lookio](https://lookio.app) account with your policy PDF uploaded
- An API key for the model provider (DeepSeek by default)
- A Slack workspace where you can create apps
- [ngrok](https://ngrok.com) (or another tunnel) for local Slack testing

### 1. Install

```bash
git clone <your-repo-url> asknova
cd asknova
npm install
cp .env.example .env
```

### 2. Configure environment

Fill in `.env`. Never commit it; it's already in `.gitignore`.

| Variable | Required | Description |
| --- | --- | --- |
| `DEEPSEEK_API_KEY` | Yes* | Model provider key. *Use the matching key if you change `ASKNOVA_MODEL`. |
| `ASKNOVA_MODEL` | No | Mastra model string. Default `deepseek/deepseek-flash`. |
| `ASKNOVA_COMPANY_NAME` | No | Company name used in the prompt. Default "your organization". |
| `ASKNOVA_TIMEZONE` | No | IANA time zone for `get_current_date`, e.g. `Africa/Lagos`. Default `UTC`. |
| `LOOKIO_API_KEY` | Yes | Lookio API key with the **Ask questions** preset. |
| `LOOKIO_ASSISTANT_ID` | Yes | ID of the Lookio assistant limited to your policy PDF. |
| `LOOKIO_MCP_SERVER` | No | Default `https://mcp.lookio.app/mcp`. |
| `ASKNOVA_DB_URL` | No | LibSQL URL for memory. Default `file:./asknova.db`. Use a persistent private location in production. |
| `PRODUCT_DOCS_MCP_URL` | No | Optional MCP server for public product/API docs. |
| `PRODUCT_DOCS_MCP_AUTH_TOKEN` | No | Bearer token for that server, if needed. |
| `SLACK_BOT_TOKEN` | For Slack | Bot User OAuth Token (`xoxb-…`). |
| `SLACK_SIGNING_SECRET` | For Slack | From **Basic Information → App Credentials**. |

The Slack adapter only activates when both Slack variables are set. Lookio connects when `LOOKIO_API_KEY` is set.

### 3. Set up Lookio

1. Upload your policy PDF and wait until its status is **ready**.
2. Create an assistant whose knowledge is limited to that PDF, and put its ID in `LOOKIO_ASSISTANT_ID`.
3. Create an API key with the **Ask questions** preset (`account:read`, `assistants:read`, `query`), limited to that assistant if possible, and put it in `LOOKIO_API_KEY`.

Lookio's free credits are limited; keep an eye on usage.

### 4. Run locally

```bash
npm run dev
```

- Local test chat: <http://localhost:4111/test> (localhost only, with persistent memory and a **New conversation** button)
- Mastra Studio: <http://localhost:4111>

Try a supported question, an unsupported one, and "What's today's date?" before connecting Slack.

> After editing `.env`, fully restart with `Ctrl+C` and `npm run dev`. The file watcher reloads code changes, but it does **not** reload environment variables.

### 5. Expose the server (local testing)

Slack can't reach `localhost`, so open a tunnel. This ngrok traffic policy only forwards the Slack webhook path, keeping Studio and the agent API private:

```bash
mkdir -p ~/.asknova-ngrok
cat > ~/.asknova-ngrok/policy.yml <<'EOF'
on_http_request:
  - expressions:
      - "req.url.path != '/api/agents/asknova/channels/slack/webhook'"
    actions:
      - type: custom-response
        config:
          status_code: 404
          body: Not found
EOF

ngrok http 4111 --url https://<your-static-domain>.ngrok-free.dev --traffic-policy-file ~/.asknova-ngrok/policy.yml
```

A free ngrok account includes one static domain, so the URL stays the same between restarts.

### 6. Create the Slack app

1. Go to [api.slack.com/apps](https://api.slack.com/apps) → **Create New App** → **From a manifest**, pick your workspace, and paste the manifest below, replacing `<public-host>`.
2. **Install App → Install to Workspace.**
3. Copy the **Signing Secret** (Basic Information) and **Bot User OAuth Token** (OAuth & Permissions) into `.env`, then fully restart `npm run dev`.
4. In **Event Subscriptions**, click **Retry** until the Request URL shows **Verified**, then **Save Changes**. Save the same URL under **Interactivity & Shortcuts**.

```json
{
  "display_information": { "name": "AskNova" },
  "features": {
    "app_home": { "home_tab_enabled": false, "messages_tab_enabled": true, "messages_tab_read_only_enabled": false },
    "bot_user": { "display_name": "AskNova", "always_online": true }
  },
  "oauth_config": {
    "scopes": { "bot": ["app_mentions:read", "channels:history", "channels:read", "chat:write", "users:read", "im:read", "im:history", "im:write"] }
  },
  "settings": {
    "event_subscriptions": {
      "request_url": "https://<public-host>/api/agents/asknova/channels/slack/webhook",
      "bot_events": ["app_mention", "message.im"]
    },
    "interactivity": { "is_enabled": true, "request_url": "https://<public-host>/api/agents/asknova/channels/slack/webhook" },
    "org_deploy_enabled": false, "socket_mode_enabled": false, "token_rotation_enabled": false
  }
}
```

The manifest subscribes only to `app_mention` and `message.im`, so the bot never reads ordinary channel messages. These scopes cover **public** channels. For private channels, add `groups:read` and `groups:history` and reinstall.

### 7. Chat with it

- **DM:** in Slack's sidebar under **Apps**, open **AskNova** → **Messages** tab, and ask a question. No @mention needed. If messaging is disabled, enable **App Home → Allow users to send Slash commands and messages from the messages tab**.
- **Channel:** create a public channel (e.g. `#asknova-pilot`), run `/invite @AskNova`, then ask `@AskNova What is the leave policy?`. The answer arrives in a thread.

## Troubleshooting

| Symptom | Cause and fix |
| --- | --- |
| Slack: *"Your URL didn't respond with the value of the challenge parameter"* | The tunnel or server isn't running, or the signing secret is wrong. Check both are up and that the local webhook returns `401` to an unsigned `POST`. |
| Log: `Invalid signature` (401) for Slack's requests | `SLACK_SIGNING_SECRET` doesn't belong to this app. The **Client Secret** sits right next to it and is easy to copy by mistake. Fix it, then **fully** restart `npm run dev`. |
| Log: `Slack timestamp is too old` | Your computer's clock is more than 5 minutes off. Turn on **Set time and date automatically** (macOS), or run `sudo sntp -sS time.apple.com`. |
| Webhook returns 404 locally | The Slack adapter isn't active. Both `SLACK_BOT_TOKEN` and `SLACK_SIGNING_SECRET` must be set before startup. |
| ngrok `502` | The tunnel is up but the server isn't, often during a hot reload after saving a file. Slack retries; otherwise resend. Avoid saving files while testing. |
| Bot posts tool cards or JSON | Check that `toolDisplay: 'hidden'` is set on the Slack adapter in `agents/asknova.ts`. |
| Bot still adds sources | Old replies in memory can be imitated. Start a fresh thread or DM topic. |

## Security notes

- Secrets live only in `.env` or your deployment's secret manager. `.env`, local databases, and build output are git-ignored.
- Slack requests are verified with the signing secret. The webhook is the only route that should be public.
- The Slack adapter has **no user allowlist**: anyone in the workspace can DM the bot, and anyone in a channel it's invited to can mention it. Control access through channel membership, and don't add it to shared (Slack Connect) channels unless the handbook is safe for external members.
- Conversation memory is stored in the LibSQL database. Treat it as sensitive.

## Production

- Deploy the Mastra server to a permanent host (Mastra Cloud, Railway, Fly.io, a VM, etc.) and update both Slack request URLs to the production webhook.
- Point `ASKNOVA_DB_URL` at persistent storage (e.g. Turso/LibSQL). A local file won't survive serverless or ephemeral hosts.
- For serverless hosts, see Mastra's channel docs on `waitUntil` and pub/sub so background replies complete.
- Track Lookio credit usage, and assign an owner to re-upload the PDF when the policy changes.

## Tech stack

TypeScript · [Mastra](https://mastra.ai) (agents, memory, channels) · [Chat SDK Slack adapter](https://chat-sdk.dev) · [Lookio](https://lookio.app) (MCP) · LibSQL · DeepSeek · Zod

See [docs/PRD.md](docs/PRD.md) for the full requirements and acceptance criteria.
