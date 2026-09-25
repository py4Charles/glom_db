import { beforeEach, describe, expect, it, vi } from 'vitest'

// members.js holds a module-level mutable array, so each test re-imports the
// module graph to get an isolated fixture set.
let members
let api

beforeEach(async () => {
  vi.resetModules()
  api = await import('./members.js')
  members = (await import('./mockApi/data.js')).members
})

const titles = (list) => list.map((member) => member.title)
const ids = (list) => list.map((member) => member.id)

describe('listMembers defaults', () => {
  it('sorts by last name then first name by default', () => {
    expect(api.listMembers().map((m) => m.last_name)).toEqual([
      'Brown',
      'Garcia',
      'Kariuki',
      'Okafor',
      'Peterson',
      'Smith',
      'Smith',
      'Smith',
    ])
  })

  it('breaks first-name ties on last name', () => {
    const smiths = api.listMembers({ search: 'Smith' })
    expect(smiths.map((m) => `${m.first_name} ${m.last_name}`)).toEqual([
      'Jane Smith',
      'John Smith',
      'John Smith',
    ])
  })

  it('does not mutate the underlying store', () => {
    const before = ids(members)
    api.listMembers({ sort: 'title', direction: 'desc' })
    expect(ids(members)).toEqual(before)
  })
})

describe('filters', () => {
  it('filters by marital status', () => {
    // Peterson(7), Smith Jane(3), Smith John(1) under the default name sort.
    expect(ids(api.listMembers({ marital_status: 'married' }))).toEqual([7, 3, 1])
  })

  it('is case-insensitive on enum filters', () => {
    expect(ids(api.listMembers({ marital_status: 'MARRIED' }))).toEqual([7, 3, 1])
  })

  it('ignores an unrecognised enum value instead of matching nothing', () => {
    expect(api.listMembers({ marital_status: 'nope' })).toHaveLength(members.length)
  })

  it('filters by title case-insensitively', () => {
    expect(ids(api.listMembers({ title: 'REV.' }))).toEqual([1])
  })

  it('filters by title substring', () => {
    expect(titles(api.listMembers({ title: 'r' }))).toEqual(['Dr.', 'Mrs.', 'Rev.'])
  })

  it('excludes untitled members from a title filter', () => {
    const result = api.listMembers({ title: 'Rev.' })
    expect(ids(result)).toEqual([1])
    expect(result.every((member) => member.title !== null)).toBe(true)
  })

  it('trims the search term', () => {
    expect(ids(api.listMembers({ search: '  smith  ' }))).toEqual([3, 1, 2])
  })

  it('searches preferred names as well as legal names', () => {
    expect(ids(api.listMembers({ search: 'Johnny' }))).toEqual([1])
  })

  it('combines filters with AND semantics', () => {
    expect(ids(api.listMembers({ marital_status: 'married', gender: 'female' }))).toEqual([3])
  })

  it('ignores unknown query keys', () => {
    expect(api.listMembers({ sort: 'title', nope: 'x' }).length).toBe(
      api.listMembers({ sort: 'title' }).length,
    )
  })
})

