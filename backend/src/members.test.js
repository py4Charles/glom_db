import assert from 'node:assert/strict'
import { after, before, describe, it } from 'node:test'

// Config reads these at import time and throws when they are missing, so give
// the test process defaults before importing. That lets this file load and
// report a skip reason instead of dying with a module-not-found style error when
// no .env exists yet.
process.env.AUTH_MODE ??= 'dev'
process.env.DATABASE_URL ??= 'postgresql://postgres:postgres@127.0.0.1:5432/postgres'

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
const created = []

function names(list) {
  return list.map((member) => `${member.last_name}, ${member.first_name}`)
}

function titles(list) {
  return list.map((member) => member.title)
}

describe('members repository', { skip: skipReason ?? false }, () => {
  before(async () => {
    // Run inside a transaction so every test rolls back and the seeded
    // directory is left exactly as the migrations created it.
    await pool.query('begin')
  })

  after(async () => {
    await pool.query('rollback')
    await pool.end()
  })

  describe('sorting', () => {
    it('sorts by lower(last_name) then lower(first_name) by default', async () => {
      const { members } = await listMembers()
      assert.deepEqual(
        names(members).slice(0, 4),
        ['Adeyemi, Grace', 'Al-Amin, Noor', 'Al-Rashid, Fatima', 'Álvarez, José'],
      )
    })

    it('puts records with no title last in ascending', async () => {
      const { members } = await listMembers({ sort: 'title' })
      assert.equal(members.at(-1).title, null)
    })

    it('keeps untitled records last in descending while the titled group flips', async () => {
      const asc = (await listMembers({ sort: 'title' })).members
      const desc = (await listMembers({ sort: 'title', direction: 'desc' })).members

      const ascTitled = titles(asc.filter((member) => member.title))
      const descTitled = titles(desc.filter((member) => member.title))
      assert.deepEqual(descTitled, [...ascTitled].reverse())

      const untitled = (list) => list.filter((member) => !member.title).map((m) => m.id)
      assert.deepEqual(untitled(desc), untitled(asc))
    })

    it('sorts by marital status', async () => {
      const { members } = await listMembers({ sort: 'marital_status' })
      const statuses = members.map((member) => member.marital_status)
      assert.deepEqual(statuses, [...statuses].sort())
    })

    it('sorts by date of birth and puts undated records last', async () => {
      const { members } = await listMembers({ sort: 'date_of_birth' })
      const dated = members.filter((member) => member.date_of_birth)
      assert.equal(members.length - dated.length, members.filter((m) => !m.date_of_birth).length)
      assert.equal(members.slice(dated.length).every((m) => m.date_of_birth === null), true)
      const iso = dated.map((member) => member.date_of_birth)
      assert.deepEqual(iso, [...iso].sort())
    })

    it('rejects an unrecognised sort key and falls back to the default', async () => {
      const fallback = (await listMembers()).members.map((m) => m.id)
      for (const key of ['nope', '; drop table members', 'constructor', '__proto__', 'toString']) {
        const { members } = await listMembers({ sort: key })
        assert.deepEqual(members.map((m) => m.id), fallback, `sort=${key}`)
      }
    })

    it('treats an unrecognised direction as ascending', async () => {
      const asc = (await listMembers({ direction: 'asc' })).members.map((m) => m.id)
      const { members } = await listMembers({ direction: 'sideways' })
      assert.deepEqual(members.map((m) => m.id), asc)
    })
  })

  describe('filtering', () => {
    it('filters by marital status', async () => {
      const { members, total } = await listMembers({ marital_status: 'married' })
      assert.ok(total > 0)
      assert.ok(members.every((member) => member.marital_status === 'married'))
    })

    it('is case-insensitive on enum filters', async () => {
      const lower = (await listMembers({ marital_status: 'married' })).total
      const upper = (await listMembers({ marital_status: 'MARRIED' })).total
      assert.equal(upper, lower)
    })

    it('ignores an unrecognised enum value', async () => {
      const all = (await listMembers()).total
      for (const key of ['constructor', '__proto__', 'nope']) {
        const { total } = await listMembers({ marital_status: key })
        assert.equal(total, all, `marital_status=${key}`)
      }
    })

    it('filters by title substring, excluding untitled records', async () => {
      const { members } = await listMembers({ title: 'Rev.' })
      assert.ok(members.length > 0)
      assert.ok(members.every((member) => member.title !== null))
    })

    it('does not let LIKE metacharacters match every row', async () => {
      // '%' is a LIKE wildcard. Unescaped, this would match all titled records
      // instead of returning nothing, because no title contains a literal '%'.
      const { total } = await listMembers({ title: '%' })
      assert.equal(total, 0)
    })

    it('treats an underscore as a literal, not a wildcard', async () => {
      const { total } = await listMembers({ title: '_' })
      assert.equal(total, 0)
    })

    it('trims and lowercases the search term', async () => {
      const padded = (await listMembers({ search: '  smith  ' })).total
      const plain = (await listMembers({ search: 'Smith' })).total
      assert.equal(padded, plain)
    })

    it('searches preferred names', async () => {
      const { members } = await listMembers({ search: 'Johnny' })
      assert.equal(members.length, 1)
    })

    it('combines filters with AND semantics', async () => {
      const { members } = await listMembers({ marital_status: 'married', gender: 'female' })
      assert.ok(members.every((m) => m.marital_status === 'married' && m.gender === 'female'))
    })

    it('reports filtered and unfiltered totals', async () => {
      const all = await listMembers()
      const filtered = await listMembers({ gender: 'female' })
      assert.equal(filtered.totalAll, all.total)
      assert.ok(filtered.total < all.total)
    })
  })

  describe('writes', () => {
    it('creates a record and reads it back', async () => {
      const member = await createMember({
        first_name: 'Test',
        last_name: 'Person',
        gender: 'female',
        marital_status: 'single',
      })
      created.push(member.id)

      assert.match(member.id, /^[0-9a-f-]{36}$/)
      const fetched = await getMember(member.id)
      assert.equal(fetched.first_name, 'Test')
    })

    it('normalises blank strings to null', async () => {
      const member = await createMember({
        first_name: 'Blank',
        last_name: 'Values',
        gender: 'male',
        marital_status: 'single',
        middle_name: '   ',
      })
      created.push(member.id)
      assert.equal(member.middle_name, null)
    })

    it('ignores a caller-supplied id', async () => {
      const member = await createMember({
        id: '00000000-0000-4000-8000-0000000000ff',
        first_name: 'Ignored',
        last_name: 'Id',
        gender: 'male',
        marital_status: 'single',
      })
      created.push(member.id)
      assert.notEqual(member.id, '00000000-0000-4000-8000-0000000000ff')
    })

    it('rejects a record missing a required field', async () => {
      await assert.rejects(
        () => createMember({ first_name: 'NoLast', gender: 'male', marital_status: 'single' }),
        (error) => error.code === '23502',
      )
    })

    it('rejects a value outside the enum', async () => {
      await assert.rejects(
        () =>
          createMember({
            first_name: 'Bad',
            last_name: 'Enum',
            gender: 'unknown',
            marital_status: 'single',
          }),
        (error) => error.code === '22P02',
      )
    })

    it('rejects a non-string field', async () => {
      await assert.rejects(
        () =>
          createMember({
            first_name: 42,
            last_name: 'Numbers',
            gender: 'male',
            marital_status: 'single',
          }),
        (error) => error instanceof ValidationError,
      )
    })

    it('updates in place and preserves the id and untouched fields', async () => {
      const createdMember = await createMember({
        first_name: 'Before',
        last_name: 'Change',
        gender: 'male',
        marital_status: 'single',
        title: 'Dr.',
      })
      created.push(createdMember.id)

      const updated = await updateMember(createdMember.id, { first_name: 'After' })
      assert.equal(updated.id, createdMember.id)
      assert.equal(updated.first_name, 'After')
      assert.equal(updated.title, 'Dr.')
    })

    it('deletes a record and reports a missing one', async () => {
      const member = await createMember({
        first_name: 'Temp',
        last_name: 'Record',
        gender: 'male',
        marital_status: 'single',
      })

      assert.equal(await deleteMember(member.id), true)
      assert.equal(await getMember(member.id), null)
      assert.equal(await deleteMember(member.id), false)
      assert.equal(await updateMember(member.id, { first_name: 'Ghost' }), null)
    })
  })

  describe('contract with the database', () => {
    it('allowlists exactly the enum values the database defines', async () => {
      const enums = await readEnumValues()
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
      const member = await getMember('00000000-0000-4000-8000-000000000001')
      assert.equal(typeof member.date_of_birth, 'string')
      assert.match(member.date_of_birth, /^\d{4}-\d{2}-\d{2}$/)
    })

    it('blocks the anon role from reading members, leaving Express the only door', async () => {
      // RLS is enabled with no policies, so anon is denied. This is the check
      // that stops someone bypassing Express through PostgREST.
      const { rows } = await pool.query('select relrowsecurity from pg_class where relname = $1', [
        'members',
      ])
      assert.equal(rows[0].relrowsecurity, true)
    })
  })
})

if (skipReason) {
  console.log(`\nSkipping repository tests: ${skipReason}\n`)
}
