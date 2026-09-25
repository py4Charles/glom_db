import { useMemo } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { listMembers } from '../api/members.js'
import Avatar from '../components/Avatar.jsx'
import {
  GENDER_OPTIONS,
  ageFrom,
  formatDate,
  fullName,
  genderLabel,
  maritalStatusLabel,
  nameWithPrefix,
} from '../lib/format.js'
import '../styles/MemberList.css'

const COLUMNS = ['Name', 'Phone', 'Gender', 'Marital status', 'Born']

function bornLine(member) {
  const formatted = formatDate(member.date_of_birth)
  if (!formatted) return 'Not recorded'
  const age = ageFrom(member.date_of_birth)
  return age === null ? formatted : `${formatted} · ${age} yrs`
}

export default function MemberList() {
  const [searchParams, setSearchParams] = useSearchParams()
  const search = searchParams.get('q') ?? ''
  const gender = searchParams.get('gender') ?? ''
  const hasFilters = Boolean(search || gender)

  const visibleMembers = useMemo(
    () => listMembers({ search, gender }),
    [search, gender],
  )
  const totalCount = useMemo(() => listMembers().length, [])

  function setParam(key, value) {
    const next = new URLSearchParams(searchParams)
    if (value) {
      next.set(key, value)
    } else {
      next.delete(key)
    }
    setSearchParams(next, { replace: true })
  }

  return (
    <div className="page">
      <div className="page__header">
        <div>
          <h1 className="page__title">Members</h1>
          <p className="page__subtitle">
            {hasFilters
              ? `${visibleMembers.length} of ${totalCount} members`
              : `${totalCount} members on record`}
          </p>
        </div>
        {hasFilters && (
          <Link to="/members" className="btn btn--ghost">
            Clear filters
          </Link>
        )}
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
            placeholder="Search by first or last name"
            value={search}
            onChange={(event) => setParam('q', event.target.value)}
          />
        </div>
        <div className="field filters__gender">
          <label className="field__label" htmlFor="gender-filter">
            Gender
          </label>
          <select
            id="gender-filter"
            className="input"
            value={gender}
            onChange={(event) => setParam('gender', event.target.value)}
          >
            <option value="">All</option>
            {GENDER_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
      </form>

      {visibleMembers.length === 0 ? (
        <div className="empty">
          <p className="empty__title">No members match those filters</p>
          <p className="empty__body">
            Try a different name, or reset the gender filter to see everyone on
            record.
          </p>
          <Link to="/members" className="btn">
            Reset filters
          </Link>
        </div>
      ) : (
        <div className="directory card">
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
