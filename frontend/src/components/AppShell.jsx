import { NavLink, Outlet } from 'react-router-dom'
import '../styles/AppShell.css'

// const NAV_ITEMS = [{ to: '/members', label: 'Members' }]

export default function AppShell() {
  return (
    <div className="shell">
      <header className="shell__header">
        <div className="shell__bar">
          <NavLink to="/members" className="shell__brand">
            <span className="shell__mark" aria-hidden="true">
              G
            </span>
            <span className="shell__wordmark">Glom Data-house</span>
          </NavLink>
          {/* <nav className="shell__nav" aria-label="Main">
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
          </nav> */}
        </div>
      </header>
      <main className="shell__main">
        <Outlet />
      </main>
      <div className='footer__main'>
        <div className='footer__main__1'>
          <div className='footer__content'></div>
          <div className='footer__content__1'>
            <div className='footer__content__3'>
              <p> Global Life  Outreach Ministries</p>
              <div className='footer__content__2'>
                <div className='footer__content__4'>
                  <p> Privacy Policy</p>
                  <p> Terms of service</p>
                  <p> About</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div >
    </div>

  );
};
