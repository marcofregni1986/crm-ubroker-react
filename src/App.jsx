import React from 'react';
import { BrowserRouter, Routes, Route, NavLink, Navigate } from 'react-router-dom';
import {
  LayoutDashboard,
  CalendarDays,
  Users,
  Network,
  BarChart3,
  Database as DatabaseIcon,
  Trophy,
  ShieldCheck,
  MessageCircle,
} from 'lucide-react';

function Shell({ children }) {
  return (
    <div className="app">
      {/* SIDEBAR */}
      <aside className="sidebar">
        <div className="sidebar-header">CRM uBroker</div>

        <div className="user-box">
          <div className="user-avatar">M</div>
          <div>
            <div className="user-info-name">Marco Fregni</div>
            <div className="user-info-sub">Tel: 3351605276</div>
          </div>
        </div>

        <ul className="nav">
          <li>
            <NavLink
              to="/dashboard"
              className={({ isActive }) => 'nav-link' + (isActive ? ' active' : '')}
            >
              <LayoutDashboard size={18} strokeWidth={1.8} />
              <span>Dashboard</span>
            </NavLink>
          </li>

          <li>
            <NavLink
              to="/appuntamenti"
              className={({ isActive }) => 'nav-link' + (isActive ? ' active' : '')}
            >
              <CalendarDays size={18} strokeWidth={1.8} />
              <span>Appuntamenti</span>
            </NavLink>
          </li>

          <li>
            <NavLink
              to="/stepone"
              className={({ isActive }) => 'nav-link' + (isActive ? ' active' : '')}
            >
              <Users size={18} strokeWidth={1.8} />
              <span>StepOne</span>
            </NavLink>
          </li>

          <li>
            <NavLink
              to="/struttura"
              className={({ isActive }) => 'nav-link' + (isActive ? ' active' : '')}
            >
              <Network size={18} strokeWidth={1.8} />
              <span>Struttura</span>
            </NavLink>
          </li>

          <li>
            <NavLink
              to="/kpi"
              className={({ isActive }) => 'nav-link' + (isActive ? ' active' : '')}
            >
              <BarChart3 size={18} strokeWidth={1.8} />
              <span>KPI Analytics</span>
            </NavLink>
          </li>

          <li>
            <NavLink
              to="/database"
              className={({ isActive }) => 'nav-link' + (isActive ? ' active' : '')}
            >
              <DatabaseIcon size={18} strokeWidth={1.8} />
              <span>Database</span>
            </NavLink>
          </li>

          <li>
            <NavLink
              to="/classifica"
              className={({ isActive }) => 'nav-link' + (isActive ? ' active' : '')}
            >
              <Trophy size={18} strokeWidth={1.8} />
              <span>Classifica</span>
            </NavLink>
          </li>

          <li>
            <NavLink
              to="/admin"
              className={({ isActive }) => 'nav-link' + (isActive ? ' active' : '')}
            >
              <ShieldCheck size={18} strokeWidth={1.8} />
              <span>Admin</span>
            </NavLink>
          </li>

          <li>
            <NavLink
              to="/forum"
              className={({ isActive }) => 'nav-link' + (isActive ? ' active' : '')}
            >
              <MessageCircle size={18} strokeWidth={1.8} />
              <span>Forum</span>
            </NavLink>
          </li>
        </ul>
      </aside>

      {/* CONTENUTO PRINCIPALE */}
      <main className="main">
        {children}
      </main>
    </div>
  );
}

function Dashboard() {
  return (
    <div>
      <div className="main-header">
        <div>
          <div className="main-title">Dashboard</div>
          <div className="main-subtitle">
            Qui ricostruiremo i widget e i KPI del CRM.
          </div>
        </div>
      </div>

      <div className="cards-grid">
        <div className="card">
          <div className="card-title">Appuntamenti di oggi</div>
          <div className="card-value">0</div>
        </div>
        <div className="card">
          <div className="card-title">Questa settimana</div>
          <div className="card-value">0</div>
        </div>
        <div className="card">
          <div className="card-title">Questo mese</div>
          <div className="card-value">0</div>
        </div>
      </div>
    </div>
  );
}

function SimplePage({ title }) {
  return (
    <div className="main-header">
      <div className="main-title">{title}</div>
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <Shell>
        <Routes>
          <Route path="/" element={<Navigate to="/dashboard" replace />} />
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/appuntamenti" element={<SimplePage title="Appuntamenti" />} />
          <Route path="/stepone" element={<SimplePage title="StepOne" />} />
          <Route path="/struttura" element={<SimplePage title="Struttura" />} />
          <Route path="/kpi" element={<SimplePage title="KPI Analytics" />} />
          <Route path="/database" element={<SimplePage title="Database" />} />
          <Route path="/classifica" element={<SimplePage title="Classifica" />} />
          <Route path="/admin" element={<SimplePage title="Admin" />} />
          <Route path="/forum" element={<SimplePage title="Forum" />} />
        </Routes>
      </Shell>
    </BrowserRouter>
  );
}