describe('sorting', () => {
  it('places records with no title last, ascending', () => {
    const result = api.listMembers({ sort: 'title' })
    expect(result.at(-1).title).toBeNull()
  })

  it('keeps records with no title last in descending, while the titled group flips', () => {
    const asc = api.listMembers({ sort: 'title', direction: 'asc' })
    const desc = api.listMembers({ sort: 'title', direction: 'desc' })

    expect(asc.slice(0, 3).map((m) => m.title)).toEqual(['Dr.', 'Mrs.', 'Rev.'])
    expect(desc.slice(0, 3).map((m) => m.title)).toEqual(['Rev.', 'Mrs.', 'Dr.'])

    const ascUntitled = asc.filter((m) => m.title === null).map((m) => m.id)
    const descUntitled = desc.filter((m) => m.title === null).map((m) => m.id)
    expect(descUntitled).toEqual(ascUntitled)
  })

  it('sorts by marital status', () => {
    const result = api.listMembers({ sort: 'marital_status' })
    expect(result.map((m) => m.marital_status)).toEqual([
      'divorced',
      'married',
      'married',
      'married',
      'prefer_not_to_say',
      'single',
      'single',
      'widowed',
    ])
  })

  it('sorts by date of birth and puts undated records last', () => {
    const result = api.listMembers({ sort: 'date_of_birth' })
    expect(result[0].date_of_birth).toBe('1958-12-05')
    expect(result.at(-1).date_of_birth).toBeNull()
  })

  it('falls back to the default sort for an unknown sort key', () => {
    expect(ids(api.listMembers({ sort: '; drop table' }))).toEqual(
      ids(api.listMembers({ sort: 'name' })),
    )
  })

  it('treats an unknown direction as ascending', () => {
    expect(ids(api.listMembers({ direction: 'sideways' }))).toEqual(
      ids(api.listMembers({ direction: 'asc' })),
    )
  })
})

describe('parseQuery', () => {
  it('reports only recognised, active filters', () => {
    const query = api.parseQuery({ search: 'x', sort: 'title', gender: 'bogus' })
    expect(api.countActiveFilters(query)).toBe(1)
  })

  it('does not count sort or direction as filters', () => {
    const query = api.parseQuery({ sort: 'title', direction: 'desc' })
    expect(api.countActiveFilters(query)).toBe(0)
  })
})

describe('write contract', () => {
  it('returns copies so callers cannot mutate the store', () => {
    const member = api.getMember(1)
    member.first_name = 'Mutated'
    expect(api.getMember(1).first_name).toBe('John')
  })

  it('returns isolated copies from listMembers', () => {
    const [first] = api.listMembers()
    first.title = 'Mutated'
    expect(api.listMembers().find((m) => m.id === first.id).title).not.toBe('Mutated')
  })

  it('rejects records missing required fields', () => {
    const created = api.addMember({ first_name: 'NoLast', gender: 'male', marital_status: 'single' })
    expect(created).toBeNull()
  })

  it('rejects an invalid enum value', () => {
    const created = api.addMember({
      first_name: 'Bad',
      last_name: 'Enum',
      gender: 'unknown',
      marital_status: 'single',
    })
    expect(created).toBeNull()
  })

  it('drops fields outside the writable allowlist', () => {
    const created = api.addMember({
      first_name: 'Clean',
      last_name: 'Record',
      gender: 'male',
      marital_status: 'single',
      is_admin: true,
    })
    expect(created).toEqual({
      id: 9,
      first_name: 'Clean',
      last_name: 'Record',
      gender: 'male',
      marital_status: 'single',
    })
  })

  it('ignores an id supplied by the caller on create', () => {
    const created = api.addMember({
      id: 999,
      first_name: 'Nine',
      last_name: 'Nine',
      gender: 'male',
      marital_status: 'single',
    })
    expect(created.id).toBe(9)
  })

  it('keeps the original id on update', () => {
    const updated = api.updateMember(1, { id: 42, first_name: 'Jonathan' })
    expect(updated.id).toBe(1)
    expect(updated.first_name).toBe('Jonathan')
  })

  it('preserves untouched fields on update', () => {
    const updated = api.updateMember(1, { first_name: 'Jonathan' })
    expect(updated.last_name).toBe('Smith')
    expect(updated.title).toBe('Rev.')
  })

  it('returns null when updating a missing record', () => {
    expect(api.updateMember(9999, { first_name: 'Ghost' })).toBeNull()
  })

  it('survives a malformed record without throwing', () => {
    members.push({ id: 50 })
    expect(() => api.listMembers({ search: 'smith' })).not.toThrow()
    expect(ids(api.listMembers({ search: 'smith' }))).toEqual([3, 1, 2])
  })
})
