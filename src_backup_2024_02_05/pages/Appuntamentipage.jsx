// src/pages/AppuntamentiPage.jsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import "./appuntamenti.css";
import {
  useAuth
} from "../auth/AuthProvider";
import CustomSelect from "../components/CustomSelect";
import { Calendar, Clock, User, Phone, Edit, Trash2, Eye, X, MapPin, Tag, BarChart3, Flag, FileText, Plus, Pencil } from "lucide-react";
import SwipeableActionWrapper from "../components/SwipeableActionWrapper"; // [NEW]
import ContactPickerButton from "../components/ContactPickerButton"; // [NEW]

// ✅ Firestore
import { db } from "../firebase";
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  Timestamp,
  updateDoc,
  where,
  getDoc,
  getDocs,
  setDoc
} from "firebase/firestore";

/**
 * APPUNTAMENTI — Firebase + Google Calendar
 *
 * ✅ Firestore (appointments)
 * - Legge solo gli appuntamenti dell'utente loggato (uid)
 * - Filtra per settimana corrente (weekMonday → weekSunday)
 * - CRUD: crea/modifica/elimina
 *
 * ✅ Google Calendar
 * - Login via AuthProvider.connectGoogleCalendar()
 * - Usa calendarToken.token come OAuth access token per chiamare Calendar API (fetch)
 * - Salva googleEventId sul doc appuntamento per update/delete
 *
 * IMPORTANT:
 * - Per evitare doppi: interagiamo con Google SOLO su eventi con prefisso:
 *   "[CRM] CA" oppure "[CRM] CVA"
 */

const CRM_PREFIX = "[CRM]"; // NON CAMBIARE

// FIX: Helper per normalizzare stato (copiato da dashboard)
function getStatusString(a) {
  return String(a?.stato ?? a?.status ?? a?.esito ?? a?.outcome ?? a?.risultato ?? a?.result ?? "")
    .trim()
    .toLowerCase();
}

function classifyAppointment(a) {
  const s = getStatusString(a);
  const positive = ["positivo", "ok", "chiuso positivo", "contratto", "venduto", "chiusura", "completato positivo", "concluso positivo"];
  const negative = ["negativo", "ko", "annullato", "cancellato", "saltato", "non presentato", "rifiutato", "concluso negativo", "chiuso negativo"];
  const scheduled = ["programmato", "fissato", "da fare", "in programma", "aperto", "pending", "prenotato", "da risentire", "da ricontattare", "da contattare", "rimandato", "da richiamare"];

  const has = (arr) => arr.some((t) => s.includes(t));

  if (has(positive)) return "positive";
  if (has(negative)) return "negative";
  if (has(scheduled)) return "scheduled";
  return "unknown";
}

function statusClassForBadge(a) {
  return classifyAppointment(a);
}

// FIX: Helper per raggruppare appuntamenti per data (visualizzazione mobile)
const groupListByDate = (sortedList) => {
  const groups = [];
  let currentGroup = null;
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today); tomorrow.setDate(tomorrow.getDate() + 1);
  const yesterday = new Date(today); yesterday.setDate(yesterday.getDate() - 1);

  sortedList.forEach(app => {
    const d = app.date;
    if (!d || !(d instanceof Date)) return;
    const dayKey = new Date(d).setHours(0, 0, 0, 0);

    if (!currentGroup || currentGroup.key !== dayKey) {
      let title = "";
      if (dayKey === today.getTime()) title = "OGGI";
      else if (dayKey === tomorrow.getTime()) title = "DOMANI";
      else if (dayKey === yesterday.getTime()) title = "IERI";
      else {
        const days = ['DOM', 'LUN', 'MAR', 'MER', 'GIO', 'VEN', 'SAB'];
        const months = ['GEN', 'FEB', 'MAR', 'APR', 'MAG', 'GIU', 'LUG', 'AGO', 'SET', 'OTT', 'NOV', 'DIC'];
        title = `${days[d.getDay()]} ${d.getDate()} ${months[d.getMonth()]}`;
      }
      currentGroup = { key: dayKey, title, items: [] };
      groups.push(currentGroup);
    }
    currentGroup.items.push(app);
  });
  return groups;
};

// Helper per mappare status -> classe dot css
const getDotClass = (statusStr) => {
  if (statusStr === "positive") return "pos";
  if (statusStr === "negative") return "neg";
  return "sched";
};

// ---------- date helpers ----------
function startOfWeekMonday(d = new Date()) {
  const x = new Date(d);
  const day = x.getDay(); // 0 domenica
  const diff = (day === 0 ? -6 : 1) - day; // lunedì
  x.setDate(x.getDate() + diff);
  x.setHours(0, 0, 0, 0);
  return x;
}
function addDays(date, days) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}
function fmtDate(d) {
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
}
function toDateFromFirestore(v) {
  if (!v) return null;
  if (v instanceof Timestamp) return v.toDate();
  if (v instanceof Date) return v;
  if (typeof v === "number") return new Date(v);
  const dd = new Date(v);
  return Number.isFinite(dd.getTime()) ? dd : null;
}
function buildDateTimeFromInputs(dateStr, timeStr) {
  // dateStr: "YYYY-MM-DD", timeStr: "HH:MM"
  if (!dateStr || !timeStr) return null;
  const [y, m, d] = dateStr.split("-").map((n) => parseInt(n, 10));
  const [hh, mm] = timeStr.split(":").map((n) => parseInt(n, 10));
  const dt = new Date(y, (m || 1) - 1, d || 1, hh || 0, mm || 0, 0, 0);
  return Number.isFinite(dt.getTime()) ? dt : null;
}
function getDayIndexMon0Sun6(date) {
  // JS: Sun=0 ... Sat=6 → vogliamo Mon=0 ... Sun=6
  const d = date.getDay();
  return (d + 6) % 7;
}

// ---------- status helpers ----------
// Unified Status Options
const ALL_STATUS_OPTS = [
  "Programmato",
  "Da Richiamare",
  "Rimandato",
  "Annullato",
  "2 appuntamento",
  "3 appuntamento",
  "CPA",
  "Esito Positivo",
  "Esito Negativo"
];

function normalizeStatus(st) {
  // Simply return the string as is to respect the new simplified logic, 
  // or allow standard lowercase comparison. 
  // For consistency with dashboard.jsx, we just use the string.
  return String(st || "").trim();
}

function getStatusClass(stato) {
  const s = String(stato || "").toLowerCase();

  // GREEN: Esito Positivo
  if (s.includes("esito positivo") || s.includes("ok") || s.includes("venduto") || s === "positivo") return "status-positive";

  // RED: Esito Negativo OR Annullato
  if (s.includes("esito negativo") || s.includes("ko") || s.includes("annullato") || s === "negativo") return "status-negative";

  // YELLOW: Everything else
  return "status-scheduled";
}


// ---------- validation ----------

function isValidEmail(v) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(v || "").trim());
}
function mustBeCrmEvent(summary = "") {
  const s = String(summary || "");
  return s.startsWith(`${CRM_PREFIX} CA`) || s.startsWith(`${CRM_PREFIX} CVA`);
}

// ---------- Google Calendar helpers ----------
// gcalFetch is now provided by useAuth() to handle global token expiration.

function buildGcalSummary(tipo, nome, cognome) {
  const t = String(tipo || "").toUpperCase().trim();
  const base = `${CRM_PREFIX} ${t === "CVA" ? "CVA" : "CA"}`; // default CA
  const full = `${base} — ${String(nome || "").trim()} ${String(cognome || "").trim()}`.trim();
  return full;
}

function buildGcalEventFromAppointment(app) {
  const when = toDateFromFirestore(app?.dataOra) || app?.date;
  if (!when) return null;

  const end = new Date(when);
  end.setMinutes(end.getMinutes() + 60);

  const tipo = String(app?.tipo || "").toUpperCase().trim();
  const summary = buildGcalSummary(tipo, app?.nome, app?.cognome);

  const descr = [
    `Stato: ${normalizeStatus(app?.stato)}`,
    app?.telefono ? `Tel: ${app.telefono}` : "",
    app?.email ? `Email: ${app.email}` : "",
    app?.indirizzo ? `Indirizzo: ${app.indirizzo}` : "",
    app?.note ? `Note: ${app.note}` : "",
    "",
    "(Creato da CRM)",
  ]
    .filter(Boolean)
    .join("\n");

  const event = {
    summary,
    description: descr,
    location: app?.indirizzo || "",
    start: { dateTime: when.toISOString() },
    end: { dateTime: end.toISOString() },
  };

  return event;
}


// ---------- Google description parsing (Tel/Email/Indirizzo/Note) ----------
function parseCrmFieldsFromGcalDescription(desc = "") {
  const s = String(desc || "");
  const out = { telefono: "", email: "", indirizzo: "", note: "", stato: "" };

  // Accetta varianti "Tel:" "Telefono:" etc.
  const tel = s.match(/\b(?:Tel|Telefono)\s*:\s*(.+)/i);
  if (tel && tel[1]) out.telefono = tel[1].split("\n")[0].trim();

  const em = s.match(/\bEmail\s*:\s*(.+)/i);
  if (em && em[1]) out.email = em[1].split("\n")[0].trim();

  const ind = s.match(/\bIndirizzo\s*:\s*(.+)/i);
  if (ind && ind[1]) out.indirizzo = ind[1].split("\n")[0].trim();

  const nt = s.match(/\bNote\s*:\s*(.+)/i);
  if (nt && nt[1]) out.note = nt[1].split("\n")[0].trim();

  const st = s.match(/\bStato\s*:\s*(.+)/i);
  if (st && st[1]) out.stato = st[1].split("\n")[0].trim();

  return out;
}


/**
 * Crea struttura evento con Meet (conferenceData) se richiesto.
 * Nota: per creare conferenza serve conferenceDataVersion=1 in querystring.
 */
function attachMeet(event) {
  const reqId = Math.random().toString(36).slice(2, 12) + Date.now().toString(36);
  return {
    ...event,
    conferenceData: {
      createRequest: {
        requestId: reqId,
        conferenceSolutionKey: { type: "hangoutsMeet" },
      },
    },
  };
}



// ---------- Geo (OpenStreetMap Nominatim, no key) ----------
async function nominatimSearch(q, signal) {
  const qs = encodeURIComponent(q);
  const url = `https://nominatim.openstreetmap.org/search?format=json&addressdetails=1&limit=6&q=${qs}`;
  const res = await fetch(url, {
    method: "GET",
    headers: {
      "Accept": "application/json",
      // Nominatim richiede User-Agent; browser lo gestisce, ma aggiungiamo comunque Referer/Origin in automatico.
    },
    signal,
  });
  if (!res.ok) return [];
  const data = await res.json().catch(() => []);
  if (!Array.isArray(data)) return [];
  return data.map((it) => ({
    label: it.display_name,
    lat: it.lat,
    lon: it.lon,
  }));
}

function formatHms(ts) {
  if (!ts) return "—";
  const d = new Date(ts);
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  const ss = String(d.getSeconds()).padStart(2, "0");
  return `${hh}:${mm}:${ss}`;
}

