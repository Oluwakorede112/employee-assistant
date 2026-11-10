import { createTool } from '@mastra/core/tools'
import { z } from 'zod'

// Company time zone as an IANA name, e.g. Africa/Lagos or Europe/London. Defaults to UTC.
const timeZone = process.env.ASKNOVA_TIMEZONE || 'UTC'

export const currentDateTool = createTool({
  id: 'get_current_date',
  description:
    "Returns today's date, weekday, and current time in the company time zone. Use it for questions about today's date or day, and before working out deadlines, durations, or days until/since a date.",
  inputSchema: z.object({}),
  outputSchema: z.object({
    date: z.string().describe('ISO date, YYYY-MM-DD'),
    weekday: z.string(),
    readable: z.string().describe('e.g. Monday, 9 November 2026'),
    time: z.string().describe('24-hour time, HH:MM'),
    timeZone: z.string(),
  }),
  execute: async () => {
    const now = new Date()
    const part = (options: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat('en-GB', { timeZone, ...options }).format(now)
    return {
      date: new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now),
      weekday: part({ weekday: 'long' }),
      readable: part({ weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }),
      time: part({ hour: '2-digit', minute: '2-digit', hour12: false }),
      timeZone,
    }
  },
})
