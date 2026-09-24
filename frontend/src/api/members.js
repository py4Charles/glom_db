import { members } from "./mockApi/data.js"

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