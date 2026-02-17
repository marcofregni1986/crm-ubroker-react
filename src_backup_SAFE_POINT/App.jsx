// src/App.jsx
import React, { useEffect, useMemo, useState } from "react";
import {
  BrowserRouter,
  NavLink,
  Routes,
  Route,
  Navigate,
  useLocation,
  useNavigate,
} from "react-router-dom";

// ✅ AUTH PAGES
import LoginPage from "./pages/LoginPage";
import RegisterPage from "./pages/RegisterPage";
import ConnectCalendarPage from "./pages/ConnectCalendarPage"; // ✅ [NEW]
import GoogleConsentPage from "./pages/GoogleConsentPage";
import TermsPage from "./pages/TermsPage"; // [NEW]
import PresentationPage from "./pages/PresentationPage";
import PresentationTheater from "./pages/PresentationTheater";
// ✅ UNIVERSITY (nel tuo progetto è: src/pages/University.jsx)
// IMPORTANTE: assicurati che esista SOLO questo file (University.jsx). Se hai anche src/pages/university.jsx, eliminalo o rinominalo, altrimenti Windows può creare conflitti.
import University from "./pages/University.jsx";

// Pagine reali
import Dashboard from "./pages/dashboard.jsx";
import Dashboard2 from "./pages/Dashboard2.jsx"; // ✅ [NEW] Prototype Dashboard
import RiseAiPage from "./pages/RiseAiPage"; // ✅ Rise AI
import StepOnePage from "./pages/StepOnePage";
import StrutturaPage from "./pages/StrutturaPage";
import { lazy } from "react";
const ListaNomiPage = lazy(() => import("./pages/ListaNomiPage"));
const KanbanPage = lazy(() => import("./pages/KanbanPage")); // [NEW] Kanban POC
import SwipeTestPage from "./pages/SwipeTestPage";

// ✅ FIX IMPORT: case + nome file corretto
import AppuntamentiPage from "./pages/Appuntamentipage";
import KpiAnalyticsPage from "./pages/KpiAnalyticsPage";
import DatabasePage from "./pages/DatabasePage";
import ClassificaPage from "./pages/ClassificaPage";
import AdminPage from "./pages/AdminPage";
import ForumPage from "./pages/ForumPage.jsx";
import ImpostazioniPage from "./pages/ImpostazioniPage";
import PublicCardPage from "./pages/PublicCardPage"; // ✅ Import Public Card
import PreviewPage from "./pages/PreviewPage"; // ✅ New Preview Page
import ProfilePage from "./pages/ProfilePage";


// ✅ Auth context (Firebase)
import { useAuth } from "./auth/useAuth";

// ✅ App Update Push (Firestore appMeta/update)
import { useAppUpdate } from "./update/useAppUpdate";

// ✅ Toast
import { ToastProvider } from "./context/ToastContext";

// ✅ Firebase logout
import { auth } from "./firebase";
import { signOut } from "firebase/auth";

// Icone lucide-react
import {
  LayoutDashboard,
  CalendarClock,
  CalendarDays,
  Users,
  User, // ✅ User icon
  Bot, // ✅ Bot Icon
  ListTodo,
  BarChart3,
  Database,
  Medal,
  Shield,
  ShieldCheck,
  MessageSquareText,
  Settings,
  LogOut,
  GraduationCap, // ✅ icon per University
  QrCode,
} from "lucide-react";

import ChatWidget from "./components/ChatWidget";
import DigitalBusinessCard from "./components/DigitalBusinessCard";
import PwaReloadPrompt from "./components/PwaReloadPrompt"; // ✅ [NEW] PWA Prompt


/**
 * NOTE IMPORTANTI
 * 1) Questo file era in modalità "mock" e mostrava SEMPRE il telefono di mockUser.
 * 2) Ora:
 *    - Sidebar usa i dati REALI da Firestore (profile) se presenti
 *    - fallback su crm_session (localStorage/sessionStorage) SOLO se profile non è pronto
 * 3) Permissions: se nel profilo esistono (profile.permissions) li usiamo, altrimenti fallback mock.
 */

// Permessi fallback (se non li hai ancora nel profilo)
const fallbackPermissions = {

  canSeeStepOne: true,
  canAccessAppointmentsPage: true,
  canAccessStructurePage: true,
  canSeeKpiPage: true,
  canAccessDatabasePage: true,
  canSeeClassificaPage: true,
  canAccessForumPage: true,
  isAdmin: false,
};

