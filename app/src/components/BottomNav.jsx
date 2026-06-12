import { NavLink } from 'react-router-dom'
import './BottomNav.css'

export default function BottomNav() {
  return (
    <nav className="bottom-nav">
      <NavLink to="/" end className={({ isActive }) => isActive ? 'nav-item active' : 'nav-item'}>
        <span className="nav-icon">🏠</span>
        <span>홈</span>
      </NavLink>
      <NavLink to="/places" className={({ isActive }) => isActive ? 'nav-item active' : 'nav-item'}>
        <span className="nav-icon">🧭</span>
        <span>내비게이션</span>
      </NavLink>
    </nav>
  )
}
