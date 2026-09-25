import { beforeEach, describe, expect, it, vi } from 'vitest'

// The demo fixture in mockApi/data.js is expected to grow, so the query suite
// owns its own seed. Records 9 and 10 are deliberately awkward: a lowercased
// first name and a lowercased, accented last name. Real data gets dirty.
const { seed } = vi.hoisted(() => ({
  seed: [
    {
      id: 1,
      first_name: 'John',
      middle_name: 'Robert',
      last_name: 'Smith',
      preferred_name: 'Johnny',
      suffix: null,
      title: 'Rev.',
      gender: 'male',
      date_of_birth: '1965-04-12',
      marital_status: 'married',
      photo_url: null,
      phone_number: '555-0101',
    },
    {
      id: 2,
      first_name: 'John',
      middle_name: null,
      last_name: 'Smith',
      preferred_name: null,
      suffix: 'Jr.',
      title: null,
      gender: 'male',
      date_of_birth: '1991-09-30',
      marital_status: 'single',
      photo_url: null,
      phone_number: '555-0102',
    },
    {
      id: 3,
      first_name: 'Jane',
      middle_name: 'Marie',
      last_name: 'Smith',
      preferred_name: 'Janey',
      suffix: null,
      title: 'Mrs.',
      gender: 'female',
      date_of_birth: null,
      marital_status: 'married',
      photo_url: null,
      phone_number: '555-0103',
    },
    {
      id: 4,
      first_name: 'Maria',
      middle_name: null,
      last_name: 'Garcia',
      preferred_name: null,
      suffix: null,
      title: null,
      gender: 'prefer_not_to_say',
      date_of_birth: '1978-11-02',
      marital_status: 'widowed',
      photo_url: null,
      phone_number: null,
    },
    {
      id: 5,
      first_name: 'David',
      middle_name: 'James',
      last_name: 'Brown',
      preferred_name: 'Dave',
      suffix: null,
      title: null,
      gender: 'male',
      date_of_birth: '2001-02-14',
      marital_status: 'single',
      photo_url: null,
      phone_number: '555-0104',
    },
    {
      id: 6,
      first_name: 'Ellen',
      middle_name: null,
      last_name: 'Okafor',
      preferred_name: null,
      suffix: null,
      title: 'Dr.',
      gender: 'female',
      date_of_birth: '1989-07-23',
      marital_status: 'divorced',
      photo_url: null,
      phone_number: '555-0105',
    },
    {
      id: 7,
      first_name: 'Samuel',
      middle_name: null,
      last_name: 'Peterson',
      preferred_name: 'Sam',
      suffix: null,
      title: null,
      gender: 'male',
      date_of_birth: '1958-12-05',
      marital_status: 'married',
      photo_url: null,
      phone_number: '555-0106',
    },
    {
      id: 8,
      first_name: 'Grace',
      middle_name: 'Anne',
      last_name: 'Kariuki',
      preferred_name: null,
      suffix: null,
      title: null,
      gender: 'female',
      date_of_birth: null,
      marital_status: 'prefer_not_to_say',
      photo_url: null,
      phone_number: '555-0107',
    },
    {
      id: 9,
      first_name: 'josé',
      middle_name: null,
      last_name: 'Álvarez',
      preferred_name: null,
      suffix: null,
      title: 'Sr.',
      gender: 'male',
      date_of_birth: '1971-05-19',
      marital_status: 'single',
      photo_url: null,
      phone_number: null,
    },
    {
      id: 10,
      first_name: 'renée',
      middle_name: null,
      last_name: 'dubois',
      preferred_name: null,
      suffix: null,
      title: null,
      gender: 'female',
      date_of_birth: '1983-09-08',
      marital_status: 'divorced',
      photo_url: null,
      phone_number: null,
    },
  ],
}))

vi.mock('./mockApi/data.js', () => ({ members: structuredClone(seed) }))

let api
let members

beforeEach(async () => {
  // members.js holds a module-level mutable array, and vi.mock caches its
  // factory result, so the fixture is refilled in place for every test.
  vi.resetModules()
  api = await import('./members.js')
  members = (await import('./mockApi/data.js')).members
  members.length = 0
  members.push(...structuredClone(seed))
})

const titles = (list) => list.map((member) => member.title)
const ids = (list) => list.map((member) => member.id)

describe('listMembers defaults', () => {
  it('sorts by last name then first name by default', () => {
    expect(api.listMembers().map((m) => m.last_name)).toEqual([
      'Álvarez',
      'Brown',
      'dubois',
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

  it('orders accented and lowercased names without bespoke casing rules', () => {
    const order = api.listMembers().map((m) => `${m.last_name} ${m.first_name}`)
    expect(order[0]).toBe('Álvarez josé')
    expect(order.indexOf('dubois renée')).toBeLessThan(order.indexOf('Garcia Maria'))
  })

  it('matches a stored lowercase value against a differently cased search', () => {
    expect(ids(api.listMembers({ search: 'DUBOIS' }))).toEqual([10])
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
    // 'r.' is a substring of both 'Dr.' and 'Sr.', but not of 'Rev.' or 'Mrs.'.
    expect(ids(api.listMembers({ title: 'r.' }))).toEqual([9, 6])
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
    expect(api.listMembers({ sort: 'title' }).at(-1).title).toBeNull()
  })

  it('keeps records with no title last in descending, while the titled group flips', () => {
    const asc = api.listMembers({ sort: 'title', direction: 'asc' })
    const desc = api.listMembers({ sort: 'title', direction: 'desc' })

    expect(asc.slice(0, 4).map((m) => m.title)).toEqual(['Dr.', 'Mrs.', 'Rev.', 'Sr.'])
    expect(desc.slice(0, 4).map((m) => m.title)).toEqual(['Sr.', 'Rev.', 'Mrs.', 'Dr.'])

    const ascUntitled = ids(asc.filter((m) => m.title === null))
    const descUntitled = ids(desc.filter((m) => m.title === null))
    expect(ascUntitled).toEqual([5, 10, 4, 8, 7, 2])
    expect(descUntitled).toEqual(ascUntitled)
  })

  it('sorts by marital status', () => {
    expect(api.listMembers({ sort: 'marital_status' }).map((m) => m.marital_status)).toEqual([
      'divorced',
      'divorced',
      'married',
      'married',
      'married',
      'prefer_not_to_say',
      'single',
      'single',
      'single',
      'widowed',
    ])
  })

  it('sorts by date of birth and puts undated records last', () => {
    // Undated records 3 and 8 tie, so they fall through to last-name then first.
    expect(ids(api.listMembers({ sort: 'date_of_birth' }))).toEqual([7, 1, 9, 4, 10, 6, 2, 5, 8, 3])
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
    const created = api.addMember({
      first_name: 'NoLast',
      gender: 'male',
      marital_status: 'single',
    })
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
      id: 11,
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
    expect(created.id).toBe(11)
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
