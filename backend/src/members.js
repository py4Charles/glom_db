import { query } from './db.js'

// Every identifier below is a hardcoded literal. Nothing in this file
// interpolates a caller-supplied value into SQL: values are bound parameters,
// and sort keys are resolved through these maps. A sort key cannot be a bound
// parameter, which is exactly why it is an allowlist lookup rather than a
// fragment of the ORDER BY clause.

// Object.hasOwn is required, not optional: these are plain object literals, so
// 'constructor' in SORT_EXPRESSIONS is true and would resolve to Object's
// constructor instead of being rejected.
const SORT_EXPRESSIONS = {
  name: ['lower(last_name)', 'lower(first_name)'],
  title: ['lower(title)'],
  gender: ['lower(gender::text)'],
  marital_status: ['lower(marital_status::text)'],
  date_of_birth: ['date_of_birth'],
}

const DEFAULT_SORT = 'name'
const DIRECTIONS = new Set(['asc', 'desc'])

// Applied to every sort so ties, and the trailing null group, come out in the
// same order the client-side implementation produced.
const TIE_BREAKERS = ['lower(last_name)', 'lower(first_name)', 'id']

const SEARCH_COLUMNS = ['first_name', 'last_name', 'preferred_name']

const ENUM_TYPE_BY_FIELD = new Map([
  ['gender', 'gender_enum'],
  ['marital_status', 'marital_status_enum'],
])

// Must match the enum values created in the members migration. Exported so a
// test can assert this against the live database and catch drift.
export const ALLOWED_VALUES = new Map([
  ['gender', new Set(['male', 'female', 'prefer_not_to_say'])],
  [
    'marital_status',
    new Set(['single', 'married', 'divorced', 'widowed', 'prefer_not_to_say']),
  ],
])

const COLUMN_BY_FIELD = new Map([
  ['first_name', 'first_name'],
  ['middle_name', 'middle_name'],
  ['last_name', 'last_name'],
  ['preferred_name', 'preferred_name'],
  ['gender', 'gender'],
  ['marital_status', 'marital_status'],
  ['date_of_birth', 'date_of_birth'],
  ['phone_number', 'phone_number'],
  ['title', 'title'],
  ['suffix', 'suffix'],
  ['photo_url', 'photo_url'],
])

export class ValidationError extends Error {
  constructor(message, status = 400) {
    super(message)
    this.name = 'ValidationError'
    this.status = status
  }
}

function text(value) {
  if (value === null || value === undefined) return ''
  return String(value).trim()
}

function likePattern(value) {
  // %, _ and \ are LIKE metacharacters. Without escaping, a search for "%"
  // silently matches every row instead of reporting that nothing matched.
  return `%${value.toLowerCase().replace(/[\\%_]/g, (character) => `\\${character}`)}%`
}

function buildFilters(params) {
  const conditions = []
  const values = []

  const search = text(params.search)
  if (search) {
    values.push(likePattern(search))
    const placeholder = `$${values.length}`
    const matches = SEARCH_COLUMNS.map(
      (column) => `lower(${column}) like ${placeholder} escape '\\'`,
    )
    conditions.push(`(${matches.join(' or ')})`)
  }

  for (const field of ['gender', 'marital_status']) {
    const value = text(params[field]).toLowerCase()
    if (value && ALLOWED_VALUES.get(field).has(value)) {
      values.push(value)
      conditions.push(`${field} = $${values.length}::${ENUM_TYPE_BY_FIELD.get(field)}`)
    }
  }

  const title = text(params.title)
  if (title) {
    values.push(likePattern(title))
    conditions.push(`lower(title) like $${values.length} escape '\\'`)
  }

  return { where: conditions.length ? `where ${conditions.join(' and ')}` : '', values }
}

function buildOrderBy(sort, direction) {
  const key = Object.hasOwn(SORT_EXPRESSIONS, sort) ? sort : DEFAULT_SORT
  const dir = DIRECTIONS.has(direction) ? direction : 'asc'
  const primary = SORT_EXPRESSIONS[key]
  const terms = [...primary, ...TIE_BREAKERS.filter((term) => !primary.includes(term))]

  // Postgres defaults to NULLS LAST ascending but NULLS FIRST descending, so
  // the client-side rule of "untitled last in both directions" has to be stated
  // explicitly on every term.
  return terms.map((term) => `${term} ${dir} nulls last`).join(', ')
}

export async function listMembers(params = {}) {
  const { where, values } = buildFilters(params)
  const orderBy = buildOrderBy(params.sort, params.direction)
  const isFiltered = where !== ''

  const { rows } = await query(
    `select *, count(*) over ()::int as total_count
       from members
       ${where}
      order by ${orderBy}`,
    values,
  )

  const total = rows.length ? rows[0].total_count : 0

  // Only worth a second round trip when the two numbers can differ. When no
  // filter is active the filtered count is already the whole directory.
  let totalAll = total
  if (isFiltered) {
    const { rows: counts } = await query('select count(*)::int as total from members')
    totalAll = counts[0].total
  }

  return {
    members: rows.map(({ total_count: _ignored, ...member }) => member),
    total,
    totalAll,
  }
}

export async function getMember(id) {
  const { rows } = await query('select * from members where id = $1', [id])
  return rows[0] ?? null
}

function writableEntries(input) {
  const source = input && typeof input === 'object' ? input : {}
  const entries = []

  for (const [field, column] of COLUMN_BY_FIELD) {
    if (!Object.hasOwn(source, field)) continue
    const value = source[field]
    if (value === undefined) continue
    if (value !== null && typeof value !== 'string') {
      throw new ValidationError(`${field} must be a string`)
    }
    const trimmed = value === null ? null : value.trim()
    entries.push([column, trimmed === '' ? null : trimmed])
  }

  return entries
}

function placeholders(entries) {
  return entries.map(([column], index) => {
    const type = ENUM_TYPE_BY_FIELD.get(column)
    return type ? `$${index + 1}::${type}` : `$${index + 1}`
  })
}

export async function createMember(input) {
  const entries = writableEntries(input)
  if (entries.length === 0) throw new ValidationError('No writable fields supplied')

  const columns = entries.map(([column]) => column).join(', ')
  const { rows } = await query(
    `insert into members (${columns}) values (${placeholders(entries).join(', ')})
     returning *`,
    entries.map(([, value]) => value),
  )

  return rows[0]
}

export async function updateMember(id, input) {
  const entries = writableEntries(input)
  if (entries.length === 0) throw new ValidationError('No writable fields supplied')

  const assignments = entries.map(([column], index) => `${column} = $${index + 1}`).join(', ')
  const { rows } = await query(
    `update members set ${assignments} where id = $${entries.length + 1} returning *`,
    [...entries.map(([, value]) => value), id],
  )

  if (rows.length === 0) return null
  return rows[0]
}

export async function deleteMember(id) {
  const { rowCount } = await query('delete from members where id = $1', [id])
  return rowCount > 0
}

// Lets a test assert the hardcoded allowlists still match the database.
export async function readEnumValues() {
  const { rows } = await query(
    `select t.typname, e.enumlabel
       from pg_type t
       join pg_enum e on e.enumtypid = t.oid
      where t.typname = any($1)
      order by t.typname, e.enumsortorder`,
    [['gender_enum', 'marital_status_enum']],
  )

  const result = {}
  for (const { typname, enumlabel } of rows) {
    ;(result[typname] ??= []).push(enumlabel)
  }
  return result
}
