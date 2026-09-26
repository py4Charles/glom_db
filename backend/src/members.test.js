import assert from 'node:assert/strict'
import { after, before, describe, it } from 'node:test'

// dotenv does not override variables that already exist, so it has to load
// first. With a fallback applied before this import, the placeholder would win
// over a perfectly good .env and every test would skip with invalid_password.
await import('dotenv/config')

process.env.AUTH_MODE ??= 'dev'

const { pool } = await import('./db.js')
const {
  ALLOWED_VALUES,
  ValidationError,
  createMember,
  deleteMember,
  getMember,
  listMembers,
  readEnumValues,
  updateMember,
} = await import('./members.js')

// These tests need a migrated database. Rather than failing confusingly when one
// is not available, report the reason and skip.
async function probe() {
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

const skipReason = await probe()

function names(list) {
  return list.map((member) => `${member.last_name}, ${member.first_name}`)
}

function titles(list) {
  return list.map((member) => member.title)
}

describe('members repository', { skip: skipReason ?? false }, () => {
  let client

  before(async () => {
    // One connection for the whole file. With a pool, BEGIN lands on whichever
    // connection is free and later queries can escape onto another one and
    // auto-commit -- which is exactly how an earlier version of this file leaked
    // a test row into the seeded directory on every run.
    client = await pool.connect()
    await client.query('begin')
  })

  after(async () => {
    await client.query('rollback')
    client.release()
    await pool.end()
  })

  // Every call threads the same client through, so the rollback covers all of it.
  const list = (params) => listMembers(params, client)
  const get = (id) => getMember(id, client)
  const create = (input) => createMember(input, client)
  const update = (id, patch) => updateMember(id, patch, client)
  const remove = (id) => deleteMember(id, client)

  // Any error inside a Postgres transaction aborts the entire transaction, not
  // just the failing statement. The tests below deliberately provoke constraint
  // violations, so each one runs inside a savepoint that gets rolled back --
  // otherwise the first expected failure leaves the transaction unusable and
  // every later test fails with 25P02.
  async function rejectsInTransaction(fn, predicate) {
    await client.query('savepoint expected_failure')
    try {
      await assert.rejects(fn, predicate)
    } finally {
      await client.query('rollback to savepoint expected_failure')
    }
  }

  describe('sorting', () => {
    it('sorts by lower(last_name) then lower(first_name) by default', async () => {
      const { members } = await list()
      assert.deepEqual(
        names(members).slice(0, 4),
        ['Adeyemi, Grace', 'Al-Amin, Noor', 'Al-Rashid, Fatima', 'Álvarez, José'],
      )
    })

    it('puts records with no title last in ascending', async () => {
      const { members } = await list({ sort: 'title' })
      assert.equal(members.at(-1).title, null)
    })

    it('keeps untitled records last in descending while the titled group flips', async () => {
      const asc = (await list({ sort: 'title' })).members
      const desc = (await list({ sort: 'title', direction: 'desc' })).members

      const ascTitled = titles(asc.filter((member) => member.title))
      const descTitled = titles(desc.filter((member) => member.title))
      assert.deepEqual(descTitled, [...ascTitled].reverse())

      // The whole point: flipping direction reverses the sorted values and
      // nothing else. Reversing the tie-breakers too would shuffle the
      // untitled remainder, which is the bug this test was written to catch.
      const untitled = (list) => list.filter((member) => !member.title).map((m) => m.id)
      assert.deepEqual(untitled(desc), untitled(asc))
    })

    it('sorts by marital status', async () => {
      const { members } = await list({ sort: 'marital_status' })
      const statuses = members.map((member) => member.marital_status)
      assert.deepEqual(statuses, [...statuses].sort())
    })

    it('sorts by date of birth and puts undated records last', async () => {
      const { members } = await list({ sort: 'date_of_birth' })
      const dated = members.filter((member) => member.date_of_birth)
      const undated = members.filter((member) => !member.date_of_birth)
      assert.equal(undated.length > 0, true)
      assert.equal(members.slice(dated.length).every((m) => m.date_of_birth === null), true)
      const iso = dated.map((member) => member.date_of_birth)
      assert.deepEqual(iso, [...iso].sort())
    })

    it('rejects an unrecognised sort key and falls back to the default', async () => {
      const fallback = (await list()).members.map((m) => m.id)
      for (const key of ['nope', '; drop table members', 'constructor', '__proto__', 'toString']) {
        const { members } = await list({ sort: key })
        assert.deepEqual(members.map((m) => m.id), fallback, `sort=${key}`)
      }
    })

    it('treats an unrecognised direction as ascending', async () => {
      const asc = (await list({ direction: 'asc' })).members.map((m) => m.id)
      const { members } = await list({ direction: 'sideways' })
      assert.deepEqual(members.map((m) => m.id), asc)
    })
  })

  describe('filtering', () => {
    it('filters by marital status', async () => {
      const { members, total } = await list({ marital_status: 'married' })
      assert.ok(total > 0)
      assert.ok(members.every((member) => member.marital_status === 'married'))
    })

    it('is case-insensitive on enum filters', async () => {
      const lower = (await list({ marital_status: 'married' })).total
      const upper = (await list({ marital_status: 'MARRIED' })).total
      assert.equal(upper, lower)
    })

    it('ignores an unrecognised enum value', async () => {
      const all = (await list()).total
      for (const key of ['constructor', '__proto__', 'nope']) {
        const { total } = await list({ marital_status: key })
        assert.equal(total, all, `marital_status=${key}`)
      }
    })

    it('filters by title substring, excluding untitled records', async () => {
      const { members } = await list({ title: 'Rev.' })
      assert.ok(members.length > 0)
      assert.ok(members.every((member) => member.title !== null))
    })

    it('does not let LIKE metacharacters match every row', async () => {
      // '%' is a LIKE wildcard. Unescaped, this would match all titled records
      // instead of returning nothing, because no title contains a literal '%'.
      const { total } = await list({ title: '%' })
      assert.equal(total, 0)
    })

    it('treats an underscore as a literal, not a wildcard', async () => {
      const { total } = await list({ title: '_' })
      assert.equal(total, 0)
    })

    it('trims and lowercases the search term', async () => {
      const padded = (await list({ search: '  smith  ' })).total
      const plain = (await list({ search: 'Smith' })).total
      assert.equal(padded, plain)
    })

    it('searches preferred names', async () => {
      const { members } = await list({ search: 'Johnny' })
      assert.equal(members.length, 1)
    })

    it('combines filters with AND semantics', async () => {
      const { members } = await list({ marital_status: 'married', gender: 'female' })
      assert.ok(members.every((m) => m.marital_status === 'married' && m.gender === 'female'))
    })

    it('reports filtered and unfiltered totals', async () => {
      const all = await list()
      const filtered = await list({ gender: 'female' })
      assert.equal(filtered.totalAll, all.total)
      assert.ok(filtered.total < all.total)
    })
  })

  describe('writes', () => {
    it('creates a record and reads it back', async () => {
      const member = await create({
        first_name: 'Test',
        last_name: 'Person',
        gender: 'female',
        marital_status: 'single',
      })

      assert.match(member.id, /^[0-9a-f-]{36}$/)
      const fetched = await get(member.id)
      assert.equal(fetched.first_name, 'Test')
    })

    it('normalises blank strings to null', async () => {
      const member = await create({
        first_name: 'Blank',
        last_name: 'Values',
        gender: 'male',
        marital_status: 'single',
        middle_name: '   ',
      })
      assert.equal(member.middle_name, null)
    })

    it('ignores a caller-supplied id', async () => {
      const member = await create({
        id: '00000000-0000-4000-8000-0000000000ff',
        first_name: 'Ignored',
        last_name: 'Id',
        gender: 'male',
        marital_status: 'single',
      })
      assert.notEqual(member.id, '00000000-0000-4000-8000-0000000000ff')
    })

    it('rejects a record missing a required field', async () => {
      await rejectsInTransaction(
        () => create({ first_name: 'NoLast', gender: 'male', marital_status: 'single' }),
        (error) => error.code === '23502',
      )
    })

    it('rejects a value outside the enum', async () => {
      await rejectsInTransaction(
        () =>
          create({
            first_name: 'Bad',
            last_name: 'Enum',
            gender: 'unknown',
            marital_status: 'single',
          }),
        (error) => error.code === '22P02',
      )
    })

    it('rejects a non-string field', async () => {
      await rejectsInTransaction(
        () =>
          create({
            first_name: 42,
            last_name: 'Numbers',
            gender: 'male',
            marital_status: 'single',
          }),
        (error) => error instanceof ValidationError,
      )
    })

    it('updates in place and preserves the id and untouched fields', async () => {
      const createdMember = await create({
        first_name: 'Before',
        last_name: 'Change',
        gender: 'male',
        marital_status: 'single',
        title: 'Dr.',
      })

      const updated = await update(createdMember.id, { first_name: 'After' })
      assert.equal(updated.id, createdMember.id)
      assert.equal(updated.first_name, 'After')
      assert.equal(updated.title, 'Dr.')
    })

    it('deletes a record and reports a missing one', async () => {
      const member = await create({
        first_name: 'Temp',
        last_name: 'Record',
        gender: 'male',
        marital_status: 'single',
      })

      assert.equal(await remove(member.id), true)
      assert.equal(await get(member.id), null)
      assert.equal(await remove(member.id), false)
      assert.equal(await update(member.id, { first_name: 'Ghost' }), null)
    })
  })

  describe('contract with the database', () => {
    it('allowlists exactly the enum values the database defines', async () => {
      const enums = await readEnumValues(client)
      assert.deepEqual(
        [...ALLOWED_VALUES.get('gender')].sort(),
        [...(enums.gender_enum ?? [])].sort(),
      )
      assert.deepEqual(
        [...ALLOWED_VALUES.get('marital_status')].sort(),
        [...(enums.marital_status_enum ?? [])].sort(),
      )
    })

    it('returns date_of_birth as a plain YYYY-MM-DD string', async () => {
      const member = await get('00000000-0000-4000-8000-000000000001')
      assert.equal(typeof member.date_of_birth, 'string')
      assert.match(member.date_of_birth, /^\d{4}-\d{2}-\d{2}$/)
    })

    it('blocks the anon role from reading members, leaving Express the only door', async () => {
      // RLS is enabled with no policies, so anon is denied. This is the check
      // that stops someone bypassing Express through PostgREST.
      const { rows } = await client.query(
        'select relrowsecurity from pg_class where relname = $1',
        ['members'],
      )
      assert.equal(rows[0].relrowsecurity, true)
    })
  })
})

if (skipReason) {
  console.log(`\nSkipping repository tests: ${skipReason}\n`)
}
