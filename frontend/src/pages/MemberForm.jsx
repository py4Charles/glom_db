import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { addMember, getMember, updateMember } from '../api/members.js'
import { GENDER_OPTIONS, MARITAL_STATUS_OPTIONS, fullName } from '../lib/format.js'
import '../styles/MemberForm.css'

const FIELDS = [
  { name: 'first_name', label: 'First name', required: true, autoComplete: 'given-name' },
  { name: 'middle_name', label: 'Middle name', autoComplete: 'additional-name' },
  { name: 'last_name', label: 'Last name', required: true, autoComplete: 'family-name' },
  { name: 'preferred_name', label: 'Preferred name', hint: 'How they like to be addressed' },
  { name: 'gender', label: 'Gender', type: 'select', options: GENDER_OPTIONS, required: true },
  {
    name: 'marital_status',
    label: 'Marital status',
    type: 'select',
    options: MARITAL_STATUS_OPTIONS,
    required: true,
  },
  { name: 'date_of_birth', label: 'Date of birth', type: 'date' },
  { name: 'phone_number', label: 'Phone number', type: 'tel', autoComplete: 'tel' },
  { name: 'title', label: 'Title', placeholder: 'Rev., Dr., Mrs.' },
  { name: 'suffix', label: 'Suffix', placeholder: 'Jr., III' },
  {
    name: 'photo_url',
    label: 'Photo URL',
    type: 'url',
    placeholder: 'https://…',
    full: true,
  },
]

function emptyForm() {
  return Object.fromEntries(FIELDS.map((field) => [field.name, '']))
}

function formFromMember(member) {
  return Object.fromEntries(FIELDS.map((field) => [field.name, member[field.name] ?? '']))
}

function validate(values) {
  const found = {}
  for (const field of FIELDS) {
    if (field.required && !values[field.name].trim()) {
      found[field.name] = `${field.label} is required`
    }
  }
  return found
}

function normalize(values) {
  return Object.fromEntries(
    Object.entries(values).map(([key, value]) => [key, value.trim() || null]),
  )
}

export default function MemberForm() {
  const { memberId } = useParams()
  const navigate = useNavigate()
  const isEdit = Boolean(memberId)
  const existing = isEdit ? getMember(memberId) : null

  const [values, setValues] = useState(() =>
    existing ? formFromMember(existing) : emptyForm(),
  )
  const [errors, setErrors] = useState({})

  if (isEdit && !existing) {
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

  const cancelPath = isEdit ? `/members/${memberId}` : '/members'

  function setField(name, value) {
    setValues((previous) => ({ ...previous, [name]: value }))
    setErrors((previous) =>
      previous[name] ? { ...previous, [name]: undefined } : previous,
    )
  }

  function handleSubmit(event) {
    event.preventDefault()
    const found = validate(values)
    setErrors(found)

    const invalid = FIELDS.find((field) => found[field.name])
    if (invalid) {
      document.getElementById(`member-${invalid.name}`)?.focus()
      return
    }

    const details = normalize(values)
    if (isEdit) {
      updateMember(memberId, details)
      navigate(`/members/${memberId}`)
    } else {
      const created = addMember(details)
      navigate(`/members/${created.id}`)
    }
  }

  return (
    <div className="page">
      <Link to={cancelPath} className="detail__back">
        <span aria-hidden="true">&larr;</span> {isEdit ? 'Back to member' : 'Back to members'}
      </Link>

      <div className="page__header">
        <div>
          <h1 className="page__title">{isEdit ? 'Edit member' : 'New member'}</h1>
          <p className="page__subtitle">
            {isEdit ? `Editing ${fullName(existing)}` : 'Add someone to the directory'}
          </p>
        </div>
      </div>

      <form className="card form" onSubmit={handleSubmit} noValidate>
        <div className="form__grid">
          {FIELDS.map((field) => {
            const error = errors[field.name]
            const errorId = `member-${field.name}-error`
            const hintId = `member-${field.name}-hint`
            const describedBy =
              [field.hint ? hintId : null, error ? errorId : null]
                .filter(Boolean)
                .join(' ') || undefined

            return (
              <div
                key={field.name}
                className={field.full ? 'field field--full' : 'field'}
              >
                <label className="field__label" htmlFor={`member-${field.name}`}>
                  {field.label}
                  {field.required && (
                    <span className="field__required" aria-hidden="true">
                      *
                    </span>
                  )}
                </label>

                {field.type === 'select' ? (
                  <select
                    id={`member-${field.name}`}
                    className="input"
                    value={values[field.name]}
                    aria-invalid={error ? 'true' : undefined}
                    aria-describedby={describedBy}
                    onChange={(event) => setField(field.name, event.target.value)}
                  >
                    <option value="">Select…</option>
                    {field.options.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    id={`member-${field.name}`}
                    className="input"
                    type={field.type ?? 'text'}
                    placeholder={field.placeholder}
                    autoComplete={field.autoComplete}
                    value={values[field.name]}
                    aria-invalid={error ? 'true' : undefined}
                    aria-describedby={describedBy}
                    onChange={(event) => setField(field.name, event.target.value)}
                  />
                )}

                {field.hint && (
                  <p className="field__hint" id={hintId}>
                    {field.hint}
                  </p>
                )}
                {error && (
                  <p className="field__error" id={errorId}>
                    {error}
                  </p>
                )}
              </div>
            )
          })}
        </div>

        <div className="form__actions">
          <button type="submit" className="btn btn--primary">
            {isEdit ? 'Save changes' : 'Add member'}
          </button>
          <Link to={cancelPath} className="btn btn--ghost">
            Cancel
          </Link>
        </div>
      </form>
    </div>
  )
}
