import { members } from "./mockApi/data";

export function listMembers(params = {search: "Smith"}) {
    return members
        .filter(m => (!(params.gender) || params.gender === m.gender) && (!(params.search) || params.search === m.first_name.toLowerCase().includes(params().toLowerCase())))
        .sort((a, b) => a.first_name < b.first_name ? -1 : a.first_name > b.first_name ? 1 : 0)
}