// NAV ITEMS con permissionKey (se null => sempre visibile)
const NAV_ITEMS = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard, permissionKey: null },
  { to: "/profilo", label: "Profilo", icon: User, permissionKey: null }, // ✅ Moved up
  { to: "/appuntamenti", label: "Appuntamenti", icon: CalendarClock, permissionKey: "canAccessAppointmentsPage" },

  // ✅ APP COLLABORATORI (Link Esterno)
  {
    to: "https://singularity.ubroker.it/login",
    label: "App Collaboratori",
    icon: null, // No standard icon needed when imgIcon is present
    imgIcon: "/icon-collaboratori.png",
    permissionKey: null,
    external: true
  },

  { to: "/lista-nomi", label: "Lista Nomi", icon: ListTodo, permissionKey: null },
  { to: "/stepone", label: "StepOne", icon: CalendarDays, permissionKey: "canSeeStepOne" },
  { to: "/struttura", label: "Struttura", icon: Users, permissionKey: "canAccessStructurePage" },
  { to: "/kpi", label: "KPI Analytics", icon: BarChart3, permissionKey: "canSeeKpiPage" },
  { to: "/database", label: "Database", icon: Database, permissionKey: "canAccessDatabasePage" },
  { to: "/classifica", label: "Classifica", icon: Medal, permissionKey: "canSeeClassificaPage" },

  // ✅ UNIVERSITY (visibile a tutti; se vuoi limitarla, aggiungiamo un permissionKey dedicato)
  { to: "/university", label: "University", icon: GraduationCap, permissionKey: null },

  { to: "/impostazioni", label: "Impostazioni", icon: Settings, permissionKey: null },
  { to: "/admin", label: "Admin", icon: ShieldCheck, permissionKey: "isAdmin" },
  { to: "/forum", label: "Forum", icon: MessageSquareText, permissionKey: "canAccessForumPage" },

  // ✅ RISE AI (New)
  { to: "/rise-ai", label: "Rise AI Coach", icon: Bot, permissionKey: null },

];

function getAvatarLetter(user) {
  const s = String(user?.nome || user?.cognome || user?.name || "U").trim();
  return (s[0] || "U").toUpperCase();
}

/** =========================================================
 *  SESSION HELPERS (fallback)
 *  ========================================================= */
function readSession() {
  const a = localStorage.getItem("crm_session");
  if (a) {
    try { return JSON.parse(a); } catch { /* ignore */ }
  }
  const b = sessionStorage.getItem("crm_session");
  if (b) {
    try { return JSON.parse(b); } catch { /* ignore */ }
  }
  return null;
}

/** =========================================================
 *  LAYOUT (SHELL)
 *  ========================================================= */
