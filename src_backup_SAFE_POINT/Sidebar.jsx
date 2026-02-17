// src/components/Sidebar.jsx
import React, { useMemo } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import {
  LayoutDashboard,
  CalendarClock,
  ListTodo,
  Users,
  Target,
  BarChart3,
  Database,
  ShieldCheck,
  Settings,
  LogOut,
  X,
} from "lucide-react";

// ✅ Auth (profilo Firestore)
// Se nel tuo progetto importi useAuth da "../auth/AuthProvider", cambia SOLO questa riga:
import { useAuth } from "../auth/useAuth";

// ✅ Firebase logout
import { auth } from "../firebase";
import { signOut } from "firebase/auth";

/**
 * Sidebar unica del CRM
 * - Supporta mobile open/close
 * - User box prende dati REALI da Firestore (users/{uid})
 * - Telefono: fallback su campi alternativi e, se mancante nei doc vecchi, su crm_session.phone (solo UI)
 */

const baseNavItems = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { to: "/appuntamenti", label: "Appuntamenti", icon: CalendarClock },
  { to: "/lista-nomi", label: "Lista Nomi", icon: ListTodo },
  { to: "/clienti", label: "Clienti", icon: Users },
  { to: "/obiettivi", label: "Obiettivi", icon: Target },
  { to: "/kpi", label: "KPI", icon: BarChart3 },
  { to: "/database", label: "Database", icon: Database },
];

export default function Sidebar({
  sidebarOpen = false,
  onClose = () => { },
  onNavigate = () => { },
}) {
  const nav = useNavigate();
  const { profile, firebaseUser, loading, isAdmin } = useAuth();

  const navItems = useMemo(() => {
    const items = [...baseNavItems];
    if (isAdmin) items.push({ to: "/admin", label: "Admin", icon: ShieldCheck });
    return items;
  }, [isAdmin]);

  const name = useMemo(() => {
    const n = String(profile?.nome || profile?.name || "").trim();
    const c = String(profile?.cognome || "").trim();
    const full = (n + " " + c).trim();
    return full || firebaseUser?.email || "Utente";
  }, [profile, firebaseUser]);

  // ✅ TELEFONO con fallback robusto (doc vecchi)
  const phone = useMemo(() => {
    const p =
      String(profile?.telefono || "").trim() ||
      String(profile?.phone || "").trim() ||
      String(profile?.tel || "").trim() ||
      String(profile?.phoneNumber || "").trim();

    if (p) return p;

    // fallback UI: se alcuni utenti vecchi non hanno telefono nel doc
    try {
      const s = JSON.parse(localStorage.getItem("crm_session") || "{}");
      return String(s?.phone || "").trim();
    } catch {
      return "";
    }
  }, [profile]);

  const initial = useMemo(() => (name || "U").slice(0, 1).toUpperCase(), [name]);

  async function handleLogout() {
    try {
      await signOut(auth);
    } catch (e) {
      console.warn("Logout Firebase fallito:", e);
    } finally {
      localStorage.removeItem("crm_session");
      onClose();
      onNavigate();
      nav("/login");
    }
  }

  return (
    <aside className={"sidebar" + (sidebarOpen ? " open" : "")}>
      <div className="sidebar-header">
        <div className="sidebar-logo">CRM uBroker</div>

        {/* Bottone chiusura (visibile solo mobile via CSS .sidebar-close) */}
        <button
          className="sidebar-close"
          onClick={onClose}
          type="button"
          aria-label="Chiudi menu"
        >
          <X size={22} />
        </button>
      </div>

      {/* ✅ USER BOX */}
      <div className="user-box">
        <div className="user-avatar">{loading ? "…" : initial}</div>
        <div>
          <div className="user-info-name">{loading ? "Caricamento…" : name}</div>
          <div className="user-info-sub">
            {loading ? "Tel: —" : phone ? `Tel: ${phone}` : "Tel: —"}
          </div>
        </div>
      </div>

      <ul className="nav">
        {navItems.map(({ to, label, icon: Icon }) => (
          <li key={to} className="nav-item">
            <NavLink
              to={to}
              className={({ isActive }) =>
                "nav-link" + (isActive ? " active" : "")
              }
              onClick={() => {
                onNavigate();
                onClose();
              }}
            >
              <span className="nav-icon">
                <Icon size={18} strokeWidth={1.8} />
              </span>
              <span className="nav-label">{label}</span>
            </NavLink>
          </li>
        ))}
      </ul>

      <div className="sidebar-footer">
        {/* Se vuoi rendere questo un link reale: sostituisci con <NavLink to="/impostazioni" ...> */}
        <button className="nav-link nav-link-ghost" type="button">
          <span className="nav-icon">
            <Settings size={18} strokeWidth={1.8} />
          </span>
          <span className="nav-label">Impostazioni</span>
        </button>

        <button
          className="btn-logout"
          id="btnLogout"
          type="button"
          onClick={handleLogout}
        >
          <LogOut size={18} />
          <span>Esci</span>
        </button>
      </div>
    </aside>
  );
}
