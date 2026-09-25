import { GENDER_LABELS, MARITAL_STATUS_LABELS } from '../lib/format.js'
import { members } from './mockApi/data.js'

const WRITABLE_FIELDS = [
  'first_name',
  'middle_name',
  'last_name',
  'preferred_name',
  'gender',
  'marital_status',
  'date_of_birth',
  'phone_number',
  'title',
  'suffix',
  'photo_url',
]

const REQUIRED_FIELDS = ['first_name', 'last_name', 'gender', 'marital_status']

const ENUM_FIELDS = {
  gender: GENDER_LABELS,
  marital_status: MARITAL_STATUS_LABELS,
}

const SEARCH_FIELDS = ['first_name', 'last_name', 'preferred_name']

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

const SORT_FIELDS = {
  name: (member) => [member.last_name, member.first_name].filter(Boolean).join(' '),
  title: (member) => member.title,
  gender: (member) => member.gender,
  marital_status: (member) => member.marital_status,
  date_of_birth: (member) => member.date_of_birth,
}

function text(value) {
  if (value === null || value === undefined) return ''
  return String(value).trim()
}

function isBlank(value) {
  return text(value) === ''
}

function enumValue(value, labels) {
  const candidate = text(value).toLowerCase()
  return candidate in labels ? candidate : ''
}

function compareText(left, right) {
  return String(left).localeCompare(String(right), undefined, {
    numeric: true,
    sensitivity: 'base',
  })
}

export function parseQuery(params = {}) {
  const sort = text(params.sort)
  const direction = text(params.direction)

  return {
    search: text(params.search),
    gender: enumValue(params.gender, GENDER_LABELS),
    marital_status: enumValue(params.marital_status, MARITAL_STATUS_LABELS),
    title: text(params.title),
    sort: sort in SORT_FIELDS ? sort : DEFAULT_SORT,
    direction: direction === 'desc' ? 'desc' : 'asc',
  }
}

export function countActiveFilters(query) {
  return [query.search, query.gender, query.marital_status, query.title].filter(Boolean).length
}

function tieBreak(left, right) {
  const byLast = compareText(text(left.last_name), text(right.last_name))
  if (byLast !== 0) return byLast
  const byFirst = compareText(text(left.first_name), text(right.first_name))
  if (byFirst !== 0) return byFirst
  return left.id - right.id
}

function compareBySort(sort, direction) {
  const read = SORT_FIELDS[sort]
  const sign = direction === 'desc' ? -1 : 1

  return (left, right) => {
    const leftValue = read(left)
    const rightValue = read(right)
    const leftMissing = isBlank(leftValue)
    const rightMissing = isBlank(rightValue)

    // Missing values stay anchored last in both directions; the sign applies
    // only to the populated group, so flipping direction still visibly moves it.
    if (leftMissing || rightMissing) {
      if (leftMissing && rightMissing) return tieBreak(left, right)
      return leftMissing ? 1 : -1
    }

    const result = compareText(leftValue, rightValue)
    return result === 0 ? tieBreak(left, right) : result * sign
  }
}

function matchesFilters(member, query) {
  const needle = query.search.toLowerCase()
  if (needle && !SEARCH_FIELDS.some((field) => text(member[field]).toLowerCase().includes(needle))) {
    return false
  }
  if (query.gender && member.gender !== query.gender) return false
  if (query.marital_status && member.marital_status !== query.marital_status) return false
  // A member with no title is not relevant to a title search, per product rule.
  if (query.title && !text(member.title).toLowerCase().includes(query.title.toLowerCase())) {
    return false
  }
  return true
}

export function listMembers(params = {}) {
  const query = parseQuery(params)

  return members
    .filter((member) => matchesFilters(member, query))
    .sort(compareBySort(query.sort, query.direction))
    .map((member) => ({ ...member }))
}

function sanitize(details) {
  const source = details && typeof details === 'object' ? details : {}
  const record = {}

  for (const field of WRITABLE_FIELDS) {
    const value = source[field]
    if (value === undefined) continue
    const trimmed = text(value)
    record[field] = trimmed === '' ? null : trimmed
  }

  for (const field of Object.keys(ENUM_FIELDS)) {
    if (record[field] === null || record[field] === undefined) continue
    record[field] = text(record[field]).toLowerCase()
  }

  return record
}

function isValid(record) {
  if (REQUIRED_FIELDS.some((field) => isBlank(record[field]))) return false
  return Object.entries(ENUM_FIELDS).every(
    ([field, labels]) => record[field] === undefined || record[field] === null || record[field] in labels,
  )
}

export function getMember(id) {
  const member = members.find((candidate) => candidate.id === Number(id))
  return member ? { ...member } : null
}

export function addMember(details) {
  const record = sanitize(details)
  if (!isValid(record)) return null

  const id = members.reduce((highest, member) => Math.max(highest, member.id), 0) + 1
  const created = { ...record, id }
  members.push(created)
  return { ...created }
}

export function updateMember(id, changes) {
  const index = members.findIndex((member) => member.id === Number(id))
  if (index === -1) return null

  const merged = sanitize({ ...members[index], ...changes })
  if (!isValid(merged)) return null

  members[index] = { ...merged, id: members[index].id }
  return { ...members[index] }
}

export function deleteMember(id) {
  const index = members.findIndex((member) => member.id === Number(id))
  if (index === -1) return false
  members.splice(index, 1)
  return true
}
