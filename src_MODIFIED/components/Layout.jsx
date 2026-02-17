import { NavLink, Outlet } from "react-router-dom";
import ThemeSwitcher from "./ThemeSwitcher";

export default function Layout({ user }) {
  return (
    <div className="app">
      {/* Topbar mobile */}
      <div className="topbar-mobile">
        <div className="topbar-title">CRM uBroker</div>
        <button className="btn-menu" id="btnOpenMenu">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="2"
              d="M4 6h16M4 12h16M4 18h16"
            />
          </svg>
        </button>
      </div>

      {/* Sidebar */}
      <aside className="sidebar" id="sidebar">
        <div className="sidebar-header">
          <div className="sidebar-logo">CRM uBroker - TEST LAYOUT</div>
          <button className="sidebar-close" id="btnCloseMenu">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>

        {/* User box */}
        <div className="user-box">
          <div className="user-avatar">
            {user?.displayName?.[0]?.toUpperCase() || "U"}
          </div>
          <div>
            <div className="user-info-name">
              {user?.displayName || "Utente"}
            </div>
            <div className="user-info-sub">Collaboratore</div>
          </div>
        </div>

        {/* NAV */}
        <ul className="nav">
          <li className="nav-item">
            <NavLink
              to="/dashboard"
              className={({ isActive }) =>
                "nav-link" + (isActive ? " active" : "")
              }
            >
              <span>Dashboard</span>
            </NavLink>
          </li>

          <li className="nav-item">
            <NavLink
              to="/profilo"
              className={({ isActive }) =>
                "nav-link" + (isActive ? " active" : "")
              }
            >
              <span>Profilo</span>
            </NavLink>
          </li>

          <li className="nav-item">
            <NavLink
              to="/appuntamenti"
              className={({ isActive }) =>
                "nav-link" + (isActive ? " active" : "")
              }
            >
              <span>Appuntamenti</span>
            </NavLink>
          </li>

          {/* ✅ LISTA NOMI – INSERITA QUI */}
          <li className="nav-item">
            <NavLink
              to="/lista-nomi"
              className={({ isActive }) =>
                "nav-link" + (isActive ? " active" : "")
              }
            >
              <span>Lista Nomi</span>
            </NavLink>
          </li>

          <li className="nav-item">
            <NavLink
              to="/stepone"
              className={({ isActive }) =>
                "nav-link" + (isActive ? " active" : "")
              }
            >
              <span>StepOne</span>
            </NavLink>
          </li>

          <li className="nav-item">
            <NavLink
              to="/struttura"
              className={({ isActive }) =>
                "nav-link" + (isActive ? " active" : "")
              }
            >
              <span>Struttura</span>
            </NavLink>
          </li>

          <li className="nav-item">
            <NavLink
              to="/database"
              className={({ isActive }) =>
                "nav-link" + (isActive ? " active" : "")
              }
            >
              <span>Database</span>
            </NavLink>
          </li>

          <li className="nav-item">
            <NavLink
              to="/admin"
              className={({ isActive }) =>
                "nav-link" + (isActive ? " active" : "")
              }
            >
              <span>Admin</span>
            </NavLink>
          </li>
        </ul>

        {/* Footer */}
        <div className="sidebar-footer">
          <button className="btn-logout">
            <span>Esci</span>
          </button>
        </div>
      </aside>

      {/* Contenuto principale */}
      <main className="main">
        <Outlet />
      </main>

      {/* ✅ THEME SWITCHER (Float) */}
      <ThemeSwitcher />
    </div>
  );
}
