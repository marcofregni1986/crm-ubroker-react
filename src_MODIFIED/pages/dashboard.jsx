// src/pages/dashboard.jsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import "./dashboard.css";
import "../agenda_styles.css";
import { useAuth } from "../auth/AuthProvider";

// ✅ Firestore
import { db } from "../firebase";
import {
  collection,
  getDoc,
  getDocs,
  doc,
  query,
  where,
  Timestamp,
  limit,
  updateDoc,
  deleteDoc, // [NEW]
  serverTimestamp,
  onSnapshot,
} from "firebase/firestore";

// Lucide
import { Eye, StickyNote, X, Layers, Calendar, Clock, Target, Activity, Phone, RefreshCw, Trash2, Layout, TrendingUp, Users } from "lucide-react";
import CustomSelect from "../components/CustomSelect";
import PersonAgendaCard from "../components/PersonAgendaCard";
import SwipeableActionWrapper from "../components/SwipeableActionWrapper"; // [NEW]
import DailyFocusModal from "../components/DailyFocusModal"; // [NEW] Daily Focus

/**
 * DASHBOARD — Firebase (personal + structure + KPI)
 *
 * ✅ IMPORTANTISSIMO (filtro privacy/struttura):
 * Nel menu "Seleziona collaboratore" devono comparire SOLO:
 * - l'utente loggato
 * - tutti gli utenti la cui driverChain CONTIENE l'uid dell'utente loggato
 *   (quindi solo la downline, niente "sopra" e niente estranei)
 *
 * Dati letti:
 * - users/{uid} (profilo utente)
 * - users (per ottenere i membri downline via driverChain array-contains)
 * - structureNodes (per definire sotto-struttura tramite parentId)
 * - appointments (conteggi CA/CVA + KPI su struttura selezionata)
 *
 * NOTE:
 * - Per driverChain serve che ogni user abbia: driverChain: [uid1, uid2, ...] (antenati)
 * - Esempio: driverChain[0] = driverUid diretto, e include anche più su.
 */

// ================= DATE RANGE HELPERS (FIXED) =================
function startOfWeekMondayMs(d = new Date()) {
  const date = new Date(d);
  const day = date.getDay() || 7; // Sunday -> 7
  if (day !== 1) date.setDate(date.getDate() - (day - 1));
  date.setHours(0, 0, 0, 0);
  return date.getTime();
}

function endOfWeekSundayMs(d = new Date()) {
  const start = startOfWeekMondayMs(d);
  const end = new Date(start);
  end.setDate(end.getDate() + 6);
  end.setHours(23, 59, 59, 999);
  return end.getTime();
}

function startOfMonthMs(d = new Date()) {
  const date = new Date(d.getFullYear(), d.getMonth(), 1);
  date.setHours(0, 0, 0, 0);
  return date.getTime();
}

function endOfMonthMs(d = new Date()) {
  const date = new Date(d.getFullYear(), d.getMonth() + 1, 0);
  date.setHours(23, 59, 59, 999);
  return date.getTime();
}
// =============================================================

function toMillis(ts) {
  if (!ts) return null;
  // Firestore Timestamp
  if (ts instanceof Timestamp) return ts.toMillis();
  // Date
  if (ts instanceof Date) return ts.getTime();
  // number
  if (typeof ts === "number") return ts;
  // string
  const d = new Date(ts);
  const ms = d.getTime();
  return Number.isFinite(ms) ? ms : null;
}

function startOfWeekMonday(d = new Date()) {
  const x = new Date(d);
  const day = x.getDay(); // 0 domenica
  const diff = (day === 0 ? -6 : 1) - day; // lunedì
  x.setDate(x.getDate() + diff);
  x.setHours(0, 0, 0, 0);
  return x;
}
function startOfMonth(d = new Date()) {
  const x = new Date(d);
  x.setDate(1);
  x.setHours(0, 0, 0, 0);
  return x;
}
function uniqBy(arr, keyFn) {
  const m = new Map();
  for (const it of arr) {
    const k = keyFn(it);
    if (!k) continue;
    if (!m.has(k)) m.set(k, it);
  }
  return Array.from(m.values());
}
function labelUser(u) {
  const n = String(u?.nome || u?.name || "").trim();
  const c = String(u?.cognome || "").trim();
  const full = (n + " " + c).trim();
  return full || String(u?.email || u?.uid || "Utente");
}



/* =========================================================
   ✅ KPI / STATUS NORMALIZATION
   ========================================================= */
function getStatusString(a) {
  return String(a?.stato ?? a?.status ?? a?.esito ?? a?.outcome ?? a?.risultato ?? a?.result ?? "")
    .trim()
    .toLowerCase();
}

// Status classification logic


const EXECUTED_OPTS = [
  "Esito Positivo",
  "Esito Negativo"
];

const NOT_EXECUTED_OPTS = [
  "Programmato",
  "Da Richiamare",
  "Rimandato",
  "Annullato",
  "2 appuntamento",
  "3 appuntamento",
  "CPA"
];

const ALL_STATUS_OPTS = [
  ...NOT_EXECUTED_OPTS,
  ...EXECUTED_OPTS
];

function classifyAppointment(a) {
  const s = String(a.stato || a.status || "").toLowerCase();

  // GREEN: Esito Positivo
  if (s.includes("esito positivo") || s.includes("ok") || s.includes("venduto") || s === "positivo") return "positive";

  // RED: Esito Negativo OR Annullato
  if (s.includes("esito negativo") || s.includes("ko") || s.includes("annullato") || s === "negativo") return "negative";

  // YELLOW: Everything else
  return "scheduled";
}

function statusClassForBadge(a) {
  return classifyAppointment(a);
}

const MODAL_STYLE = `
  .crm-modal-overlay {
    position: fixed;
    inset: 0;
    z-index: 9999;
    /* Background handled by CSS for theme support */
    backdrop-filter: blur(8px);
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .crm-modal {
    /* Background handled by CSS */
    border-radius: 16px;
    overflow: hidden;
  }
  .crm-modal-header {
    /* Handled by CSS vars */
    padding: 16px 20px;
  }
  .crm-modal-body {
    padding: 20px;
  }
  .crm-modal-footer {
    padding: 16px 20px;
  }
  .crm-modal-title {
    font-weight: 700;
    font-size: 1.125rem;
  }
  .crm-modal-close {
    background: transparent;
    border: none;
    cursor: pointer;
    font-size: 1.5rem;
  }
`;

