import { Link, useParams } from 'react-router-dom'
import { getMember } from '../api/members.js'
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
import './MemberDetail.css'

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

export default function MemberDetail() {
  const { memberId } = useParams()
  const member = getMember(memberId)

  if (!member) {
    return (
      <div className="page">
        <div className="empty">
          <p className="empty__title">Member not found</p>
          <p className="empty__body">
            No member matches id <code>{memberId}</code>.
          </p>
          <Link to="/members" className="btn btn--primary">
            Back to members
          </Link>
        </div>
      </div>
    )
  }

  const formattedDob = formatDate(member.date_of_birth)
  const age = ageFrom(member.date_of_birth)

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
              <span className="detail__id">#{member.id}</span>
            </Row>
          </dl>
        </section>
      </div>
    </div>
  )
}
