import { Navigate, Route, Routes } from 'react-router-dom'
import AppShell from './components/AppShell.jsx'
import MemberDetail from './pages/MemberDetail.jsx'
import MemberForm from './pages/MemberForm.jsx'
import MemberList from './pages/MemberList.jsx'

export default function App() {
  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route index element={<Navigate to="/members" replace />} />
        <Route path="/members" element={<MemberList />} />
        <Route path="/members/new" element={<MemberForm />} />
        <Route path="/members/:memberId" element={<MemberDetail />} />
        <Route path="/members/:memberId/edit" element={<MemberForm />} />
        <Route path="*" element={<Navigate to="/members" replace />} />
      </Route>
    </Routes>
  )
}