export default function Dashboard() {
  const { user, firebaseUser, profile, loading } = useAuth();

  // ✅ Daily Focus Logic
  const [showDailyFocus, setShowDailyFocus] = useState(false);

  useEffect(() => {
    // Check if seen today
    const now = new Date();
    const todayKey = `daily_focus_${now.getFullYear()}_${now.getMonth() + 1}_${now.getDate()}`;
    const lastSeen = localStorage.getItem("last_daily_focus");

    if (lastSeen !== todayKey) {
      // Not seen today -> Show
      // wait a bit for fade in
      const t = setTimeout(() => setShowDailyFocus(true), 1200);
      return () => clearTimeout(t);
    }
  }, []);

  const handleCloseDailyFocus = () => {
    const now = new Date();
    const todayKey = `daily_focus_${now.getFullYear()}_${now.getMonth() + 1}_${now.getDate()}`;
    localStorage.setItem("last_daily_focus", todayKey);
    setShowDailyFocus(false);
  };

  // UI state
  const [detailMode, setDetailMode] = useState("all");
  const [detailFilter, setDetailFilter] = useState("all"); // "all" | "executed"
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [activeTab, setActiveTab] = useState("personal");

  // --- modifica appuntamento (solo personali)
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [editDraft, setEditDraft] = useState(null);
  const [editSaving, setEditSaving] = useState(false);
  // NEW: State for the toggle "Eseguito" vs "Non Eseguito"
  const [editExecutionType, setEditExecutionType] = useState("non_eseguito"); // "eseguito" | "non_eseguito"

  // --- visualizza appuntamento (dettaglio + note)
  const [isViewOpen, setIsViewOpen] = useState(false);
  const [viewAppt, setViewAppt] = useState(null);

  // --- obiettivo personale (persistito in localStorage)
  const GOAL_LS_KEY = "crm_goal_personal_v1";
  const [goal, setGoal] = useState(() => {
    try {
      const raw = localStorage.getItem(GOAL_LS_KEY);
      if (!raw) return { ca: 0, cva: 0 };
      const parsed = JSON.parse(raw);
      return {
        ca: Math.max(0, parseInt(parsed?.ca ?? 0, 10) || 0),
        cva: Math.max(0, parseInt(parsed?.cva ?? 0, 10) || 0),
      };
    } catch {
      return { ca: 0, cva: 0 };
    }
  });
  const [isGoalOpen, setIsGoalOpen] = useState(false);
  const [goalDraft, setGoalDraft] = useState({ ca: "0", cva: "0" });



  // (Moved down below appts declaration)

  const openGoal = () => {
    setGoalDraft({ ca: String(goal.ca ?? 0), cva: String(goal.cva ?? 0) });
    setIsGoalOpen(true);
  };
  const closeGoal = () => setIsGoalOpen(false);

  const saveGoal = () => {
    const ca = Math.max(0, parseInt(goalDraft.ca, 10) || 0);
    const cva = Math.max(0, parseInt(goalDraft.cva, 10) || 0);
    const next = { ca, cva };
    setGoal(next);
    try {
      localStorage.setItem(GOAL_LS_KEY, JSON.stringify(next));
    } catch { }
    setIsGoalOpen(false);
  };

  // --- struttura selection + data
  const [structureUsers, setStructureUsers] = useState([]); // SOLO downline + self
  const [structureNodes, setStructureNodes] = useState([]); // nodi (filtrati)
  const [selectedRootUid, setSelectedRootUid] = useState(""); // uid della persona selezionata
  const [structureLoading, setStructureLoading] = useState(false);
  const [structureError, setStructureError] = useState("");

  const kpiCollaboratorOptions = useMemo(() => {
    const base = [
      { value: "__me__", label: "Solo io" },
      { value: "", label: "Tutta la mia struttura" },
    ];
    const list = (structureUsers || [])
      .filter((u) => (u?.uid || u?.id) && (u?.uid || u?.id) !== firebaseUser?.uid)
      .map((u) => ({ value: u.uid || u.id, label: labelUser(u) }));
    return base.concat(list);
  }, [structureUsers, firebaseUser?.uid]);

  // --- appointments raw + computed
  const [appts, setAppts] = useState([]);
  const [apptsLoading, setApptsLoading] = useState(false);
  const [apptsError, setApptsError] = useState("");



  // modal helpers
  const openDetail = (mode, filter = "all") => {
    setDetailMode(mode);
    setDetailFilter(filter); // ✅ Set the filter!
    setIsDetailOpen(true);
  };
  const closeDetail = () => setIsDetailOpen(false);

  const detailTitle =
    detailMode === "week"
      ? "Dettaglio appuntamenti – Settimana"
      : detailMode === "month"
        ? "Dettaglio appuntamenti – Mese"
        : "Dettaglio appuntamenti – Totali";

  // ---------- display info
  const displayName = useMemo(() => {
    const full =
      (profile?.nome ? `${profile.nome} ${profile?.cognome || ""}`.trim() : "") ||
      (profile?.name ? String(profile.name).trim() : "");
    return full || profile?.email || firebaseUser?.email || "Utente";
  }, [profile, firebaseUser]);

  const displayPhone = useMemo(() => {
    return profile?.telefono || profile?.phone || profile?.mobile || "";
  }, [profile]);

  const displayEmail = useMemo(() => {
    return profile?.email || firebaseUser?.email || "";
  }, [profile, firebaseUser]);

  // --- helpers: date/time inputs (edit appuntamento)
  function msToInputDate(ms) {
    if (!ms) return "";
    const d = new Date(ms);
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    return `${yyyy}-${mm}-${dd}`;
  }

  function msToInputTime(ms) {
    if (!ms) return "";
    const d = new Date(ms);
    const hh = String(d.getHours()).padStart(2, "0");
    const mi = String(d.getMinutes()).padStart(2, "0");
    return `${hh}:${mi}`;
  }

  function buildMsFromInputs(dateStr, timeStr) {
    if (!dateStr || !timeStr) return null;
    const [y, m, d] = dateStr.split("-").map((x) => parseInt(x, 10));
    const [hh, mi] = timeStr.split(":").map((x) => parseInt(x, 10));
    if (!y || !m || !d) return null;
    const dt = new Date(y, m - 1, d, hh || 0, mi || 0, 0, 0);
    return dt.getTime();
  }

  // --- RESCHEDULE (Rifissa)

  function handleReschedule(appt) {
    // Open Edit modal as "New" but pre-filled
    setEditDraft({
      id: null, // NEW
      tipo: appt.tipo || "CA",
      nome: appt.nome || "",
      cognome: appt.cognome || "",
      stato: "Programmato", // Reset status
      note: "",
      date: "",
      time: ""
    });
    setEditExecutionType("non_eseguito"); // Default for new
    setIsEditOpen(true);
  }

  function openEdit(appt) {
    const ms = toMillis(appt?.dataOra);
    const s = String(appt.stato || appt.status || "Programmato");

    // Auto-detect execution category
    // Logic: use outcome_executed if present, otherwise guess based on text
    let isExecuted = false;

    if (typeof appt.outcome_executed === 'boolean') {
      isExecuted = appt.outcome_executed;
    } else {
      // Fallback guess
      // Old logic: Positivo/Negativo were the only ones counting as "closed"
      const lower = s.toLowerCase();
      isExecuted = lower.includes("positivo") || lower.includes("negativo") || lower.includes("ok") || lower.includes("ko");
    }

    setEditExecutionType(isExecuted ? "eseguito" : "non_eseguito");

    setEditDraft({
      id: appt.id,
      tipo: appt.tipo || "CA",
      nome: appt.nome || "",
      cognome: appt.cognome || "",
      stato: s,
      note: appt.note || appt.descrizione || "",
      date: msToInputDate(ms),
      time: msToInputTime(ms),
    });
    setIsEditOpen(true);
  }

  function closeEdit() {
    setIsEditOpen(false);
    setEditDraft(null);
    setEditSaving(false);
  }

  function openView(appt) {
    if (!appt) return;
    setViewAppt(appt);
    setIsViewOpen(true);
  }

  function closeView() {
    setIsViewOpen(false);
    setViewAppt(null);
  }

  // [NEW] Delete handler
  // [NEW] Delete handler with Custom Modal
  const [deleteCandidate, setDeleteCandidate] = useState(null);

  function handleDelete(appt) {
    // Instead of window.confirm, open custom modal
    if (!appt?.id) return;
    setDeleteCandidate(appt);
  }

  async function confirmDelete() {
    if (!deleteCandidate) return;
    const appt = deleteCandidate;

    try {
      await deleteDoc(doc(db, "appointments", appt.id));
      console.log("Dashboard: Delete success");
      // Optimistic remove
      setAppts(prev => prev.filter(p => p.id !== appt.id));
      // Close modal
      setDeleteCandidate(null);
      // If we were viewing this specific appointment, close view
      if (viewAppt?.id === appt.id) closeView();
    } catch (e) {
      console.error("Errore eliminazione:", e);
      alert("Errore durante l'eliminazione: " + (e.message || String(e)));
    }
  }

  async function saveEdit() {
    // if (!editDraft?.id) return; // Allow creation if null
    const ms = buildMsFromInputs(editDraft.date, editDraft.time);
    if (!ms) return;

    setEditSaving(true);
    try {
      if (editDraft.id) {
        // UPDATE EXISTING
        const ref = doc(db, "appointments", editDraft.id);
        await updateDoc(ref, {
          tipo: editDraft.tipo,
          nome: (editDraft.nome || "").trim(),
          cognome: (editDraft.cognome || "").trim(),
          stato: editDraft.stato,
          status: editDraft.stato,
          note: (editDraft.note || "").trim(),
          outcome_executed: editExecutionType === "eseguito", // SAVE FLAG
          dataOra: Timestamp.fromMillis(ms),
          updatedAt: serverTimestamp(),
        });

        // Optimistic UI update
        setAppts((prev) =>
          prev.map((a) =>
            a.id === editDraft.id
              ? {
                ...a,
                tipo: editDraft.tipo,
                nome: (editDraft.nome || "").trim(),
                cognome: (editDraft.cognome || "").trim(),
                stato: editDraft.stato,
                status: editDraft.stato,
                note: (editDraft.note || "").trim(),
                outcome_executed: editExecutionType === "eseguito", // OPTIMISTIC UPDATE
                dataOra: Timestamp.fromMillis(ms),
              }
              : a
          )
        );
      } else {
        // CREATE NEW (Reschedule / Custom Add)
        const { addDoc } = await import("firebase/firestore");

        const newDoc = {
          uid: firebaseUser.uid, // Always created by me
          tipo: editDraft.tipo,
          nome: (editDraft.nome || "").trim(),
          cognome: (editDraft.cognome || "").trim(),
          stato: "Programmato",
          status: "Programmato",
          note: (editDraft.note || "").trim(),
          outcome_executed: false, // New default is false (Not Executed)
          dataOra: Timestamp.fromMillis(ms),
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        };

        const res = await addDoc(collection(db, "appointments"), newDoc);

        // Optimistic append
        setAppts(prev => [...prev, { id: res.id, ...newDoc, dataOra: Timestamp.fromMillis(ms) }]);
      }

      closeEdit();
    } catch (e) {
      console.error("Errore salvataggio appuntamento:", e);
      setEditSaving(false);
    }
  }

  /* =========================================================
     ✅ MODAL THEME STYLES (DARK + LIGHT)
     - Non cambia logiche
     - Colori e contrasto perfetti in entrambi i temi
     - Ogni modal ha una "variant" (detail/goal/view/edit)
     ========================================================= */
  const MODAL_STYLE = `
/* ---- Overlay (sempre uguale) ---- */
.dashboard-page .crm-modal-overlay{
  position: fixed !important;
  inset: 0 !important;
  display: flex !important;
  align-items: center !important;
  justify-content: center !important;
  padding: 14px !important;
  z-index: 9999 !important;
}

/* Overlay: DARK */
body.theme-dark .dashboard-page .crm-modal-overlay{
  background: rgba(0,0,0,0.58) !important;
  backdrop-filter: blur(10px) !important;
  -webkit-backdrop-filter: blur(10px) !important;
}
/* Overlay: LIGHT */
body.theme-light .dashboard-page .crm-modal-overlay{
  background: rgba(15,23,42,0.40) !important;
  backdrop-filter: blur(10px) !important;
  -webkit-backdrop-filter: blur(10px) !important;
}

/* ---- Shell ---- */
.dashboard-page .crm-modal{
  width: min(920px, calc(100vw - 28px)) !important;
  max-height: min(86vh, calc(100dvh - 28px)) !important;
  overflow: hidden !important;
  border-radius: 20px !important;
  display: flex !important;
  flex-direction: column !important;
}
@supports not (height: 100dvh){
  .dashboard-page .crm-modal{ max-height: calc(100vh - 28px) !important; }
}

/* ---- Header / Footer ---- */
.dashboard-page .crm-modal-header,
.dashboard-page .crm-modal-footer{
  flex: 0 0 auto !important;
  display: flex !important;
  align-items: center !important;
  gap: 12px !important;
  padding: 14px 16px !important;
  min-height: 56px !important;
}
.dashboard-page .crm-modal-header{
  justify-content: space-between !important;
  border-bottom: 1px solid rgba(148,163,184,0.16) !important;
}
.dashboard-page .crm-modal-footer{
  justify-content: flex-end !important;
  border-top: 1px solid rgba(148,163,184,0.16) !important;
}

/* ---- Body (scroll SOLO qui) ---- */
.dashboard-page .crm-modal-body{
  flex: 1 1 auto !important;
  overflow: auto !important;
  -webkit-overflow-scrolling: touch !important;
  padding: 16px !important;
  min-height: 0 !important;
}

/* ---- Title ---- */
.dashboard-page .crm-modal-title{
  font-weight: 950 !important;
  letter-spacing: .2px !important;
}

/* ---- Close button ---- */
.dashboard-page .crm-modal-close{
  width: 40px !important;
  height: 40px !important;
  border-radius: 14px !important;
  display: inline-flex !important;
  align-items: center !important;
  justify-content: center !important;
  cursor: pointer !important;
}

/* =========================================================
   ✅ VARIANT COLORS (ogni modal ha i suoi colori)
   ========================================================= */

/* ===== DETAIL MODAL ===== */
body.theme-dark .dashboard-page .crm-modal.variant-detail{
  background: radial-gradient(1200px 520px at 25% 0%, rgba(168,85,247,0.22) 0%, rgba(2,6,23,0.78) 55%, rgba(2,6,23,0.94) 100%) !important;
  border: 1px solid rgba(255,255,255,0.10) !important;
  box-shadow: 0 30px 90px rgba(0,0,0,0.62) !important;
  color: rgba(226,232,240,0.96) !important;
}
body.theme-light .dashboard-page .crm-modal.variant-detail{
  background: rgba(255,255,255,0.98) !important;
  border: 1px solid rgba(15,23,42,0.12) !important;
  box-shadow: 0 30px 90px rgba(15,23,42,0.20) !important;
  color: rgba(15,23,42,0.92) !important;
}

/* ===== GOAL MODAL ===== */
body.theme-dark .dashboard-page .crm-modal.variant-goal{
  background: radial-gradient(980px 420px at 35% 0%, rgba(56,189,248,0.16) 0%, rgba(2,6,23,0.82) 55%, rgba(2,6,23,0.94) 100%) !important;
  border: 1px solid rgba(255,255,255,0.10) !important;
  box-shadow: 0 30px 90px rgba(0,0,0,0.62) !important;
  color: rgba(226,232,240,0.96) !important;
}
body.theme-light .dashboard-page .crm-modal.variant-goal{
  background: rgba(255,255,255,0.98) !important;
  border: 1px solid rgba(15,23,42,0.12) !important;
  box-shadow: 0 30px 90px rgba(15,23,42,0.20) !important;
  color: rgba(15,23,42,0.92) !important;
}

/* ===== VIEW MODAL ===== */
body.theme-dark .dashboard-page .crm-modal.variant-view{
  background: radial-gradient(980px 420px at 25% 0%, rgba(124,58,237,0.22) 0%, rgba(2,6,23,0.80) 55%, rgba(2,6,23,0.94) 100%) !important;
  border: 1px solid rgba(255,255,255,0.10) !important;
  box-shadow: 0 30px 90px rgba(0,0,0,0.62) !important;
  color: rgba(226,232,240,0.96) !important;
}
body.theme-light .dashboard-page .crm-modal.variant-view{
  background: rgba(255,255,255,0.98) !important;
  border: 1px solid rgba(15,23,42,0.12) !important;
  box-shadow: 0 30px 90px rgba(15,23,42,0.20) !important;
  color: rgba(15,23,42,0.92) !important;
}

/* ===== EDIT MODAL ===== */
body.theme-dark .dashboard-page .crm-modal.variant-edit{
  background: radial-gradient(980px 420px at 25% 0%, rgba(244,63,94,0.14) 0%, rgba(2,6,23,0.80) 55%, rgba(2,6,23,0.94) 100%) !important;
  border: 1px solid rgba(255,255,255,0.10) !important;
  box-shadow: 0 30px 90px rgba(0,0,0,0.62) !important;
  color: rgba(226,232,240,0.96) !important;
}
body.theme-light .dashboard-page .crm-modal.variant-edit{
  background: rgba(255,255,255,0.98) !important;
  border: 1px solid rgba(15,23,42,0.12) !important;
  box-shadow: 0 30px 90px rgba(15,23,42,0.20) !important;
  color: rgba(15,23,42,0.92) !important;
}

/* ---- Header/Footer per tema (sempre leggibili) ---- */
body.theme-dark .dashboard-page .crm-modal-header,
body.theme-dark .dashboard-page .crm-modal-footer{
  background: rgba(2,6,23,0.88) !important;
  color: rgba(226,232,240,0.96) !important;
  border-color: rgba(255,255,255,0.10) !important;
}
body.theme-light .dashboard-page .crm-modal-header,
body.theme-light .dashboard-page .crm-modal-footer{
  background: rgba(255,255,255,0.98) !important;
  color: rgba(15,23,42,0.92) !important;
  border-color: rgba(15,23,42,0.10) !important;
}

body.theme-dark .dashboard-page .crm-modal-close{
  border: 1px solid rgba(255,255,255,0.12) !important;
  background: rgba(255,255,255,0.06) !important;
  color: rgba(255,255,255,0.92) !important;
}
body.theme-light .dashboard-page .crm-modal-close{
  border: 1px solid rgba(15,23,42,0.12) !important;
  background: rgba(15,23,42,0.04) !important;
  color: rgba(15,23,42,0.92) !important;
}

/* ---- Field look nel modal (div.input usato nel JSX) ---- */
.dashboard-page .crm-modal .field .label{
  font-size: 11px !important;
  font-weight: 900 !important;
  letter-spacing: .55px !important;
  text-transform: uppercase !important;
  margin-bottom: 8px !important;
  opacity: .80 !important;
}
.dashboard-page .crm-modal .input,
.dashboard-page .crm-modal input,
.dashboard-page .crm-modal textarea{
  width: 100% !important;
  border-radius: 14px !important;
  padding: 12px 12px !important;
  min-height: 44px !important;
  border: 1px solid rgba(148,163,184,0.18) !important;
}
body.theme-dark .dashboard-page .crm-modal .input,
body.theme-dark .dashboard-page .crm-modal input,
body.theme-dark .dashboard-page .crm-modal textarea{
  background: rgba(2,6,23,0.50) !important;
  color: rgba(226,232,240,0.96) !important;
  border-color: rgba(148,163,184,0.22) !important;
}
body.theme-light .dashboard-page .crm-modal .input,
body.theme-light .dashboard-page .crm-modal input,
body.theme-light .dashboard-page .crm-modal textarea{
  background: rgba(255,255,255,0.92) !important;
  color: rgba(15,23,42,0.92) !important;
  border-color: rgba(15,23,42,0.12) !important;
}
.dashboard-page .crm-modal input:focus,
.dashboard-page .crm-modal textarea:focus{
  outline: none !important;
  border-color: rgba(139,92,246,0.62) !important;
  box-shadow: 0 0 0 4px rgba(139,92,246,0.16) !important;
}

/* ---- Tabelle nei modal ---- */
.dashboard-page .crm-modal table{
  width: 100% !important;
  border-collapse: separate !important;
  border-spacing: 0 !important;
  overflow: hidden !important;
  border-radius: 14px !important;
}
.dashboard-page .crm-modal thead th{
  font-size: 12px !important;
  letter-spacing: .04em !important;
  text-transform: uppercase !important;
  padding: 10px 12px !important;
}
body.theme-dark .dashboard-page .crm-modal thead th{
  background: rgba(255,255,255,0.06) !important;
  color: rgba(226,232,240,0.82) !important;
  border-bottom: 1px solid rgba(255,255,255,0.10) !important;
}
body.theme-light .dashboard-page .crm-modal thead th{
  background: rgba(15,23,42,0.04) !important;
  color: rgba(15,23,42,0.70) !important;
  border-bottom: 1px solid rgba(15,23,42,0.10) !important;
}
.dashboard-page .crm-modal tbody td{
  padding: 12px !important;
}
body.theme-dark .dashboard-page .crm-modal tbody td{
  border-bottom: 1px solid rgba(255,255,255,0.08) !important;
}
body.theme-light .dashboard-page .crm-modal tbody td{
  border-bottom: 1px solid rgba(15,23,42,0.08) !important;
}
.dashboard-page .crm-modal tbody tr:last-child td{ border-bottom: none !important; }

/* ---- Status badge (fallback) ---- */
.dashboard-page .status-badge{
  display:inline-flex;
  align-items:center;
  gap:6px;
  padding: 2px 10px;
  border-radius: 999px;
  font-size: 12px;
  font-weight: 800;
  text-transform: capitalize;
  border: 1px solid rgba(255,255,255,0.14);
  background: rgba(255,255,255,0.06);
  color: rgba(255,255,255,0.90);
  white-space: nowrap;
}
body.theme-light .dashboard-page .status-badge{
  border-color: rgba(15,23,42,0.12);
  background: rgba(15,23,42,0.04);
  color: rgba(15,23,42,0.90);
}
.dashboard-page .status-positive{ border-color: rgba(34,197,94,0.35); background: rgba(34,197,94,0.12); }
.dashboard-page .status-negative{ border-color: rgba(239,68,68,0.35); background: rgba(239,68,68,0.12); }
.dashboard-page .status-scheduled{ border-color: rgba(124,58,237,0.35); background: rgba(124,58,237,0.12); }
.dashboard-page .status-unknown{ border-color: rgba(148,163,184,0.20); background: rgba(148,163,184,0.10); }
body.theme-light .dashboard-page .status-positive{ background: rgba(34,197,94,0.10); }
body.theme-light .dashboard-page .status-negative{ background: rgba(239,68,68,0.10); }
body.theme-light .dashboard-page .status-scheduled{ background: rgba(124,58,237,0.10); }



        /* ===== Esito appuntamenti: split premium (ripristinato) ===== */
        .kpi-esito-split{
          display:flex;
          align-items:flex-end;
          justify-content:space-between;
          gap: 16px;
          margin-top: 6px;
          margin-bottom: 10px;
        }
        .kpi-esito-side{
          flex:1;
          min-width: 0;
        }
        .kpi-esito-side.neg{ text-align:right; }
        .kpi-esito-label{
          font-size: 12px;
          font-weight: 900;
          letter-spacing: .08em;
          text-transform: uppercase;
          opacity: .8;
          margin-bottom: 6px;
        }
        .kpi-esito-value{
          font-size: 42px;
          font-weight: 950;
          letter-spacing: -0.03em;
          line-height: 1;
        }
        .kpi-esito-value.pos{ color: rgba(34,197,94,0.95); }
        .kpi-esito-value.neg{ color: rgba(239,68,68,0.95); }

        .kpi-progress-wrapper{ margin-top: 10px; }
        .kpi-progress-bar{
          width: 100%;
          height: 10px;
          border-radius: 999px;
          overflow: hidden;
          background: rgba(255,255,255,0.06);
          border: 1px solid rgba(255,255,255,0.10);
        }
        body.theme-light .kpi-progress-bar{
          background: rgba(15,23,42,0.06);
          border-color: rgba(15,23,42,0.10);
        }
        .kpi-progress-inner{
          height: 100%;
          border-radius: 999px;
          background: rgba(34,197,94,0.85);
        }
        .kpi-progress-label{
          margin-top: 8px;
          font-size: 12px;
          font-weight: 800;
          opacity: .8;
        }

        @media (max-width: 520px){
          .kpi-esito-split{ flex-direction: column; align-items:flex-start; }
          .kpi-esito-side.neg{ text-align:left; }
          .kpi-esito-value{ font-size: 36px; }
        }

/* Light dropdown */
body.theme-light .kpi-dd-btn{
  background: rgba(255,255,255,0.92) !important;
  color: rgba(15,23,42,0.92) !important;
  border-color: rgba(15,23,42,0.12) !important;
  box-shadow: 0 10px 26px rgba(15,23,42,0.10) !important;
}
body.theme-light .kpi-dd-btn:hover{
  background: rgba(124,58,237,0.10) !important;
  border-color: rgba(124,58,237,0.22) !important;
}
body.theme-light .kpi-dd-menu{
  background: rgba(255,255,255,0.96) !important;
  border-color: rgba(15,23,42,0.10) !important;
  box-shadow: 0 22px 60px rgba(15,23,42,0.14) !important;
}
body.theme-light .kpi-dd-item{ color: rgba(15,23,42,0.90) !important; }
body.theme-light .kpi-dd-item:hover{ background: rgba(124,58,237,0.10) !important; border-color: rgba(124,58,237,0.16) !important; }
body.theme-light .kpi-dd-item.active{ background: rgba(124,58,237,0.14) !important; border-color: rgba(124,58,237,0.22) !important; }

/* Mobile */
@media (max-width: 520px){
  .kpi-dd-btn{ min-width: 180px; }
  .dashboard-page .crm-modal{ width: calc(100vw - 24px) !important; }
  .dashboard-page .crm-modal .grid-2{ grid-template-columns: 1fr !important; }
  .dashboard-page .crm-modal-body{ padding: 14px !important; }
}
`;

  // ---------- LOADING STATES
  if (loading) {
    return (
      <main className="main dashboard-page">
        <style>{MODAL_STYLE}</style>

        <header className="main-header">
          <div>
            <h1 className="main-title">Dashboard</h1>
            <p className="main-subtitle">Caricamento profilo…</p>
          </div>
          <span className="badge-status">…</span>
        </header>
        <section className="cards-wrapper">
          <div className="card card-secondary">
            <div className="card-title">Sto sincronizzando i tuoi dati</div>
            <div className="card-footer">Un attimo…</div>
          </div>
        </section>
      </main>
    );
  }

  if (!firebaseUser) {
    return (
      <main className="main dashboard-page">
        <style>{MODAL_STYLE}</style>

        <header className="main-header">
          <div>
            <h1 className="main-title">Dashboard</h1>
            <p className="main-subtitle">Non sei autenticato.</p>
          </div>
          <span className="badge-status">Offline</span>
        </header>

        <section className="cards-wrapper">
          <div className="card card-secondary">
            <div className="card-title">Accedi</div>
            <div className="card-footer">Torna al login per continuare.</div>
          </div>
        </section>
      </main>
    );
  }

  // ---------- LOAD STRUCTURE USERS (SELF + DOWNLINE ONLY) + STRUCTURE NODES
  useEffect(() => {
    let alive = true;

    async function loadStructure() {
      setStructureLoading(true);
      setStructureError("");

      try {
        const myUid = user.uid;

        // 1) Prendo tutti gli utenti che hanno driverChain che contiene me
        // => sono tutta la mia downline (qualsiasi profondità)
        const qChain = query(collection(db, "users"), where("driverChain", "array-contains", myUid), limit(1000));

        // 1b) Prendo anche chi ha me come driver diretto (fallback robusto se driverChain è rotto)
        const qDirect = query(collection(db, "users"), where("driverUid", "==", myUid), limit(1000));

        const [snapChain, snapDirect] = await Promise.all([getDocs(qChain), getDocs(qDirect)]);

        const chainUsers = snapChain.docs.map((d) => ({ id: d.id, ...d.data() }));
        const directUsers = snapDirect.docs.map((d) => ({ id: d.id, ...d.data() }));

        console.log("[Dashboard] Chain found:", chainUsers.length);
        console.log("[Dashboard] Direct found:", directUsers.length);

        // ✅ Robust replacement for uniqBy
        const allUsersRaw = [...chainUsers, ...directUsers];
        const seen = new Set();
        const downUsers = allUsersRaw.filter(u => {
          const id = u.uid || u.id;
          if (!id || seen.has(id)) return false;
          seen.add(id);
          return true;
        });

        console.log("[Dashboard] Merged downline total:", downUsers.length);

        // 2) Aggiungo anche me (self)
        let me = profile ? { id: myUid, uid: myUid, ...profile } : null;
        if (!me) {
          const meSnap = await getDoc(doc(db, "users", myUid));
          if (meSnap.exists()) me = { id: meSnap.id, ...meSnap.data() };
        }
        console.log("[Dashboard] Me object:", me?.uid || me?.id, !!me);

        // ✅ Robust replacement for second uniqBy
        const mergedRaw = [me, ...downUsers].filter(Boolean);
        const seenMerged = new Set();
        const merged = mergedRaw.filter(u => {
          const id = u.uid || u.id;
          if (!id || seenMerged.has(id)) return false;
          seenMerged.add(id);
          return true;
        });

        console.log("[Dashboard] Final merged list for dropdown:", merged.length);

        // 3) Ordina per nome
        merged.sort((a, b) => labelUser(a).localeCompare(labelUser(b), "it"));

        // 4) Carica structureNodes
        const nSnap = await getDocs(query(collection(db, "structureNodes"), limit(5000)));
        const nodesAll = nSnap.docs.map((d) => ({ id: d.id, ...d.data() }));

        const allowed = new Set(merged.map((u) => u.uid || u.id).filter(Boolean));
        const nodesFiltered = nodesAll.filter((n) => allowed.has(n.ownerUid));

        if (!alive) return;

        setStructureUsers(merged);
        setStructureNodes(nodesFiltered);

        // default selection: IO (self)
        setSelectedRootUid((prev) => prev || (me?.uid || me?.id || myUid));
      } catch (e) {
        console.error("loadStructure error:", e);
        if (!alive) return;
        setStructureUsers(profile ? [{ uid: firebaseUser.uid, ...profile }] : []);
        setStructureNodes([]);
        setSelectedRootUid(firebaseUser.uid);
        setStructureError(e?.message || "Errore nel caricamento struttura.");
      } finally {
        if (alive) setStructureLoading(false);
      }
    }

    loadStructure();
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [firebaseUser?.uid]);

  // ---------- BUILD SUBTREE (selected root UID + its descendants) using structureNodes
  const subtreeUids = useMemo(() => {
    if (selectedRootUid === "__me__") return [firebaseUser.uid];

    if (!selectedRootUid) {
      const s = new Set((structureUsers || []).map((u) => u?.uid || u?.id).filter(Boolean));
      if (firebaseUser?.uid) s.add(firebaseUser.uid);
      return Array.from(s);
    }

    const root = selectedRootUid;
    const nodes = structureNodes || [];
    if (!root || nodes.length === 0) return [root];

    const byOwner = new Map();
    for (const n of nodes) {
      if (n?.ownerUid) byOwner.set(n.ownerUid, n);
    }

    const childrenByParentId = new Map();
    for (const n of nodes) {
      const pid = n?.parentId || null;
      if (!pid) continue;
      if (!childrenByParentId.has(pid)) childrenByParentId.set(pid, []);
      childrenByParentId.get(pid).push(n);
    }

    const rootNode = byOwner.get(root);
    if (!rootNode?.id) return [root];

    const out = new Set();
    const stack = [rootNode];
    while (stack.length) {
      const cur = stack.pop();
      if (cur?.ownerUid) out.add(cur.ownerUid);
      const kids = childrenByParentId.get(cur.id) || [];
      for (const k of kids) stack.push(k);
    }
    out.add(root);
    return Array.from(out);
  }, [structureUsers, structureNodes, selectedRootUid, firebaseUser?.uid]);

  // ---------- UID set: tutta la mia downline (usato per copertura globale)
  const downlineUidsAll = useMemo(() => {
    const s = new Set((structureUsers || []).map((u) => u?.uid || u?.id).filter(Boolean));
    if (firebaseUser?.uid) s.add(firebaseUser.uid);
    return s;
  }, [structureUsers, firebaseUser?.uid]);

  // ---------- LOAD APPOINTMENTS
  useEffect(() => {
    setApptsLoading(true);
    setApptsError("");

    const q = query(collection(db, "appointments"), limit(10000));

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const all = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
        setAppts(all);
        setApptsLoading(false);
      },
      (error) => {
        console.error("loadAppointments error:", error);
        setAppts([]);
        setApptsError(error?.message || "Errore nel caricamento appuntamenti.");
        setApptsLoading(false);
      }
    );

    return () => {
      unsubscribe();
    };
  }, []);

  // ---------- FILTER APPTS for personal + structure
  const weekStart = useMemo(() => startOfWeekMonday(new Date()), []);
  const monthStart = useMemo(() => startOfMonth(new Date()), []);

  function isInRange(ms, startMs, endMs) {
    if (!ms) return false;
    if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) return false;
    return ms >= startMs && ms <= endMs;
  }

  const personalStats = useMemo(() => {
    const myUid = firebaseUser.uid;
    // 1. Get raw list - EXCLUDE "da risentire" AND "da richiamare" from personal stats context entirely
    const rawList = (appts || []).filter((a) => {
      const s = String(a.stato || a.status || "").toLowerCase();
      // Unification: exclude both terms so they don't pollute stats
      return a?.uid === myUid && !s.includes("da risentire") && !s.includes("da richiamare");
    });

    // 2. Group by Unique Person
    const peopleMap = new Map();
    rawList.forEach(a => {
      const rawName = (a.nome || "") + " " + (a.cognome || "");
      const key = rawName.trim().toLowerCase();
      if (!key) return;

      if (!peopleMap.has(key)) {
        peopleMap.set(key, {
          hasCA: false, hasCVA: false,
          appts: []
        });
      }
      const p = peopleMap.get(key);
      p.appts.push(a);
      if (a.tipo === "CVA") p.hasCVA = true;
    });

    // 2b. Re-calculate CA/CVA flags based ONLY on Executed (Positive/Negative) for STATS
    // The previous loop set flags if ANY exists. We need flags only if VALID (Positive/Negative).
    // Let's redo the flag logic properly:
    peopleMap.clear();
    rawList.forEach(a => {
      const rawName = (a.nome || "") + " " + (a.cognome || "");
      const key = rawName.trim().toLowerCase();
      if (!key) return;

      if (!peopleMap.has(key)) {
        peopleMap.set(key, {
          hasCA_Prog: false, hasCVA_Prog: false, hasS1Online_Prog: false, hasS1Live_Prog: false, hasAny_Prog: false,
          hasCA_Exec: false, hasCVA_Exec: false, hasS1Online_Exec: false, hasS1Live_Exec: false, hasAny_Exec: false,
          appts: []
        });
      }
      const p = peopleMap.get(key);
      p.appts.push(a);

      // 1. Programmati (All valid appointments in this list)
      p.hasAny_Prog = true; // Any type counts for generic Total
      if (a.tipo === "CA") p.hasCA_Prog = true;
      if (a.tipo === "CVA") p.hasCVA_Prog = true;
      if (a.tipo === "STEPONE ONLINE") p.hasS1Online_Prog = true;
      if (a.tipo === "STEPONE LIVE") p.hasS1Live_Prog = true;

      // 2. Eseguiti (Prioritize outcome_executed flag)
      let isExecuted = false;
      if (typeof a.outcome_executed === 'boolean') {
        isExecuted = a.outcome_executed;
      } else {
        const c = classifyAppointment(a);
        isExecuted = (c === "positive" || c === "negative" || c === "neutral-executed");
      }

      if (isExecuted) {
        p.hasAny_Exec = true; // Any type counts for generic Total
        if (a.tipo === "CA") p.hasCA_Exec = true;
        if (a.tipo === "CVA") p.hasCVA_Exec = true;
        if (a.tipo === "STEPONE ONLINE") p.hasS1Online_Exec = true;
        if (a.tipo === "STEPONE LIVE") p.hasS1Live_Exec = true;
      }
    });

    const uniquePeople = Array.from(peopleMap.values());
    const totalProg = uniquePeople.length; // Total people with ANY appointment
    const totalExec = uniquePeople.filter(p => p.hasAny_Exec).length; // Total people with EXECUTED appointment (Any type)

    const totalCA_Prog = uniquePeople.filter(p => p.hasCA_Prog).length;
    const totalCVA_Prog = uniquePeople.filter(p => p.hasCVA_Prog).length;
    const totalS1Online_Prog = uniquePeople.filter(p => p.hasS1Online_Prog).length;
    const totalS1Live_Prog = uniquePeople.filter(p => p.hasS1Live_Prog).length;

    const totalCA_Exec = uniquePeople.filter(p => p.hasCA_Exec).length;
    const totalCVA_Exec = uniquePeople.filter(p => p.hasCVA_Exec).length;
    const totalS1Online_Exec = uniquePeople.filter(p => p.hasS1Online_Exec).length;
    const totalS1Live_Exec = uniquePeople.filter(p => p.hasS1Live_Exec).length;

    const weekMs = weekStart.getTime();
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekEnd.getDate() + 6);
    weekEnd.setHours(23, 59, 59, 999);
    const weekEndMs = weekEnd.getTime();

    const monthMs = monthStart.getTime();
    const monthEnd = new Date(monthStart.getFullYear(), monthStart.getMonth() + 1, 0);
    monthEnd.setHours(23, 59, 59, 999);
    const monthEndMs = monthEnd.getTime();

    // Filter People who have ANY appointment in the range
    const peopleInWeek = uniquePeople.filter(p => p.appts.some(a => isInRange(toMillis(a?.dataOra), weekMs, weekEndMs)));
    const peopleInMonth = uniquePeople.filter(p => p.appts.some(a => isInRange(toMillis(a?.dataOra), monthMs, monthEndMs)));

    // WEEK
    const weekProg = peopleInWeek.length;
    const weekCA_Prog = peopleInWeek.filter(p => p.hasCA_Prog).length;
    const weekCVA_Prog = peopleInWeek.filter(p => p.hasCVA_Prog).length;
    const weekS1Online_Prog = peopleInWeek.filter(p => p.hasS1Online_Prog).length;
    const weekS1Live_Prog = peopleInWeek.filter(p => p.hasS1Live_Prog).length;

    // Filter for Executed in Week (must have an executed appointment IN that week)
    const peopleInWeekExec = uniquePeople.filter(p => p.appts.some(a => {
      // Logic executed check
      let isExecuted = false;
      if (typeof a.outcome_executed === 'boolean') {
        isExecuted = a.outcome_executed;
      } else {
        const c = classifyAppointment(a);
        isExecuted = (c === "positive" || c === "negative" || c === "neutral-executed");
      }
      return isExecuted && isInRange(toMillis(a?.dataOra), weekMs, weekEndMs);
    }));
    // Now weekExec uses the generic list of people who executed (regardless of type)
    const weekExec = peopleInWeekExec.length;

    const weekCA_Exec = peopleInWeekExec.filter(p => p.hasCA_Exec).length;
    const weekCVA_Exec = peopleInWeekExec.filter(p => p.hasCVA_Exec).length;
    const weekS1Online_Exec = peopleInWeekExec.filter(p => p.hasS1Online_Exec).length;
    const weekS1Live_Exec = peopleInWeekExec.filter(p => p.hasS1Live_Exec).length;


    // MONTH
    const monthProg = peopleInMonth.length;
    const monthCA_Prog = peopleInMonth.filter(p => p.hasCA_Prog).length;
    const monthCVA_Prog = peopleInMonth.filter(p => p.hasCVA_Prog).length;
    const monthS1Online_Prog = peopleInMonth.filter(p => p.hasS1Online_Prog).length;
    const monthS1Live_Prog = peopleInMonth.filter(p => p.hasS1Live_Prog).length;

    const peopleInMonthExec = uniquePeople.filter(p => p.appts.some(a => {
      // Logic executed check
      let isExecuted = false;
      if (typeof a.outcome_executed === 'boolean') {
        isExecuted = a.outcome_executed;
      } else {
        const c = classifyAppointment(a);
        isExecuted = (c === "positive" || c === "negative" || c === "neutral-executed");
      }
      return isExecuted && isInRange(toMillis(a?.dataOra), monthMs, monthEndMs);
    }));
    const monthExec = peopleInMonthExec.length;
    const monthCA_Exec = peopleInMonthExec.filter(p => p.hasCA_Exec).length;
    const monthCVA_Exec = peopleInMonthExec.filter(p => p.hasCVA_Exec).length;
    const monthS1Online_Exec = peopleInMonthExec.filter(p => p.hasS1Online_Exec).length;
    const monthS1Live_Exec = peopleInMonthExec.filter(p => p.hasS1Live_Exec).length;

    return {
      // Programmati
      totalProg, totalCA_Prog, totalCVA_Prog, totalS1Online_Prog, totalS1Live_Prog,
      weekProg, weekCA_Prog, weekCVA_Prog, weekS1Online_Prog, weekS1Live_Prog,
      monthProg, monthCA_Prog, monthCVA_Prog, monthS1Online_Prog, monthS1Live_Prog,

      // Eseguiti
      totalExec, totalCA_Exec, totalCVA_Exec, totalS1Online_Exec, totalS1Live_Exec,
      weekExec, weekCA_Exec, weekCVA_Exec, weekS1Online_Exec, weekS1Live_Exec,
      monthExec, monthCA_Exec, monthCVA_Exec, monthS1Online_Exec, monthS1Live_Exec,

      list: rawList,
      listWeek: rawList.filter((a) => isInRange(toMillis(a?.dataOra), weekMs, weekEndMs)),
      listMonth: rawList.filter((a) => isInRange(toMillis(a?.dataOra), monthMs, monthEndMs)),
    };
  }, [appts, firebaseUser?.uid, weekStart, monthStart]);

  // % avanzamento obiettivo personale (sul mese corrente)
  const personalGoalDen = (goal.ca || 0) + (goal.cva || 0);
  const personalGoalNum = (personalStats.monthCA_Exec || 0) + (personalStats.monthCVA_Exec || 0);
  const personalGoalPct = personalGoalDen > 0 ? Math.min(100, Math.round((personalGoalNum / personalGoalDen) * 100)) : 0;
  const personalGoalPctCA = (goal.ca || 0) > 0 ? Math.min(100, Math.round(((personalStats.monthCA_Exec || 0) / (goal.ca || 1)) * 100)) : 0;
  const personalGoalPctCVA = (goal.cva || 0) > 0 ? Math.min(100, Math.round(((personalStats.monthCVA_Exec || 0) / (goal.cva || 1)) * 100)) : 0;

  const structureStats = useMemo(() => {
    const uids = new Set(subtreeUids || [firebaseUser.uid]);
    // 1. Get raw list (Keep "da risentire" here because we need it for the 'Da Risentire' tab)
    const rawList = (appts || []).filter((a) => uids.has(a?.uid));

    // 2. Filter list for STATS (exclude "da risentire" AND "da richiamare")
    const statsList = rawList.filter((a) => {
      const s = String(a.stato || a.status || "").toLowerCase();
      return !s.includes("da risentire") && !s.includes("da richiamare");
    });

    // 3. Group by Unique Person (using STATS list)
    const peopleMap = new Map();
    statsList.forEach(a => {
      const rawName = (a.nome || "") + " " + (a.cognome || "");
      const key = rawName.trim().toLowerCase();
      if (!key) return;

      if (!peopleMap.has(key)) {
        peopleMap.set(key, {
          hasCA: false, hasCVA: false,
          appts: []
        });
      }
      const p = peopleMap.get(key);
      p.appts.push(a);
      if (a.tipo === "CVA") p.hasCVA = true;
    });

    // 3b. Redo flag logic for Structure to exclude Scheduled
    peopleMap.clear();
    statsList.forEach(a => {
      const rawName = (a.nome || "") + " " + (a.cognome || "");
      const key = rawName.trim().toLowerCase();
      if (!key) return;

      if (!peopleMap.has(key)) {
        peopleMap.set(key, {
          hasCA_Prog: false, hasCVA_Prog: false, hasS1Online_Prog: false, hasS1Live_Prog: false, hasAny_Prog: false,
          hasCA_Exec: false, hasCVA_Exec: false, hasS1Online_Exec: false, hasS1Live_Exec: false, hasAny_Exec: false,
          appts: []
        });
      }
      const p = peopleMap.get(key);
      p.appts.push(a);

      // 1. Programmati (All valid in statsList)
      p.hasAny_Prog = true;
      if (a.tipo === "CA") p.hasCA_Prog = true;
      if (a.tipo === "CVA") p.hasCVA_Prog = true;
      if (a.tipo === "STEPONE ONLINE") p.hasS1Online_Prog = true;
      if (a.tipo === "STEPONE LIVE") p.hasS1Live_Prog = true;

      // 2. Eseguiti (Prioritize outcome_executed flag)
      let isExecuted = false;
      if (typeof a.outcome_executed === 'boolean') {
        isExecuted = a.outcome_executed;
      } else {
        const c = classifyAppointment(a);
        isExecuted = (c === "positive" || c === "negative" || c === "neutral-executed");
      }

      if (isExecuted) {
        p.hasAny_Exec = true;
        if (a.tipo === "CA") p.hasCA_Exec = true;
        if (a.tipo === "CVA") p.hasCVA_Exec = true;
        if (a.tipo === "STEPONE ONLINE") p.hasS1Online_Exec = true;
        if (a.tipo === "STEPONE LIVE") p.hasS1Live_Exec = true;
      }
    });

    const uniquePeople = Array.from(peopleMap.values());

    // PROGRAMMATI
    const totalProg = uniquePeople.length;
    const totalCA_Prog = uniquePeople.filter(p => p.hasCA_Prog).length;
    const totalCVA_Prog = uniquePeople.filter(p => p.hasCVA_Prog).length;
    const totalS1Online_Prog = uniquePeople.filter(p => p.hasS1Online_Prog).length;
    const totalS1Live_Prog = uniquePeople.filter(p => p.hasS1Live_Prog).length;

    // ESEGUITI
    const totalExec = uniquePeople.filter(p => p.hasAny_Exec).length;
    const totalCA_Exec = uniquePeople.filter(p => p.hasCA_Exec).length;
    const totalCVA_Exec = uniquePeople.filter(p => p.hasCVA_Exec).length;
    const totalS1Online_Exec = uniquePeople.filter(p => p.hasS1Online_Exec).length;
    const totalS1Live_Exec = uniquePeople.filter(p => p.hasS1Live_Exec).length;

    const weekMs = weekStart.getTime();
    const weekEndMs = endOfWeekSundayMs(weekStart);
    const monthMs = monthStart.getTime();
    const monthEndMs = endOfMonthMs(monthStart);

    // Filter People who have ANY appointment in the range
    const peopleInWeek = uniquePeople.filter(p => p.appts.some(a => isInRange(toMillis(a?.dataOra), weekMs, weekEndMs)));
    const peopleInMonth = uniquePeople.filter(p => p.appts.some(a => isInRange(toMillis(a?.dataOra), monthMs, monthEndMs)));

    // WEEK
    const weekProg = peopleInWeek.length;
    const weekCA_Prog = peopleInWeek.filter(p => p.hasCA_Prog).length;
    const weekCVA_Prog = peopleInWeek.filter(p => p.hasCVA_Prog).length;
    const weekS1Online_Prog = peopleInWeek.filter(p => p.hasS1Online_Prog).length;
    const weekS1Live_Prog = peopleInWeek.filter(p => p.hasS1Live_Prog).length;

    // Filter for Executed in Week
    const peopleInWeekExec = uniquePeople.filter(p => p.appts.some(a => {
      // Logic executed check
      let isExecuted = false;
      if (typeof a.outcome_executed === 'boolean') {
        isExecuted = a.outcome_executed;
      } else {
        const c = classifyAppointment(a);
        isExecuted = (c === "positive" || c === "negative" || c === "neutral-executed");
      }
      return isExecuted && isInRange(toMillis(a?.dataOra), weekMs, weekEndMs);
    }));
    const weekExec = peopleInWeekExec.length;
    const weekCA_Exec = peopleInWeekExec.filter(p => p.hasCA_Exec).length;
    const weekCVA_Exec = peopleInWeekExec.filter(p => p.hasCVA_Exec).length;
    const weekS1Online_Exec = peopleInWeekExec.filter(p => p.hasS1Online_Exec).length;
    const weekS1Live_Exec = peopleInWeekExec.filter(p => p.hasS1Live_Exec).length;

    // MONTH
    const monthProg = peopleInMonth.length;
    const monthCA_Prog = peopleInMonth.filter(p => p.hasCA_Prog).length;
    const monthCVA_Prog = peopleInMonth.filter(p => p.hasCVA_Prog).length;
    const monthS1Online_Prog = peopleInMonth.filter(p => p.hasS1Online_Prog).length;
    const monthS1Live_Prog = peopleInMonth.filter(p => p.hasS1Live_Prog).length;

    // Filter for Executed in Month
    const peopleInMonthExec = uniquePeople.filter(p => p.appts.some(a => {
      // Logic executed check
      let isExecuted = false;
      if (typeof a.outcome_executed === 'boolean') {
        isExecuted = a.outcome_executed;
      } else {
        const c = classifyAppointment(a);
        isExecuted = (c === "positive" || c === "negative" || c === "neutral-executed");
      }
      return isExecuted && isInRange(toMillis(a?.dataOra), monthMs, monthEndMs);
    }));
    const monthExec = peopleInMonthExec.length;
    const monthCA_Exec = peopleInMonthExec.filter(p => p.hasCA_Exec).length;
    const monthCVA_Exec = peopleInMonthExec.filter(p => p.hasCVA_Exec).length;
    const monthS1Online_Exec = peopleInMonthExec.filter(p => p.hasS1Online_Exec).length;
    const monthS1Live_Exec = peopleInMonthExec.filter(p => p.hasS1Live_Exec).length;

    return {
      // Programmati
      totalProg, totalCA_Prog, totalCVA_Prog, totalS1Online_Prog, totalS1Live_Prog,
      weekProg, weekCA_Prog, weekCVA_Prog, weekS1Online_Prog, weekS1Live_Prog,
      monthProg, monthCA_Prog, monthCVA_Prog, monthS1Online_Prog, monthS1Live_Prog,

      // Eseguiti
      totalExec, totalCA_Exec, totalCVA_Exec, totalS1Online_Exec, totalS1Live_Exec,
      weekExec, weekCA_Exec, weekCVA_Exec, weekS1Online_Exec, weekS1Live_Exec,
      monthExec, monthCA_Exec, monthCVA_Exec, monthS1Online_Exec, monthS1Live_Exec,


      // ✅ Return rawList (with 'da risentire') so the tab can display them
      list: rawList,

      // These lists are likely unused but if used for stats detail, use filtered:
      listWeek: statsList.filter((a) => isInRange(toMillis(a?.dataOra), weekMs, weekEndMs)),
      listMonth: statsList.filter((a) => isInRange(toMillis(a?.dataOra), monthMs, monthEndMs)),
      peopleCount: uids.size,
    };
  }, [appts, subtreeUids, firebaseUser?.uid, weekStart, monthStart]);

  // ---------- KPI su TUTTA LA STRUTTURA (selezionata)
  const kpi = useMemo(() => {
    // NEW LOGIC REDESIGN (Card 1, 2, 3)

    // NEW LOGIC REDESIGN (Current Month - Past Only)
    // Timeframe: 1st of Current Month -> Now.
    // Exclude future appointments (strict "Past" logic).

    const now = new Date();
    const nowMs = now.getTime();

    // Start of current month
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const startOfMonthMs = startOfMonth.getTime();

    // Filter source: `structureStats.list` (All appts for selected subtree)
    const sourceList = structureStats.list || [];

    // Filter by Date Range: [StartOfMonth, Now]
    // This effectively excludes future appointments even if they are in the current month.
    const listCurrentMonthPast = sourceList.filter(a => {
      const d = toMillis(a.dataOra);
      return d >= startOfMonthMs && d <= nowMs;
    });

    // 1. EXECUTION RATE (Efficienza)
    // Denominator: Scheduled + Pos + Neg (exclude Annullato and outliers)
    const validInMonth = listCurrentMonthPast.filter(a => {
      // ✅ IF EXEC: Always valid (respects "quanti eseguiti... con qualsiasi stato")
      if (a.outcome_executed === true) return true;

      const s = String(a.stato || a.status || "").toLowerCase();
      // Exclude special statuses if NOT explicitly executed
      if (s.includes("da risentire") || s.includes("da richiamare")) return false;
      if (s.includes("annullato")) return false;
      return true;
    });

    const executedInMonth = validInMonth.filter(a => {
      // ✅ [FIX] Check outcome_executed logic (same as personalStats)
      if (typeof a.outcome_executed === 'boolean') {
        return a.outcome_executed;
      }
      // Fallback for legacy data
      const c = classifyAppointment(a);
      return c === "positive" || c === "negative" || c === "neutral-executed";
    });

    const execRate = validInMonth.length > 0
      ? (executedInMonth.length / validInMonth.length) * 100
      : 0;


    // 2. WEEKLY FREQUENCY (Ritmo)
    // Formula: Executed / Weeks Passed in Month.
    // Calculate weeks passed from StartOfMonth to Now (min 1 week)
    const msPassed = Math.max(0, nowMs - startOfMonthMs);
    const weeksPassed = Math.max(1, msPassed / (1000 * 60 * 60 * 24 * 7));

    const freq = executedInMonth.length / weeksPassed;


    // 3. SUCCESS RATE (Qualità)
    // Formula: Positive / Executed.
    const positiveInMonth = executedInMonth.filter(a => classifyAppointment(a) === "positive");

    const successRate = executedInMonth.length > 0
      ? (positiveInMonth.length / executedInMonth.length) * 100
      : 0;

    return {
      execRate,
      execCount30d: executedInMonth.length,
      validCount30d: validInMonth.length,

      freq: freq.toFixed(1),

      successRate,
      posCount30d: positiveInMonth.length,

      // Keep old props if needed to avoid crash?
      coverage: 0,
      activeDownlineCount: 0,
      downlinePeopleCount: 0
    };
  }, [structureStats.list]);


  // ---------- per tab "Dettaglio" (modal)
  const detailRows = useMemo(() => {
    let rows = [];
    if (detailMode === "week") rows = personalStats.listWeek;
    else if (detailMode === "month") rows = personalStats.listMonth;
    else rows = personalStats.list; // "all"

    if (detailFilter === "executed") {
      return rows.filter(a => {
        // Updated check: explicitly start relying on outcome_executed OR class check
        if (typeof a.outcome_executed === 'boolean') return a.outcome_executed;

        const c = classifyAppointment(a);
        return c === "positive" || c === "negative";
      });
    }
    return rows;
  }, [detailMode, detailFilter, personalStats]);

  // openDetail removed (using existing one if valid, or will add back if undefined)

  // UI
  return (
    <main className="main dashboard-page">
      <DailyFocusModal isOpen={showDailyFocus} onClose={handleCloseDailyFocus} />
      <style>{MODAL_STYLE}</style>

      <header className="main-header">
        <div>
          <h1 className="main-title">Dashboard</h1>

          <p className="main-subtitle" style={{ marginBottom: 6 }}>
            Ciao <b>{displayName}</b>
          </p>

          <p className="main-subtitle" style={{ opacity: 0.85 }}>
            {displayPhone ? `Tel: ${displayPhone}` : ""}
            {displayPhone && displayEmail ? " • " : ""}
            {displayEmail ? `Email: ${displayEmail}` : ""}
          </p>
        </div>

        <span className="badge-status">CRM attivo</span>
      </header>

      {/* Tabs */}
      <div className="tabs dashboard-tabs-mobile">
        <button type="button" className={"tab-btn" + (activeTab === "personal" ? " active" : "")} onClick={() => setActiveTab("personal")}>
          Personale
        </button>
        <button type="button" className={"tab-btn" + (activeTab === "structure" ? " active" : "")} onClick={() => setActiveTab("structure")}>
          Struttura
        </button>
        <button type="button" className={"tab-btn" + (activeTab === "kpi" ? " active" : "")} onClick={() => setActiveTab("kpi")}>
          KPI
        </button>
        <button type="button" className={"tab-btn" + (activeTab === "history" ? " active" : "")} onClick={() => setActiveTab("history")}>
          Agenda
        </button>
        <button type="button" className={"tab-btn" + (activeTab === "recall" ? " active" : "")} onClick={() => setActiveTab("recall")}>
          Da Richiamare
        </button>
      </div>

      {/* 1) PERSONALE */}
      <section className={"cards-wrapper" + (activeTab !== "personal" ? " tab-hidden-mobile" : "")}>
        <h2 className="cards-section-title">Appuntamenti personali</h2>
        <p className="cards-section-subtitle">Statistiche basate sugli appuntamenti creati dal tuo utente.</p>

        {apptsError ? <div className="error visible">{apptsError}</div> : null}

        <div className="cards-grid cards-grid-personal">
          {/* --- PROGRAMMATI --- */}
          {/* TOTAL PROGRAMMATI */}
          <div className="card card-highlight">
            <div className="card-header">
              <div className="card-title">
                <Layers size={14} className="card-icon" />
                Totale Programmati
              </div>
              <button type="button" className="card-link" onClick={() => openDetail("all", "all")}>
                Dettaglio
              </button>
            </div>
            <div className="card-value">{apptsLoading ? "…" : personalStats.totalProg}</div>
            <div className="card-subvalue">
              <div className="stat-item"><div className="stat-dot ca"></div> CA: {apptsLoading ? "…" : personalStats.totalCA_Prog}</div>
              <div className="stat-item"><div className="stat-dot cva"></div> CVA: {apptsLoading ? "…" : personalStats.totalCVA_Prog}</div>
              <div className="stat-item"><div className="stat-dot" style={{ background: 'cyan' }}></div> S1 On: {apptsLoading ? "…" : personalStats.totalS1Online_Prog}</div>
              <div className="stat-item"><div className="stat-dot" style={{ background: 'orange' }}></div> S1 Live: {apptsLoading ? "…" : personalStats.totalS1Live_Prog}</div>
            </div>
            <div className="card-footer">Tutti gli appuntamenti (agenda).</div>
          </div>

          {/* MONTH PROGRAMMATI */}
          <div className="card card-secondary">
            <div className="card-header">
              <div className="card-title">
                <Calendar size={14} className="card-icon" />
                Mese Programmati
              </div>
              <button type="button" className="card-link" onClick={() => openDetail("month", "all")}>
                Dettaglio
              </button>
            </div>
            <div className="card-value">{apptsLoading ? "…" : personalStats.monthProg}</div>
            <div className="card-subvalue">
              <div className="stat-item"><div className="stat-dot ca"></div> CA: {apptsLoading ? "…" : personalStats.monthCA_Prog}</div>
              <div className="stat-item"><div className="stat-dot cva"></div> CVA: {apptsLoading ? "…" : personalStats.monthCVA_Prog}</div>
              <div className="stat-item"><div className="stat-dot" style={{ background: 'cyan' }}></div> S1 On: {apptsLoading ? "…" : personalStats.monthS1Online_Prog}</div>
              <div className="stat-item"><div className="stat-dot" style={{ background: 'orange' }}></div> S1 Live: {apptsLoading ? "…" : personalStats.monthS1Live_Prog}</div>
            </div>
            <div className="card-footer">Appuntamenti in agenda questo mese.</div>
          </div>

          {/* WEEK PROGRAMMATI */}
          <div className="card card-secondary">
            <div className="card-header">
              <div className="card-title">
                <Clock size={14} className="card-icon" />
                Settimana Programmati
              </div>
              <button type="button" className="card-link" onClick={() => openDetail("week", "all")}>
                Dettaglio
              </button>
            </div>
            <div className="card-value">{apptsLoading ? "…" : personalStats.weekProg}</div>
            <div className="card-subvalue">
              <div className="stat-item"><div className="stat-dot ca"></div> CA: {apptsLoading ? "…" : personalStats.weekCA_Prog}</div>
              <div className="stat-item"><div className="stat-dot cva"></div> CVA: {apptsLoading ? "…" : personalStats.weekCVA_Prog}</div>
              <div className="stat-item"><div className="stat-dot" style={{ background: 'cyan' }}></div> S1 On: {apptsLoading ? "…" : personalStats.weekS1Online_Prog}</div>
              <div className="stat-item"><div className="stat-dot" style={{ background: 'orange' }}></div> S1 Live: {apptsLoading ? "…" : personalStats.weekS1Live_Prog}</div>
            </div>
            <div className="card-footer">Lun - Dom.</div>
          </div>

          {/* --- ESEGUITI --- */}
          {/* TOTAL ESEGUITI */}
          <div className="card card-highlight">
            <div className="card-header">
              <div className="card-title" style={{ color: 'var(--success)' }}>
                <Layers size={14} className="card-icon" />
                Totale Eseguiti
              </div>
              <button type="button" className="card-link" onClick={() => openDetail("all", "executed")}>
                Dettaglio
              </button>
            </div>
            <div className="card-value">{apptsLoading ? "…" : personalStats.totalExec}</div>
            <div className="card-subvalue">
              <div className="stat-item"><div className="stat-dot ca"></div> CA: {apptsLoading ? "…" : personalStats.totalCA_Exec}</div>
              <div className="stat-item"><div className="stat-dot cva"></div> CVA: {apptsLoading ? "…" : personalStats.totalCVA_Exec}</div>
              <div className="stat-item"><div className="stat-dot" style={{ background: 'cyan' }}></div> S1 On: {apptsLoading ? "…" : personalStats.totalS1Online_Exec}</div>
              <div className="stat-item"><div className="stat-dot" style={{ background: 'orange' }}></div> S1 Live: {apptsLoading ? "…" : personalStats.totalS1Live_Exec}</div>
            </div>
            <div className="card-footer">Solo appuntamenti con esito (Pos/Neg).</div>
          </div>

          {/* MONTH ESEGUITI */}
          <div className="card card-secondary">
            <div className="card-header">
              <div className="card-title" style={{ color: 'var(--success)' }}>
                <Calendar size={14} className="card-icon" />
                Mese Eseguiti
              </div>
              <button type="button" className="card-link" onClick={() => openDetail("month", "executed")}>
                Dettaglio
              </button>
            </div>
            <div className="card-value">{apptsLoading ? "…" : personalStats.monthExec}</div>
            <div className="card-subvalue">
              <div className="stat-item"><div className="stat-dot ca"></div> CA: {apptsLoading ? "…" : personalStats.monthCA_Exec}</div>
              <div className="stat-item"><div className="stat-dot cva"></div> CVA: {apptsLoading ? "…" : personalStats.monthCVA_Exec}</div>
              <div className="stat-item"><div className="stat-dot" style={{ background: 'cyan' }}></div> S1 On: {apptsLoading ? "…" : personalStats.monthS1Online_Exec}</div>
              <div className="stat-item"><div className="stat-dot" style={{ background: 'orange' }}></div> S1 Live: {apptsLoading ? "…" : personalStats.monthS1Live_Exec}</div>
            </div>
            <div className="card-footer">Eseguiti questo mese.</div>
          </div>

          {/* WEEK ESEGUITI */}
          <div className="card card-secondary">
            <div className="card-header">
              <div className="card-title" style={{ color: 'var(--success)' }}>
                <Clock size={14} className="card-icon" />
                Settimana Eseguiti
              </div>
              <button type="button" className="card-link" onClick={() => openDetail("week", "executed")}>
                Dettaglio
              </button>
            </div>
            <div className="card-value">{apptsLoading ? "…" : personalStats.weekExec}</div>
            <div className="card-subvalue">
              <div className="stat-item"><div className="stat-dot ca"></div> CA: {apptsLoading ? "…" : personalStats.weekCA_Exec}</div>
              <div className="stat-item"><div className="stat-dot cva"></div> CVA: {apptsLoading ? "…" : personalStats.weekCVA_Exec}</div>
              <div className="stat-item"><div className="stat-dot" style={{ background: 'cyan' }}></div> S1 On: {apptsLoading ? "…" : personalStats.weekS1Online_Exec}</div>
              <div className="stat-item"><div className="stat-dot" style={{ background: 'orange' }}></div> S1 Live: {apptsLoading ? "…" : personalStats.weekS1Live_Exec}</div>
            </div>
            <div className="card-footer">Eseguiti settimanale.</div>
          </div>

          {/* GOAL */}
          <div className="card card-success">
            <div className="card-header">
              <div className="card-title">
                <Target size={14} className="card-icon" />
                Obiettivo
              </div>
              <button type="button" className="card-link" onClick={openGoal}>
                Modifica
              </button>
            </div>

            <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 16 }}>
              <div style={{ textAlign: "left" }}>
                <div style={{ fontSize: 10, fontWeight: 700, opacity: 0.6, marginBottom: 2 }}>TARGET CA</div>
                <div className="card-value" style={{ fontSize: 24 }}>{personalGoalPctCA}%</div>
              </div>
              <div style={{ textAlign: "right" }}>
                <div style={{ fontSize: 10, fontWeight: 700, opacity: 0.6, marginBottom: 2 }}>TARGET CVA</div>
                <div className="card-value" style={{ fontSize: 24 }}>{personalGoalPctCVA}%</div>
              </div>
            </div>

            <div className="progress-wrapper" style={{ marginTop: 12 }}>
              {/* Custom thin progress lines */}
              <div style={{ marginBottom: 8 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, opacity: 0.7, marginBottom: 4 }}>
                  <span>CA ({personalStats.monthCA_Exec}/{goal.ca})</span>
                </div>
                <div className="progress-bar" style={{ height: 4, background: 'rgba(255,255,255,0.05)' }}>
                  <div className="progress-inner" style={{ width: `${personalGoalPctCA}%`, background: "rgb(56, 189, 248)" }} />
                </div>
              </div>

              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, opacity: 0.7, marginBottom: 4 }}>
                  <span>CVA ({personalStats.monthCVA_Exec}/{goal.cva})</span>
                </div>
                <div className="progress-bar" style={{ height: 4, background: 'rgba(255,255,255,0.05)' }}>
                  <div className="progress-inner" style={{ width: `${personalGoalPctCVA}%`, background: "rgb(167, 139, 250)" }} />
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 2) STRUTTURA */}
      <section className={"cards-wrapper" + (activeTab !== "structure" ? " tab-hidden-mobile" : "")}>
        <h2 className="cards-section-title">Appuntamenti di struttura</h2>
        <p className="cards-section-subtitle">Monitoraggio produzione team e rete (solo downline).</p>

        {structureError ? <div className="error visible">{structureError}</div> : null}

        <div className="form-group" style={{ maxWidth: 520, marginTop: 8 }}>
          <label>Seleziona collaboratore (solo la tua struttura):</label>
          <CustomSelect value={selectedRootUid} onChange={(v) => setSelectedRootUid(v)} options={kpiCollaboratorOptions} />
          <div className="helper" style={{ marginTop: 6 }}>
            Conteggio su: <b>{structureStats.peopleCount}</b> persone (nodo selezionato incluso).
          </div>
        </div>

        <div className="cards-grid cards-grid-structure">
          {/* ROW 1: PROGRAMMATI */}
          <div className="card card-structure">
            <div className="card-header">
              <div className="card-title">Total Programmati</div>
            </div>
            <div className="card-value">{apptsLoading ? "…" : structureStats.totalProg}</div>
            <div className="card-subvalue">
              <div className="stat-item"><div className="stat-dot ca"></div> CA: {apptsLoading ? "…" : structureStats.totalCA_Prog}</div>
              <div className="stat-item"><div className="stat-dot cva"></div> CVA: {apptsLoading ? "…" : structureStats.totalCVA_Prog}</div>
              <div className="stat-item"><div className="stat-dot" style={{ background: 'cyan' }}></div> S1 On: {apptsLoading ? "…" : structureStats.totalS1Online_Prog}</div>
              <div className="stat-item"><div className="stat-dot" style={{ background: 'orange' }}></div> S1 Live: {apptsLoading ? "…" : structureStats.totalS1Live_Prog}</div>
            </div>
            <div className="card-footer">Somma storica agenda.</div>
          </div>

          <div className="card card-structure">
            <div className="card-header">
              <div className="card-title">Mese Programmati</div>
            </div>
            <div className="card-value">{apptsLoading ? "…" : structureStats.monthProg}</div>
            <div className="card-subvalue">
              <div className="stat-item"><div className="stat-dot ca"></div> CA: {apptsLoading ? "…" : structureStats.monthCA_Prog}</div>
              <div className="stat-item"><div className="stat-dot cva"></div> CVA: {apptsLoading ? "…" : structureStats.monthCVA_Prog}</div>
              <div className="stat-item"><div className="stat-dot" style={{ background: 'cyan' }}></div> S1 On: {apptsLoading ? "…" : structureStats.monthS1Online_Prog}</div>
              <div className="stat-item"><div className="stat-dot" style={{ background: 'orange' }}></div> S1 Live: {apptsLoading ? "…" : structureStats.monthS1Live_Prog}</div>
            </div>
            <div className="card-footer">Agenda mese corrente.</div>
          </div>

          <div className="card card-structure">
            <div className="card-header">
              <div className="card-title">Settimana Programmati</div>
            </div>
            <div className="card-value">{apptsLoading ? "…" : structureStats.weekProg}</div>
            <div className="card-subvalue">
              <div className="stat-item"><div className="stat-dot ca"></div> CA: {apptsLoading ? "…" : structureStats.weekCA_Prog}</div>
              <div className="stat-item"><div className="stat-dot cva"></div> CVA: {apptsLoading ? "…" : structureStats.weekCVA_Prog}</div>
              <div className="stat-item"><div className="stat-dot" style={{ background: 'cyan' }}></div> S1 On: {apptsLoading ? "…" : structureStats.weekS1Online_Prog}</div>
              <div className="stat-item"><div className="stat-dot" style={{ background: 'orange' }}></div> S1 Live: {apptsLoading ? "…" : structureStats.weekS1Live_Prog}</div>
            </div>
            <div className="card-footer">Agenda settimanale.</div>
          </div>

          {/* ROW 2: ESEGUITI */}
          <div className="card card-structure">
            <div className="card-header">
              <div className="card-title" style={{ color: 'var(--success)' }}>Totale Eseguiti</div>
            </div>
            <div className="card-value">{apptsLoading ? "…" : structureStats.totalExec}</div>
            <div className="card-subvalue">
              <div className="stat-item"><div className="stat-dot ca"></div> CA: {apptsLoading ? "…" : structureStats.totalCA_Exec}</div>
              <div className="stat-item"><div className="stat-dot cva"></div> CVA: {apptsLoading ? "…" : structureStats.totalCVA_Exec}</div>
              <div className="stat-item"><div className="stat-dot" style={{ background: 'cyan' }}></div> S1 On: {apptsLoading ? "…" : structureStats.totalS1Online_Exec}</div>
              <div className="stat-item"><div className="stat-dot" style={{ background: 'orange' }}></div> S1 Live: {apptsLoading ? "…" : structureStats.totalS1Live_Exec}</div>
            </div>
            <div className="card-footer">Storico eseguiti (Pos/Neg).</div>
          </div>

          <div className="card card-structure">
            <div className="card-header">
              <div className="card-title" style={{ color: 'var(--success)' }}>Mese Eseguiti</div>
            </div>
            <div className="card-value">{apptsLoading ? "…" : structureStats.monthExec}</div>
            <div className="card-subvalue">
              <div className="stat-item"><div className="stat-dot ca"></div> CA: {apptsLoading ? "…" : structureStats.monthCA_Exec}</div>
              <div className="stat-item"><div className="stat-dot cva"></div> CVA: {apptsLoading ? "…" : structureStats.monthCVA_Exec}</div>
              <div className="stat-item"><div className="stat-dot" style={{ background: 'cyan' }}></div> S1 On: {apptsLoading ? "…" : structureStats.monthS1Online_Exec}</div>
              <div className="stat-item"><div className="stat-dot" style={{ background: 'orange' }}></div> S1 Live: {apptsLoading ? "…" : structureStats.monthS1Live_Exec}</div>
            </div>
            <div className="card-footer">Eseguiti mese corrente.</div>
          </div>

          <div className="card card-structure">
            <div className="card-header">
              <div className="card-title" style={{ color: 'var(--success)' }}>Settimana Eseguiti</div>
            </div>
            <div className="card-value">{apptsLoading ? "…" : structureStats.weekExec}</div>
            <div className="card-subvalue">
              <div className="stat-item"><div className="stat-dot ca"></div> CA: {apptsLoading ? "…" : structureStats.weekCA_Exec}</div>
              <div className="stat-item"><div className="stat-dot cva"></div> CVA: {apptsLoading ? "…" : structureStats.weekCVA_Exec}</div>
              <div className="stat-item"><div className="stat-dot" style={{ background: 'cyan' }}></div> S1 On: {apptsLoading ? "…" : structureStats.weekS1Online_Exec}</div>
              <div className="stat-item"><div className="stat-dot" style={{ background: 'orange' }}></div> S1 Live: {apptsLoading ? "…" : structureStats.weekS1Live_Exec}</div>
            </div>
            <div className="card-footer">Eseguiti settimanale.</div>
          </div>
        </div>
      </section>

      {/* 3) KPI */}
      <section className={"cards-wrapper" + (activeTab !== "kpi" ? " tab-hidden-mobile" : "")}>
        <h2 className="cards-section-title">KPI Struttura (Mese Corrente)</h2>
        <p className="cards-section-subtitle">Analisi efficienza, frequenza e qualità su tutta la rete selezionata.</p>

        <div className="cards-grid">
          {/* 1. EXECUTION RATE */}
          <div className="card card-structure">
            <div className="card-header">
              <div className="card-title">
                <Layout size={14} className="card-icon" />
                Tasso di Esecuzione
              </div>
              <div className="card-chip">Efficienza</div>
            </div>
            <div className="card-value">{kpi.execRate.toFixed(1)}%</div>
            <div className="card-subvalue">
              {kpi.execCount30d} eseguiti su {kpi.validCount30d} programmati
            </div>
            <div className="card-footer">
              <div style={{ width: '100%', height: 4, background: 'rgba(255,255,255,0.1)', borderRadius: 4, marginTop: 8, overflow: 'hidden' }}>
                <div style={{ width: `${Math.min(kpi.execRate, 100)}%`, height: '100%', background: '#0ea5e9' }}></div>
              </div>
            </div>
          </div>

          {/* 2. WEEKLY FREQUENCY */}
          <div className="card card-secondary">
            <div className="card-header">
              <div className="card-title">
                <Clock size={14} className="card-icon" />
                Ritmo Settimanale
              </div>
              <div className="card-chip">Frequenza</div>
            </div>
            <div className="card-value">{kpi.freq}</div>
            <div className="card-subvalue">
              Appuntamenti eseguiti / settimana
            </div>
            <div className="card-footer">Media sul mese corrente.</div>
          </div>

          {/* 3. SUCCESS RATE */}
          <div className="card card-success">
            <div className="card-header">
              <div className="card-title">
                <TrendingUp size={14} className="card-icon" />
                Tasso di Successo
              </div>
              <div className="card-chip">Qualità</div>
            </div>
            <div className="card-value">{kpi.successRate.toFixed(1)}%</div>
            <div className="card-subvalue">
              {kpi.posCount30d} positivi su {kpi.execCount30d} eseguiti
            </div>
            <div className="card-footer">
              <div style={{ width: '100%', height: 4, background: 'rgba(255,255,255,0.1)', borderRadius: 4, marginTop: 8, overflow: 'hidden' }}>
                <div style={{ width: `${Math.min(kpi.successRate, 100)}%`, height: '100%', background: '#22c55e' }}></div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 4) STORICO */}
      <section className={"cards-wrapper" + (activeTab !== "history" ? " tab-hidden-mobile" : "")}>
        <h2 className="cards-section-title">Agenda appuntamenti</h2>
        <p className="cards-section-subtitle">Storico completo (per ora: struttura selezionata).</p>

        {structureError ? <div className="error visible">{structureError}</div> : null}

        {apptsLoading ? (
          <div className="cards-grid" style={{ marginTop: 20 }}>
            <div className="card" style={{ textAlign: "center", padding: 30 }}>Caricamento in corso...</div>
          </div>
        ) : !structureStats.list.length ? (
          <div className="cards-grid" style={{ marginTop: 20 }}>
            <div className="card" style={{ textAlign: "center", padding: 30 }}>Nessun appuntamento trovato.</div>
          </div>
        ) : (
          <div className="agenda-wrapper" style={{ marginTop: 20 }} key={activeTab}>
            {(() => {
              // 1. Sort by date ascending to build timelines correctly
              const sorted = [...structureStats.list].sort((a, b) => (toMillis(a.dataOra) || 0) - (toMillis(b.dataOra) || 0));

              // 2. Group by Unique Person (Name + Surname)
              const peopleMap = new Map();

              sorted.forEach(a => {
                const rawName = (a.nome || "") + " " + (a.cognome || "");
                const normalizedKey = rawName.trim().toLowerCase();
                if (!normalizedKey) return;

                if (!peopleMap.has(normalizedKey)) {
                  peopleMap.set(normalizedKey, {
                    nameDisplay: rawName.trim(), // Keep original casing of first occurrence
                    appointments: [],
                    latestDate: 0
                  });
                }
                const person = peopleMap.get(normalizedKey);
                person.appointments.push(a);
                // Update latest date for sorting the cards themselves
                const ms = toMillis(a.dataOra);
                if (ms > person.latestDate) person.latestDate = ms;
              });

              // 3. Convert to array and sort by "Latest Activity" descending (so recent people are top)
              const groupedPeople = Array.from(peopleMap.values()).sort((a, b) => b.latestDate - a.latestDate);

              if (groupedPeople.length === 0) return <div style={{ textAlign: "center", padding: 20 }}>Nessun dato.</div>;

              return groupedPeople.map((person, i) => <PersonAgendaCard key={i} person={person} firebaseUser={firebaseUser} openView={openView} openEdit={openEdit} onReschedule={handleReschedule} />); // Added onReschedule
            })()}
          </div>
        )}
      </section>



      {/* 5) DA RISENTIRE */}
      <section className={"cards-wrapper" + (activeTab !== "recall" ? " tab-hidden-mobile" : "")}>
        <h2 className="cards-section-title">Da Richiamare</h2>
        <p className="cards-section-subtitle">Appuntamenti da richiamare o gestire.</p>

        {apptsLoading ? (
          <div className="cards-grid" style={{ marginTop: 20 }}>
            <div className="card" style={{ textAlign: "center", padding: 30 }}>Caricamento...</div>
          </div>
        ) : (
          <div className="agenda-wrapper" style={{ marginTop: 20 }} key={activeTab}>
            {(() => {
              const recallList = structureStats.list.filter(a => {
                const s = String(a.stato || a.status || "").toLowerCase();
                return s.includes("da risentire") || s.includes("da richiamare") || s.includes("da_risentire") || s.includes("da_richiamare");
              });

              if (!recallList.length) {
                return (
                  <div className="cards-grid">
                    <div className="card" style={{ textAlign: "center", padding: 30 }}>
                      Nessun appuntamento "Da Richiamare".
                    </div>
                  </div>
                );
              }

              const sorted = [...recallList].sort((a, b) => (toMillis(b.dataOra) || 0) - (toMillis(a.dataOra) || 0));
              // Grouping logic (same as Agenda)
              const groups = [];
              let lastLabel = null;
              let currentGroup = null;

              sorted.forEach(a => {
                const ms = toMillis(a.dataOra);
                let label = "Data sconosciuta";
                if (ms) {
                  const d = new Date(ms);
                  const today = new Date();
                  const t0 = new Date(today); t0.setHours(0, 0, 0, 0);
                  const d0 = new Date(d); d0.setHours(0, 0, 0, 0);
                  const diff = t0.getTime() - d0.getTime();
                  const oneDay = 86400000;
                  if (diff === 0) label = "Oggi";
                  else if (diff === oneDay) label = "Ieri";
                  else if (diff === -oneDay) label = "Domani";
                  else label = d.toLocaleDateString("it-IT", { day: 'numeric', month: 'long', year: 'numeric' });
                }

                if (label !== lastLabel) {
                  currentGroup = { label, items: [] };
                  groups.push(currentGroup);
                  lastLabel = label;
                }
                currentGroup.items.push(a);
              });

              return groups.map((g, i) => (
                <div key={i} className="agenda-group">
                  <div className="agenda-date-header" style={{
                    fontSize: 11, fontWeight: 700, color: '#64748b',
                    textTransform: 'uppercase', letterSpacing: '0.05em',
                    marginTop: i > 0 ? 16 : 0, marginBottom: 8, paddingLeft: 16
                  }}>
                    {g.label}
                  </div>
                  <div className="agenda-list" style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
                    {g.items.map(a => {
                      const ms = toMillis(a.dataOra);
                      const hh = ms ? new Date(ms).toLocaleTimeString("it-IT", { hour: '2-digit', minute: '2-digit' }) : "--:--";
                      const bClass = statusClassForBadge(a);
                      const dotMap = { positive: 'pos', negative: 'neg', scheduled: 'sched' };
                      const dotType = dotMap[bClass] || 'sched';
                      const isMe = a.uid && firebaseUser?.uid && a.uid === firebaseUser.uid;

                      return (
                        <div key={a.id} className={`agenda-card-modern ${dotType}`}>
                          <div className="agenda-time-box">
                            <div className="agenda-time">{hh}</div>
                            <div className="agenda-type">{a.tipo || "CA"}</div>
                          </div>

                          <div className="agenda-info">
                            <div className="agenda-client">{(a.nome || "") + " " + (a.cognome || "")}</div>
                            <div className="agenda-sub">
                              {a.uid === firebaseUser?.uid ? "Tu" : "Collab."} • <span style={{ opacity: 0.8 }}>{a.stato || "-"}</span>
                            </div>
                          </div>

                          <div className="agenda-actions">
                            {/* Tasto Chiama Diretto (Verde) */}
                            {a.telefono && (
                              <button
                                type="button"
                                className="btn-icon-soft"
                                onClick={() => window.location.href = `tel:${a.telefono}`}
                                title="Chiama"
                                style={{ color: '#22c55e', borderColor: 'rgba(34, 197, 94, 0.3)', background: 'rgba(34, 197, 94, 0.1)' }}
                              >
                                <Phone size={16} />
                              </button>
                            )}

                            <button type="button" className="btn-icon-soft" onClick={() => openView(a)} title="Visualizza">
                              <Eye size={16} />
                            </button>
                            {isMe && (
                              <button type="button" className="btn-icon-soft" onClick={() => openEdit(a)} title="Modifica">
                                <StickyNote size={16} />
                              </button>
                            )}
                            {/* NEW: Rifissa in recall tab */}
                            {isMe && (
                              <button type="button" className="btn-icon-soft" onClick={() => handleReschedule(a)} title="Rifissa">
                                <RefreshCw size={16} />
                              </button>
                            )}
                            {/* [NEW] Delete Button */}
                            {isMe && (
                              <button type="button" className="btn-icon-soft" onClick={() => handleDelete(a)} title="Elimina" style={{ color: '#ef4444', borderColor: 'rgba(239, 68, 68, 0.3)', background: 'rgba(239, 68, 68, 0.1)' }}>
                                <Trash2 size={16} />
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ));
            })()}
          </div>
        )}
      </section>

      {/* ==========================
          ✅ MODAL DETTAGLIO PERSONALE
          ========================== */}
      {isDetailOpen && (
        <div className="crm-modal-overlay" role="dialog" aria-modal="true">
          <div className="crm-modal variant-detail" style={{ maxWidth: "900px" }}>
            <div className="crm-modal-header">
              <div className="crm-modal-title">{detailTitle}</div>
              <button className="crm-modal-close" onClick={closeDetail} aria-label="Chiudi">
                ×
              </button>
            </div>

            <div className="crm-modal-body">
              <div className="tabs">
                <button type="button" className={"tab-btn" + (detailMode === "all" ? " active" : "")} onClick={() => setDetailMode("all")}>
                  Totali
                </button>
                <button type="button" className={"tab-btn" + (detailMode === "week" ? " active" : "")} onClick={() => setDetailMode("week")}>
                  Settimana
                </button>
                <button type="button" className={"tab-btn" + (detailMode === "month" ? " active" : "")} onClick={() => setDetailMode("month")}>
                  Mese
                </button>
              </div>

              <div className="agenda-wrapper-in-modal" style={{ marginTop: 20 }}>
                {(() => {
                  const sorted = [...detailRows].sort((a, b) => (toMillis(b.dataOra) || 0) - (toMillis(a.dataOra) || 0));

                  if (sorted.length === 0) {
                    return (
                      <div style={{ textAlign: "center", padding: "40px 20px", color: "var(--text-dim)", fontSize: 13 }}>
                        Nessun appuntamento in questa vista.
                      </div>
                    );
                  }

                  const groups = [];
                  let lastLabel = null;
                  let currentGroup = null;

                  sorted.forEach(a => {
                    const ms = toMillis(a.dataOra);
                    let label = "Data sconosciuta";
                    if (ms) {
                      const d = new Date(ms);
                      const today = new Date();
                      const t0 = new Date(today); t0.setHours(0, 0, 0, 0);
                      const d0 = new Date(d); d0.setHours(0, 0, 0, 0);
                      const diff = t0.getTime() - d0.getTime();
                      const oneDay = 86400000;
                      if (diff === 0) label = "Oggi";
                      else if (diff === oneDay) label = "Ieri";
                      else if (diff === -oneDay) label = "Domani";
                      else label = d.toLocaleDateString("it-IT", { day: 'numeric', month: 'long', year: 'numeric' });
                    }

                    if (label !== lastLabel) {
                      currentGroup = { label, items: [] };
                      groups.push(currentGroup);
                      lastLabel = label;
                    }
                    currentGroup.items.push(a);
                  });

                  return groups.map((g, i) => (
                    <div key={i} className="agenda-group">
                      <div className="agenda-date-header" style={{
                        fontSize: 11, fontWeight: 700, color: '#64748b',
                        textTransform: 'uppercase', letterSpacing: '0.05em',
                        marginTop: i > 0 ? 16 : 0, marginBottom: 8, paddingLeft: 16
                      }}>
                        {g.label}
                      </div>
                      <div className="agenda-list" style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
                        {g.items.map(a => {
                          const ms = toMillis(a.dataOra);
                          const hh = ms ? new Date(ms).toLocaleTimeString("it-IT", { hour: '2-digit', minute: '2-digit' }) : "--:--";
                          const bClass = statusClassForBadge(a);
                          const dotMap = { positive: 'pos', negative: 'neg', scheduled: 'sched' };
                          const dotType = dotMap[bClass] || 'sched';

                          // In detail modal, we might want to allow edit if it's "me"
                          const isMe = a.uid && firebaseUser?.uid && a.uid === firebaseUser.uid;

                          return (
                            <div key={a.id} className={`agenda-card-modern ${dotType}`}>
                              <div className="agenda-time-box">
                                <div className="agenda-time">{hh}</div>
                                <div className="agenda-type">{a.tipo || "CA"}</div>
                              </div>

                              <div className="agenda-info">
                                <div className="agenda-client">{(a.nome || "") + " " + (a.cognome || "")}</div>
                                <div className="agenda-sub">
                                  {a.stato || "-"}
                                </div>
                              </div>

                              <div className="agenda-actions">
                                <button type="button" className="btn-icon-soft" onClick={() => openView(a)} title="Visualizza">
                                  <Eye size={16} />
                                </button>
                                {/* Optional: allow edit from detail view too if needed, keeping it consistent with Agenda */}
                                {isMe && (
                                  <button type="button" className="btn-icon-soft" onClick={() => openEdit(a)} title="Modifica">
                                    <StickyNote size={16} />
                                  </button>
                                )}
                                {/* NEW: Rifissa in detail modal */}
                                {isMe && (
                                  <button type="button" className="btn-icon-soft" onClick={() => handleReschedule(a)} title="Rifissa">
                                    <RefreshCw size={16} />
                                  </button>
                                )}
                              </div>
                              {/* [NEW] Delete Button in Detail Modal */}
                              {isMe && (
                                <button type="button" className="btn-icon-soft" onClick={() => handleDelete(a)} title="Elimina" style={{ marginLeft: 4, color: '#ef4444', borderColor: 'rgba(239, 68, 68, 0.3)', background: 'rgba(239, 68, 68, 0.1)' }}>
                                  <Trash2 size={16} />
                                </button>
                              )}
                            </div>

                          );
                        })}
                      </div>
                    </div>
                  ));
                })()}
              </div>
            </div>

            <div className="crm-modal-footer">
              <button className="btn-secondary" onClick={closeDetail}>
                Chiudi
              </button>
            </div>
          </div>
        </div>
      )
      }

      {/* ==========================
          ✅ MODAL OBIETTIVO
          ========================== */}
      {
        isGoalOpen && (
          <div
            className="crm-modal-overlay"
            role="dialog"
            aria-modal="true"
            onMouseDown={(e) => {
              if (e.target === e.currentTarget) closeGoal();
            }}
          >
            <div className="crm-modal variant-goal" style={{ maxWidth: "520px" }} onMouseDown={(e) => e.stopPropagation()}>
              <div className="crm-modal-header">
                <div className="crm-modal-title">Imposta obiettivo del mese</div>
                <button className="crm-modal-close" onClick={closeGoal} aria-label="Chiudi">
                  ×
                </button>
              </div>

              <div className="crm-modal-body">
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
                  <label className="form-field">
                    <div className="form-label">Target CA</div>
                    <input
                      className="input"
                      type="number"
                      min="0"
                      inputMode="numeric"
                      value={goalDraft.ca}
                      onChange={(e) => setGoalDraft((p) => ({ ...p, ca: e.target.value }))}
                    />
                  </label>

                  <label className="form-field">
                    <div className="form-label">Target CVA</div>
                    <input
                      className="input"
                      type="number"
                      min="0"
                      inputMode="numeric"
                      value={goalDraft.cva}
                      onChange={(e) => setGoalDraft((p) => ({ ...p, cva: e.target.value }))}
                    />
                  </label>
                </div>

                <div style={{ marginTop: "10px", color: "var(--text-dim)", fontSize: "12px", lineHeight: 1.4 }}>
                  L&apos;obiettivo viene salvato in locale su questo dispositivo (localStorage).
                </div>
              </div>

              <div className="crm-modal-footer" style={{ justifyContent: "flex-end", gap: "10px" }}>
                <button className="btn-secondary" onClick={closeGoal}>
                  Annulla
                </button>
                <button className="btn-primary" onClick={saveGoal}>
                  Salva
                </button>
              </div>
            </div>
          </div>
        )
      }

      {/* ==========================
          ✅ MODAL VISUALIZZA APPUNTAMENTO (dettaglio + NOTE)
          ========================== */}
      {
        isViewOpen && viewAppt && (
          <div
            className="crm-modal-overlay"
            role="dialog"
            aria-modal="true"
            onMouseDown={(e) => {
              if (e.target === e.currentTarget) closeView();
            }}
          >
            <div className="crm-modal variant-view" style={{ maxWidth: 720 }} onMouseDown={(e) => e.stopPropagation()}>
              <div className="crm-modal-header" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <div className="icon-badge" aria-hidden="true">
                    <Eye size={16} />
                  </div>
                  <div>
                    <div className="crm-modal-title">Visualizza appuntamento</div>
                    <div className="helper" style={{ marginTop: 2 }}>
                      {(() => {
                        const ms = toMillis(viewAppt?.dataOra);
                        if (!ms) return "Data non disponibile";
                        const d = new Date(ms);
                        const dd = d.toLocaleDateString("it-IT");
                        const hh = d.toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" });
                        return `${dd} • ${hh}`;
                      })()}
                    </div>
                  </div>
                </div>

                <button className="crm-modal-close" onClick={closeView} aria-label="Chiudi">
                  <X size={18} />
                </button>
              </div>

              <div className="crm-modal-body">
                <div className="grid-2" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                  <div className="field">
                    <div className="label">Tipo</div>
                    <div className="input" style={{ display: "flex", alignItems: "center" }}>
                      {(viewAppt?.tipo || "-").toString()}
                    </div>
                  </div>

                  <div className="field">
                    <div className="label">Stato</div>
                    <div className="input" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
                      <span>{(viewAppt?.stato || viewAppt?.status || "-").toString()}</span>
                      <span className={`status-badge status-${statusClassForBadge(viewAppt)}`}>
                        {(viewAppt?.stato || viewAppt?.status || "-").toString()}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="grid-2" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginTop: 12 }}>
                  <div className="field">
                    <div className="label">Nome</div>
                    <div className="input">{(viewAppt?.nome || "-").toString()}</div>
                  </div>
                  <div className="field">
                    <div className="label">Cognome</div>
                    <div className="input">{(viewAppt?.cognome || "-").toString()}</div>
                  </div>
                </div>

                <div className="field" style={{ marginTop: 12 }}>
                  <div className="label" style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <StickyNote size={16} />
                    Note
                  </div>
                  <div className="input" style={{ minHeight: 120, whiteSpace: "pre-wrap", lineHeight: 1.45, opacity: 0.95 }}>
                    {String(viewAppt?.note || viewAppt?.descrizione || "").trim() || "Nessuna nota inserita."}
                  </div>
                </div>
              </div>

              <div className="crm-modal-footer" style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
                <button className="btn-secondary" onClick={closeView}>
                  Chiudi
                </button>
              </div>
            </div>
          </div>
        )
      }

      {/* ==========================
          ✅ MODAL MODIFICA APPUNTAMENTO (solo personali)
          ========================== */}
      {
        isEditOpen && editDraft && (
          <div className="crm-modal-overlay" role="dialog" aria-modal="true">
            <div className="crm-modal variant-edit" style={{ maxWidth: 620 }}>
              <div className="crm-modal-header">
                <div className="crm-modal-title">Modifica appuntamento</div>
                <button className="crm-modal-close" onClick={closeEdit} disabled={editSaving} aria-label="Chiudi">
                  ×
                </button>
              </div>

              <div className="crm-modal-body">
                <div className="grid-2" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                  <div className="field">
                    <div className="label">Data</div>
                    <input className="input" type="date" value={editDraft.date} onChange={(e) => setEditDraft((d) => ({ ...d, date: e.target.value }))} />
                  </div>
                  <div className="field">
                    <div className="label">Ora</div>
                    <input className="input" type="time" value={editDraft.time} onChange={(e) => setEditDraft((d) => ({ ...d, time: e.target.value }))} />
                  </div>
                </div>

                <div className="grid-2" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginTop: 12 }}>
                  <div className="field">
                    <div className="label">Tipo</div>
                    <CustomSelect
                      value={editDraft.tipo}
                      options={[
                        { value: "CA", label: "CA" },
                        { value: "CVA", label: "CVA" },
                        { value: "STEPONE ONLINE", label: "STEPONE ONLINE" },
                        { value: "STEPONE LIVE", label: "STEPONE LIVE" },
                      ]}
                      onChange={(v) => setEditDraft((d) => ({ ...d, tipo: v }))}
                      placeholder="Seleziona tipo..."
                    />
                  </div>
                  <div className="field">
                    <div className="label">Esito</div>

                    {/* TOGGLE BUTTONS */}
                    <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
                      <button
                        className={`btn-toggle ${editExecutionType === "eseguito" ? "active" : ""}`}
                        onClick={() => {
                          setEditExecutionType("eseguito");
                          // Default to first option if switching
                          setEditDraft(d => ({ ...d, stato: EXECUTED_OPTS[0] }));
                        }}
                        style={{
                          flex: 1, padding: '8px', borderRadius: 8, border: '1px solid',
                          background: editExecutionType === "eseguito" ? 'rgba(34, 197, 94, 0.2)' : 'transparent',
                          borderColor: editExecutionType === "eseguito" ? 'rgba(34, 197, 94, 0.5)' : 'rgba(148,163,184,0.3)',
                          color: editExecutionType === "eseguito" ? '#22c55e' : 'inherit',
                          fontWeight: 700, fontSize: 13, cursor: 'pointer'
                        }}
                      >
                        Eseguito
                      </button>
                      <button
                        className={`btn-toggle ${editExecutionType === "non_eseguito" ? "active" : ""}`}
                        onClick={() => {
                          setEditExecutionType("non_eseguito");
                          setEditDraft(d => ({ ...d, stato: NOT_EXECUTED_OPTS[0] }));
                        }}
                        style={{
                          flex: 1, padding: '8px', borderRadius: 8, border: '1px solid',
                          background: editExecutionType === "non_eseguito" ? 'rgba(148, 163, 184, 0.2)' : 'transparent',
                          borderColor: editExecutionType === "non_eseguito" ? 'rgba(148, 163, 184, 0.5)' : 'rgba(148,163,184,0.3)',
                          color: editExecutionType === "non_eseguito" ? '#94a3b8' : 'inherit',
                          fontWeight: 700, fontSize: 13, cursor: 'pointer'
                        }}
                      >
                        Non Eseguito
                      </button>
                    </div>

                    <CustomSelect
                      value={editDraft.stato}
                      options={ALL_STATUS_OPTS.map(s => ({ value: s, label: s }))}
                      onChange={(v) => setEditDraft((d) => ({ ...d, stato: v }))}
                      placeholder="Seleziona stato..."
                    />
                  </div>
                </div>

                <div className="grid-2" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginTop: 12 }}>
                  <div className="field">
                    <div className="label">Nome</div>
                    <input className="input" value={editDraft.nome} onChange={(e) => setEditDraft((d) => ({ ...d, nome: e.target.value }))} placeholder="Nome" />
                  </div>
                  <div className="field">
                    <div className="label">Cognome</div>
                    <input className="input" value={editDraft.cognome} onChange={(e) => setEditDraft((d) => ({ ...d, cognome: e.target.value }))} placeholder="Cognome" />
                  </div>
                </div>

                <div className="field" style={{ marginTop: 12 }}>
                  <div className="label">Note (opzionale)</div>
                  <textarea className="input" rows={3} value={editDraft.note} onChange={(e) => setEditDraft((d) => ({ ...d, note: e.target.value }))} placeholder="Aggiungi una nota..." />
                </div>
              </div>

              <div className="crm-modal-footer" style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
                <button className="btn-secondary" onClick={closeEdit} disabled={editSaving}>
                  Annulla
                </button>
                <button className="btn-primary" onClick={saveEdit} disabled={editSaving}>
                  {editSaving ? "Salvataggio..." : "Salva"}
                </button>
              </div>
            </div>
          </div>
        )
      }

      {/* ==========================
          ✅ MODAL CONFERMA ELIMINAZIONE (Custom)
          ========================== */}
      {deleteCandidate && (
        <div className="crm-modal-overlay" role="dialog" aria-modal="true" style={{ zIndex: 99999 }}>
          <div className="crm-modal variant-alert" style={{ maxWidth: 400, border: '1px solid rgba(239, 68, 68, 0.4)', boxShadow: '0 20px 50px rgba(0,0,0,0.5)' }}>
            <div className="crm-modal-header" style={{ borderBottom: 'none', paddingBottom: 0 }}>
              <div className="crm-modal-title" style={{ color: '#ef4444', display: 'flex', alignItems: 'center', gap: 10 }}>
                <Trash2 size={20} />
                Elimina Appuntamento
              </div>
            </div>
            <div className="crm-modal-body" style={{ padding: '20px 24px' }}>
              <p style={{ fontSize: 15, lineHeight: 1.5, opacity: 0.9 }}>
                Sei sicuro di voler eliminare l'appuntamento di <b>{deleteCandidate.nome} {deleteCandidate.cognome}</b>?
              </p>
              <p style={{ fontSize: 13, opacity: 0.6, marginTop: 8 }}>
                L'operazione è irreversibile.
              </p>
            </div>
            <div className="crm-modal-footer" style={{ borderTop: 'none', paddingTop: 0, paddingBottom: 20, paddingRight: 24 }}>
              <button className="btn-secondary" onClick={() => setDeleteCandidate(null)}>
                Annulla
              </button>
              <button
                className="btn-primary"
                onClick={confirmDelete}
                style={{ background: '#ef4444', color: 'white', border: 'none' }}
              >
                Elimina definitvamente
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Styles for Modals */}
      <style>{MODAL_STYLE}</style>
    </main >
  );
}
