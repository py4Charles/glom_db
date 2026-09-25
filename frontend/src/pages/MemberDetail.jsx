import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ApiError } from '../api/client.js'
import { deleteMember, getMember } from '../api/members.js'
import Avatar from '../components/Avatar.jsx'
import {
  ageFrom,
  displayName,
  formatDate,
  fullName,
  genderLabel,
  maritalStatusLabel,
  nameWithPrefix,
} from '../lib/format.js'
import '../styles/MemberDetail.css'

function Row({ label, children }) {
  return (
    <div className="detail__row">
      <dt className="detail__label">{label}</dt>
      <dd className="detail__value">{children}</dd>
    </div>
  )
}

function NotRecorded() {
  return <span className="muted">Not recorded</span>
}

function Centered({ title, children }) {
  return (
    <div className="page">
      <div className="empty">
        <p className="empty__title">{title}</p>
        {children}
      </div>
    </div>
  )
}

export default function MemberDetail() {
  const { memberId } = useParams()
  const navigate = useNavigate()

  const [state, setState] = useState({
    key: null,
    status: 'loading',
    member: null,
    error: null,
  })
  const [deleting, setDeleting] = useState(false)

  useEffect(() => {
    const controller = new AbortController()

    getMember(memberId, { signal: controller.signal })
      .then((member) => {
        setState({ key: memberId, status: 'ready', member, error: null })
      })
      .catch((cause) => {
        if (cause.name === 'AbortError') return
        setState({
          key: memberId,
          status: cause instanceof ApiError && cause.status === 404 ? 'missing' : 'error',
          member: null,
          error: cause.message,
        })
      })

    return () => controller.abort()
  }, [memberId])

  // Derived, not stored: a response for a previous id is not current, and
  // setting state here would be a cascading render.
  const isStale = state.key !== memberId
  const status = isStale ? 'loading' : state.status
  const error = isStale ? null : state.error
  const member = state.member

  if (status === 'loading') {
    return <Centered title="Loading member…">{null}</Centered>
  }

  if (status === 'missing') {
    return (
      <Centered title="Member not found">
        <p className="empty__body">
          No member matches id <code>{memberId}</code>.
        </p>
        <Link to="/members" className="btn btn--primary">
          Back to members
        </Link>
      </Centered>
    )
  }

  if (status === 'error') {
    return (
      <Centered title="Could not load this member">
        <p className="empty__body">{error}</p>
        <Link to="/members" className="btn btn--primary">
          Back to members
        </Link>
      </Centered>
    )
  }

  const formattedDob = formatDate(member.date_of_birth)
  const age = ageFrom(member.date_of_birth)

  async function handleDelete() {
    const confirmed = window.confirm(
      `Delete ${nameWithPrefix(member)}? This cannot be undone.`,
    )
    if (!confirmed) return

    setDeleting(true)
    try {
      await deleteMember(member.id)
      navigate('/members')
    } catch (cause) {
      setState({ key: memberId, status: 'error', member, error: cause.message })
      setDeleting(false)
    }
  }

  return (
    <div className="page">
      <Link to="/members" className="detail__back">
        <span aria-hidden="true">&larr;</span> All members
      </Link>

      <div className="profile card">
        <Avatar member={member} size="xl" />
        <div className="profile__body">
          <h1 className="profile__name">{nameWithPrefix(member)}</h1>
          <p className="profile__subtitle">{fullName(member)}</p>
          <div className="profile__badges">
            <span className="badge" data-gender={member.gender}>
              {genderLabel(member)}
            </span>
            <span className="badge" data-status={member.marital_status}>
              {maritalStatusLabel(member)}
            </span>
            {member.suffix && <span className="badge">{member.suffix}</span>}
          </div>
        </div>
        <div className="profile__actions">
          <Link to={`/members/${member.id}/edit`} className="btn btn--primary">
            Edit
          </Link>
          <button
            type="button"
            className="btn btn--danger"
            onClick={handleDelete}
            disabled={deleting}
          >
            {deleting ? 'Deleting…' : 'Delete'}
          </button>
        </div>
      </div>

      <div className="detail__grid">
        <section className="card detail__card">
          <header className="detail__header">
            <h2 className="detail__title">Personal</h2>
          </header>
          <dl className="detail__list">
            <Row label="Full name">{nameWithPrefix(member)}</Row>
            <Row label="Preferred name">
              {member.preferred_name ?? <NotRecorded />}
            </Row>
            <Row label="Middle name">{member.middle_name ?? <NotRecorded />}</Row>
            <Row label="Date of birth">
              {formattedDob ? (
                <>
                  {formattedDob}
                  {age !== null && <span className="muted"> · {age} years old</span>}
                </>
              ) : (
                <NotRecorded />
              )}
            </Row>
            <Row label="Marital status">{maritalStatusLabel(member)}</Row>
          </dl>
        </section>

        <section className="card detail__card">
          <header className="detail__header">
            <h2 className="detail__title">Contact &amp; record</h2>
          </header>
          <dl className="detail__list">
            <Row label="Phone">
              {member.phone_number ? (
                <a href={`tel:${member.phone_number}`}>{member.phone_number}</a>
              ) : (
                <NotRecorded />
              )}
            </Row>
            <Row label="Photo">
              {member.photo_url ? (
                <span className="muted">On file</span>
              ) : (
                <NotRecorded />
              )}
            </Row>
            <Row label="Known as">
              {displayName(member) === fullName(member) ? (
                <NotRecorded />
              ) : (
                displayName(member)
              )}
            </Row>
            <Row label="Member id">
              <span className="detail__id">{member.id.slice(0, 8)}</span>
            </Row>
          </dl>
        </section>
      </div>
    </div>
  )
}
