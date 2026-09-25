import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import {
  DEFAULT_SORT,
  SORT_DIRECTIONS,
  SORT_OPTIONS,
  countActiveFilters,
  listMembers,
  parseQuery,
} from '../api/members.js'
import Avatar from '../components/Avatar.jsx'
import {
  GENDER_OPTIONS,
  MARITAL_STATUS_OPTIONS,
  ageFrom,
  formatDate,
  fullName,
  genderLabel,
  maritalStatusLabel,
  nameWithPrefix,
} from '../lib/format.js'
import '../styles/MemberList.css'

const COLUMNS = ['Name', 'Phone', 'Gender', 'Marital status', 'Born']
const FILTER_PARAMS = ['q', 'gender', 'marital_status', 'title']
const EMPTY_RESULT = { members: [], total: 0, totalAll: 0 }

function bornLine(member) {
  const formatted = formatDate(member.date_of_birth)
  if (!formatted) return 'Not recorded'
  const age = ageFrom(member.date_of_birth)
  return age === null ? formatted : `${formatted} · ${age} yrs`
}

export default function MemberList() {
  const [searchParams, setSearchParams] = useSearchParams()
  const query = parseQuery({
    search: searchParams.get('q'),
    gender: searchParams.get('gender'),
    marital_status: searchParams.get('marital_status'),
    title: searchParams.get('title'),
    sort: searchParams.get('sort'),
    direction: searchParams.get('direction'),
  })
  const activeFilterCount = countActiveFilters(query)

  const [state, setState] = useState({
    key: null,
    status: 'loading',
    result: EMPTY_RESULT,
    error: null,
  })

  // A stable primitive key. Depending on `query` itself would refire on every
  // render, because parseQuery returns a fresh object each time.
  const requestKey = searchParams.toString()

  useEffect(() => {
    // Every keystroke starts a request, and responses can arrive out of order.
    // Aborting the previous one stops a slow earlier response from overwriting
    // a fast later one, which would otherwise show results for a stale query.
    const controller = new AbortController()

    listMembers(query, { signal: controller.signal })
      .then((result) => {
        setState({ key: requestKey, status: 'ready', result, error: null })
      })
      .catch((cause) => {
        if (cause.name === 'AbortError') return
        setState({ key: requestKey, status: 'error', result: EMPTY_RESULT, error: cause.message })
      })

    return () => controller.abort()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requestKey])

  // Derived rather than stored: while a newer request is in flight the previous
  // result is no longer current, so show loading instead of flashing stale rows.
  // Setting state here would be a cascading render, and setting it inside the
  // effect would render once with the old data first.
  const isStale = state.key !== requestKey
  const status = isStale ? 'loading' : state.status
  const error = isStale ? null : state.error
  const { members: visibleMembers, total, totalAll } = isStale ? EMPTY_RESULT : state.result

  function applyParams(changes) {
    const next = new URLSearchParams(searchParams)
    for (const [key, value] of Object.entries(changes)) {
      if (value) {
        next.set(key, value)
      } else {
        next.delete(key)
      }
    }
    setSearchParams(next, { replace: true })
  }

  function clearFilters() {
    const next = new URLSearchParams(searchParams)
    for (const key of FILTER_PARAMS) next.delete(key)
    setSearchParams(next, { replace: true })
  }

  function toggleDirection() {
    applyParams({ direction: query.direction === 'asc' ? 'desc' : 'asc' })
  }

  const directionLabel =
    SORT_DIRECTIONS.find((option) => option.value === query.direction)?.label ?? 'Ascending'
  const nextDirection = query.direction === 'asc' ? 'desc' : 'asc'
  const nextDirectionLabel =
    SORT_DIRECTIONS.find((option) => option.value === nextDirection)?.label ?? 'Descending'

  const isEmpty = status === 'ready' && visibleMembers.length === 0

  return (
    <div className="page">
      <div className="page__header">
        <div>
          <h1 className="page__title">Members</h1>
          <p className="page__subtitle" aria-live="polite">
            {status === 'loading' && !visibleMembers.length
              ? 'Loading members…'
              : status === 'error'
                ? 'Could not load members'
                : activeFilterCount > 0
                  ? `${total} of ${totalAll} members`
                  : `${totalAll} members on record`}
          </p>
        </div>
        <div className="page__actions">
          {activeFilterCount > 0 && (
            <button type="button" className="btn btn--ghost" onClick={clearFilters}>
              Clear filters
            </button>
          )}
          <Link to="/members/new" className="btn btn--primary">
            New member
          </Link>
        </div>
      </div>

      <form
        className="filters"
        role="search"
        onSubmit={(event) => event.preventDefault()}
      >
        <div className="field filters__search">
          <label className="field__label" htmlFor="member-search">
            Search
          </label>
          <input
            id="member-search"
            className="input"
            type="search"
            placeholder="Search by first, last, or preferred name"
            value={query.search}
            onChange={(event) => applyParams({ q: event.target.value })}
          />
        </div>

        <div className="field">
          <label className="field__label" htmlFor="gender-filter">
            Gender
          </label>
          <select
            id="gender-filter"
            className="input"
            value={query.gender}
            onChange={(event) => applyParams({ gender: event.target.value })}
          >
            <option value="">All</option>
            {GENDER_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>

        <div className="field">
          <label className="field__label" htmlFor="marital-status-filter">
            Marital status
          </label>
          <select
            id="marital-status-filter"
            className="input"
            value={query.marital_status}
            onChange={(event) => applyParams({ marital_status: event.target.value })}
          >
            <option value="">All</option>
            {MARITAL_STATUS_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>

        <div className="field">
          <label className="field__label" htmlFor="title-filter">
            Title
          </label>
          <input
            id="title-filter"
            className="input"
            type="search"
            placeholder="Rev., Dr., Mrs."
            value={query.title}
            onChange={(event) => applyParams({ title: event.target.value })}
          />
        </div>

        <div className="field filters__sort">
          <label className="field__label" htmlFor="sort-field">
            Sort by
          </label>
          <div className="filters__sort-controls">
            <select
              id="sort-field"
              className="input"
              value={query.sort}
              onChange={(event) =>
                applyParams({
                  sort: event.target.value === DEFAULT_SORT ? '' : event.target.value,
                })
              }
            >
              {SORT_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            <button
              type="button"
              className="btn"
              onClick={toggleDirection}
              aria-label={`Sort direction: ${directionLabel}. Switch to ${nextDirectionLabel}.`}
            >
              <span aria-hidden="true">{query.direction === 'asc' ? '↑' : '↓'}</span>{' '}
              {directionLabel}
            </button>
          </div>
        </div>
      </form>

      {status === 'error' ? (
        <div className="empty">
          <p className="empty__title">Could not load members</p>
          <p className="empty__body">{error}</p>
          <button
            type="button"
            className="btn"
            onClick={() => setSearchParams(searchParams, { replace: true })}
          >
            Try again
          </button>
        </div>
      ) : isEmpty ? (
        <div className="empty">
          <p className="empty__title">No members match those filters</p>
          <p className="empty__body">
            Try a different name, or clear the filters to see everyone on record.
          </p>
          <Link to="/members" className="btn">
            Reset filters
          </Link>
        </div>
      ) : (
        <div
          className="directory card"
          aria-busy={status === 'loading' ? 'true' : 'false'}
        >
          <div className="directory__head" aria-hidden="true">
            <span className="directory__col" data-column="avatar" />
            {COLUMNS.map((label, index) => (
              <span key={label} className="directory__col" data-column={index + 1}>
                {label}
              </span>
            ))}
          </div>
          <ul className="directory__body">
            {visibleMembers.map((member) => (
              <li key={member.id} className="directory__item">
                <Link
                  to={`/members/${member.id}`}
                  className="member-row"
                  aria-label={`${nameWithPrefix(member)} · ${genderLabel(member)} · ${maritalStatusLabel(member)}`}
                >
                  <Avatar member={member} />
                  <span className="member-row__name" data-column="1">
                    <span className="member-row__primary">
                      {member.preferred_name ?? member.first_name}
                      {member.preferred_name && (
                        <span className="member-row__alt">{fullName(member)}</span>
                      )}
                    </span>
                    {member.title && (
                      <span className="member-row__tagline">{member.title}</span>
                    )}
                  </span>
                  <span className="member-row__cell" data-column="2">
                    {member.phone_number ?? <span className="muted">None</span>}
                  </span>
                  <span className="member-row__cell" data-column="3">
                    <span className="badge" data-gender={member.gender}>
                      {genderLabel(member)}
                    </span>
                  </span>
                  <span className="member-row__cell" data-column="4">
                    {maritalStatusLabel(member)}
                  </span>
                  <span className="member-row__cell" data-column="5">
                    {bornLine(member)}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
