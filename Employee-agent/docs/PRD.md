# AskNova: company policy answers in Slack

## Goal

Employees ask `@AskNova` questions about company policy in Slack DMs or approved channels and get a short, accurate answer in seconds. A Mastra agent handles Slack. Lookio stores the approved policy PDF and supplies grounded answers through its hosted MCP server. An optional MCP server for public product documentation covers product and API questions.

## Scope and standards

- Use Lookio for PDF ingestion, retrieval, and grounded policy answers. Configure one minimal Lookio assistant whose knowledge is limited to the approved PDF. Mastra remains the employee-facing agent.
- Use Mastra Channels' Slack adapter for DMs and channel mentions. Do not build a separate Slack event handler, PDF parser, embeddings, vector database, RAG pipeline, or MCP wrapper service.
- Start with one PDF and one Slack workspace. Keep secrets in deployment configuration, never in code or chat.
- Never invent policy facts. If the source does not support an answer, say so.

## User journey

1. An employee mentions `@AskNova What is the leave policy?` in an approved channel, or sends the bot a DM.
2. Mastra receives the Slack message and picks the right tool: Lookio's `ask_assistant` for policy, the product docs tools for product/API questions, `get_current_date` for anything date-related, or no tool for small talk.
3. Mastra replies with a concise answer, in the channel thread or the DM. If there is no reliable source, it says it cannot verify the answer and points the employee to HR.

## Answer format (decided during the pilot)

- Answers are plain and direct: one or two sentences by default, with essential conditions kept.
- No citations, document titles, page numbers, or `[n]` markers in replies. Lookio's citations are removed before the model sees the tool result, so the model cannot add them.
- Tool calls run silently in Slack: no tool cards or raw JSON, only a "checking the policy…" typing status.
- Fallback for unsupported questions, Lookio outages, or exhausted credits: "I couldn't verify that in the approved policy. Please consider asking the HR Team."

## Implementation steps

### 1. Baseline

- Record installed `@mastra/core` and `@mastra/mcp` versions and use version-matched docs (`node_modules/@mastra/core/dist/docs`).
- Obtain the approved PDF, its title, version, owner, and permitted audience. Confirm which content may be repeated in shared channels.

### 2. Prepare Lookio

- Upload the PDF and confirm its resource status is `ready` and its indexed text includes the key passages.
- Create a minimal assistant limited to this PDF. Test a straightforward question, an exception, and one the PDF cannot answer.
- Record the assistant ID and credit balance. Free credits are limited; do not assume a recurring allowance.

### 3. Connect Lookio to Mastra

- MCP URL: `https://mcp.lookio.app/mcp`. Create an API key with the **Ask questions** preset (`account:read`, `assistants:read`, `query`), limited to the policy assistant if possible. Send it as `Authorization: Bearer <key>`.
- Discover the tools and expose only `ask_assistant` to the agent.
- Make one real `ask_assistant` call with a known question, then test through the agent.

### 4. Verify answer quality

- Test an entitlement, an exception, an exact number or duration, an unsupported question, a date question, and (if configured) a product docs question.
- Compare policy answers to the PDF. Verify the fallback when Lookio is unavailable or out of credits.

### 5. Slack DMs and channel mentions

- Mastra Channels requires `@mastra/core@1.22.0` or later. Add the Slack adapter to the agent's `channels.adapters`.
- Create a Slack app named `AskNova` from a manifest with the Messages tab, `message.im`, `app_mention`, and the documented bot scopes. Install it.
- Store `SLACK_SIGNING_SECRET` and `SLACK_BOT_TOKEN` as secrets. Set Event Subscriptions and Interactivity URLs to `https://<host>/api/agents/asknova/channels/slack/webhook`.
- Invite the bot to an approved pilot channel. Test one DM and one mention; the mention must be answered in a thread.

### 6. Pilot and maintain

- Restrict channel membership to the policy's audience. The Slack adapter has no built-in user allowlist; anyone in the workspace can DM the bot.
- Assign a policy owner. For updates, replace the Lookio resource, wait for `ready`, verify the assistant reads the new version, and rerun the checks.
- Track Lookio credit usage before wider rollout. Move from a tunnel to a permanent host for production.

## Acceptance criteria

- One direct answer per Slack DM or channel mention, with channel answers in the thread.
- Answers are consistent across DM and channel.
- Unsupported questions and Lookio failures produce the honest fallback.
- The PDF resource is `ready`, the Lookio assistant reads it, and Mastra calls `ask_assistant` over authenticated MCP.
- No credentials in committed code or logs. An updated PDF can be reindexed and retested.

## Product boundaries

- `get_resource_content` can read indexed PDF text but returns it in windows. The first release uses `ask_assistant` for relevant answers rather than sending the whole PDF each turn.
- Lookio's MCP URL is shared; credentials determine workspace access. File uploads use Lookio's app, API, or CLI.
- Lookio has no native Slack bot, so Mastra is the Slack-facing runtime.

## References

- [Lookio MCP overview](https://lookio.app/docs/developers/mcp/overview), [MCP tools](https://lookio.app/docs/mcp/standard-tools), [API keys](https://lookio.app/docs/platform/api-keys), [resources](https://lookio.app/docs/platform/resources)
- [Mastra MCP client](https://mastra.ai/docs/connections/mcp), [Mastra Slack channel](https://mastra.ai/integrations/channels/slack)
