import { Mastra } from '@mastra/core'
import { registerApiRoute } from '@mastra/core/server'
import { LibSQLStore } from '@mastra/libsql'
import { randomUUID } from 'node:crypto'
import { askNova } from './agents/asknova'
import { testUiHtml } from './test-ui'

function localTestRequest(request: Request) {
  const host = new URL(request.url).hostname
  return process.env.ASKNOVA_TEST_UI === '1' && (host === 'localhost' || host === '127.0.0.1')
}

function testUserId(request: Request) {
  const cookie = request.headers.get('cookie') || ''
  const match = cookie.match(/(?:^|;\s*)asknova_test_user=([a-f0-9-]{36})(?:;|$)/)
  return match?.[1]
}

export const mastra = new Mastra({
  storage: new LibSQLStore({ id: 'asknova-storage', url: process.env.ASKNOVA_DB_URL || `file:${process.env.INIT_CWD || process.cwd()}/asknova.db` }),
  agents: { askNova },
  server: {
    apiRoutes: [
      registerApiRoute('/test', {
        method: 'GET',
        handler: async c => {
          if (!localTestRequest(c.req.raw)) return c.text('Not found', 404)
          if (!testUserId(c.req.raw)) {
            c.header('Set-Cookie', `asknova_test_user=${randomUUID()}; HttpOnly; SameSite=Strict; Path=/test; Max-Age=2592000`)
          }
          return c.html(testUiHtml)
        },
      }),
      registerApiRoute('/test/chat', {
        method: 'POST',
        handler: async c => {
          if (!localTestRequest(c.req.raw)) return c.json({ error: 'Not found' }, 404)
          if (!process.env.DEEPSEEK_API_KEY && (process.env.ASKNOVA_MODEL || 'deepseek/deepseek-flash').startsWith('deepseek/')) {
            return c.json({ error: 'Set DEEPSEEK_API_KEY in .env to test the Mastra agent.' }, 503)
          }
          let body: unknown
          try { body = await c.req.json() } catch { return c.json({ error: 'Send valid JSON.' }, 400) }
          if (!body || typeof body !== 'object') return c.json({ error: 'Question is required.' }, 400)
          const { question, threadId } = body as { question?: unknown; threadId?: unknown }
          const resourceId = testUserId(c.req.raw)
          if (!resourceId) return c.json({ error: 'Reload the test page to start a session.' }, 401)
          if (typeof threadId !== 'string' || !/^[a-f0-9-]{36}$/.test(threadId)) {
            return c.json({ error: 'Invalid conversation ID.' }, 400)
          }
          if (typeof question !== 'string' || !question.trim() || question.length > 4000) {
            return c.json({ error: 'Question must be 1–4000 characters.' }, 400)
          }
          try {
            const agent = c.get('mastra').getAgent('askNova')
            const result = await agent.generate(question.trim(), { memory: { resource: resourceId, thread: threadId } })
            return c.json({ answer: result.text || 'I could not verify an answer in the approved policy.' })
          } catch {
            return c.json({ error: 'The agent could not complete this answer. Check the model and Lookio connection.' }, 502)
          }
        },
      }),
    ],
  },
})