function Shell({ children, user, permissions }) {
  const { isAdmin } = useAuth();
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [businessCardOpen, setBusinessCardOpen] = useState(false);

  const closeSidebar = () => setSidebarOpen(false);
  const openSidebar = () => setSidebarOpen(true);

  // ✅ ESC chiude + blocco scroll body in mobile
  useEffect(() => {
    const onKeyDown = (e) => {
      if (e.key === "Escape") closeSidebar();
    };
    window.addEventListener("keydown", onKeyDown);

    // document.body.style.overflow = sidebarOpen ? "hidden" : "";
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      // document.body.style.overflow = "";
    };
  }, [sidebarOpen]);

  const navItemsVisible = useMemo(() => {
    return NAV_ITEMS.filter((it) => {
      // ✅ EXTRA SAFETY: Se isAdmin dal contesto è true, forziamo la visibilità del link Admin
      if (it.to === "/admin" && isAdmin) return true;

      if (!it.permissionKey) return true;
      return !!permissions?.[it.permissionKey];
    });
  }, [permissions, isAdmin]);

  async function handleLogout() {
    try {
      await signOut(auth);
    } catch (e) {
      console.warn("Logout Firebase fallito:", e);
    } finally {
      localStorage.removeItem("crm_session");
      sessionStorage.removeItem("crm_session");
      window.location.href = "/login";
    }
  }



  return (
    <>
      {/* TOPBAR MOBILE */}
      <div className="topbar-mobile">

        <button
          type="button"
          className="topbar-brand"
          onClick={() => navigate("/dashboard")}
          aria-label="Vai alla Dashboard"
        >
          <img src="/logo-crm.jpg" alt="Logo" className="brand-logo brand-logo--topbar" draggable={false} />
          <span className="topbar-brand-text">Team Rise Program</span>
        </button>

        <button className="btn-menu" onClick={openSidebar} type="button" aria-label="Apri menu">
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        </button>
      </div>

      {/* OVERLAY dietro sidebar */}
      <div
        className={"sidebar-backdrop" + (sidebarOpen ? " show" : "")}
        onClick={closeSidebar}
        aria-hidden={!sidebarOpen}
      />

      <div className="app">
        {/* SIDEBAR */}
        <aside className={"sidebar" + (sidebarOpen ? " open" : "")} aria-label="Menu laterale">
          <div className="sidebar-header">
            <button
              type="button"
              className="sidebar-brand sidebar-brand--vertical"
              onClick={() => {
                closeSidebar();
                navigate("/dashboard");
              }}
              aria-label="Vai alla Dashboard"
            >
              <span className="brand-mark">
                <img src="/logo-crm.jpg" alt="Logo" className="brand-logo brand-logo--sidebar" draggable={false} />
              </span>
              <span className="brand-text">
                <span className="brand-line brand-line-1">Team</span>
                <span className="brand-line brand-line-2">Rise Program</span>
              </span>
            </button>

            <button className="sidebar-close" onClick={closeSidebar} type="button" aria-label="Chiudi menu">
              <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* ✅ USER BOX: ora prende user dinamico (profile -> session) */}
          {/* ✅ USER BOX: ora prende user dinamico (profile -> session) */}
          {/* ✅ USER BOX: CLICK -> PROFILO */}
          <div
            className="user-box group relative cursor-pointer hover:bg-white/5 transition-colors"
            onClick={() => {
              navigate("/profilo");
              closeSidebar();
            }}
          >
            <div className="user-avatar">{getAvatarLetter(user)}</div>
            <div className="flex-1 min-w-0">
              <div className="user-info-name truncate">
                {String((user?.nome || user?.name || "") + " " + (user?.cognome || "")).trim() || "Utente"}
              </div>
              <div className="user-info-sub truncate">
                {user?.telefono ? `Tel: ${user.telefono}` : (user?.email ? user.email : "Tel: -")}
              </div>
            </div>
            {/* QR Trigger Button */}
            <button
              onClick={(e) => {
                e.stopPropagation();
                setBusinessCardOpen(true);
              }}
              className="p-1.5 text-slate-400 hover:text-amber-500 hover:bg-slate-800/50 rounded-lg transition-colors ml-1 z-10"
              title="Apri Biglietto da Visita"
            >
              <QrCode size={18} strokeWidth={2} />
            </button>
          </div>

          <ul className="nav">
            {navItemsVisible.map(({ to, label, icon: Icon, permissionKey, external, imgIcon }) => (
              <li className="nav-item" key={to}>
                {external ? (
                  <a
                    href={to}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="nav-link"
                    onClick={closeSidebar}
                  >
                    <span className="nav-icon">
                      {imgIcon ? (
                        <img src={imgIcon} alt="" style={{ width: 18, height: 18, objectFit: "contain" }} />
                      ) : (
                        <Icon size={18} strokeWidth={1.8} />
                      )}
                    </span>
                    <span className="nav-label">{label}</span>
                  </a>
                ) : (
                  <NavLink
                    to={to}
                    className={({ isActive }) => "nav-link" + (isActive ? " active" : "")}
                    onClick={closeSidebar}
                  >
                    <span className="nav-icon">
                      {imgIcon ? (
                        <img src={imgIcon} alt="" style={{ width: 18, height: 18, objectFit: "contain" }} />
                      ) : (
                        <Icon size={18} strokeWidth={1.8} />
                      )}
                    </span>
                    <span className="nav-label">{label}</span>
                  </NavLink>
                )}
              </li>
            ))}
          </ul>

          <div className="sidebar-footer">
            <button className="btn-logout" type="button" onClick={handleLogout}>
              <LogOut size={18} />
              <span>Esci</span>
            </button>
          </div>

          <DigitalBusinessCard
            isOpen={businessCardOpen}
            onClose={() => setBusinessCardOpen(false)}
          />
        </aside>

        {/* CONTENUTO PRINCIPALE */}
        <main className="main">{children}</main>

        {/* GLOBAL CHAT WIDGET */}
        <ChatWidget />
      </div>
    </>
  );
}

/** =========================================================
 *  ROUTE GUARDS
 *  ========================================================= */

// 1) Guard: se NON loggato → /login
function RequireAuth({ children }) {
  const loc = useLocation();
  const { firebaseUser, loading } = useAuth();
  const session = readSession();

  // mentre Firebase sta determinando lo stato auth, evitiamo redirect aggressivi
  if (loading) {
    return <div style={{ padding: 24 }}>Caricamento...</div>;
  }

  // Se ho firebaseUser ok. Altrimenti fallback su sessione locale (transitorio).
  if (!firebaseUser && !session) {
    return <Navigate to="/login" replace state={{ from: loc.pathname }} />;
  }

  return children;
}

