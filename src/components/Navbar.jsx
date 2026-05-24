export default function Navbar({ onSearchFocus }) {
  return (
    <header className="navbar">
      <div className="nav-left">
        <button className="icon-btn" aria-label="Open menu">☰</button>
        <button className="global-search" onClick={onSearchFocus}>
          <span>⌕</span>
          <span>Search patients, appointments etc</span>
          <kbd>⌘K</kbd>
        </button>
      </div>

      <nav className="nav-links" aria-label="Main navigation">
        <a className="active" href="#dashboard">Dashboard</a>
        <a href="#team">Team</a>
        <a href="#projects">Projects</a>
        <a href="#calendar">Calendar</a>
      </nav>

      <div className="nav-profile">
        <button className="icon-btn" aria-label="Notifications">♡</button>
        <div className="doctor-avatar">DC</div>
        <div className="doctor-meta">
          <strong>Dr Cook</strong>
          <span>Staff Admin</span>
        </div>
        <span>⌄</span>
      </div>
    </header>
  );
}
