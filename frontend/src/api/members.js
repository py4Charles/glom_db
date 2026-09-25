import { members } from "./mockApi/data.js"

export function getMember(id) {
  return members.find(m => m.id === Number(id)) ?? null
}

export function addMember(details) {
  const id = members.reduce((highest, m) => Math.max(highest, m.id), 0) + 1
  const record = { ...details, id }
  members.push(record)
  return record
}

export function updateMember(id, changes) {
  const index = members.findIndex(m => m.id === Number(id))
  if (index === -1) return null
  const updated = { ...members[index], ...changes, id: members[index].id }
  members[index] = updated
  return updated
}

export function deleteMember(id) {
  const index = members.findIndex(m => m.id === Number(id))
  if (index === -1) return false
  members.splice(index, 1)
  return true
}

export function listMembers(params = {}) {
  return members
    .filter(m => {
      const genderOk = !params.gender || params.gender === m.gender
      const searchOk =
        !params.search ||
        m.first_name.toLowerCase().includes(String(params.search).toLowerCase()) ||
        m.last_name.toLowerCase().includes(String(params.search).toLowerCase())
      return genderOk && searchOk
    })
    .sort((a, b) =>
      a.first_name < b.first_name ? -1
      : a.first_name > b.first_name ? 1
      : 0
    )
}