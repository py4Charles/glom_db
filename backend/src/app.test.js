import assert from 'node:assert/strict'
import { after, before, describe, it } from 'node:test'

// dotenv first: it does not override variables that already exist.
await import('dotenv/config')
process.env.AUTH_MODE ??= 'dev'

const { createApp } = await import('./app.js')
const { pool } = await import('./db.js')

const SEEDED_COUNT = 38
const MISSING_UUID = '00000000-0000-4000-8000-0000000000ee'

let server
let base

async function api(path, options = {}) {
  const response = await fetch(`${base}${path}`, options)
  const text = await response.text()
  return {
    status: response.status,
    body: text ? JSON.parse(text) : null,
  }
}

async function databaseIsReady() {
  try {
    await pool.query('select 1 from members limit 1')
    return null
  } catch (error) {
    if (error.code === '42703' || error.code === '42P01' || error.code === '3D000') {
      return 'database reachable but migrations are not applied'
    }
    return `database unreachable (${error.code ?? error.message})`
  }
}

const skipReason = await databaseIsReady()

describe('http api', { skip: skipReason ?? false }, () => {
  before(async () => {
    server = createApp().listen(0)
    await new Promise((resolve) => server.once('listening', resolve))
    base = `http://127.0.0.1:${server.address().port}`
  })

  after(async () => {
    await new Promise((resolve) => server.close(resolve))
    await pool.end()
  })

  it('leaves the seeded directory untouched', async () => {
    // Guards against the repository suite committing rows it meant to roll back.
    // A test that writes to the database needs its cleanup to be verifiable.
    const { rows } = await pool.query('select count(*)::int as total from members')
    assert.equal(rows[0].total, SEEDED_COUNT)
  })

  describe('health', () => {
    it('reports ok', async () => {
      const { status, body } = await api('/api/health')
      assert.equal(status, 200)
      assert.deepEqual(body, { ok: true })
    })
  })

  describe('GET /api/members', () => {
    it('returns members with both totals', async () => {
      const { status, body } = await api('/api/members')
      assert.equal(status, 200)
      assert.equal(Array.isArray(body.members), true)
      assert.equal(body.total, SEEDED_COUNT)
      // This assertion is the reason route tests exist. The repository returned
      // totalAll correctly, but the handler destructured only two of the three
      // fields, so the list header would have shown the wrong number forever.
      assert.equal(body.totalAll, SEEDED_COUNT)
      assert.equal('total_count' in body.members[0], false)
    })

    it('reports a larger totalAll than total when filtered', async () => {
      const { body } = await api('/api/members?gender=female')
      assert.ok(body.total < body.totalAll)
      assert.equal(body.totalAll, SEEDED_COUNT)
    })

    it('ignores an unrecognised sort key', async () => {
      const unfiltered = await api('/api/members')
      const injected = await api('/api/members?sort=constructor')
      assert.equal(injected.status, 200)
      assert.deepEqual(
        injected.body.members.map((m) => m.id),
        unfiltered.body.members.map((m) => m.id),
      )
    })
  })

  describe('GET /api/members/:id', () => {
    it('rejects a malformed id before touching the database', async () => {
      const { status } = await api('/api/members/not-a-uuid')
      assert.equal(status, 400)
    })

    it('returns 404 for a well-formed id that does not exist', async () => {
      const { status, body } = await api(`/api/members/${MISSING_UUID}`)
      assert.equal(status, 404)
      assert.equal(body.error, 'Member not found')
    })

    it('returns a member', async () => {
      const { status, body } = await api('/api/members/00000000-0000-4000-8000-000000000001')
      assert.equal(status, 200)
      assert.equal(body.member.last_name, 'Smith')
    })
  })

  describe('write lifecycle', () => {
    let id

    it('creates, reads, updates and deletes', async () => {
      const created = await api('/api/members', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          first_name: 'Route',
          last_name: 'Test',
          gender: 'female',
          marital_status: 'single',
        }),
      })
      assert.equal(created.status, 201)
      id = created.body.member.id
      assert.match(id, /^[0-9a-f-]{36}$/)

      const read = await api(`/api/members/${id}`)
      assert.equal(read.body.member.first_name, 'Route')

      const patched = await api(`/api/members/${id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ first_name: 'Renamed' }),
      })
      assert.equal(patched.status, 200)
      assert.equal(patched.body.member.first_name, 'Renamed')
      assert.equal(patched.body.member.last_name, 'Test')

      const removed = await api(`/api/members/${id}`, { method: 'DELETE' })
      assert.equal(removed.status, 204)
      assert.equal(removed.body, null)

      const gone = await api(`/api/members/${id}`)
      assert.equal(gone.status, 404)
    })

    it('maps a missing required field to 400, not 500', async () => {
      const { status, body } = await api('/api/members', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ first_name: 'NoLast', gender: 'male', marital_status: 'single' }),
      })
      assert.equal(status, 400)
      assert.equal(body.error, 'A required field was missing')
    })

    it('maps an invalid enum value to 400, not 500', async () => {
      const { status, body } = await api('/api/members', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          first_name: 'Bad',
          last_name: 'Enum',
          gender: 'unknown',
          marital_status: 'single',
        }),
      })
      assert.equal(status, 400)
      assert.equal(body.error, 'A field had an invalid value')
    })

    it('returns 404 when patching or deleting a record that is not there', async () => {
      const patched = await api(`/api/members/${MISSING_UUID}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ first_name: 'Ghost' }),
      })
      const removed = await api(`/api/members/${MISSING_UUID}`, { method: 'DELETE' })
      assert.equal(patched.status, 404)
      assert.equal(removed.status, 404)
    })
  })
})

if (skipReason) {
  console.log(`\nSkipping API tests: ${skipReason}\n`)
}
