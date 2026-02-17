// src/pages/StepOnePage.jsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import "./stepone.css";

import { useAuth } from "../auth/AuthProvider";
import CustomSelect from "../components/CustomSelect";

// ✅ Firestore
import { db } from "../firebase";
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
  writeBatch,
} from "firebase/firestore";

/**
 * STEPONE — Firebase + UI (come vecchio CRM)
 *
 * ✅ Tutti possono vedere i risultati
 * ✅ Solo chi ha permessi può MODIFICARE / IMPORTARE:
 *    permissions.isAdmin === true  OR  permissions.canManageStepOne === true
 *
 * MODEL (compatibile):
 * - steponeEvents/{eventId}
 *   { date, time, place, partecipantiCount, iscrittiCount, createdAt, createdByUid, updatedAt }
 * - steponeEvents/{eventId}/participants/{participantId}
 *   { nome, cognome, telefono, email, presente, iscritto, source, createdAt, updatedAt }
 *
 * IMPORT EXCEL
 * - Richiede: npm i xlsx
 */

// -----------------------
// Helpers
// -----------------------
function norm(s) {
  return String(s || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/[^\p{L}\p{N}\s]/gu, "");
}

function pickColumn(headersNorm, candidates) {
  for (const c of candidates) {
    const idx = headersNorm.findIndex((h) => h === c || h.includes(c));
    if (idx >= 0) return idx;
  }
  return -1;
}

function truthy(v) {
  const x = norm(v);
  if (!x) return false;
  if (["1", "si", "sì", "yes", "y", "true", "ok", "presente", "iscritto"].includes(x)) return true;
  if (x.includes("si") || x.includes("sì") || x.includes("yes") || x.includes("true")) return true;
  return false;
}

function formatDateIT(yyyyMmDd) {
  if (!yyyyMmDd) return "";
  const [y, m, d] = String(yyyyMmDd).split("-");
  if (!y || !m || !d) return String(yyyyMmDd);
  return `${d}/${m}/${y}`;
}

function makeEventLabel(ev) {
  const dateLabel = formatDateIT(ev.date);
  return `Evento: ${dateLabel} ${ev.time || ""} – ${ev.place || ""}`.trim();
}



