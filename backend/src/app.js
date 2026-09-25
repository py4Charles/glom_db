import express from 'express'
import { config } from './config.js'
import { requireSession } from './auth.js'
import { pool } from './db.js'
import {
  ValidationError,
  createMember,
  deleteMember,
  getMember,
  listMembers,
  updateMember,
} from './members.js'

// Postgres error codes that mean the request was bad rather than the server.
const CLIENT_ERROR_CODES = new Map([
  ['23502', 'A required field was missing'],
  ['23503', 'Related record does not exist'],
  ['23505', 'That record already exists'],
  ['23514', 'A field failed a validation rule'],
  ['22P02', 'A field had an invalid value'],
  ['22007', 'A date field was invalid'],
])

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// Exported without calling listen() so tests can mount it on an ephemeral port
// and exercise the real routing, status codes and JSON shapes. Testing the
// repository alone does not catch a handler that forgets to forward a field.
export function createApp() {
  const app = express()
  app.use(express.json())

  app.get('/api/health', async (_req, res) => {
    try {
      await pool.query('select 1')
      res.json({ ok: true })
    } catch (error) {
      console.error('Health check failed', error)
      res.status(503).json({ ok: false })
    }
  })

  // Every route below requires a verified Supabase session. Because RLS is
  // enabled with no policies, this process holds the only key that can read
  // members, so there is no second door. Add authorization checks as routes are
  // added.
  app.use('/api/members', requireSession)

  app.get('/api/members', async (req, res, next) => {
    try {
      // totalAll has to be forwarded, not just total: the list header renders
      // "showing n of m" and silently shows the wrong number if it is dropped.
      const { members, total, totalAll } = await listMembers(req.query)
      res.json({ members, total, totalAll })
    } catch (error) {
      next(error)
    }
  })

  app.get('/api/members/:id', async (req, res, next) => {
    if (!UUID_PATTERN.test(req.params.id)) {
      return res.status(400).json({ error: 'Malformed member id' })
    }

    try {
      const member = await getMember(req.params.id)
      if (!member) return res.status(404).json({ error: 'Member not found' })
      res.json({ member })
    } catch (error) {
      next(error)
    }
  })

  app.post('/api/members', async (req, res, next) => {
    try {
      const member = await createMember(req.body)
      res.status(201).json({ member })
    } catch (error) {
      next(error)
    }
  })

  app.patch('/api/members/:id', async (req, res, next) => {
    if (!UUID_PATTERN.test(req.params.id)) {
      return res.status(400).json({ error: 'Malformed member id' })
    }

    try {
      const member = await updateMember(req.params.id, req.body)
      if (!member) return res.status(404).json({ error: 'Member not found' })
      res.json({ member })
    } catch (error) {
      next(error)
    }
  })

  app.delete('/api/members/:id', async (req, res, next) => {
    if (!UUID_PATTERN.test(req.params.id)) {
      return res.status(400).json({ error: 'Malformed member id' })
    }

    try {
      const deleted = await deleteMember(req.params.id)
      if (!deleted) return res.status(404).json({ error: 'Member not found' })
      res.status(204).end()
    } catch (error) {
      next(error)
    }
  })

  app.use((error, _req, res, _next) => {
    if (error instanceof ValidationError) {
      return res.status(error.status).json({ error: error.message })
    }

    const clientMessage = CLIENT_ERROR_CODES.get(error.code)
    if (clientMessage) {
      return res.status(400).json({ error: clientMessage })
    }

    console.error('Unhandled error', error)
    res.status(500).json({ error: 'Internal server error' })
  })

  return app
}
