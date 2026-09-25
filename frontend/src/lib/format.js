export const GENDER_LABELS = {
  male: 'Male',
  female: 'Female',
  prefer_not_to_say: 'Prefer not to say',
}

export const MARITAL_STATUS_LABELS = {
  single: 'Single',
  married: 'Married',
  divorced: 'Divorced',
  widowed: 'Widowed',
  prefer_not_to_say: 'Prefer not to say',
}

export const GENDER_OPTIONS = Object.entries(GENDER_LABELS).map(([value, label]) => ({
  value,
  label,
}))

function parts(dateValue) {
  const [year, month, day] = dateValue.split('-').map(Number)
  return { year, month, day }
}

export function fullName(member) {
  return [member.first_name, member.middle_name, member.last_name]
    .filter(Boolean)
    .join(' ')
}

export function nameWithPrefix(member) {
  const suffix = member.suffix ? ` ${member.suffix}` : ''
  const title = member.title ? `${member.title} ` : ''
  return `${title}${fullName(member)}${suffix}`
}

export function displayName(member) {
  return member.preferred_name || fullName(member)
}

export function initials(member) {
  return [member.first_name, member.last_name]
    .filter(Boolean)
    .map((name) => name[0].toUpperCase())
    .join('')
}

export function genderLabel(member) {
  return GENDER_LABELS[member.gender] ?? 'Not recorded'
}

export function maritalStatusLabel(member) {
  return MARITAL_STATUS_LABELS[member.marital_status] ?? 'Not recorded'
}

export function formatDate(dateValue) {
  if (!dateValue) return null
  const { year, month, day } = parts(dateValue)
  return new Date(year, month - 1, day).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}

export function ageFrom(dateValue) {
  if (!dateValue) return null
  const { year, month, day } = parts(dateValue)
  const today = new Date()
  let age = today.getFullYear() - year
  const monthDelta = today.getMonth() - (month - 1)
  if (monthDelta < 0 || (monthDelta === 0 && today.getDate() < day)) {
    age -= 1
  }
  return age >= 0 ? age : null
}
