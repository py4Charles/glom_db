import { NavLink, Outlet } from 'react-router-dom'
import '../styles/AppShell.css'

const NAV_ITEMS = [{ to: '/members', label: 'Members' }]

export default function AppShell() {
  return (
    <div className="shell">
      <header className="shell__header">
        <div className="shell__bar">
          <NavLink to="/members" className="shell__brand">
            <span className="shell__mark" aria-hidden="true">
              G
            </span>
            <span className="shell__wordmark">Glom</span>
          </NavLink>
          <nav className="shell__nav" aria-label="Main">
            {NAV_ITEMS.map(item => (
              <NavLink
                key={item.to}
                to={item.to}
                className="shell__link"
                end={item.to === '/members'}
              >
                {item.label}
              </NavLink>
            ))}
          </nav>
        </div>
      </header>
      <main className="shell__main">
        <Outlet />
      </main>
    </div>
  )
}