export default function AppuntamentiPage() {
  const {
    firebaseUser,
    calendarToken,
    connectGoogleCalendar,
    connectGoogleCalendarRedirect, // [NEW]
    disconnectGoogleCalendar,
    gcalFetch, // ✅ Get from context
    profile,
    isAdmin
  } = useAuth();

  // ✅ connesso se ho un token valido
  const isCalendarConnected = Boolean(calendarToken?.token);

  // settimana (solo UI + query)
  const [weekOffset, setWeekOffset] = useState(0);
  const [mobileView, setMobileView] = useState("week");
  const [isBusyMode, setIsBusyMode] = useState(false);
  console.log("DEBUG: AppuntamentiPage render. mobileView=", mobileView, "isBusyMode=", isBusyMode);

  // [NEW] Missing "Busy Mode" logic (Grid)
  const [gridMode, setGridMode] = useState("events"); // "events" | "busy"
  const [busyDefaultLabel, setBusyDefaultLabel] = useState("");
  const [busySlots, setBusySlots] = useState({}); // { "weekKey": { "slotKey": true } }
  const [isDraggingBusy, setIsDraggingBusy] = useState(false);
  const dragActionRef = useRef(null); // "add" | "remove"
  const lastDragSlotRef = useRef(null);

  const isSlotBusy = (wk, sk) => {
    return Boolean(busySlots[wk]?.[sk]);
  };

  const getSlotBusyLabel = (wk, sk) => {
    const val = busySlots[wk]?.[sk];
    return typeof val === "string" ? val : "";
  };

  const setSlotBusy = (wk, sk, val) => {
    setBusySlots(prev => {
      const weekObj = prev[wk] || {};
      const newWeekObj = { ...weekObj };
      if (!val) delete newWeekObj[sk];
      else newWeekObj[sk] = val;
      return { ...prev, [wk]: newWeekObj };
    });
  };

  const toggleSlotBusy = (wk, sk) => {
    setBusySlots(prev => {
      const weekObj = prev[wk] || {};
      const isBusy = weekObj[sk];
      const newWeekObj = { ...weekObj };
      if (isBusy) delete newWeekObj[sk];
      else newWeekObj[sk] = true;
      return { ...prev, [wk]: newWeekObj };
    });
  };

  const clearWeekBusy = (wk) => {
    setBusySlots(prev => {
      const next = { ...prev };
      delete next[wk];
      return next;
    });
  };


  const syncBtnRef = useRef(null);


  const [isSyncing, setIsSyncing] = useState(false);
  const [lastSyncAt, setLastSyncAt] = useState(0);
  const [lastSyncStatus, setLastSyncStatus] = useState('idle'); // idle | syncing | ok | error
  const weekMonday = useMemo(() => {
    const base = startOfWeekMonday(new Date());
    return addDays(base, weekOffset * 7);
  }, [weekOffset]);

  const weekSundayExclusive = useMemo(() => addDays(weekMonday, 7), [weekMonday]);

  const weekLabel = useMemo(() => {
    const monday = weekMonday;
    const sunday = addDays(weekMonday, 6);
    return `${fmtDate(monday)} → ${fmtDate(sunday)}`;
  }, [weekMonday]);

  const weekKey = useMemo(() => {
    const y = weekMonday.getFullYear();
    const m = String(weekMonday.getMonth() + 1).padStart(2, "0");
    const d = String(weekMonday.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }, [weekMonday]);

  // ------------ DATA: appointments from Firestore (real)
  const [apptsLoading, setApptsLoading] = useState(false);
  const [apptsError, setApptsError] = useState("");
  const [appointments, setAppointments] = useState([]);

  // log area
  const [glog, setGlog] = useState([
    `[${new Date().toLocaleTimeString("it-IT")}] UI React caricata.`,
    `[${new Date().toLocaleTimeString("it-IT")}] In attesa di connessione Google Calendar...`,
  ]);

  // UI: mostra/nascondi log Google (console compatta)
  const [showGcalLog, setShowGcalLog] = useState(false);
  const [isTokenExpired, setIsTokenExpired] = useState(false); // [NEW]

  const pushLog = (line) => {
    setGlog((prev) => {
      const ts = new Date().toLocaleTimeString("it-IT");
      return [`[${ts}] ${line}`, ...prev].slice(0, 30);
    });
  };

  // 🔥 subscribe Firestore per settimana corrente (LOGICA VECCHIO CRM)
  useEffect(() => {
    if (!firebaseUser?.uid) return;

    setApptsLoading(true);
    setApptsError("");

    const myUid = firebaseUser.uid;

    const qA = query(
      collection(db, "appointments"),
      where("uid", "==", myUid),
      where("dataOra", ">=", Timestamp.fromDate(weekMonday)),
      where("dataOra", "<", Timestamp.fromDate(weekSundayExclusive)),
      orderBy("dataOra", "asc"),
      limit(2000)
    );

    const unsub = onSnapshot(
      qA,
      (snap) => {
        const rows = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        setAppointments(rows);
        setApptsLoading(false);
      },
      (err) => {
        console.error("appointments snapshot error:", err);
        setApptsError(err?.message || "Errore nel caricamento appuntamenti.");
        setAppointments([]);
        setApptsLoading(false);
        pushLog(
          "Errore query Firestore. Se ti dice 'requires an index', crea indice su appointments: uid + dataOra."
        );
      }
    );

    return () => unsub();
  }, [firebaseUser?.uid, weekMonday, weekSundayExclusive]);

  // ------------ UI state
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingAppointment, setEditingAppointment] = useState(null);

  // ✅ form state (controlled inputs) — evita bug da document.getElementById in React
  // [NEW] Custom Delete Modal State
  const [deleteCandidate, setDeleteCandidate] = useState(null);

  async function confirmDelete() {
    if (!deleteCandidate) return;
    const app = deleteCandidate;

    // Logic extracted from removeAppointment but using local confirm
    try {
      await deleteDoc(doc(db, "appointments", app.id));
      pushLog("Eliminato appuntamento (Firestore) ✅");

      if (calendarToken?.token && app?.googleEventId) {
        try {
          await gcalFetch(`/calendars/primary/events/${encodeURIComponent(app.googleEventId)}`, { method: "DELETE" });
          pushLog("Eliminato evento su Google Calendar ✅");
        } catch (e) {
          console.warn("Google delete event failed:", e);
          pushLog("Google: impossibile eliminare evento (non blocco l'eliminazione).");
        }
      }

      setDeleteCandidate(null);
      // If deleting from detail view, close it
      if (selectedAppointment?.id === app.id) {
        setIsDetailOpen(false);
      }
    } catch (err) {
      console.error("Firestore delete error:", err);
      alert("Errore durante l'eliminazione: " + (err.message || String(err)));
    }
  }

  const EMPTY_FORM = {
    nome: "",
    cognome: "",
    telefono: "",
    email: "",
    indirizzo: "",
    data: "",
    ora: "",
    tipo: "",
    stato: "programmato",
    note: "",
    createMeet: false,
    sendMail: false,
  };
  const [formData, setFormData] = useState(EMPTY_FORM);
  const knownCustomers = [];
  const activeField = "nome";
  const setKnownCustomers = () => { };
  const customersLoaded = true;
  const setCustomersLoaded = () => { };
  const filteredSuggestions = [];
  const setFilteredSuggestions = () => { };
  const showSuggestions = false;
  const setShowSuggestions = () => { };



  // Load known customers on modal open (once)
  useEffect(() => {
    if (isFormOpen && !customersLoaded && firebaseUser?.uid) {
      // Fetch all appointments to build registry
      const q = query(collection(db, "appointments"), where("uid", "==", firebaseUser.uid));
      getDocs(q).then((snap) => {
        const tempMap = new Map();
        snap.forEach(doc => {
          const d = doc.data();
          const key = (d.nome + " " + d.cognome).trim().toLowerCase();
          if (!key) return;

          // Keep the most recent details if duplicates
          // (Simple logic: just overwrite, assuming later docs are newer or random order. 
          // For better precision we could sort by date, but this is usually enough for contact data).
          // Merge strategy: always keep the non-empty value. 
          // If both have values, prefer the latest one (by date).
          let existing = tempMap.get(key);
          const isNewer = !existing || d.dataOra > existing.dataOra;

          if (!existing) {
            // First time seeing this customer
            tempMap.set(key, {
              nome: d.nome || "",
              cognome: d.cognome || "",
              telefono: d.telefono || "",
              email: d.email || "",
              indirizzo: d.indirizzo || "",
              dataOra: d.dataOra
            });
          } else {
            // Merge with existing
            // If d is newer, we take d's values IF they are present, otherwise keep existing.
            // If d is older, we only take d's values if existing is empty.

            const merged = { ...existing };

            if (isNewer) {
              // Update with newer data if present
              if (d.telefono) merged.telefono = d.telefono;
              if (d.email) merged.email = d.email;
              if (d.indirizzo) merged.indirizzo = d.indirizzo;
              merged.dataOra = d.dataOra; // update timestmap
            } else {
              // Older data: fill gaps if existing is empty
              if (!merged.telefono && d.telefono) merged.telefono = d.telefono;
              if (!merged.email && d.email) merged.email = d.email;
              if (!merged.indirizzo && d.indirizzo) merged.indirizzo = d.indirizzo;
            }
            tempMap.set(key, merged);
          }
        });
        setKnownCustomers(Array.from(tempMap.values()));
        setCustomersLoaded(true);
      }).catch(err => console.error("Error loading known customers:", err));
    }
  }, [isFormOpen, customersLoaded, firebaseUser?.uid]);

  // Filter suggestions when typing name/surname


  // Filter suggestions
  useEffect(() => {
    if (!isFormOpen) {
      setFilteredSuggestions([]);
      setShowSuggestions(false);
      return;
    }

    let matches = [];
    const termNome = (formData.nome + " " + formData.cognome).trim().toLowerCase();
    const termTel = (formData.telefono || "").trim().replace(/\s/g, "");
    const termEmail = (formData.email || "").trim().toLowerCase();

    if (activeField === "nome" || activeField === "cognome") {
      if (termNome.length < 1) {
        setFilteredSuggestions([]);
        setShowSuggestions(false);
        return;
      }
      matches = knownCustomers.filter(c => {
        const full = (c.nome + " " + c.cognome).toLowerCase();
        return full.includes(termNome);
      });
    } else if (activeField === "telefono") {
      if (termTel.length < 3) {
        setFilteredSuggestions([]);
        setShowSuggestions(false);
        return;
      }
      matches = knownCustomers.filter(c => {
        const t = (c.telefono || "").replace(/\s/g, "");
        return t.includes(termTel);
      });
    } else if (activeField === "email") {
      if (termEmail.length < 3) {
        setFilteredSuggestions([]);
        setShowSuggestions(false);
        return;
      }
      matches = knownCustomers.filter(c => {
        return (c.email || "").toLowerCase().includes(termEmail);
      });
    }



    setFilteredSuggestions(matches.slice(0, 5));
  }, [formData.nome, formData.cognome, formData.telefono, formData.email, knownCustomers, isFormOpen, activeField]);




  const [selectedAppointmentId, setSelectedAppointmentId] = useState(null);
  const selectedAppointment = useMemo(() => {
    if (!selectedAppointmentId) return null;
    const raw = appointments.find(a => a.id === selectedAppointmentId);
    if (!raw) return null;
    return { ...raw, date: toDateFromFirestore(raw.dataOra) };
  }, [selectedAppointmentId, appointments]);

  const [isDetailOpen, setIsDetailOpen] = useState(false);

  // ... (lines 615-694 omitted, logic remains same)

  const handleView = (app) => {
    if (!app?.id) return;
    setSelectedAppointmentId(app.id);
    setIsDetailOpen(true);
  };

  const handleOpenNew = () => {
    setEditingAppointment(null);
    setFormData(EMPTY_FORM);
    setGeoQuery("");
    setIsFormOpen(true);
  };

  const handleEdit = (app) => {
    setEditingAppointment(app);
    const d = app.date;
    const dateStr = d ? d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0") : "";
    const timeStr = d ? String(d.getHours()).padStart(2, "0") + ":" + String(d.getMinutes()).padStart(2, "0") : "";

    setFormData({
      nome: app.nome || "",
      cognome: app.cognome || "",
      telefono: app.telefono || "",
      email: app.email || "",
      indirizzo: app.indirizzo || "",
      data: dateStr,
      ora: timeStr,
      tipo: app.tipo || "",
      stato: classifyAppointment(app) === "scheduled" ? "programmato" : (normalizeStatus(app.stato) || "programmato"),
      note: app.note || "",
      createMeet: app.createMeet || false,
      sendMail: app.sendMail || false,
    });
    setGeoQuery(app.indirizzo || "");
    setIsFormOpen(true);
  };

  const handleCloseForm = () => setIsFormOpen(false);
  const handleCloseDetail = () => {
    setIsDetailOpen(false);
    setSelectedAppointmentId(null);
  };

  const handlePrevWeek = () => setWeekOffset((prev) => prev - 1);
  const handleNextWeek = () => setWeekOffset((prev) => prev + 1);
  const handleTodayWeek = () => setWeekOffset(0);

  // --- Costanti griglia ---
  const startHour = 8;
  const endHour = 24; // esclusivo (mostra fino alle 23:00)
  const hours = Array.from({ length: endHour - startHour }, (_, i) => startHour + i);
  const days = ["Lun", "Mar", "Mer", "Gio", "Ven", "Sab", "Dom"];

  // ---------- week appointments (da Firestore)
  const weekAppointments = useMemo(() => {
    return (appointments || [])
      .map((a) => {
        const date = toDateFromFirestore(a.dataOra);
        return { ...a, date };
      })
      .filter((a) => a.date instanceof Date && Number.isFinite(a.date.getTime()));
  }, [appointments]);

  // Agenda/Storio mobile
  const now = new Date();
  const futureAppointments = weekAppointments.filter((a) => a.date >= now);
  const pastAppointments = weekAppointments.filter((a) => a.date < now);

  const formatTime = (date) => date.toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" });
  const formatShortDate = (date) => date.toLocaleDateString("it-IT", { weekday: "short", day: "numeric", month: "short" });

  const handleMobileView = (view) => setMobileView(view);

  const todayIdx = (() => {
    const d = new Date().getDay();
    if (d === 0) return 6;
    return d - 1;
  })();

  const visibleDayIndexes = useMemo(() => {
    if (mobileView === "day") return [todayIdx];
    if (mobileView === "3day") return [todayIdx, (todayIdx + 1) % 7, (todayIdx + 2) % 7];
    return [0, 1, 2, 3, 4, 5, 6];
  }, [mobileView, todayIdx]);

  // ✅ Stop drag se rilasci fuori
  useEffect(() => {
    const up = () => {
      setIsDraggingBusy(false);
      lastDragSlotRef.current = null;
    };
    window.addEventListener("mouseup", up);
    window.addEventListener("touchend", up);
    return () => {
      window.removeEventListener("mouseup", up);
      window.removeEventListener("touchend", up);
    };
  }, []);

  // ---------- Google connect/disconnect
  const handleConnectCalendar = async () => {
    try {
      pushLog("Avvio login Google (Calendar scope)...");
      await connectGoogleCalendar();
      pushLog("Google Calendar connesso ✅");
    } catch (e) {
      console.error(e);
      pushLog("Errore connessione Google: " + (e?.message || e));
      alert(e?.message || "Errore connessione Google.");
    }
  };

  const handleDisconnectCalendar = async () => {
    try {
      await disconnectGoogleCalendar();
      pushLog("Google Calendar disconnesso (solo Google).");
      alert(isCalendarConnected ? "Google Calendar disconnesso. Ora puoi ricollegarlo." : "Nessun Google Calendar collegato: token già pulito.");
    } catch (e) {
      console.error(e);
      pushLog("Errore disconnessione Google: " + (e?.message || e));
      alert(e?.message || "Errore disconnessione Google.");
    }
  };

  // ---------- Google sync (lettura eventi settimana: SOLO [CRM] CA/CVA)
  const handleSyncNow = async () => {
    if (!firebaseUser?.uid) {
      alert("Devi essere loggato.");
      return;
    }
    if (!calendarToken?.token) {
      alert("Collega prima Google Calendar.");
      return;
    }

    setIsSyncing(true);
    pushLog("🔄 Sincronizzazione manuale avviata (Google ↔ CRM)...");
    try {
      const uid = firebaseUser.uid;

      // Track prima data evento importata/aggiornata da Google in questa sync
      // (serve per saltare automaticamente alla settimana corretta e farla vedere in griglia)
      let firstImportedDate = null;

      // Stato sync salvato su users/{uid}
      const userRef = doc(db, "users", uid);
      const userSnap = await getDoc(userRef);
      const userData = userSnap.exists() ? userSnap.data() : {};
      let googleSyncToken = userData?.googleSyncToken || null;
      const lastCrmPushAt = userData?.lastCrmPushAt || null;

      // -------------------------
      // GOOGLE -> FIRESTORE
      // Incrementale con syncToken (nessun limite data evento)
      // -------------------------
      const upsertFromGoogle = async (ev) => {
        const summary = ev?.summary || "";
        if (!mustBeCrmEvent(summary)) return { did: false };

        // cancellato su Google
        if (ev?.status === "cancelled") {
          const qy = query(
            collection(db, "appointments"),
            where("uid", "==", uid),
            where("googleEventId", "==", ev.id),
            limit(5)
          );
          const snap = await getDocs(qy);
          let n = 0;
          for (const d of snap.docs) {
            pushLog(`🗑️ Google ha cancellato l'evento "${d.data().nome}". Elimino dal CRM...`);
            await deleteDoc(doc(db, "appointments", d.id));
            n += 1;
          }
          return { did: n > 0, deleted: n };
        }

        const startDT = ev?.start?.dateTime || null;
        if (!startDT) return { did: false }; // skip all-day

        // track date for auto-jump
        try {
          const _d = new Date(startDT);
          if (Number.isFinite(_d.getTime())) {
            if (!firstImportedDate || _d < firstImportedDate) firstImportedDate = _d;
          }
        } catch { }

        const tipo = summary.startsWith(`${CRM_PREFIX} CVA`) ? "CVA" : "CA";

        const cleaned = summary
          .replace(`${CRM_PREFIX} CA`, "")
          .replace(`${CRM_PREFIX} CVA`, "")
          .replace(/^(\s*[—\-:]\s*)/, "")
          .trim();

        const parts = cleaned.split(" ").filter(Boolean);
        const nome = parts.length ? parts[0] : "";
        const cognome = parts.length > 1 ? parts.slice(1).join(" ") : "";

        const meetLink =
          ev?.hangoutLink ||
          ev?.conferenceData?.entryPoints?.find((p) => p?.entryPointType === "video")?.uri ||
          "";

        const parsed = parseCrmFieldsFromGcalDescription(ev?.description || "");
        const eventDate = new Date(startDT);
        const eventTimestamp = Timestamp.fromDate(eventDate);

        const payload = {
          uid,
          tipo,
          nome,
          cognome,
          // ⚠️ IMPORTANTISSIMO:
          // Se l'evento Google non contiene Tel/Email, NON vogliamo sovrascrivere con stringhe vuote.
          // Quindi valorizziamo da descrizione e poi, in update, facciamo merge con i dati esistenti.
          telefono: String(parsed.telefono || "").trim(),
          email: String(parsed.email || "").trim(),
          indirizzo: String((ev?.location || "").trim() || (parsed.indirizzo || "").trim()),
          note: String(parsed.note || "").trim(),
          dataOra: eventTimestamp,
          stato: normalizeStatus(parsed.stato || "programmato"),
          meetLink: meetLink || "",
          googleEventId: ev.id,
          updatedAt: serverTimestamp(),
          source: "google",
        };

        // 1. Cerca per googleEventId (Match Sicuro)
        let qy = query(
          collection(db, "appointments"),
          where("uid", "==", uid),
          where("googleEventId", "==", ev.id),
          limit(1)
        );
        let snap = await getDocs(qy);

        // 2. FALLBACK: Cerca per Data/Ora esatta (Fix Race Condition)
        // Se ho appena creato l'evento, potrebbe non avere ancora il googleEventId salvato su Firestore,
        // ma la data/ora è sicuramente la stessa.
        if (snap.empty) {
          const qyFallback = query(
            collection(db, "appointments"),
            where("uid", "==", uid),
            where("dataOra", "==", eventTimestamp),
            limit(1)
          );
          snap = await getDocs(qyFallback);
          if (!snap.empty) {
            pushLog(`🔗 Trovato appuntamento locale corrispondente (data/ora) per evento Google. Collego IDs.`);
          }
        }

        if (!snap.empty) {
          const docId = snap.docs[0].id;
          const existing = snap.docs[0].data() || {};

          // Se l'evento esistente ha già un googleEventId DIVERSO da quello che sta arrivando,
          // allora è un conflitto o un duplicato strano. Ma se stiamo nel fallback, existing.googleEventId sarà probabilmente vuoto.

          const merged = {
            ...payload,
            telefono: payload.telefono || existing.telefono || "",
            email: payload.email || existing.email || "",
            indirizzo: payload.indirizzo || existing.indirizzo || "",
            note: payload.note || existing.note || "",
            stato: normalizeStatus(payload.stato || existing.stato || "programmato"),
            // mantieni flag CRM se erano già presenti
            createMeet: existing.createMeet ?? false,
            sendMail: existing.sendMail ?? false,
          };

          await updateDoc(doc(db, "appointments", docId), merged);
          return { did: true, updated: 1 };
        } else {
          await addDoc(collection(db, "appointments"), {
            ...payload,
            createdAt: serverTimestamp(),
          });
          return { did: true, imported: 1 };
        }
      };

      const runGoogleSync = async () => {
        let pageToken = null;
        let nextSyncToken = null;
        let imported = 0;
        let updated = 0;
        let deleted = 0;

        for (let guard = 0; guard < 80; guard++) {
          const params = new URLSearchParams();
          params.set("singleEvents", "true");
          params.set("showDeleted", "true");
          params.set("maxResults", "2500");
          if (googleSyncToken) params.set("syncToken", googleSyncToken);
          if (pageToken) params.set("pageToken", pageToken);

          let data;
          try {
            data = await gcalFetch(`/calendars/primary/events?${params.toString()}`);
          } catch (e) {
            const msg = String(e?.message || e);
            // syncToken scaduto -> reset e full
            if (googleSyncToken && (msg.includes(" 410") || msg.includes("410"))) {
              pushLog("⚠️ syncToken scaduto → reset e full sync...");
              googleSyncToken = null;
              pageToken = null;
              continue;
            }
            throw e;
          }

          const items = Array.isArray(data?.items) ? data.items : [];
          for (const ev of items) {
            const r = await upsertFromGoogle(ev);
            imported += r.imported || 0;
            updated += r.updated || 0;
            deleted += r.deleted || 0;
          }

          pageToken = data?.nextPageToken || null;
          nextSyncToken = data?.nextSyncToken || nextSyncToken;
          if (!pageToken) break;
        }

        if (nextSyncToken) {
          googleSyncToken = nextSyncToken;
          await setDoc(userRef, { googleSyncToken }, { merge: true });
        }

        return { imported, updated, deleted };
      };

      pushLog(`Google → CRM: sync ${googleSyncToken ? "incrementale" : "full"}...`);
      const g = await runGoogleSync();
      pushLog(`Google → CRM: importati ${g.imported}, aggiornati ${g.updated}, eliminati ${g.deleted}.`);

      // ✅ Auto-jump: se ho importato qualcosa e non è nella settimana attuale, sposto la griglia
      // La tua griglia mostra SOLO la settimana selezionata, quindi questo ti evita l'effetto "importato ma non lo vedo".
      if (firstImportedDate) {
        try {
          const target = new Date(firstImportedDate);
          target.setHours(0, 0, 0, 0);

          // monday of target
          const day = target.getDay(); // 0 Sun
          const diffToMon = (day === 0 ? -6 : 1) - day;
          const targetMon = new Date(target);
          targetMon.setDate(target.getDate() + diffToMon);
          targetMon.setHours(0, 0, 0, 0);

          // monday of current week (weekMonday è già nel componente)
          const curMon = new Date(weekMonday);
          curMon.setHours(0, 0, 0, 0);

          const diffDays = Math.round((targetMon.getTime() - curMon.getTime()) / (1000 * 60 * 60 * 24));
          const diffWeeks = Math.round(diffDays / 7);

          if (diffWeeks !== 0) {
            setWeekOffset((w) => w + diffWeeks);
            pushLog(`📌 Visualizzazione spostata alla settimana dell'evento importato (${targetMon.toLocaleDateString()}).`);
          }
        } catch { }
      }

      // -------------------------
      // FIRESTORE -> GOOGLE
      // (solo modifiche CRM)
      // -------------------------
      let created = 0;
      let patched = 0;

      const unsyncedQ = query(
        collection(db, "appointments"),
        where("uid", "==", uid),
        where("googleEventId", "==", ""),
        limit(500)
      );
      const unsyncedSnap = await getDocs(unsyncedQ);

      let updatedSnapDocs = [];
      if (lastCrmPushAt) {
        const updQ = query(
          collection(db, "appointments"),
          where("uid", "==", uid),
          where("updatedAt", ">", lastCrmPushAt),
          orderBy("updatedAt", "asc"),
          limit(1000)
        );
        const updSnap = await getDocs(updQ);
        updatedSnapDocs = updSnap.docs;
      }

      const seen = new Set();
      const toPush = [];
      for (const d of [...unsyncedSnap.docs, ...updatedSnapDocs]) {
        if (seen.has(d.id)) continue;
        seen.add(d.id);
        toPush.push(d);
      }

      if (toPush.length) pushLog(`CRM → Google: invio ${toPush.length} appuntamenti...`);

      for (const d of toPush) {
        const ap = d.data() || {};
        const apId = d.id;

        const start = ap?.dataOra?.toDate ? ap.dataOra.toDate() : null;
        if (!start) continue;

        const end = new Date(start);
        end.setMinutes(end.getMinutes() + 60);

        const tipo = ap?.tipo === "CVA" ? "CVA" : "CA";
        const prefix = tipo === "CVA" ? `${CRM_PREFIX} CVA` : `${CRM_PREFIX} CA`;
        const summary = `${prefix} — ${String(ap?.nome || "").trim()} ${String(ap?.cognome || "").trim()}`.trim();

        const descr = [
          `Stato: ${normalizeStatus(ap?.stato)}`,
          ap?.telefono ? `Tel: ${ap.telefono}` : "",
          ap?.email ? `Email: ${ap.email}` : "",
          ap?.indirizzo ? `Indirizzo: ${ap.indirizzo}` : "",
          ap?.note ? `Note: ${ap.note}` : "",
          "",
          "(Creato da CRM)",
        ]
          .filter(Boolean)
          .join("\n");

        const body = {
          summary,
          description: descr,
          location: ap?.indirizzo || "",
          start: { dateTime: start.toISOString() },
          end: { dateTime: end.toISOString() },
          extendedProperties: { private: { crmId: apId, uid, tipo } },
          ...(ap?.sendMail && ap?.email ? { attendees: [{ email: ap.email }] } : {}),
        };

        const evId = String(ap?.googleEventId || "").trim();

        if (!evId) {
          try {
            const createdEv = await gcalFetch(`/calendars/primary/events`, {
              method: "POST",
              body: JSON.stringify(body),
            });
            await updateDoc(doc(db, "appointments", apId), {
              googleEventId: createdEv?.id || "",
              updatedAt: serverTimestamp(),
            });
            created += 1;
          } catch (e) {
            pushLog("Errore creazione evento Google: " + (e?.message || e));
          }
        } else {
          try {
            await gcalFetch(`/calendars/primary/events/${evId}`, {
              method: "PATCH",
              body: JSON.stringify(body),
            });
            patched += 1;
          } catch (e) {
            pushLog("Errore update evento Google: " + (e?.message || e));
          }
        }
      }

      await setDoc(userRef, { lastCrmPushAt: serverTimestamp() }, { merge: true });
      pushLog(`CRM → Google: creati ${created}, aggiornati ${patched}.`);
      pushLog("✅ Sincronizzazione completata.");
    } catch (e) {
      console.error(e);

      if (e.isGcalAuthError) {
        // ✅ Token scaduto: mostriamo modale "Sessione Scaduta"
        pushLog("⚠️ Token Google scaduto. Richiesto login manuale.");
        setIsTokenExpired(true);
      } else {
        pushLog("❌ Errore sync: " + (e?.message || e));
        alert(e?.message || "Errore sincronizzazione.");
      }
    } finally {
      setIsSyncing(false);
    }
  };;
  // ✅ AUTO-CLICK "Sincronizza Ora" quando entri in pagina
  // (replica il click manuale)
  useEffect(() => {
    let alive = true;
    let tries = 0;
    const MAX_TRIES = 30; // ~9s

    const id = setInterval(() => {
      if (!alive) return;
      tries += 1;

      const ready = !!firebaseUser?.uid && !!calendarToken?.token && !!syncBtnRef.current;

      if (ready) {
        syncBtnRef.current.click();
        clearInterval(id);
        alive = false;
        return;
      }

      if (tries >= MAX_TRIES) {
        clearInterval(id);
        alive = false;
      }
    }, 300);

    return () => {
      alive = false;
      clearInterval(id);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ✅ AUTO-REFRESH: ogni volta che entri in Appuntamenti (e quando cambi settimana)
  useEffect(() => {
    // Firestore è già in realtime; qui forziamo il refresh Google (lettura) + log.
    // Non blocchiamo mai la UI.
    handleSyncNow().catch(() => { });
  }, [weekOffset, calendarToken?.token]);


  // ---------- Firestore CRUD + Google upsert
  const upsertAppointment = async (payload, existingId = null, existingGoogleEventId = null) => {
    if (!firebaseUser?.uid) throw new Error("Non autenticato.");

    const clean = {
      uid: firebaseUser.uid,
      nome: String(payload.nome || "").trim(),
      cognome: String(payload.cognome || "").trim(),
      telefono: String(payload.telefono || "").trim(),
      email: String(payload.email || "").trim(),
      indirizzo: String(payload.indirizzo || "").trim(),
      tipo: String(payload.tipo || "").trim().toUpperCase(),
      stato: normalizeStatus(payload.stato),
      note: String(payload.note || "").trim(),
      dataOra: Timestamp.fromDate(payload.date),
      createMeet: Boolean(payload.createMeet),
      sendMail: Boolean(payload.sendMail),
      updatedAt: serverTimestamp(),
    };

    if (!existingId) {
      clean.createdAt = serverTimestamp();
      const ref = await addDoc(collection(db, "appointments"), clean);
      pushLog("Creato appuntamento (Firestore) ✅");
      // opzionale: crea evento su Google SOLO se connesso
      if (calendarToken?.token) {
        try {
          let gEvent = buildGcalEventFromAppointment({ ...clean, dataOra: clean.dataOra });
          if (!gEvent) throw new Error('Dati evento non validi (data/ora).');
          // ✅ collega evento Google ↔ doc Firestore (serve per hard delete inverso)
          gEvent = {
            ...gEvent,
            extendedProperties: {
              private: {
                crmId: ref.id,
                uid: firebaseUser.uid,
              },
            },
          };

          // ✅ se serve Meet: richiede email valida (già validata prima)
          if (clean.createMeet) {
            gEvent = attachMeet(gEvent);
          }

          // ✅ se serve invio email: metto attendee e sendUpdates=all
          // Nota: Google invia invito+reminder (da impostazioni calendario) agli attendees.
          if (clean.sendMail && clean.email) {
            gEvent = { ...gEvent, attendees: [{ email: clean.email }] };
          }

          // ✅ CREA SOLO EVENTI CRM
          if (!mustBeCrmEvent(gEvent?.summary)) {
            // se per qualsiasi motivo non è crm, lo rendo crm (safety)
            gEvent.summary = buildGcalSummary(clean.tipo, clean.nome, clean.cognome);
          }

          const qs = [];
          if (clean.createMeet) qs.push("conferenceDataVersion=1");
          if (clean.sendMail) qs.push("sendUpdates=all");
          const suffix = qs.length ? `?${qs.join("&")}` : "";

          const res = await gcalFetch(`/calendars/primary/events${suffix}`, {
            method: "POST",
            body: JSON.stringify(gEvent),
          });

          if (res?.id) {
            const meetLink = res?.hangoutLink || res?.conferenceData?.entryPoints?.find((p) => p.entryPointType === "video")?.uri || null;

            await updateDoc(doc(db, "appointments", ref.id), {
              googleEventId: res.id,
              meetLink: meetLink || null,
            });

            pushLog("Creato evento su Google Calendar ✅");
            // 🔁 Debug: aggiorna log settimana Google
            handleSyncNow().catch(() => { });
          }
        } catch (e) {
          console.warn("Google create event failed:", e);
          pushLog("Google: impossibile creare evento (non blocco il salvataggio).");
        }
      }

      return ref.id;
    } else {
      await updateDoc(doc(db, "appointments", existingId), clean);
      pushLog("Aggiornato appuntamento (Firestore) ✅");

      // opzionale: aggiorna evento Google se ho googleEventId
      if (calendarToken?.token && existingGoogleEventId) {
        try {
          let gEvent = buildGcalEventFromAppointment({ ...clean, dataOra: clean.dataOra });
          if (!gEvent) throw new Error('Dati evento non validi (data/ora).');
          // ✅ mantiene link evento Google ↔ doc Firestore
          gEvent = {
            ...gEvent,
            extendedProperties: {
              private: {
                crmId: existingId,
                uid: firebaseUser.uid,
              },
            },
          };

          if (clean.createMeet) {
            // patch: su update preferiamo NON rigenerare conference se esiste,
            // ma se non esiste può essere aggiunta. Qui facciamo richiesta createRequest: spesso Google la ignora se già esiste.
            gEvent = attachMeet(gEvent);
          }

          if (clean.sendMail && clean.email) {
            gEvent = { ...gEvent, attendees: [{ email: clean.email }] };
          } else {
            // se togli sendMail, non tocchiamo attendees per non "staccare" inviti già inviati in modo aggressivo
          }

          if (!mustBeCrmEvent(gEvent?.summary)) {
            gEvent.summary = buildGcalSummary(clean.tipo, clean.nome, clean.cognome);
          }

          const qs = [];
          if (clean.createMeet) qs.push("conferenceDataVersion=1");
          if (clean.sendMail) qs.push("sendUpdates=all");
          const suffix = qs.length ? `?${qs.join("&")}` : "";

          const res = await gcalFetch(`/calendars/primary/events/${encodeURIComponent(existingGoogleEventId)}${suffix}`, {
            method: "PATCH",
            body: JSON.stringify(gEvent),
          });

          const meetLink = res?.hangoutLink || res?.conferenceData?.entryPoints?.find((p) => p.entryPointType === "video")?.uri || null;

          await updateDoc(doc(db, "appointments", existingId), {
            meetLink: meetLink || null,
          });

          pushLog("Aggiornato evento su Google Calendar ✅");
          // 🔁 Debug: aggiorna log settimana Google
          handleSyncNow().catch(() => { });
        } catch (e) {
          console.warn("Google patch event failed:", e);
          pushLog("Google: impossibile aggiornare evento (non blocco il salvataggio).");
        }
      }

      return existingId;
    }
  };

  const removeAppointment = async (app) => {
    if (!app?.id) return;
    try {
      await deleteDoc(doc(db, "appointments", app.id));
      pushLog("Eliminato appuntamento (Firestore) ✅");
    } catch (err) {
      console.error("Firestore delete error:", err);
      // Show unexpected error to user
      alert("Errore durante l'eliminazione: " + (err.message || String(err)));
      return; // Stop if firestore delete failed
    }

    if (calendarToken?.token && app?.googleEventId) {
      try {
        await gcalFetch(`/calendars/primary/events/${encodeURIComponent(app.googleEventId)}`, { method: "DELETE" });
        pushLog("Eliminato evento su Google Calendar ✅");
      } catch (e) {
        console.warn("Google delete event failed:", e);
        pushLog("Google: impossibile eliminare evento (non blocco l'eliminazione).");
      }
    }
  };

  // ---------- GEO UI state (modal) ----------
  const [geoQuery, setGeoQuery] = useState("");
  const [geoSuggestions, setGeoSuggestions] = useState([]);
  const [geoOpen, setGeoOpen] = useState(false);
  const geoAbortRef = useRef(null);

  const resetGeo = () => {
    setGeoSuggestions([]);
    setGeoOpen(false);
    if (geoAbortRef.current) {
      try {
        geoAbortRef.current.abort();
      } catch { }
      geoAbortRef.current = null;
    }
  };

  const doGeoSearch = async (q) => {
    const s = String(q || "").trim();
    if (s.length < 4) {
      setGeoSuggestions([]);
      setGeoOpen(false);
      return;
    }

    if (geoAbortRef.current) {
      try {
        geoAbortRef.current.abort();
      } catch { }
    }
    const ctrl = new AbortController();
    geoAbortRef.current = ctrl;

    try {
      const items = await nominatimSearch(s, ctrl.signal);
      setGeoSuggestions(items);
      setGeoOpen(true);
    } catch (e) {
      if (String(e?.name || "") === "AbortError") return;
      setGeoSuggestions([]);
      setGeoOpen(false);
    }
  };

  const fillAddress = (label) => {
    const v = label || "";
    setGeoQuery(v);
    setFormData((p) => ({ ...p, indirizzo: v }));
    setGeoOpen(false);
  };

  const handleUseMyLocation = () => {
    if (!navigator.geolocation) {
      alert("Geolocalizzazione non supportata dal browser.");
      return;
    }
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        try {
          const { latitude, longitude } = pos.coords;
          const url = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${encodeURIComponent(latitude)}&lon=${encodeURIComponent(longitude)}`;
          const res = await fetch(url);
          const data = await res.json().catch(() => null);
          const label = data?.display_name || "";
          if (label) fillAddress(label);
        } catch (e) {
          alert("Impossibile ottenere l'indirizzo dalla posizione.");
        }
      },
      () => alert("Permesso geolocalizzazione negato o errore posizione.")
    );
  };

  // ---------- form submit
  const handleSubmitForm = async (e) => {
    e.preventDefault();

    // ✅ usa lo state (controlled inputs). 
    // 🔒 Fallback DOM: alcuni browser (o autofill) possono NON triggerare onChange.
    const nome = String(formData.nome || document.getElementById("appNome")?.value || "");
    const cognome = String(formData.cognome || document.getElementById("appCognome")?.value || "");
    const telefono = String(formData.telefono || document.getElementById("appTelefono")?.value || "");
    const email = String(formData.email || document.getElementById("appEmail")?.value || "");
    const indirizzo = String(formData.indirizzo || document.getElementById("appIndirizzo")?.value || "");
    const dateStr = String(formData.data || "");
    const timeStr = String(formData.ora || "");
    const tipo = String(formData.tipo || "");
    const stato = String(formData.stato || "programmato");
    const note = String(formData.note || "");
    const createMeet = Boolean(formData.createMeet);
    const sendMail = Boolean(formData.sendMail);

    if (!nome.trim() || !cognome.trim() || !telefono.trim() || !dateStr || !timeStr || !tipo) {
      alert("Compila tutti i campi obbligatori (*)");
      return;
    }

    if (sendMail && !isValidEmail(email)) {
      alert("Per inviare l'invito via email è necessaria una mail valida del cliente.");
      return;
    }

    const dt = buildDateTimeFromInputs(dateStr, timeStr);
    if (!dt) {
      alert("Data/Ora non valide.");
      return;
    }

    try {
      await upsertAppointment(
        { nome, cognome, telefono, email, indirizzo, tipo, stato, note, date: dt, createMeet, sendMail },
        editingAppointment?.id || null,
        editingAppointment?.googleEventId || null
      );

      // ✅ chiudi e reset form
      setIsFormOpen(false);
      setEditingAppointment(null);
      setFormData(EMPTY_FORM);
      setGeoQuery("");
      resetGeo();
    } catch (err) {
      console.error(err);
      alert(err?.message || "Errore salvataggio appuntamento.");
    }
  };

  // ---------- UI render ----------
  return (
    <div className="main appuntamenti-page">
      {/* ✅ SESSION EXPIRED MODAL */}
      {isTokenExpired && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 99999,
          background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(5px)',
          display: 'grid', placeItems: 'center'
        }}>
          <div style={{
            background: 'var(--bg-card)', border: '1px solid var(--border-color)',
            borderRadius: 16, padding: 32, maxWidth: 400, textAlign: 'center',
            boxShadow: '0 25px 50px -12px rgba(0,0,0,0.5)'
          }}>
            <div style={{ fontSize: 48, marginBottom: 16 }}>⚠️</div>
            <h2 style={{ fontSize: 20, fontWeight: 800, color: 'var(--text-main)', marginBottom: 8 }}>Sessione Google Scaduta</h2>
            <p style={{ color: 'var(--text-muted)', marginBottom: 24, lineHeight: 1.5 }}>
              Il token di accesso a Google Calendar è scaduto o non è più valido.
              Per continuare a sincronizzare gli appuntamenti, devi ricollegare l'account.
            </p>
            <button
              className="btn-primary"
              style={{ width: '100%', justifyContent: 'center', height: 48 }}
              onClick={() => {
                setIsTokenExpired(false);
                handleConnectCalendar(); // Usa il popup standard
              }}
            >
              Ricollega Google Calendar
            </button>
            <button
              onClick={() => setIsTokenExpired(false)}
              style={{ marginTop: 16, background: 'none', border: 'none', color: 'var(--text-dim)', fontSize: 13, textDecoration: 'underline', cursor: 'pointer' }}
            >
              Chiudi (Sync disabilitato)
            </button>
          </div>
        </div>
      )}

      {/* ✅ Stile locale: bottone Disconnetti Google in linea col CRM */}
      <style>{`
        .btn-danger-soft{
          border-color: rgba(239,68,68,0.35) !important;
          color: rgba(239,68,68,0.95) !important;
          box-shadow: 0 0 0 1px rgba(239,68,68,0.18) inset;
        }
        .btn-danger-soft:hover{
          border-color: rgba(239,68,68,0.55) !important;
          box-shadow: 0 0 0 1px rgba(239,68,68,0.28) inset;
        }
      
        .gcal-sync-status{ margin-top: 10px; margin-bottom: 10px; }
        .gcal-badge{
          display:inline-flex;
          align-items:center;
          gap:8px;
          padding: 8px 10px;
          border-radius: 999px;
          font-size: 12px;
          font-weight: 800;
          border: 1px solid rgba(148,163,184,0.20);
          background: rgba(148,163,184,0.06);
          color: var(--text-main, rgba(255,255,255,0.9));
        }
        .gcal-badge.ok{
          border-color: rgba(16,185,129,0.35);
          box-shadow: 0 0 0 1px rgba(16,185,129,0.18) inset;
          color: rgba(52,211,153,0.95);
        }
        .gcal-badge.error{
          border-color: rgba(239,68,68,0.35);
          box-shadow: 0 0 0 1px rgba(239,68,68,0.18) inset;
          color: rgba(239,68,68,0.95);
        }
        .gcal-badge.syncing{
          border-color: rgba(139,92,246,0.35);
          box-shadow: 0 0 0 1px rgba(139,92,246,0.18) inset;
          color: rgba(167,139,250,0.95);
        }
        .mini-spinner{
          width: 12px;
          height: 12px;
          border-radius: 999px;
          border: 2px solid rgba(148,163,184,0.30);
          border-top-color: rgba(167,139,250,0.95);
          animation: spin 0.9s linear infinite;
        }
        @keyframes spin{
          from{ transform: rotate(0deg); }
          to{ transform: rotate(360deg); }
        }

        .gcal-logbox{
          margin-top: 8px;
          border-radius: 14px;
          border: 1px solid rgba(148,163,184,0.16);
          background: rgba(2,6,23,0.35);
          overflow: hidden;
        }
        .gcal-loghead{
          display:flex;
          align-items:center;
          justify-content:space-between;
          gap:12px;
          padding: 10px 12px;
          border-bottom: 1px solid rgba(148,163,184,0.12);
          background: rgba(148,163,184,0.06);
        }
        .gcal-logtitle{
          font-weight: 900;
          letter-spacing: 0.2px;
          color: var(--text-main, rgba(255,255,255,0.92));
          font-size: 13px;
          line-height: 1.2;
        }
        .gcal-logsub{
          margin-top: 2px;
          font-size: 12px;
          color: var(--text-dim, rgba(148,163,184,0.88));
        }
        .gcal-logclear{
          padding: 8px 10px !important;
          border-radius: 12px !important;
          font-weight: 800 !important;
          font-size: 12px !important;
        }
        .google-log{
          margin: 0;
          padding: 12px;
          max-height: 90px;
          overflow: auto;
          white-space: pre-wrap;
          font-size: 11px;
          line-height: 1.45;
          color: rgba(226,232,240,0.92);
          font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
        }
        .google-log::-webkit-scrollbar{ height: 10px; width: 10px; }
        .google-log::-webkit-scrollbar-thumb{
          background: rgba(148,163,184,0.22);
          border-radius: 999px;
          border: 2px solid rgba(2,6,23,0.25);
        }
        .google-log::-webkit-scrollbar-track{ background: rgba(2,6,23,0.18); }

        /* ✅ MOBILE: evita che il calendario finisca sotto il tasto “Nuovo Appuntamento” */
        .mobile-bottom-spacer{ display:none; }

        @media (max-width: 720px){
          .google-log{ max-height: 70px; font-size: 10px; }

          /* ✅ Appuntamenti: Google box ancora più compatto su telefono */
          .gcal-section .section-sub{ display:none !important; } /* elimina testo lungo */
          .gcal-section .week-controls{ display:none !important; } /* elimina navigazione date duplicata */
          .gcal-actions-row{ margin-top: 10px !important; margin-bottom: 6px !important; gap: 8px !important; }
          .gcal-sync-status{ margin-top: 6px !important; margin-bottom: 6px !important; }
          .gcal-badge{ padding: 6px 10px !important; font-size: 11px !important; }
          .gcal-loghead{ padding: 8px 10px !important; }
          .gcal-logtitle{ font-size: 12px !important; }
          .gcal-logsub{ font-size: 11px !important; }
          .gcal-logclear{ padding: 7px 9px !important; font-size: 11px !important; border-radius: 10px !important; }

          /* Se il tuo layout usa un contenitore scrollabile, questo spacer garantisce spazio in fondo */
          .mobile-bottom-spacer{
            display:block;
            height: 98px; /* spazio per il bottone + respiro */
          }

          /* Bottone “Nuovo Appuntamento” sempre visibile ma NON copre i contenuti */
          .btn-add-appointment.fab-add{
            position: sticky;
            bottom: calc(14px + env(safe-area-inset-bottom, 0px));
            width: calc(100% - 24px);
            margin: 0 12px 12px 12px;
            z-index: 40;
          }

          /* Se esiste un wrapper footer, non bloccare scroll */
          .add-appointment-footer{
            background: transparent;
          }
        }

        /* ✅ MOBILE: spazio extra in fondo per evitare che il calendario finisca sotto al FAB */
        @media (max-width: 720px){
          .main.appuntamenti-page{
            padding-bottom: 120px; /* spazio globale */
          }
          .month-grid{
            margin-bottom: 120px; /* spazio specifico vista mese */
          }
          .calendar-grid{
            padding-bottom: 120px; /* spazio specifico vista settimana/giorno */
          }

          /* FAB “Nuovo Appuntamento” */
          .btn-add{
            position: fixed;
            left: 12px;
            right: 12px;
            bottom: calc(12px + env(safe-area-inset-bottom, 0px));
            width: calc(100% - 24px);
            z-index: 60;
          }
        }
`}</style>
      {/* HEADER */}
      <div className="main-header">
        <div className="main-header-left">
          <div>
            <h1 className="main-title">Appuntamenti <span style={{ fontSize: '0.45em', background: '#ec4899', color: '#fff', padding: '2px 8px', borderRadius: 4, marginLeft: 8 }}>v.PREMIUM-APPOINTMENTS</span></h1>
            <p className="main-subtitle">Calendario settimanale (Firebase) + sincronizzazione Google</p>
          </div>
        </div>
        <div className="main-header-right">
          <div className={"badge-status " + (isCalendarConnected ? "is-ok" : "is-bad")}>
            {isCalendarConnected ? "Calendar connesso" : "Calendar non connesso"}
          </div>
        </div>
      </div>

      {/* SEZIONE INTEGRAZIONE GOOGLE CALENDAR */}
      <section className="section gcal-section">
        <div className="section-header">
          <div>
            <div className="section-title">Integrazione Google Calendar</div>
            <div className="section-sub">Login Google + sync (lettura) + sync eventi su save. (Solo eventi {CRM_PREFIX} CA/CVA)</div>
          </div>
          <div className="week-controls">
            <button type="button" className="btn-secondary" onClick={handlePrevWeek}>
              ◀
            </button>
            <span className="week-label">{weekLabel}</span>
            <button type="button" className="btn-secondary" onClick={handleTodayWeek}>
              Oggi
            </button>
            <button type="button" className="btn-secondary" onClick={handleNextWeek}>
              ▶
            </button>
          </div>
        </div>

        <div className="gcal-actions-row" style={{ display: "flex", gap: 12, flexWrap: "wrap", marginTop: 20, marginBottom: 8 }}>
          <button type="button" className="btn-secondary btn-danger-soft" onClick={handleDisconnectCalendar}>
            Disconnetti Google
          </button>
          {!isCalendarConnected && (
            <button type="button" className="btn-primary" onClick={handleConnectCalendar}>
              Collega Calendar
            </button>
          )}

          {isCalendarConnected && (
            <button
              type="button"
              className="btn-secondary"
              onClick={handleSyncNow}
              ref={syncBtnRef}
            >
              Sincronizza Ora
            </button>
          )}

          <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 10 }}>
            <div className={"badge-status " + (apptsLoading ? "" : "is-ok")} style={{ opacity: 0.95 }}>
              {apptsLoading ? "Caricamento..." : `Appuntamenti (settimana): ${weekAppointments.length}`}
            </div>
            {apptsError ? (
              <div className="error visible" style={{ margin: 0 }}>
                {apptsError}
              </div>
            ) : null}
          </div>
        </div>


        {/* ✅ Badge Sync Google */}
        <div className="gcal-sync-status">
          <div className={"gcal-badge " + (lastSyncStatus || "idle")}>
            {lastSyncStatus === "syncing" ? (
              <>
                <span className="mini-spinner" aria-hidden="true" />
                <span>Sync in corso...</span>
              </>
            ) : lastSyncStatus === "ok" ? (
              <span>Calendario allineato • {formatHms(lastSyncAt)}</span>
            ) : lastSyncStatus === "error" ? (
              <span>Sync fallito • riprova</span>
            ) : (
              <span>Pronto</span>
            )}
          </div>
        </div>


        <div className="gcal-logbox">
          <div className="gcal-loghead">
            <div className="gcal-loghead-left">
              <div className="gcal-logtitle">Stato sincronizzazione</div>
              <div className="gcal-logsub">{glog[0] || "Nessuna attività recente"}</div>
            </div>

            <div style={{ display: "flex", gap: 8 }}>
              <button
                type="button"
                className="btn-secondary gcal-logclear"
                onClick={() => setShowGcalLog((v) => !v)}
                title={showGcalLog ? "Nascondi log" : "Mostra log"}
              >
                {showGcalLog ? "Nascondi" : "Dettagli"}
              </button>

              <button
                type="button"
                className="btn-secondary gcal-logclear"
                onClick={() => setGlog([])}
                title="Pulisci log"
              >
                Pulisci
              </button>
            </div>
          </div>

          {showGcalLog && <pre className="google-log">{glog.join("\n")}</pre>}
        </div>

      </section>

      {/* CONTROLLI MOBILE */}
      <div className="mobile-wrapper-controls">
        <div className="week-controls-mobile">
          <button type="button" className="btn-secondary" onClick={handlePrevWeek}>
            ◀
          </button>
          <span className="week-label">{weekLabel}</span>
          <button type="button" className="btn-secondary" onClick={handleNextWeek}>
            ▶
          </button>
          <button type="button" className="btn-secondary" style={{ marginLeft: "auto" }} onClick={handleTodayWeek}>
            Oggi
          </button>
        </div>

        <div className="mobile-view-controls">
          <button className={"btn-view-switch " + (mobileView === "agenda" ? "active" : "")} onClick={() => handleMobileView("agenda")}>
            Agenda
          </button>
          <button className={"btn-view-switch " + (mobileView === "history" ? "active" : "")} onClick={() => handleMobileView("history")}>
            Storico
          </button>
          <button className={"btn-view-switch " + (mobileView === "day" ? "active" : "")} onClick={() => handleMobileView("day")}>
            Giorno
          </button>
          <button className={"btn-view-switch " + (mobileView === "3day" ? "active" : "")} onClick={() => handleMobileView("3day")}>
            3 Giorni
          </button>
          <button className={"btn-view-switch " + (mobileView === "week" ? "active" : "")} onClick={() => handleMobileView("week")}>
            Settimana
          </button>
          <button className={"btn-view-switch " + (mobileView === "month" ? "active" : "")} onClick={() => handleMobileView("month")}>
            Mese
          </button>
        </div>
      </div>

      {/* SEZIONE GRIGLIA CALENDARIO */}
      <section
        className={"section section-grid-container " + (mobileView === "agenda" || mobileView === "history" || mobileView === "month" ? "hidden" : "")}
        id="gridSection"
      >
        <div className="section-header">
          <div>
            <div className="section-title">Calendario</div>
            <div className="section-sub">Griglia oraria (gli appuntamenti arrivano da Firestore).</div>
          </div>

          <div className="grid-mode-controls">
            {isBusyMode && (
              <div className="busy-label-wrap">
                <span className="busy-label-title">Testo nuovo blocco</span>
                <input
                  className="busy-label-input"
                  value={busyDefaultLabel}
                  onChange={(e) => setBusyDefaultLabel(e.target.value)}
                  placeholder="Es: Palestra, Pranzo, Visita..."
                />
              </div>
            )}

            <button type="button" className={"btn-secondary " + (!isBusyMode ? "active" : "")} onClick={() => setGridMode("events")}>
              Appuntamenti
            </button>
            <button type="button" className={"btn-secondary " + (isBusyMode ? "active" : "")} onClick={() => setGridMode("busy")}>
              Segna occupato
            </button>

            <button type="button" className="btn-secondary" onClick={() => clearWeekBusy(weekKey)} title="Pulisci blocchi occupato (solo UI)">
              Pulisci occupato
            </button>
          </div>
        </div>

        {isBusyMode && <div className="grid-hint">Suggerimento: trascina il mouse sulle celle per bloccare più ore. Clicca di nuovo per sbloccare.</div>}

        <div className="week-grid-wrapper">
          <table className={"week-grid " + (isBusyMode ? "busy-mode" : "")}>
            <thead>
              <tr id="gridHeaderRow">
                <th className="col-hour">Ora</th>
                {visibleDayIndexes.map((dayIdx) => (
                  <th key={`day-${dayIdx}`} data-day={dayIdx} className={dayIdx === todayIdx ? "current-day" : ""}>
                    {days[dayIdx]}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody id="weekGridBody">
              {hours.map((hour) => (
                <tr key={`h-${hour}`}>
                  <td className="col-hour">{String(hour).padStart(2, "0")}:00</td>
                  {visibleDayIndexes.map((dayIdx) => {
                    const slotKey = `${dayIdx}-${hour}`;
                    const busyHere = isSlotBusy(weekKey, slotKey);

                    const eventsAtCell = weekAppointments.filter((app) => {
                      const d = app.date;
                      if (!(d instanceof Date)) return false;
                      const cellDayIndex = getDayIndexMon0Sun6(d);
                      return cellDayIndex === dayIdx && d.getHours() === hour;
                    });

                    const hasEvent = eventsAtCell.length > 0;

                    const onBusyMouseDown = (e) => {
                      if (!isBusyMode) return;
                      if (hasEvent) return;
                      e.preventDefault();

                      const currentlyBusy = isSlotBusy(weekKey, slotKey);
                      dragActionRef.current = currentlyBusy ? "remove" : "add";
                      setIsDraggingBusy(true);
                      toggleSlotBusy(weekKey, slotKey);
                    };

                    const onBusyMouseEnter = () => {
                      if (!isBusyMode) return;
                      if (!isDraggingBusy) return;
                      if (hasEvent) return;

                      const action = dragActionRef.current;
                      setSlotBusy(weekKey, slotKey, action === "add" ? busyDefaultLabel || "Occupato" : null);
                    };

                    const onBusyClick = () => {
                      if (!isBusyMode) return;
                      if (hasEvent) return;
                      toggleSlotBusy(weekKey, slotKey);
                    };

                    return (
                      <td
                        key={`cell-${hour}-${dayIdx}`}
                        data-slotkey={slotKey}
                        className={"day-cell " + (busyHere ? "is-busy" : "")}
                        onMouseDown={onBusyMouseDown}
                        onMouseEnter={onBusyMouseEnter}
                        onClick={onBusyClick}
                        onPointerDown={(e) => {
                          if (!isBusyMode) return;
                          if (hasEvent) return;

                          const currentlyBusy = isSlotBusy(weekKey, slotKey);
                          dragActionRef.current = currentlyBusy ? "remove" : "add";
                          setIsDraggingBusy(true);
                          lastDragSlotRef.current = slotKey;

                          toggleSlotBusy(weekKey, slotKey);

                          try {
                            e.currentTarget.setPointerCapture(e.pointerId);
                          } catch { }
                        }}
                        onPointerMove={(e) => {
                          if (!isBusyMode) return;
                          if (!isDraggingBusy) return;

                          const el = document.elementFromPoint(e.clientX, e.clientY);
                          if (!el) return;

                          const td = el.closest?.("td.day-cell");
                          const sk = td?.dataset?.slotkey;
                          if (!sk) return;

                          if (lastDragSlotRef.current === sk) return;
                          lastDragSlotRef.current = sk;

                          if (td.querySelector?.(".calendar-event")) return;

                          const action = dragActionRef.current;
                          setSlotBusy(weekKey, sk, action === "add" ? busyDefaultLabel || "Occupato" : null);
                        }}
                        onPointerUp={() => {
                          setIsDraggingBusy(false);
                          lastDragSlotRef.current = null;
                        }}
                        onPointerCancel={() => {
                          setIsDraggingBusy(false);
                          lastDragSlotRef.current = null;
                        }}
                        role={isBusyMode ? "button" : undefined}
                        tabIndex={isBusyMode ? 0 : undefined}
                      >
                        {/* layer "occupato" (solo UI) */}
                        {!hasEvent && busyHere && (
                          <div className="busy-block">
                            <span className="busy-block-text">{getSlotBusyLabel(weekKey, slotKey) || "Occupato"}</span>
                          </div>
                        )}

                        {eventsAtCell.map((app) => (
                          <div
                            key={app.id}
                            className={"calendar-event " + getStatusClass(app.stato)}
                            onClick={() => {
                              if (isBusyMode) return;
                              handleView(app);
                            }}
                            role="button"
                            tabIndex={0}
                          >
                            <div className="calendar-event-main">
                              <span className="calendar-event-type">{String(app.tipo || "").toUpperCase()}</span>
                              <span className="calendar-event-name">{`${app.nome || ""} ${app.cognome || ""}`.trim() || "-"}</span>
                            </div>

                            <div className="calendar-event-actions">
                              <button
                                type="button"
                                title="Vedi dettaglio"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleView(app);
                                }}
                              >
                                👁
                              </button>
                              <button
                                type="button"
                                title="Modifica"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleEdit(app);
                                }}
                              >
                                ✏️
                              </button>
                              <button
                                type="button"
                                title="Elimina"
                                onClick={(e) => {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  setDeleteCandidate(app);
                                }}
                              >
                                🗑
                              </button>
                            </div>
                          </div>
                        ))}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* MOBILE: AGENDA FUTURA */}
      <div className={"mobile-agenda-view " + (mobileView === "agenda" ? "active" : "")} id="mobileAgendaView">
        {apptsLoading ? (
          <div style={{ textAlign: "center", color: "var(--text-muted)", padding: 20 }}>Caricamento…</div>
        ) : futureAppointments.length === 0 ? (
          <div style={{ textAlign: "center", color: "var(--text-muted)", padding: 20 }}>Nessun appuntamento in programma.</div>
        ) : (
          groupListByDate(futureAppointments.slice().sort((a, b) => a.date - b.date)).map((group) => (
            <div key={group.key} className="agenda-group">
              <div className="agenda-date-header">{group.title}</div>
              <div className="agenda-list">
                {group.items.map((app) => (
                  <SwipeableActionWrapper
                    key={app.id}
                    item={app}
                    onCall={(item) => item.telefono ? window.location.href = `tel:${item.telefono}` : alert("Nessun telefono")}
                    onWhatsApp={(item) => item.telefono ? window.open(`https://wa.me/${item.telefono.replace(/\D/g, '')}`, '_blank') : alert("Nessun telefono")}
                  >
                    <div className="agenda-card" onClick={() => handleView(app)}>
                      <div className="agenda-time-box">
                        <div className="agenda-time">{formatTime(app.date)}</div>
                      </div>
                      <div className="agenda-info">
                        <div className="agenda-client">{`${app.nome || ""} ${app.cognome || ""}`.trim()}</div>
                        <div className="agenda-sub">
                          <span className={"status-dot " + getDotClass(statusClassForBadge(app))}></span>
                          <span>{String(app.tipo || "").toUpperCase()}</span>
                        </div>
                      </div>
                      <div className="agenda-actions">
                        <button className="btn-icon-soft" onClick={(e) => { e.stopPropagation(); handleView(app); }} title="Vedi">
                          <Eye size={16} />
                        </button>
                        <button className="btn-icon-soft" onClick={(e) => { e.stopPropagation(); handleEdit(app); }} title="Modifica">
                          <Pencil size={16} />
                        </button>
                        <button className="btn-icon-soft" onClick={(e) => { e.preventDefault(); e.stopPropagation(); setDeleteCandidate(app); }} style={{ color: '#ef4444' }} title="Elimina">
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </div>
                  </SwipeableActionWrapper>
                ))}
              </div>
            </div>
          ))
        )}
      </div>

      {/* MOBILE: STORICO PASSATO */}
      <div className={"mobile-agenda-view " + (mobileView === "history" ? "active" : "")} id="mobileHistoryView">
        {apptsLoading ? (
          <div style={{ textAlign: "center", color: "var(--text-muted)", padding: 20 }}>Caricamento…</div>
        ) : pastAppointments.length === 0 ? (
          <div style={{ textAlign: "center", color: "var(--text-muted)", padding: 20 }}>Nessun appuntamento passato.</div>
        ) : (
          groupListByDate(pastAppointments.slice().sort((a, b) => b.date - a.date)).map((group) => (
            <div key={group.key} className="agenda-group">
              <div className="agenda-date-header">{group.title}</div>
              <div className="agenda-list">
                {group.items.map((app) => (
                  <SwipeableActionWrapper
                    key={app.id}
                    item={app}
                    onCall={(item) => item.telefono ? window.location.href = `tel:${item.telefono}` : alert("Nessun telefono")}
                    onWhatsApp={(item) => item.telefono ? window.open(`https://wa.me/${item.telefono.replace(/\D/g, '')}`, '_blank') : alert("Nessun telefono")}
                  >
                    <div className="agenda-card" style={{ opacity: 0.8 }} onClick={() => handleView(app)}>
                      <div className="agenda-time-box">
                        <div className="agenda-time">{formatTime(app.date)}</div>
                      </div>
                      <div className="agenda-info">
                        <div className="agenda-client">{`${app.nome || ""} ${app.cognome || ""}`.trim()}</div>
                        <div className="agenda-sub">
                          <span className={"status-dot " + getDotClass(statusClassForBadge(app))}></span>
                          <span>{String(app.tipo || "").toUpperCase()}</span>
                        </div>
                      </div>
                      <div className="agenda-actions">
                        <button className="btn-icon-soft" onClick={(e) => { e.stopPropagation(); handleView(app); }} title="Vedi">
                          <Eye size={16} />
                        </button>
                        <button className="btn-icon-soft" onClick={(e) => { e.stopPropagation(); handleEdit(app); }} title="Modifica">
                          <Pencil size={16} />
                        </button>
                        <button className="btn-icon-soft" onClick={(e) => { e.preventDefault(); e.stopPropagation(); setDeleteCandidate(app); }} style={{ color: '#ef4444' }} title="Elimina">
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </div>
                  </SwipeableActionWrapper>
                ))}
              </div>
            </div>
          ))
        )}
      </div>

      {/* MOBILE: VISTA MESE (placeholder UI) */}
      <div className={"mobile-month-view " + (mobileView === "month" ? "active" : "")} id="mobileMonthView">
        {["L", "M", "Ma", "G", "V", "S", "D"].map((d) => (
          <div key={`dow-${d}`} style={{ textAlign: "center", fontWeight: "bold", fontSize: 12 }}>
            {d}
          </div>
        ))}
        {Array.from({ length: 30 }, (_, i) => i + 1).map((day) => {
          const hasEvent = weekAppointments.some((a) => a.date.getDate() === day);
          return (
            <div key={`day-${day}`} className={"month-cell " + (hasEvent ? "has-event" : "")}>
              <span>{day}</span>
              {hasEvent && <div className="month-dot" />}
            </div>
          );
        })}
      </div>

      {/* FLOATING BUTTON NUOVO APPUNTAMENTO */}
      <button className="btn-add" id="btnAddAppointment" type="button" onClick={handleOpenNew}>
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
        </svg>
        <span>Nuovo Appuntamento (v2)</span>
      </button>

      {/* MODALE NUOVO / MODIFICA APPUNTAMENTO */}
      {isFormOpen && (
        <div className="premium-modal-backdrop" id="modalAppointment" onMouseDown={() => setGeoOpen(false)}>
          <div className="premium-modal" onMouseDown={(e) => e.stopPropagation()}>
            <div className="premium-modal-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div className="premium-icon-box"><Calendar size={20} /></div>
                <h3 className="modal-title">{editingAppointment ? "Modifica appuntamento" : "Nuovo appuntamento"}</h3>
              </div>
              <button className="modal-close" type="button" onClick={() => { handleCloseForm(); resetGeo(); }}>
                <X size={20} />
              </button>
            </div>

            <div className="premium-modal-body">
              <form onSubmit={handleSubmitForm}>
                <div className="form-row">
                  <div className="form-group" style={{ position: "relative" }}>
                    <label className="form-label" htmlFor="appNome">
                      Nome*
                    </label>
                    <input
                      type="text"
                      id="appNome"
                      name="nome_crm_new"
                      autoComplete="new-password"
                      className="form-input"
                      placeholder="Nome cliente"
                      value={formData.nome}
                      onChange={(e) => setFormData((p) => ({ ...p, nome: e.target.value }))}
                    />
                  </div>
                  <div className="form-group" style={{ position: "relative" }}>
                    <label className="form-label" htmlFor="appCognome">
                      Cognome*
                    </label>
                    <input
                      type="text"
                      id="appCognome"
                      name="cognome_crm_new"
                      autoComplete="new-password"
                      className="form-input"
                      placeholder="Cognome cliente"
                      value={formData.cognome}
                      onChange={(e) => setFormData((p) => ({ ...p, cognome: e.target.value }))}
                    />
                  </div>
                </div>

                <div className="form-row">
                  <div className="form-group" style={{ position: "relative" }}>
                    <label className="form-label" htmlFor="appTelefono">
                      Telefono*
                    </label>
                    <input
                      type="tel"
                      id="appTelefono"
                      name="telefono_crm_new"
                      autoComplete="new-password"
                      inputMode="tel"
                      className="form-input"
                      placeholder="+39..."
                      value={formData.telefono}
                      onChange={(e) => setFormData((p) => ({ ...p, telefono: e.target.value }))}
                      style={{ paddingRight: 40 }}
                    />
                    <ContactPickerButton
                      className="absolute-picker-btn"
                      iconSize={18}
                      onContactSelected={(c) => {
                        setFormData(prev => {
                          const next = { ...prev, telefono: c.tel || prev.telefono };
                          // Optional: fill name/surname if empty
                          if (c.name && (!prev.nome || !prev.cognome)) {
                            const parts = c.name.trim().split(" ");
                            if (!prev.nome && parts.length > 0) next.nome = parts[0];
                            if (!prev.cognome && parts.length > 1) next.cognome = parts.slice(1).join(" ");
                          }
                          return next;
                        });
                      }}
                    />
                    {/* Add simple style for positioning */}
                    <style>{`
                      .absolute-picker-btn {
                        position: absolute;
                        right: 8px;
                        top: 38px; /* adjust based on label height */
                        color: #00a884 !important;
                      }
                    `}</style>
                  </div>
                  <div className="form-group" style={{ position: "relative" }}>
                    <label className="form-label" htmlFor="appEmail">
                      Email
                    </label>
                    <input
                      type="email"
                      id="appEmail"
                      name="email_crm_new"
                      autoComplete="new-password"
                      className="form-input"
                      placeholder="email@esempio.com"
                      value={formData.email}
                      onChange={(e) => setFormData((p) => ({ ...p, email: e.target.value }))}
                    />
                  </div>
                </div>

                {/* Indirizzo + geo */}
                <div className="form-group">
                  <label className="form-label" htmlFor="appIndirizzo">
                    Indirizzo (geolocalizzato)
                  </label>

                  <div className="geo-row">
                    <input
                      type="text"
                      id="appIndirizzo"
                      className="form-input"
                      placeholder="Cerca via, città..."
                      autoComplete="new-password"
                      value={geoQuery}
                      onChange={(e) => {
                        const v = e.target.value;
                        setGeoQuery(v);
                        setFormData((p) => ({ ...p, indirizzo: v }));
                        doGeoSearch(v);
                      }}
                      onFocus={(e) => {
                        const v = e.target.value;
                        setGeoQuery(v);
                        setFormData((p) => ({ ...p, indirizzo: v }));
                        doGeoSearch(v);
                      }}
                    />
                    <button type="button" className="geo-pin" title="Usa la mia posizione" onClick={handleUseMyLocation}>
                      📍
                    </button>
                  </div>

                  <div className="geo-hint">Suggerimento: scrivi 4+ caratteri e scegli un risultato.</div>

                  {geoOpen && geoSuggestions.length > 0 && (
                    <div className="geo-suggest">
                      {geoSuggestions.map((s, i) => (
                        <button
                          key={`${s.label}-${i}`}
                          type="button"
                          className="geo-suggest-item"
                          onClick={() => fillAddress(s.label)}
                        >
                          {s.label}
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                <div className="form-row">
                  <div className="form-group">
                    <label className="form-label" htmlFor="appData">
                      Data*
                    </label>
                    <input
                      type="date"
                      id="appData"
                      className="form-input"
                      value={formData.data} onChange={(e) => setFormData((p) => ({ ...p, data: e.target.value }))}
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label" htmlFor="appOra">
                      Ora*
                    </label>
                    <input
                      type="time"
                      id="appOra"
                      className="form-input"
                      value={formData.ora} onChange={(e) => setFormData((p) => ({ ...p, ora: e.target.value }))}
                    />
                  </div>
                </div>

                <div className="form-row">
                  <div className="form-group">

                    <label className="form-label">
                      Tipo appuntamento*
                    </label>
                    <CustomSelect
                      options={[
                        { value: "CA", label: "CA - Colloquio Assunzione" },
                        { value: "CVA", label: "CVA - Colloquio Vendita" },
                        { value: "STEPONE ONLINE", label: "StepOne Online" },
                        { value: "STEPONE LIVE", label: "StepOne Live" }
                      ]}
                      value={formData.tipo}
                      onChange={(val) => setFormData((p) => ({ ...p, tipo: val }))}
                      placeholder="Seleziona tipo..."
                    />
                  </div>

                  <div className="form-group">
                    <label className="form-label">
                      Stato Attuale
                    </label>
                    <CustomSelect
                      options={ALL_STATUS_OPTS.map(s => ({ value: s, label: s }))}
                      value={formData.stato}
                      onChange={(val) => setFormData((p) => ({ ...p, stato: val }))}
                    />
                  </div>
                </div>

                <div className="form-group">
                  <label className="form-label" htmlFor="appNote">
                    Note
                  </label>
                  <textarea id="appNote" className="form-textarea" placeholder="Note, dettagli, citofono, interno..." value={formData.note} onChange={(e) => setFormData((p) => ({ ...p, note: e.target.value }))} />
                </div>

                {/* ✅ CHECKBOX: impilate + regola email per Meet */}
                <div className="meet-mail-stack">
                  <label className="check-row">
                    <input type="checkbox" id="appCreateMeet" checked={formData.createMeet} onChange={(e) => setFormData((p) => ({ ...p, createMeet: e.target.checked }))} />
                    <span>Crea Google Meet (richiede email valida)</span>
                  </label>

                  <label className="check-row">
                    <input type="checkbox" id="appSendMail" checked={formData.sendMail} onChange={(e) => setFormData((p) => ({ ...p, sendMail: e.target.checked }))} />
                    <span>Invia mail cliente (invito + reminder)</span>
                  </label>
                </div>

                <div className="premium-modal-footer">
                  <button type="button" className="btn btn-ghost" onClick={() => { handleCloseForm(); resetGeo(); }}>
                    Annulla
                  </button>
                  <button type="submit" className="btn btn-primary">
                    Salva
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* MODALE DETTAGLIO APPUNTAMENTO */}
      {isDetailOpen && selectedAppointment && (
        <div className="premium-modal-backdrop" id="modalViewAppointment">
          <div className="premium-modal">
            <div className="premium-modal-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div className="premium-icon-box"><Eye size={20} /></div>
                <h3 className="modal-title">Dettaglio Appuntamento</h3>
              </div>
              <button className="modal-close" type="button" onClick={handleCloseDetail}>
                <X size={20} />
              </button>
            </div>

            <div className="premium-modal-body">
              <div className="view-row">
                <div className="view-label">Cliente</div>
                <div className="view-value" style={{ fontSize: 16, fontWeight: 600 }}>
                  {`${selectedAppointment.nome || ""} ${selectedAppointment.cognome || ""}`.trim()}
                </div>
              </div>

              <div className="view-row">
                <div className="view-label">Tipo</div>
                <div className="view-value">{String(selectedAppointment.tipo || "").toUpperCase()}</div>
              </div>

              <div className="view-row">
                <div className="view-label">Stato</div>
                <div className="view-value">
                  <span className={"status-badge " + getStatusClass(selectedAppointment.stato)}>
                    {normalizeStatus(selectedAppointment.stato).replaceAll("_", " ")}
                  </span>
                </div>
              </div>

              <div className="view-row">
                <div className="view-label">Data e Ora</div>
                <div className="view-value">
                  {selectedAppointment.date.toLocaleDateString("it-IT")} alle {formatTime(selectedAppointment.date)}
                </div>
              </div>

              <div className="view-row">
                <div className="view-label">Contatti</div>
                <div className="view-value">
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                    <span>{selectedAppointment.telefono || "-"}</span>
                  </div>
                  <div style={{ color: "var(--text-muted)" }}>{selectedAppointment.email || "Nessuna email"}</div>
                </div>
              </div>

              <div className="view-row">
                <div className="view-label">Indirizzo</div>
                <div className="view-value">{selectedAppointment.indirizzo || "-"}</div>
              </div>

              <div className="view-row">
                <div className="view-label">Meet</div>
                <div className="view-value">
                  {selectedAppointment.meetLink ? (
                    <a href={selectedAppointment.meetLink} target="_blank" rel="noreferrer">
                      Apri Google Meet
                    </a>
                  ) : (
                    "—"
                  )}
                </div>
              </div>

              <div className="detail-actions">
                <button
                  type="button"
                  className="btn btn-ghost"
                  onClick={() => {
                    handleEdit(selectedAppointment);
                    setIsDetailOpen(false);
                  }}
                >
                  Modifica
                </button>
                <button
                  type="button"
                  className="btn btn-danger-ghost"
                  onClick={() => {
                    setDeleteCandidate(selectedAppointment);
                  }}
                  style={{ color: '#ef4444' }}
                >
                  Elimina
                </button>
              </div>
            </div>

            <div className="premium-modal-footer">
              <button type="button" className="btn btn-primary" onClick={handleCloseDetail}>
                Chiudi
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODALE CONFERMA ELIMINAZIONE (Custom) */}
      {deleteCandidate && (
        <div className="premium-modal-backdrop" style={{ zIndex: 99999 }}>
          <div className="premium-modal" style={{ maxWidth: 400 }}>
            <div className="premium-modal-header" style={{ paddingBottom: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div className="premium-icon-box" style={{ background: '#ef4444' }}><Trash2 size={20} /></div>
                <h3 className="modal-title" style={{ color: '#ef4444' }}>Elimina Appuntamento</h3>
              </div>
            </div>
            <div className="premium-modal-body" style={{ paddingTop: 20 }}>
              <p style={{ fontSize: 15, lineHeight: 1.5, opacity: 0.9 }}>
                Sei sicuro di voler eliminare l'appuntamento di <b>{deleteCandidate.nome} {deleteCandidate.cognome}</b>?
              </p>
              <p style={{ fontSize: 13, opacity: 0.6, marginTop: 8 }}>
                L'operazione è irreversibile.
              </p>
            </div>
            <div className="premium-modal-footer" style={{ paddingTop: 0, paddingBottom: 24 }}>
              <button className="btn btn-ghost" onClick={() => setDeleteCandidate(null)}>
                Annulla
              </button>
              <button
                className="btn btn-primary"
                onClick={confirmDelete}
                style={{ background: '#ef4444', color: 'white', border: 'none', boxShadow: '0 4px 15px rgba(239, 68, 68, 0.3)' }}
              >
                Elimina definitivamente
              </button>
            </div>
          </div>
        </div>
      )}
    </div >
  );
}