export default function StepOnePage() {
  const { user, permissions, loading } = useAuth();

  // ✅ permessi: admin OR canManageStepOne
  const canManage = !!(permissions?.isAdmin || permissions?.canManageStepOne);

  // --- UI state ---
  const [isModalEventOpen, setIsModalEventOpen] = useState(false);
  const [isModalManageOpen, setIsModalManageOpen] = useState(false);

  const [eventDate, setEventDate] = useState("");
  const [eventTime, setEventTime] = useState("");
  const [eventPlace, setEventPlace] = useState("");

  // Evento "gestione" (modal)
  const [selectedEventId, setSelectedEventId] = useState("");
  const [selectedEventLabel, setSelectedEventLabel] = useState("Evento selezionato");

  // Evento "statistiche" (tendina KPI)
  // "" = globale (tutti gli eventi)
  const [statsEventId, setStatsEventId] = useState("");

  // --- Firestore events ---
  const [events, setEvents] = useState([]);

  // --- Participants for selected event (modal gestione) ---
  const [participants, setParticipants] = useState([]);
  const [participantsLoading, setParticipantsLoading] = useState(false);

  // --- Import Excel ---
  const excelInputRef = useRef(null);
  const [excelFile, setExcelFile] = useState(null);
  const [importStatus, setImportStatus] = useState("");
  const [previewRows, setPreviewRows] = useState([]);
  const [importing, setImporting] = useState(false);

  // =========================
  // LOAD EVENTS realtime
  // =========================
  useEffect(() => {
    const qEv = query(collection(db, "steponeEvents"), orderBy("date", "desc"));
    const unsub = onSnapshot(
      qEv,
      (snap) => {
        const items = snap.docs.map((d) => ({ id: d.id, ...d.data() }));

        // Ordine stabile: date desc + time desc
        items.sort((a, b) => {
          const ad = String(a.date || "");
          const bd = String(b.date || "");
          if (ad !== bd) return bd.localeCompare(ad);
          const at = String(a.time || "");
          const bt = String(b.time || "");
          return bt.localeCompare(at);
        });

        setEvents(items);

        // default selezione (modal gestione)
        if (!selectedEventId && items.length > 0) {
          setSelectedEventId(items[0].id);
          setSelectedEventLabel(makeEventLabel(items[0]));
        }

        // se filtro stats punta a evento eliminato → torna globale
        if (statsEventId && !items.some((e) => e.id === statsEventId)) {
          setStatsEventId("");
        }
      },
      (err) => console.error("[StepOne] steponeEvents onSnapshot error:", err)
    );

    return () => unsub();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedEventId, statsEventId]);

  // =========================
  // LOAD PARTICIPANTS realtime per evento selezionato (modal gestione)
  // =========================
  useEffect(() => {
    if (!selectedEventId) {
      setParticipants([]);
      return;
    }

    setParticipantsLoading(true);

    const qP = query(
      collection(db, "steponeEvents", selectedEventId, "participants"),
      orderBy("createdAt", "asc")
    );

    const unsub = onSnapshot(
      qP,
      (snap) => {
        const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        setParticipants(list);
        setParticipantsLoading(false);
      },
      (err) => {
        console.error("[StepOne] participants onSnapshot error:", err);
        setParticipants([]);
        setParticipantsLoading(false);
      }
    );

    return () => unsub();
  }, [selectedEventId]);

  // KPI evento selezionato in MODAL (da participants)
  const selectedStats = useMemo(() => {
    const presenti = participants.reduce((a, p) => a + (p.presente ? 1 : 0), 0);
    const iscritti = participants.reduce((a, p) => a + (p.iscritto ? 1 : 0), 0);
    return { presenti, iscritti, tot: participants.length };
  }, [participants]);

  // KPI globali: usa i count sugli eventi (veloce)
  const globalTotals = useMemo(() => {
    const iscr = events.reduce((a, e) => a + (Number(e.iscrittiCount) || 0), 0);
    const pres = events.reduce((a, e) => a + (Number(e.partecipantiCount) || 0), 0);
    return { iscritti: iscr, presenti: pres };
  }, [events]);

  // KPI evento selezionato (dalla tendina): usa i count sull'evento
  const eventTotals = useMemo(() => {
    if (!statsEventId) return null;
    const ev = events.find((e) => e.id === statsEventId);
    if (!ev) return null;
    return {
      presenti: Number(ev.partecipantiCount) || 0,
      iscritti: Number(ev.iscrittiCount) || 0,
      label: makeEventLabel(ev),
    };
  }, [events, statsEventId]);

  const isGlobalView = !statsEventId;
  const kpiPresenti = isGlobalView ? globalTotals.presenti : (eventTotals?.presenti || 0);
  const kpiIscritti = isGlobalView ? globalTotals.iscritti : (eventTotals?.iscritti || 0);

  const conversioneRounded = useMemo(() => {
    if (kpiPresenti <= 0) return 0;
    const conversione = (kpiIscritti / kpiPresenti) * 100;
    return Math.round(conversione * 10) / 10;
  }, [kpiIscritti, kpiPresenti]);

  // Target: 1 iscritto / 8 presenti (>= 12.5%)
  const targetPresentiMin = 8;
  const targetConversionPct = 12.5;

  const requiredIscrittiForTarget = useMemo(() => {
    if (kpiPresenti <= 0) return 0;
    return Math.ceil(kpiPresenti / 8);
  }, [kpiPresenti]);

  const missingIscrittiToTarget = useMemo(() => {
    return Math.max(0, requiredIscrittiForTarget - kpiIscritti);
  }, [requiredIscrittiForTarget, kpiIscritti]);

  const targetProgress = useMemo(() => {
    if (kpiPresenti <= 0) return 0;
    const currentPct = (kpiIscritti / kpiPresenti) * 100;
    return Math.min(currentPct / targetConversionPct, 1) * 100;
  }, [kpiIscritti, kpiPresenti]);

  // =========================
  // Dropdown options (tutti + eventi)
  // =========================
  const dropdownOptions = useMemo(() => {
    const base = [
      {
        value: "",
        label: "Tutti gli eventi (globale)",
        sub: "Somma di tutti gli StepOne",
      },
    ];

    const evOpts = events.map((ev) => ({
      value: ev.id,
      label: `${formatDateIT(ev.date)} ${ev.time || ""} • ${ev.place || ""}`.trim(),
      sub: `Presenti ${Number(ev.partecipantiCount) || 0} • Iscritti ${Number(ev.iscrittiCount) || 0}`,
    }));

    return [...base, ...evOpts];
  }, [events]);

  // =========================
  // ACTIONS UI
  // =========================
  function openNewEvent() {
    if (!canManage) return;
    setEventDate("");
    setEventTime("");
    setEventPlace("");
    setIsModalEventOpen(true);
  }
  function closeNewEvent() {
    setIsModalEventOpen(false);
  }

  function openManage(ev) {
    setSelectedEventId(ev.id);
    setSelectedEventLabel(makeEventLabel(ev));
    setIsModalManageOpen(true);

    setExcelFile(null);
    setImportStatus("");
    setPreviewRows([]);
    if (excelInputRef.current) excelInputRef.current.value = "";
  }
  function closeManage() {
    setIsModalManageOpen(false);
  }

  async function saveEvent() {
    if (!canManage) return;

    if (!eventDate || !eventTime || !eventPlace.trim()) {
      alert("Compila tutti i campi");
      return;
    }

    const payload = {
      date: eventDate,
      time: eventTime,
      place: eventPlace.trim(),
      partecipantiCount: 0,
      iscrittiCount: 0,
      createdAt: serverTimestamp(),
      createdByUid: user?.uid || "",
    };

    try {
      const ref = await addDoc(collection(db, "steponeEvents"), payload);
      setIsModalEventOpen(false);
      openManage({ id: ref.id, ...payload });
    } catch (e) {
      console.error("[StepOne] addDoc error:", e);
      alert("Errore: impossibile creare lo StepOne (controlla console).");
    }
  }

  async function deleteEvent(id) {
    if (!canManage) return;

    if (!window.confirm("Vuoi eliminare questo evento?")) return;
    try {
      const partSnap = await getDocs(collection(db, "steponeEvents", id, "participants"));
      const batch = writeBatch(db);
      partSnap.forEach((d) => batch.delete(d.ref));
      batch.delete(doc(db, "steponeEvents", id));
      await batch.commit();

      if (selectedEventId === id) {
        setSelectedEventId("");
        setIsModalManageOpen(false);
      }
      if (statsEventId === id) {
        setStatsEventId("");
      }
    } catch (e) {
      console.error("[StepOne] delete event error:", e);
      alert("Errore: impossibile eliminare (controlla console).");
    }
  }

  async function setParticipantFlag(pid, field, value) {
    if (!canManage) return;
    if (!selectedEventId) return;

    try {
      await updateDoc(doc(db, "steponeEvents", selectedEventId, "participants", pid), {
        [field]: !!value,
        updatedAt: serverTimestamp(),
      });
    } catch (e) {
      console.error("[StepOne] update participant error:", e);
      alert("Errore: impossibile aggiornare partecipante (controlla console).");
    }
  }

  // Aggiorna i count sull'evento (per KPI globali veloci)
  async function syncEventCountsFromParticipants() {
    if (!selectedEventId) return;
    const presenti = participants.reduce((a, p) => a + (p.presente ? 1 : 0), 0);
    const iscritti = participants.reduce((a, p) => a + (p.iscritto ? 1 : 0), 0);

    try {
      await updateDoc(doc(db, "steponeEvents", selectedEventId), {
        partecipantiCount: presenti,
        iscrittiCount: iscritti,
        updatedAt: serverTimestamp(),
      });
    } catch (e) {
      console.error("[StepOne] update event counts error:", e);
    }
  }

  useEffect(() => {
    if (!canManage) return;
    if (!selectedEventId) return;
    const t = setTimeout(() => {
      syncEventCountsFromParticipants();
    }, 450);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [participants, canManage, selectedEventId]);

  // =========================
  // IMPORT EXCEL
  // =========================
  const onExcelFileChange = (e) => {
    const file = e.target.files?.[0] || null;
    setExcelFile(file);
    setPreviewRows([]);
    if (!file) {
      setImportStatus("Nessun file selezionato.");
      return;
    }
    setImportStatus(`File selezionato: ${file.name}`);
  };

  async function parseExcelForPreview() {
    if (!excelFile) {
      setImportStatus("Seleziona prima un file Excel.");
      return;
    }
    if (!selectedEventId) {
      setImportStatus("Seleziona prima un evento.");
      return;
    }

    setImportStatus("Lettura file in corso...");
    setPreviewRows([]);

    try {
      const XLSX = await import("xlsx");

      const buf = await excelFile.arrayBuffer();
      const wb = XLSX.read(buf, { type: "array" });
      const sheetName = wb.SheetNames?.[0];
      if (!sheetName) {
        setImportStatus("Errore: nessun foglio trovato nel file.");
        return;
      }
      const ws = wb.Sheets[sheetName];

      const rows = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true });
      if (!rows || rows.length < 2) {
        setImportStatus("Il file sembra vuoto o senza dati.");
        return;
      }

      const header = rows[0];
      const headersNorm = header.map((h) => norm(h));

      const idxNome = pickColumn(headersNorm, ["nome", "name"]);
      const idxCognome = pickColumn(headersNorm, ["cognome", "surname"]);
      const idxTel = pickColumn(headersNorm, ["telefono", "tel", "cellulare", "mobile"]);
      const idxEmail = pickColumn(headersNorm, ["email", "mail"]);
      const idxPres = pickColumn(headersNorm, ["presente", "presenti", "partecipato", "partecipazione"]);
      const idxIscr = pickColumn(headersNorm, ["iscritto", "iscritti", "iscrizione", "registrato", "registrazione"]);

      if (idxNome < 0 && idxCognome < 0 && idxTel < 0 && idxEmail < 0) {
        setImportStatus("Non trovo colonne riconoscibili (nome/cognome/telefono/email). Rinomina le intestazioni e riprova.");
        return;
      }

      const parsed = [];
      for (let i = 1; i < rows.length; i++) {
        const r = rows[i] || [];
        const nome = idxNome >= 0 ? String(r[idxNome] || "").trim() : "";
        const cognome = idxCognome >= 0 ? String(r[idxCognome] || "").trim() : "";
        const telefono = idxTel >= 0 ? String(r[idxTel] || "").trim() : "";
        const email = idxEmail >= 0 ? String(r[idxEmail] || "").trim() : "";
        if (!nome && !cognome && !telefono && !email) continue;

        const presente = idxPres >= 0 ? truthy(r[idxPres]) : true;
        const iscritto = idxIscr >= 0 ? truthy(r[idxIscr]) : false;

        parsed.push({ nome, cognome, telefono, email, presente, iscritto });
      }

      if (parsed.length === 0) {
        setImportStatus("Nessuna riga valida trovata nel file.");
        return;
      }

      setPreviewRows(parsed.slice(0, 50));
      setImportStatus(`Preview pronta: ${parsed.length} righe trovate (mostro le prime 50).`);
    } catch (e) {
      console.error("[StepOne] parseExcel error:", e);
      setImportStatus("Errore lettura file (controlla console).");
    }
  }

  async function importExcelToFirebase() {
    if (!canManage) return;
    if (!excelFile) {
      setImportStatus("Seleziona prima un file Excel.");
      return;
    }
    if (!selectedEventId) {
      setImportStatus("Seleziona prima un evento.");
      return;
    }

    setImporting(true);
    setImportStatus("Import in corso...");

    try {
      const XLSX = await import("xlsx");
      const buf = await excelFile.arrayBuffer();
      const wb = XLSX.read(buf, { type: "array" });
      const sheetName = wb.SheetNames?.[0];
      if (!sheetName) {
        setImportStatus("Errore: nessun foglio trovato nel file.");
        setImporting(false);
        return;
      }
      const ws = wb.Sheets[sheetName];
      const rows = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true });
      if (!rows || rows.length < 2) {
        setImportStatus("Il file sembra vuoto o senza dati.");
        setImporting(false);
        return;
      }

      const header = rows[0];
      const headersNorm = header.map((h) => norm(h));

      const idxNome = pickColumn(headersNorm, ["nome", "name"]);
      const idxCognome = pickColumn(headersNorm, ["cognome", "surname"]);
      const idxTel = pickColumn(headersNorm, ["telefono", "tel", "cellulare", "mobile"]);
      const idxEmail = pickColumn(headersNorm, ["email", "mail"]);
      const idxPres = pickColumn(headersNorm, ["presente", "presenti", "partecipato", "partecipazione"]);
      const idxIscr = pickColumn(headersNorm, ["iscritto", "iscritti", "iscrizione", "registrato", "registrazione"]);

      const parsed = [];
      for (let i = 1; i < rows.length; i++) {
        const r = rows[i] || [];
        const nome = idxNome >= 0 ? String(r[idxNome] || "").trim() : "";
        const cognome = idxCognome >= 0 ? String(r[idxCognome] || "").trim() : "";
        const telefono = idxTel >= 0 ? String(r[idxTel] || "").trim() : "";
        const email = idxEmail >= 0 ? String(r[idxEmail] || "").trim() : "";
        if (!nome && !cognome && !telefono && !email) continue;

        const presente = idxPres >= 0 ? truthy(r[idxPres]) : true;
        const iscritto = idxIscr >= 0 ? truthy(r[idxIscr]) : false;

        parsed.push({ nome, cognome, telefono, email, presente, iscritto });
      }

      if (parsed.length === 0) {
        setImportStatus("Nessuna riga valida trovata nel file.");
        setImporting(false);
        return;
      }

      // dedupe
      const seen = new Set();
      const unique = [];
      for (const p of parsed) {
        const key = `${norm(p.telefono)}|${norm(p.email)}|${norm(p.nome)}|${norm(p.cognome)}`;
        if (seen.has(key)) continue;
        seen.add(key);
        unique.push(p);
      }

      // write in chunks (batch max 500, safe 450)
      const chunks = [];
      for (let i = 0; i < unique.length; i += 450) chunks.push(unique.slice(i, i + 450));

      let written = 0;
      for (const chunk of chunks) {
        const batch = writeBatch(db);
        for (const row of chunk) {
          const ref = doc(collection(db, "steponeEvents", selectedEventId, "participants"));
          batch.set(ref, {
            ...row,
            source: "excel",
            createdAt: serverTimestamp(),
            createdByUid: user?.uid || "",
          });
        }
        await batch.commit();
        written += chunk.length;
      }

      setImportStatus(`Import completato: ${written} partecipanti inseriti.`);
      setImporting(false);

      setExcelFile(null);
      if (excelInputRef.current) excelInputRef.current.value = "";
    } catch (e) {
      console.error("[StepOne] import excel error:", e);
      setImportStatus("Errore import (controlla console).");
      setImporting(false);
    }
  }

  // =========================
  // RENDER
  // =========================
  if (loading) {
    return (
      <div className="main" style={{ padding: 18, color: "var(--text-muted)" }}>
        Caricamento...
      </div>
    );
  }

  return (
    <main className="main stepone-page">
      {/* HEADER */}
      <div className="stepone-hero">
        <div>
          <div className="stepone-title">StepOne</div>
          <div className="stepone-sub">Gestione eventi e importazione partecipanti</div>
        </div>
        <div className="stepone-hero-right">
          <div className={`stepone-mode ${canManage ? "on" : "off"}`}>
            {canManage ? "Modalità: Gestione" : "Modalità: Visione"}
          </div>
        </div>
      </div>

      {/* FILTRO EVENTO (tendina premium) */}
      <div className="stepone-filter-row">
        <div className="stepone-filter-label">
          Statistiche su:
          <span className="stepone-filter-hint">
            {isGlobalView ? " Globale (tutti gli eventi)" : " Evento selezionato"}
          </span>
        </div>

        <CustomSelect
          value={statsEventId}
          onChange={(v) => setStatsEventId(v)}
          options={dropdownOptions}
          placeholder="Seleziona evento..."
          disabled={events.length === 0}
        />
      </div>

      {/* KPI (4 card) */}
      <div className="kpi-grid-4">
        <div className="kpi-box kpi-orange">
          <div className="kpi-label">TOTALE ISCRITTI</div>
          <div className="kpi-num">{kpiIscritti}</div>
          <div className="kpi-note">{isGlobalView ? "Generati dai presenti" : "Iscritti su evento selezionato"}</div>
        </div>

        <div className="kpi-box kpi-purple">
          <div className="kpi-label">TASSO CONVERSIONE</div>
          <div className="kpi-bar">
            <div className="kpi-bar-inner" style={{ width: `${Math.min(conversioneRounded, 100)}%` }} />
          </div>
          <div className="kpi-mini">{kpiPresenti === 0 ? "0%" : `${conversioneRounded}%`}</div>
        </div>

        <div className="kpi-box kpi-green">
          <div className="kpi-label">TOTALE PRESENTI</div>
          <div className="kpi-num">{kpiPresenti}</div>
          <div className="kpi-note">{isGlobalView ? "Persone in sala (tutti gli eventi)" : "Presenti su evento selezionato"}</div>
        </div>

        <div className="kpi-box kpi-purple">
          <div className="kpi-label">TARGET: 1 ISCRITTO / 8 PRESENTI</div>
          <div className="kpi-row">
            <span>Presenti {kpiPresenti}</span>
            <span>•</span>
            <span>Iscritti {kpiIscritti}</span>
          </div>
          <div className="kpi-bar">
            <div className="kpi-bar-inner" style={{ width: `${targetProgress}%` }} />
          </div>
          <div className="kpi-note">
            {kpiPresenti < targetPresentiMin
              ? `Dati insufficienti (servono almeno ${targetPresentiMin} presenti).`
              : (missingIscrittiToTarget === 0
                ? "Target raggiunto."
                : `Sotto target: ti mancano ${missingIscrittiToTarget} iscritti.`)}
          </div>
        </div>
      </div>

      {/* EVENTI */}
      <section className="events-card">
        <div className="events-head">
          <div>
            <div className="events-title">Elenco Eventi</div>
            <div className="events-sub">Tutti gli StepOne programmati</div>
          </div>

          {canManage && (
            <button className="btn-primary" type="button" onClick={openNewEvent}>
              + Nuovo evento
            </button>
          )}
        </div>

        <div className="events-list-modern">
          {events.length === 0 ? (
            <div className="events-empty">Nessun evento programmato.</div>
          ) : (
            events.map((ev) => (
              <div className="stepone-card-modern" key={ev.id}>

                {/* DATE BOX */}
                <div className="s1-date-box">
                  <span className="s1-date">{formatDateIT(ev.date)}</span>
                  <span className="s1-time">{ev.time || ""}</span>
                </div>

                {/* MAIN INFO */}
                <div className="s1-info">
                  <div className="s1-place">{ev.place || "Nessun luogo"}</div>
                  <div className="s1-meta">
                    <span className="s1-pill">Presenti: {Number(ev.partecipantiCount) || 0}</span>
                    <span className="s1-pill">Iscritti: {Number(ev.iscrittiCount) || 0}</span>
                  </div>
                </div>

                {/* ACTIONS */}
                <div className="s1-actions">
                  {canManage ? (
                    <>
                      <button className="btn-secondary btn-sm" type="button" onClick={() => openManage(ev)}>
                        Gestisci
                      </button>
                      <button className="btn-delete btn-sm" type="button" onClick={() => deleteEvent(ev.id)}>
                        Elimina
                      </button>
                    </>
                  ) : (
                    <span className="td-actions-muted" style={{ fontSize: 13 }}>Solo visione</span>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      </section>

      {/* MODAL: NUOVO EVENTO */}
      {isModalEventOpen && (
        <div
          className="modal-overlay open"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) closeNewEvent();
          }}
        >
          <div className="modal modal-stepone" role="dialog" aria-modal="true">
            <div className="modal-header">
              <div className="modal-title">Nuovo StepOne</div>
              <button className="modal-close" type="button" onClick={closeNewEvent} aria-label="Chiudi">
                ✕
              </button>
            </div>

            <div className="modal-body">
              <div className="form-group">
                <label className="form-label">Data*</label>
                <input className="form-input" type="date" value={eventDate} onChange={(e) => setEventDate(e.target.value)} />
              </div>

              <div className="form-group">
                <label className="form-label">Orario*</label>
                <input className="form-input" type="time" value={eventTime} onChange={(e) => setEventTime(e.target.value)} />
              </div>

              <div className="form-group">
                <label className="form-label">Luogo*</label>
                <input
                  className="form-input"
                  type="text"
                  value={eventPlace}
                  onChange={(e) => setEventPlace(e.target.value)}
                  placeholder="Es. Hotel Morandi – Sanremo"
                />
              </div>

              <div className="modal-actions">
                <button className="btn-secondary" type="button" onClick={closeNewEvent}>
                  Annulla
                </button>
                <button className="btn-primary" type="button" onClick={saveEvent} disabled={!canManage}>
                  Salva evento
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: GESTIONE EVENTO */}
      {isModalManageOpen && (
        <div
          className="modal-overlay open"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) closeManage();
          }}
        >
          <div className="modal modal-stepone modal-wide" role="dialog" aria-modal="true">
            <div className="modal-header">
              <div>
                <div className="modal-title">Gestione Evento</div>
                <div className="modal-sub">{selectedEventLabel}</div>
              </div>

              <button className="modal-close" type="button" onClick={closeManage} aria-label="Chiudi">
                ✕
              </button>
            </div>

            <div className="modal-body">
              {/* KPI evento */}
              <div className="import-box" style={{ marginBottom: 12 }}>
                <div className="import-kpi-row">
                  <div className="pill">Totale: {selectedStats.tot}</div>
                  <div className="pill">Presenti: {selectedStats.presenti}</div>
                  <div className="pill">Iscritti: {selectedStats.iscritti}</div>
                  {!canManage && <div className="import-hint">Solo visualizzazione: non hai permessi per importare/modificare.</div>}
                </div>
              </div>

              {/* Import Excel */}
              <div className="import-block">
                <div className="import-title">Importa partecipanti da Excel</div>
                <div className="import-sub">Carica il file .xlsx esportato dall’app.</div>

                <input
                  ref={excelInputRef}
                  type="file"
                  accept=".xlsx,.xls"
                  style={{ display: "none" }}
                  onChange={onExcelFileChange}
                  disabled={!canManage}
                />

                <div className="import-box">
                  <div className="import-buttons">
                    <button className="btn-secondary" type="button" onClick={() => excelInputRef.current?.click()} disabled={!canManage || importing}>
                      Seleziona file
                    </button>

                    <button className="btn-secondary" type="button" onClick={parseExcelForPreview} disabled={!canManage || importing || !excelFile}>
                      Preview
                    </button>

                    <button className="btn-primary" type="button" onClick={importExcelToFirebase} disabled={!canManage || importing || !excelFile}>
                      {importing ? "Import..." : "Importa su Firebase"}
                    </button>
                  </div>

                  <div className="import-status">{importStatus || "Seleziona un file per iniziare."}</div>

                  {previewRows.length > 0 && (
                    <div className="preview-box">
                      <div className="preview-title">Preview (prime {previewRows.length} righe)</div>
                      <div className="table-wrap">
                        <table className="data-table" style={{ minWidth: 720 }}>
                          <thead>
                            <tr>
                              <th>Nome</th>
                              <th>Cognome</th>
                              <th>Presente</th>
                              <th>Iscritto</th>
                            </tr>
                          </thead>
                          <tbody>
                            {previewRows.map((r, idx) => (
                              <tr key={idx}>
                                <td>{r.nome}</td>
                                <td>{r.cognome}</td>
                                <td>{r.presente ? "Sì" : "No"}</td>
                                <td>{r.iscritto ? "Sì" : "No"}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Lista partecipanti */}
              <div className="participants-block">
                <div className="import-title">Partecipanti</div>
                <div className="import-sub">Lista reale dall’evento selezionato.</div>

                <div className="table-wrap">
                  <table className="data-table" style={{ minWidth: 720 }}>
                    <thead>
                      <tr>
                        <th>Nome</th>
                        <th>Cognome</th>
                        <th style={{ width: 120 }}>Presente</th>
                        <th style={{ width: 120 }}>Iscritto</th>
                      </tr>
                    </thead>
                    <tbody>
                      {participantsLoading ? (
                        <tr>
                          <td colSpan="6" className="empty-row">
                            Caricamento...
                          </td>
                        </tr>
                      ) : participants.length === 0 ? (
                        <tr>
                          <td colSpan="6" className="empty-row">
                            Nessun partecipante. Importa un file Excel oppure inserisci dall’app.
                          </td>
                        </tr>
                      ) : (
                        participants.map((p) => (
                          <tr key={p.id}>
                            <td className="td-strong">{p.nome || "-"}</td>
                            <td>{p.cognome || "-"}</td>
                            <td>
                              <label className="toggle-switch">
                                <input
                                  type="checkbox"
                                  checked={!!p.presente}
                                  onChange={(e) => setParticipantFlag(p.id, "presente", e.target.checked)}
                                  disabled={!canManage}
                                />
                                <span className="toggle-slider" />
                              </label>
                            </td>
                            <td>
                              <label className="toggle-switch">
                                <input
                                  type="checkbox"
                                  checked={!!p.iscritto}
                                  onChange={(e) => setParticipantFlag(p.id, "iscritto", e.target.checked)}
                                  disabled={!canManage}
                                />
                                <span className="toggle-slider" />
                              </label>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>

                {!canManage && <div className="import-hint" style={{ marginTop: 10 }}>Non hai permessi per modificare: puoi solo visualizzare.</div>}
              </div>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
