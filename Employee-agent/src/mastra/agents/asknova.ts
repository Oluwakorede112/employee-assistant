import { Agent } from '@mastra/core/agent'
import { MCPClient } from '@mastra/mcp'
import { Memory } from '@mastra/memory'
import { createSlackAdapter } from '@chat-adapter/slack'
import { currentDateTool } from '../tools/date'
import { ASKNOVA_AGENT_INSTRUCTIONS } from '../prompts/constant'

function server(url: string, token?: string) {
  return {
    url: new URL(url),
    ...(token ? { requestInit: { headers: { Authorization: `Bearer ${token}` } } } : {}),
  }
}

const lookioUrl = process.env.LOOKIO_MCP_SERVER || 'https://mcp.lookio.app/mcp'
const lookioKey = process.env.LOOKIO_API_KEY
const lookio = lookioKey
  ? new MCPClient({ id: 'asknova-lookio', servers: { lookio: server(lookioUrl, lookioKey) } })
  : undefined
const lookioTools = lookio ? await lookio.listTools() : {}

// Pass the model only Lookio's answer text, without citations or [n] markers, so replies carry no sources.
function stripMarkers(text: string) {
  return text.replace(/\s*\[\d+(?:\s*,\s*\d+)*\]/g, '').trim()
}

function answerOnly(result: unknown): unknown {
  const r = result as any
  if (typeof r?.answer === 'string') return { answer: stripMarkers(r.answer) }
  if (typeof r?.structuredContent?.answer === 'string') return { answer: stripMarkers(r.structuredContent.answer) }
  if (Array.isArray(r?.content)) {
    for (const part of r.content) {
      if (part?.type !== 'text' || typeof part.text !== 'string') continue
      try {
        const parsed = JSON.parse(part.text)
        if (typeof parsed?.answer === 'string') return { answer: stripMarkers(parsed.answer) }
      } catch {}
    }
  }
  return result // errors and unexpected shapes pass through unchanged so the fallback still applies
}

// Expose only Lookio's ask_assistant tool, wrapped so its output is answer-only.
const askTool = Object.fromEntries(
  Object.entries(lookioTools)
    .filter(([name]) => name === 'ask_assistant' || name.endsWith('_ask_assistant'))
    .map(([name, tool]) => {
      const execute = tool.execute
      return [name, Object.assign(Object.create(Object.getPrototypeOf(tool)), tool, {
        execute: execute ? async (...args: Parameters<typeof execute>) => answerOnly(await execute(...args)) : execute,
      })]
    }),
)

// Optional: a public product-documentation MCP server for product/API questions.
const docs = process.env.PRODUCT_DOCS_MCP_URL
  ? new MCPClient({
      id: 'asknova-docs',
      servers: {
        productDocs: server(process.env.PRODUCT_DOCS_MCP_URL, process.env.PRODUCT_DOCS_MCP_AUTH_TOKEN),
      },
    })
  : undefined
const docsTools = docs ? await docs.listTools() : {}

const slackConfigured = Boolean(process.env.SLACK_BOT_TOKEN && process.env.SLACK_SIGNING_SECRET)

export const askNova = new Agent({
  id: 'asknova',
  name: 'AskNova',
  model: process.env.ASKNOVA_MODEL || 'deepseek/deepseek-flash',
  memory: new Memory({ options: { lastMessages: 20 } }),
  instructions: ASKNOVA_AGENT_INSTRUCTIONS,
  tools: { ...askTool, ...docsTools, get_current_date: currentDateTool },
  ...(slackConfigured
    ? {
        channels: {
          adapters: {
            slack: {
              adapter: createSlackAdapter(),
              // Run tools silently: no tool cards or raw JSON in Slack, only the final answer.
              toolDisplay: 'hidden',
              typingStatus: () => 'is checking the policy…',
            },
          },
        },
      }
    : {}),
})
