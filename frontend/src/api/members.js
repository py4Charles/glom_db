import { GENDER_LABELS, MARITAL_STATUS_LABELS } from '../lib/format.js'
import { del, get, patch, post } from './client.js'

// This module keeps the query vocabulary the UI needs (options, parsing,
// active-filter counting) but no longer owns the data. The server re-validates
// everything the client sends, so this parsing exists to drive the controlled
// inputs and the "Clear filters" affordance -- never to be trusted as a gate.

export const SORT_OPTIONS = [
  { value: 'name', label: 'Name' },
  { value: 'title', label: 'Title' },
  { value: 'gender', label: 'Gender' },
  { value: 'marital_status', label: 'Marital status' },
  { value: 'date_of_birth', label: 'Date of birth' },
]

export const SORT_DIRECTIONS = [
  { value: 'asc', label: 'Ascending' },
  { value: 'desc', label: 'Descending' },
]

export const DEFAULT_SORT = 'name'
export const DEFAULT_DIRECTION = 'asc'

const SORT_KEYS = new Set(SORT_OPTIONS.map((option) => option.value))

function text(value) {
  if (value === null || value === undefined) return ''
  return String(value).trim()
}

function enumValue(value, labels) {
  const candidate = text(value).toLowerCase()
  return Object.hasOwn(labels, candidate) ? candidate : ''
}

export function parseQuery(params = {}) {
  const sort = text(params.sort)
  const direction = text(params.direction)

  return {
    search: text(params.search),
    gender: enumValue(params.gender, GENDER_LABELS),
    marital_status: enumValue(params.marital_status, MARITAL_STATUS_LABELS),
    title: text(params.title),
    sort: SORT_KEYS.has(sort) ? sort : DEFAULT_SORT,
    direction: direction === 'desc' ? 'desc' : DEFAULT_DIRECTION,
  }
}

export function countActiveFilters(query) {
  return [query.search, query.gender, query.marital_status, query.title].filter(Boolean).length
}

function toSearchParams(query) {
  const params = new URLSearchParams()
  if (query.search) params.set('search', query.search)
  if (query.gender) params.set('gender', query.gender)
  if (query.marital_status) params.set('marital_status', query.marital_status)
  if (query.title) params.set('title', query.title)
  if (query.sort !== DEFAULT_SORT) params.set('sort', query.sort)
  if (query.direction !== DEFAULT_DIRECTION) params.set('direction', query.direction)
  return params
}

export function listMembers(query = {}, { signal } = {}) {
  const params = toSearchParams(query)
  const search = params.toString()
  return get(`/members${search ? `?${search}` : ''}`, { signal }).then((payload) => ({
    members: payload.members,
    total: payload.total,
    totalAll: payload.totalAll,
  }))
}

export function getMember(id, options) {
  return get(`/members/${encodeURIComponent(id)}`, options).then((payload) => payload.member)
}

export function addMember(details) {
  return post('/members', details).then((payload) => payload.member)
}

export function updateMember(id, changes) {
  return patch(`/members/${encodeURIComponent(id)}`, changes).then((payload) => payload.member)
}

export function deleteMember(id) {
  return del(`/members/${encodeURIComponent(id)}`)
}
