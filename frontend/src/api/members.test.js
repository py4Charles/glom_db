import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError, setAccessToken } from './client.js'
import {
  DEFAULT_DIRECTION,
  DEFAULT_SORT,
  addMember,
  countActiveFilters,
  deleteMember,
  getMember,
  listMembers,
  parseQuery,
  updateMember,
} from './members.js'

let fetchMock

function okResponse(payload) {
  return { ok: true, status: 200, json: async () => payload }
}

function errorResponse(status, payload) {
  return { ok: false, status, json: async () => payload }
}

function requestedUrl() {
  return fetchMock.mock.calls[0][0]
}

beforeEach(() => {
  fetchMock = vi.fn()
  vi.stubGlobal('fetch', fetchMock)
  setAccessToken(null)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('parseQuery', () => {
  it('falls back to the default sort and direction', () => {
    expect(parseQuery()).toEqual({
      search: '',
      gender: '',
      marital_status: '',
      title: '',
      sort: DEFAULT_SORT,
      direction: DEFAULT_DIRECTION,
    })
  })

  it('trims every text value', () => {
    const query = parseQuery({ search: '  smith  ', title: ' Rev. ' })
    expect(query.search).toBe('smith')
    expect(query.title).toBe('Rev.')
  })

  it('normalises enum casing', () => {
    expect(parseQuery({ gender: 'MALE' }).gender).toBe('male')
  })

  it('rejects unrecognised enum values and sort keys', () => {
    const query = parseQuery({ gender: 'nope', marital_status: 'nope', sort: 'nope' })
    expect(query.gender).toBe('')
    expect(query.marital_status).toBe('')
    expect(query.sort).toBe(DEFAULT_SORT)
  })

  it('rejects inherited object keys', () => {
    // 'constructor' is a real key on every object, so a naive membership test
    // would accept it and resolve to Object's constructor.
    for (const key of ['constructor', 'toString', 'hasOwnProperty', '__proto__']) {
      expect(parseQuery({ sort: key }).sort).toBe(DEFAULT_SORT)
      expect(parseQuery({ gender: key }).gender).toBe('')
      expect(parseQuery({ marital_status: key }).marital_status).toBe('')
    }
  })

  it('treats an unknown direction as ascending', () => {
    expect(parseQuery({ direction: 'sideways' }).direction).toBe('asc')
    expect(parseQuery({ direction: 'desc' }).direction).toBe('desc')
  })
})

describe('countActiveFilters', () => {
  it('counts only filters, not sort or direction', () => {
    expect(countActiveFilters(parseQuery({ sort: 'title', direction: 'desc' }))).toBe(0)
  })

  it('counts each active filter', () => {
    const query = parseQuery({ search: 'a', gender: 'male', title: 'Dr.' })
    expect(countActiveFilters(query)).toBe(3)
  })

  it('ignores unrecognised filter values', () => {
    expect(countActiveFilters(parseQuery({ gender: 'bogus' }))).toBe(0)
  })
})

describe('listMembers', () => {
  it('omits defaults from the query string', async () => {
    fetchMock.mockResolvedValue(okResponse({ members: [], total: 0, totalAll: 0 }))
    await listMembers(parseQuery({ search: 'smith' }))
    expect(requestedUrl()).toBe('/api/members?search=smith')
  })

  it('sends every recognised filter and sort key', async () => {
    fetchMock.mockResolvedValue(okResponse({ members: [], total: 0, totalAll: 0 }))
    await listMembers(
      parseQuery({
        search: 'smith',
        gender: 'male',
        marital_status: 'married',
        title: 'Rev.',
        sort: 'title',
        direction: 'desc',
      }),
    )
    const url = new URL(requestedUrl(), 'http://localhost')
    expect(Object.fromEntries(url.searchParams)).toEqual({
      search: 'smith',
      gender: 'male',
      marital_status: 'married',
      title: 'Rev.',
      sort: 'title',
      direction: 'desc',
    })
  })

  it('returns the server counts', async () => {
    fetchMock.mockResolvedValue(okResponse({ members: [{ id: 'a' }], total: 1, totalAll: 38 }))
    const result = await listMembers()
    expect(result).toEqual({ members: [{ id: 'a' }], total: 1, totalAll: 38 })
  })

  it('passes an abort signal through to fetch', async () => {
    fetchMock.mockResolvedValue(okResponse({ members: [], total: 0, totalAll: 0 }))
    const controller = new AbortController()
    await listMembers(parseQuery(), { signal: controller.signal })
    expect(fetchMock.mock.calls[0][1].signal).toBe(controller.signal)
  })
})

describe('writes', () => {
  it('encodes the member id into the path', async () => {
    fetchMock.mockResolvedValue(okResponse({ member: { id: 'abc' } }))
    await getMember('abc')
    expect(requestedUrl()).toBe('/api/members/abc')
  })

  it('posts JSON on create', async () => {
    fetchMock.mockResolvedValue(okResponse({ member: { id: 'abc' } }))
    await addMember({ first_name: 'Ada' })
    const [url, options] = fetchMock.mock.calls[0]
    expect(url).toBe('/api/members')
    expect(options.method).toBe('POST')
    expect(options.headers['Content-Type']).toBe('application/json')
    expect(JSON.parse(options.body)).toEqual({ first_name: 'Ada' })
  })

  it('patches on update', async () => {
    fetchMock.mockResolvedValue(okResponse({ member: { id: 'abc' } }))
    await updateMember('abc', { first_name: 'Ada' })
    expect(fetchMock.mock.calls[0][1].method).toBe('PATCH')
  })

  it('returns null for a 204 delete', async () => {
    fetchMock.mockResolvedValue({ ok: true, status: 204, json: async () => null })
    await expect(deleteMember('abc')).resolves.toBeNull()
  })
})

describe('errors', () => {
  it('surfaces the server error message', async () => {
    fetchMock.mockResolvedValue(errorResponse(400, { error: 'A required field was missing' }))
    await expect(getMember('abc')).rejects.toThrow('A required field was missing')
  })

  it('exposes the status code for 404 handling', async () => {
    fetchMock.mockResolvedValue(errorResponse(404, { error: 'Member not found' }))
    await expect(getMember('abc')).rejects.toBeInstanceOf(ApiError)
    await expect(getMember('abc')).rejects.toMatchObject({ status: 404 })
  })

  it('falls back to the status when the body is not JSON', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 502,
      json: async () => {
        throw new Error('not json')
      },
    })
    await expect(getMember('abc')).rejects.toThrow('Request failed (502)')
  })
})

describe('authorization', () => {
  it('omits the header when there is no token', async () => {
    fetchMock.mockResolvedValue(okResponse({ members: [], total: 0, totalAll: 0 }))
    await listMembers()
    expect(fetchMock.mock.calls[0][1].headers.Authorization).toBeUndefined()
  })

  it('attaches a bearer token when one is set', async () => {
    setAccessToken('token-123')
    fetchMock.mockResolvedValue(okResponse({ members: [], total: 0, totalAll: 0 }))
    await listMembers()
    expect(fetchMock.mock.calls[0][1].headers.Authorization).toBe('Bearer token-123')
  })
})