// 2) Guard Google Calendar: se NON collegato → /connect-calendar
function RequireGoogleCalendar({ children }) {
  const { calendarToken, loading } = useAuth();
  const session = readSession();

  // Se stiamo caricando l'auth, aspettiamo
  if (loading) return null;

  // Se non c'è token calendar (e non siamo in una sessione di bypass se prevista)
  // Reindirizziamo alla pagina di collegamento
  if (!calendarToken?.token) {
    return <Navigate to="/connect-calendar" replace />;
  }

  return children;
}

// 3) Guard permessi: se manca permesso → dashboard
function Guard({ canAccess, children }) {
  if (!canAccess) return <Navigate to="/dashboard" replace />;
  return children;
}

/** =========================================================
 *  APP
 *  ========================================================= */
export default function App() {
  const { profile, firebaseUser, loading, isAdmin } = useAuth();
  const session = readSession();
  // ✅ user reale: mix di profile (Firestore) e session (localStorage) per fallback robusto
  const user = useMemo(() => {
    // Dati da Firestore
    const pNome = profile?.nome || profile?.name;
    const pCognome = profile?.cognome;
    const pTel = profile?.telefono || profile?.phone || profile?.tel || profile?.phoneNumber;
    const pEmail = profile?.email;

    // Dati da Sessione
    let sNome = "";
    let sCognome = "";
    if (session?.name) {
      const parts = session.name.split(" ").filter(Boolean);
      sNome = parts[0] || "";
      sCognome = parts.slice(1).join(" ") || "";
    }
    const sTel = session?.phone;
    const sEmail = session?.email;

    // Dati da Firebase User
    const fEmail = firebaseUser?.email;

    // Combinazione (Priorità: Profile > Session > FirebaseUser)
    return {
      nome: pNome || sNome || "",
      cognome: pCognome || sCognome || "",
      telefono: pTel || sTel || "",
      email: pEmail || sEmail || fEmail || "",
    };
  }, [profile, firebaseUser, session]);

  // ✅ permissions: se arrivano da Firestore le usiamo, altrimenti fallback
  const permissions = useMemo(() => {
    const p = profile?.permissions || {};

    return {
      ...fallbackPermissions,
      ...p,
      // Usiamo il valore centralizzato nell'AuthProvider
      isAdmin: !!isAdmin,
    };
  }, [profile, isAdmin]);

  // ✅ Listener aggiornamenti (push da Admin)
  const { hasUpdate, message: updateMsg, applyUpdate, dismiss } = useAppUpdate();

  return (
    <>
      <PwaReloadPrompt /> {/* ✅ [NEW] PWA Updater */}
      <ToastProvider>
        <BrowserRouter>
          <Routes>
            {/* PUBLIC ROUTES (senza Shell) */}
            <Route path="/login" element={<LoginPage />} />
            <Route path="/register" element={<RegisterPage />} />
            <Route path="/connect-calendar" element={<ConnectCalendarPage />} />
            <Route path="/privacy" element={<GoogleConsentPage />} /> {/* [NEW] */}
            <Route path="/terms" element={<TermsPage />} /> {/* [NEW] */}

            {/* ✅ PUBLIC DIGITAL CARD */}
            <Route path="/card/:uid" element={<PublicCardPage />} />

            {/* ✅ PREVIEW PAGE (Locale) */}
            <Route path="/preview" element={<PreviewPage />} />

            {/* ✅ PRESENTATION THEATER (High Fidelity) */}
            <Route path="/presentation" element={<PresentationTheater />} />

            {/* ✅ DASHBOARD 2 (Public Test) */}
            <Route path="/dashboard2" element={<Dashboard2 />} />

            {/* ROOT: se loggato → dashboard, altrimenti → Presentation Page */}
            <Route
              path="/"
              element={(firebaseUser || readSession()) ? <Navigate to="/dashboard" replace /> : <PresentationPage />}
            />

            {/* PROTECTED AREA (con Shell) */}
            <Route
              path="/*"
              element={
                <RequireAuth>
                  <RequireGoogleCalendar>
                    <Shell user={user} permissions={permissions}>
                      <Routes>
                        <Route path="dashboard" element={<Dashboard />} />

                        <Route
                          path="appuntamenti"
                          element={
                            <Guard canAccess={!!permissions.canAccessAppointmentsPage}>
                              <AppuntamentiPage />
                            </Guard>
                          }
                        />

                        <Route path="lista-nomi" element={<ListaNomiPage />} />
                        <Route path="swipe-test" element={<SwipeTestPage />} />
                        <Route path="lista-nomi-kanban" element={<KanbanPage />} /> {/* [NEW] */}

                        <Route
                          path="stepone"
                          element={
                            <Guard canAccess={!!permissions.canSeeStepOne}>
                              <StepOnePage />
                            </Guard>
                          }
                        />

                        <Route
                          path="struttura"
                          element={
                            <Guard canAccess={!!permissions.canAccessStructurePage}>
                              <StrutturaPage />
                            </Guard>
                          }
                        />

                        <Route
                          path="kpi"
                          element={
                            <Guard canAccess={!!permissions.canSeeKpiPage}>
                              <KpiAnalyticsPage />
                            </Guard>
                          }
                        />

                        <Route
                          path="database"
                          element={
                            <Guard canAccess={!!permissions.canAccessDatabasePage}>
                              <DatabasePage />
                            </Guard>
                          }
                        />

                        <Route
                          path="classifica"
                          element={
                            <Guard canAccess={!!permissions.canSeeClassificaPage}>
                              <ClassificaPage />
                            </Guard>
                          }
                        />

                        {/* ✅ UNIVERSITY (nuova route) */}
                        <Route path="university" element={<University />} />

                        {/* ✅ RISE AI */}
                        <Route path="rise-ai" element={<RiseAiPage />} />

                        {/* ✅ PROFILE (Page) */}
                        <Route path="profilo" element={<ProfilePage />} />

                        <Route path="impostazioni" element={<ImpostazioniPage />} />

                        <Route
                          path="admin"
                          element={
                            <Guard canAccess={!!permissions.isAdmin}>
                              <AdminPage />
                            </Guard>
                          }
                        />

                        <Route
                          path="forum"
                          element={
                            <Guard canAccess={!!permissions.canAccessForumPage}>
                              <ForumPage />
                            </Guard>
                          }
                        />

                        {/* fallback interno: qualunque route sbagliata → dashboard */}
                        <Route path="*" element={<Navigate to="/dashboard" replace />} />
                      </Routes>
                    </Shell>
                  </RequireGoogleCalendar>
                </RequireAuth>
              }
            />

          </Routes>

          {/* ✅ MODALE AGGIORNAMENTO (quando forceReload = OFF in Admin) */}
          {hasUpdate && (
            <div
              role="dialog"
              aria-modal="true"
              style={{
                position: "fixed",
                inset: 0,
                zIndex: 9999,
                background: "rgba(0,0,0,0.55)",
                display: "grid",
                placeItems: "center",
                padding: 16,
              }}
            >
              <div
                style={{
                  width: "min(520px, 100%)",
                  borderRadius: 16,
                  border: "1px solid rgba(148,163,184,0.18)",
                  background: "rgba(2, 6, 23, 0.92)",
                  boxShadow: "0 20px 60px rgba(0,0,0,0.55)",
                  color: "var(--text-main)",
                  overflow: "hidden",
                }}
              >
                <div style={{ padding: 16, borderBottom: "1px solid rgba(148,163,184,0.14)" }}>
                  <div style={{ fontWeight: 900, fontSize: 16 }}>Aggiornamento disponibile</div>
                  <div style={{ marginTop: 6, fontSize: 13, color: "var(--text-muted)", lineHeight: 1.45 }}>
                    È uscita una nuova versione dell’app.
                  </div>
                </div>

                <div style={{ padding: 16, fontSize: 13.5, lineHeight: 1.55, color: "#e2e8f0" }}>
                  {updateMsg || "Aggiornamento disponibile: riavvia l’app per applicarlo."}
                </div>

                <div
                  style={{
                    padding: 16,
                    display: "flex",
                    justifyContent: "flex-end",
                    gap: 10,
                    borderTop: "1px solid rgba(148,163,184,0.14)",
                    background: "rgba(255,255,255,0.02)",
                  }}
                >
                  <button
                    type="button"
                    className="btn-secondary"
                    onClick={dismiss}
                    style={{ cursor: "pointer" }}
                  >
                    Annulla
                  </button>
                  <button
                    type="button"
                    className="btn-primary"
                    onClick={applyUpdate}
                    style={{ cursor: "pointer" }}
                  >
                    OK e aggiorna
                  </button>
                </div>
              </div>
            </div>
          )}

        </BrowserRouter>
      </ToastProvider>
    </>
  );
}
