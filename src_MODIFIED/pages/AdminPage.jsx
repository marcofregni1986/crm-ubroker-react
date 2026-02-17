// src/pages/AdminPage.jsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import "./admin-patch.css"; // ✅ FIX TOGGLE PATCH
import { Navigate } from "react-router-dom";
import { Shield, Search, Save, Rocket, X, CheckCircle2, AlertTriangle, RefreshCcw, BellRing, BookOpen } from "lucide-react";

import { useAuth } from "../auth/AuthProvider";
import CustomSelect from "../components/CustomSelect";

// ✅ Firestore
import { db } from "../firebase";
import {
  collection,
  doc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
  setDoc,
  writeBatch,
  getDocs,
  addDoc,
  getDoc,
  where,
} from "firebase/firestore";

/**
 * ADMIN — Firebase
 * - Legge utenti da collection "users" (realtime)
 * - Scrive permessi in users/{uid}.permissions
 * - Accesso consentito SOLO se permissions.isAdmin === true
 *
 * ✅ UPGRADE: aggiunto sistema REALE di "Update Push" in-app:
 *   - Admin scrive su Firestore: appMeta/update
 *   - I client ascoltano quel doc (vedi file hook useAppUpdate.js)
 *   - Quando cambia "version", l'app mostra/auto-esegue il refresh
 *
 * Nota importante:
 * - Non esiste un vero "hard refresh remoto" garantito su browser.
 * - Quello che possiamo fare è:
 *   1) notificare in-app
 *   2) forzare window.location.reload()
 *   3) chiedere al Service Worker (se presente) di aggiornarsi prima del reload
 */

const PERM_DEFS = [

  { key: "canSeeStepOne", label: "Accesso StepOne", desc: "Abilita la pagina StepOne." },
  { key: "canManageStepOne", label: "StepOne: Gestione", desc: "Crea/modifica/elimina StepOne e partecipanti.", tone: "green" },
  { key: "canAccessStructurePage", label: "Accesso Struttura", desc: "Abilita l'albero struttura." },
  { key: "canAccessAppointmentsPage", label: "Accesso Appuntamenti", desc: "Abilita calendario e appuntamenti." },
  { key: "canSeeKpiPage", label: "Accesso KPI Analytics", desc: "Abilita la pagina KPI avanzata.", tone: "blue" },
  { key: "canAccessDatabasePage", label: "Accesso Database", desc: "Abilita la pagina Database." },
  { key: "canSeeClassificaPage", label: "Accesso Classifica", desc: "Abilita la pagina Classifica." },
  { key: "canAccessForumPage", label: "Accesso Forum", desc: "Abilita la pagina Forum." },

  // ✅ UNIVERSITY

  { key: "canManageUniversity", label: "University: Gestione", desc: "Crea/modifica/elimina moduli, contenuti, PDF, foto e video.", tone: "green" },

  { key: "isAdmin", label: "Privilegi Amministratore", desc: "Concede accesso a questa pagina Admin.", tone: "pink" },
];

function normalizePerms(p = {}) {
  const out = {};
  PERM_DEFS.forEach(({ key }) => (out[key] = !!p?.[key]));
  // [NEW] Granular Access
  out.allowedTopics = Array.isArray(p?.allowedTopics) ? p.allowedTopics : [];
  out.allowedModuleIds = Array.isArray(p?.allowedModuleIds) ? p.allowedModuleIds : [];
  return out;
}

function buildUserLabel(u) {
  const full = `${u.nome || ""} ${u.cognome || ""}`.trim() || "Senza nome";
  return [full, u.telefono || "", u.email || ""].filter(Boolean).join(" – ");
}



export default function AdminPage() {
  const { user, firebaseUser, permissions, loading, userDoc, profile, isAdmin } = useAuth(); // ✅ Use isAdmin from context

  // Nome dell’utente loggato (mostrato in alto)
  const currentName = useMemo(() => {
    const src = userDoc || profile || {};
    const full = `${src.nome || ""} ${src.cognome || ""}`.trim();
    if (full) return full;
    const dn = (user?.displayName || "").trim();
    if (dn) return dn;
    return (user?.email || "Utente").trim();
  }, [userDoc, profile, user?.displayName, user?.email]);

  const currentInitials = useMemo(() => {
    const parts = String(currentName || "").split(/\s+/).filter(Boolean);
    const a = parts[0]?.[0] || "U";
    const b = parts.length > 1 ? parts[parts.length - 1][0] : "";
    return (a + b).toUpperCase();
  }, [currentName]);

  // const isAdmin = !!permissions?.isAdmin; // REMOVED: context handles it


  const [usersLoading, setUsersLoading] = useState(true);
  const [allUsers, setAllUsers] = useState([]);
  const [usersError, setUsersError] = useState("");

  const [search, setSearch] = useState("");
  const [selectedUserId, setSelectedUserId] = useState("");
  const [permsDraft, setPermsDraft] = useState(() => normalizePerms({}));

  const [saveState, setSaveState] = useState({ type: "", text: "" });

  // 🔥 Update Push (reale)
  const [isUpdateModalOpen, setIsUpdateModalOpen] = useState(false);
  const [versionBadge, setVersionBadge] = useState("Sistema Pronto");
  const [pushingUpdate, setPushingUpdate] = useState(false);
  const [updateMessage, setUpdateMessage] = useState("Aggiornamento disponibile: riavvia l’app per applicarlo.");
  const [forceReload, setForceReload] = useState(true);

  // 🔥 [NEW] University Modules for Granular Access
  const [uniModules, setUniModules] = useState([]);
  useEffect(() => {
    const q = query(collection(db, "university_modules"));
    getDocs(q).then(snap => {
      const items = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      // Ordinamento client-side per evitare problemi con campi mancanti e indici Firestore
      items.sort((a, b) => {
        const topicA = (a.topic || "").toLowerCase();
        const topicB = (b.topic || "").toLowerCase();
        if (topicA !== topicB) return topicA.localeCompare(topicB);
        const titleA = (a.title || "").toLowerCase();
        const titleB = (b.title || "").toLowerCase();
        return titleA.localeCompare(titleB);
      });
      setUniModules(items);
    }).catch(err => console.error("Error fetching uni modules for admin:", err));
  }, []);


  // 🔥 RIGENERA STRUTTURA (Repair Tool)
  const [repairLog, setRepairLog] = useState([]);
  const [isRepairing, setIsRepairing] = useState(false);

  // Attendi AuthProvider
  if (loading) {
    return (
      <div className="main" style={{ padding: 18, color: "var(--text-muted)" }}>
        Caricamento...
      </div>
    );
  }

  // Logged in required
  if (!user?.uid) return <Navigate to="/login" replace />;

  // Admin required
  if (!isAdmin) return <Navigate to="/dashboard" replace />;

  // Realtime users list
  useEffect(() => {
    setUsersLoading(true);
    setUsersError("");

    const qUsers = query(collection(db, "users"), orderBy("nome", "asc"));
    const unsub = onSnapshot(
      qUsers,
      (snap) => {
        const items = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        setAllUsers(items);
        setUsersLoading(false);

        // selezione default: PRIMA l’utente loggato, altrimenti il primo della lista
        if (!selectedUserId && items.length > 0) {
          const me = user?.uid ? items.find((u) => u.id === user.uid) : null;
          setSelectedUserId(me ? me.id : items[0].id);
        }
      },
      (err) => {
        console.error("[Admin] users onSnapshot error:", err);
        setUsersError("Errore nel caricamento utenti (controlla console).");
        setAllUsers([]);
        setUsersLoading(false);
      }
    );

    return () => unsub();
  }, [user?.uid, selectedUserId]);

  const filteredUsers = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return allUsers;
    return allUsers.filter((u) => {
      const full = `${u.nome || ""} ${u.cognome || ""}`.trim().toLowerCase();
      return (
        full.includes(term) ||
        (u.telefono || "").toLowerCase().includes(term) ||
        (u.email || "").toLowerCase().includes(term)
      );
    });
  }, [allUsers, search]);

  const dropdownOptions = useMemo(
    () => filteredUsers.map((u) => ({ value: u.id, label: buildUserLabel(u) })),
    [filteredUsers]
  );

  const selectedUser = useMemo(() => allUsers.find((u) => u.id === selectedUserId) || null, [allUsers, selectedUserId]);

  // quando cambi utente → ricarica draft
  // 1) Quando cambio utente (ID) -> resetto solo lo stato e i messaggi
  useEffect(() => {
    setSaveState({ type: "", text: "" });
  }, [selectedUserId]);

  // 2) Quando cambiano i dati dell'utente (anche dopo save) -> ricarico draft, MA NON cancello i messaggi
  useEffect(() => {
    if (!selectedUser) {
      setPermsDraft(normalizePerms({}));
      return;
    }
    setPermsDraft(normalizePerms(selectedUser.permissions || {}));
  }, [selectedUser]);

  async function handleSavePerms() {
    if (!selectedUserId) return;

    setSaveState({ type: "", text: "" });

    try {
      await updateDoc(doc(db, "users", selectedUserId), {
        permissions: permsDraft,
        updatedAt: serverTimestamp(),
      });

      // Calcola permessi attivi per il messaggio
      const activeLabels = PERM_DEFS.filter((def) => permsDraft[def.key]).map((def) => def.label);
      const msg = activeLabels.length > 0
        ? `Permessi salvati! Attivati: ${activeLabels.join(", ")}.`
        : "Permessi salvati! Nessun permesso attivo.";

      setSaveState({ type: "ok", text: msg });
    } catch (e) {
      console.error("[Admin] updateDoc error:", e);
      console.log("DEBUG - Current UID:", user?.uid);
      console.log("DEBUG - Current Email:", user?.email);
      setSaveState({
        type: "error",
        text: "Errore: permessi NON salvati. Apri la console per il dettaglio.",
      });
    }
  }

  async function handleConfirmPushUpdate() {
    setPushingUpdate(true);
    setVersionBadge("Invio in corso...");

    try {
      // Versione monotona: timestamp (semplice, affidabile)
      const version = Date.now();

      await setDoc(
        doc(db, "appMeta", "update"),
        {
          version,
          message: (updateMessage || "").trim() || "Aggiornamento disponibile: riavvia l’app per applicarlo.",
          forceReload: !!forceReload,
          createdAt: serverTimestamp(),
          createdBy: user?.uid || null,
        },
        { merge: true }
      );

      setVersionBadge("Aggiornamento Inviato!");
      setTimeout(() => setVersionBadge("Sistema Pronto"), 2500);
      setIsUpdateModalOpen(false);
    } catch (e) {
      console.error("[Admin] push update error:", e);
      setVersionBadge("Errore invio (console)");
      setTimeout(() => setVersionBadge("Sistema Pronto"), 2500);
    } finally {
      setPushingUpdate(false);
    }
  }

  const [auditSearch, setAuditSearch] = useState("");
  const [auditUsers, setAuditUsers] = useState([]);
  const [isAuditing, setIsAuditing] = useState(false);
  const [inspectedUserUid, setInspectedUserUid] = useState(null); // ✅ Nuovo: per tracciamento gerarchico
  const [newParentUid, setNewParentUid] = useState(""); // ✅ Nuovo: per il cambio boss

  // 🔥 VIRTUAL COLLABORATOR FORM
  const [vNome, setVNome] = useState("");
  const [vCognome, setVCognome] = useState("");
  const [vDriverUid, setVDriverUid] = useState("");
  const [isCreatingVirtual, setIsCreatingVirtual] = useState(false);

  async function handleLoadAudit() {
    setIsAuditing(true);
    try {
      const snap = await getDocs(collection(db, "users"));
      setAuditUsers(snap.docs.map(d => ({ uid: d.id, ...d.data() })));
    } catch (e) {
      console.error(e);
    } finally {
      setIsAuditing(false);
    }
  }

  async function handleCreateVirtual() {
    if (!vNome || !vDriverUid) {
      alert("Nome e Driver sono obbligatori.");
      return;
    }
    setIsCreatingVirtual(true);
    try {
      const parentSnap = await getDoc(doc(db, "users", vDriverUid));
      let newChain = [vDriverUid];
      if (parentSnap.exists()) {
        const pData = parentSnap.data();
        if (pData.driverChain) {
          newChain = [...pData.driverChain, vDriverUid];
        }
      }
      await addDoc(collection(db, "users"), {
        nome: vNome,
        cognome: vCognome || "",
        driverUid: vDriverUid,
        driverChain: newChain,
        isVirtual: true,
        createdAt: serverTimestamp(),
        role: "Collaboratore",
        email: "virtual_" + Math.random().toString(36).substring(2, 9) + "@crm-rise.com"
      });
      alert("Collaboratore Virtuale aggiunto!");
      setVNome(""); setVCognome(""); setVDriverUid("");
      handleLoadAudit();
    } catch (e) {
      alert("Errore: " + e.message);
    } finally { setIsCreatingVirtual(false); }
  }

  async function handleForceLink(targetUid, parentUid = null) {
    const parentToSet = parentUid || user.uid;
    const isSelfLink = targetUid === user.uid;

    const msg = isSelfLink
      ? `Vuoi collegare TE STESSO a questo Driver?`
      : `Vuoi impostare questo Driver per l'utente selezionato?`;

    if (!window.confirm(msg)) return;

    try {
      const ref = doc(db, "users", targetUid);
      await updateDoc(ref, {
        driverUid: parentToSet,
        updatedAt: serverTimestamp()
      });
      alert("Collegamento aggiornato con successo!");
      handleLoadAudit(); // Refresh
    } catch (e) {
      alert("Errore: " + e.message);
    }
  }

  function handleExportJSON() {
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(auditUsers, null, 2));
    const downloadAnchorNode = document.createElement('a');
    downloadAnchorNode.setAttribute("href", dataStr);
    downloadAnchorNode.setAttribute("download", "crm_users_audit.json");
    document.body.appendChild(downloadAnchorNode);
    downloadAnchorNode.click();
    downloadAnchorNode.remove();
  }

  const filteredAudit = auditUsers.filter(u => {
    const s = auditSearch.toLowerCase();
    const name = `${u.nome || ""} ${u.cognome || ""}`.toLowerCase();
    return name.includes(s) || (u.email || "").toLowerCase().includes(s) || (u.uid || "").toLowerCase().includes(s);
  });

  // ==========================================
  // 🛠 TOOL: RIGENERA STRUTTURA
  // ==========================================
  async function handleRepairStructure() {
    if (!window.confirm("Sei sicuro? Questo ricalcolerà la driverChain di TUTTI gli utenti in base al driverUid/driverPhone.")) return;

    setIsRepairing(true);
    setRepairLog(["Avvio scansione utenti..."]);

    const norm = (p) => {
      const cleaned = String(p || "").replace(/\D/g, "");
      return cleaned.length >= 10 ? cleaned.slice(-10) : cleaned;
    };

    try {
      // 1. Fetch ALL users
      const q = query(collection(db, "users"));
      const snap = await getDocs(q);
      const docs = snap.docs.map(d => ({ uid: d.id, ...d.data() }));
      setRepairLog(prev => [...prev, `Trovati ${docs.length} utenti.`]);

      // 2. Build maps for quick lookup
      const userMap = new Map();
      const phoneMap = new Map();
      docs.forEach(u => {
        userMap.set(u.uid, u);
        const p = norm(u.telefono || u.phone);
        if (p) phoneMap.set(p, u.uid);
      });

      // 3. Helper to calculate chain (Safe)
      const getChain = (startUserUid, visited = new Set()) => {
        if (!startUserUid) return [];
        if (visited.has(startUserUid)) return [];
        visited.add(startUserUid);

        const u = userMap.get(startUserUid);
        if (!u) return [];

        let dUid = u.driverUid;
        if (!dUid && (u.driverPhone || u.phoneDriver)) {
          dUid = phoneMap.get(norm(u.driverPhone || u.phoneDriver)) || null;
        }

        if (!dUid || dUid === "undefined") return [];

        const parentChain = getChain(dUid, visited);
        // Ensure only strings in the chain
        return [...parentChain, String(dUid)];
      };

      // 4. Analyze & Batch Update
      const batch = writeBatch(db);
      let updatesCount = 0;
      let logBuffer = [];

      for (const u of docs) {
        const calculatedChain = getChain(u.uid) || [];

        // Paranoid Normalization
        const rawOldUid = u.driverUid;
        const oldDriverUid = (rawOldUid === undefined || rawOldUid === "undefined" || rawOldUid === null) ? null : String(rawOldUid);
        let newDriverUid = oldDriverUid;

        if (!newDriverUid && (u.driverPhone || u.phoneDriver)) {
          const resolved = phoneMap.get(norm(u.driverPhone || u.phoneDriver));
          if (resolved) newDriverUid = String(resolved);
        }

        const existingChain = Array.isArray(u.driverChain) ? u.driverChain : [];
        const isChainDiff = JSON.stringify(calculatedChain) !== JSON.stringify(existingChain);
        const isUidDiff = newDriverUid !== oldDriverUid;

        if (isChainDiff || isUidDiff) {
          const ref = doc(db, "users", u.uid);

          const upData = {
            updatedAt: serverTimestamp(),
            driverChain: calculatedChain.map(c => String(c || ""))
          };
          if (isUidDiff) {
            upData.driverUid = newDriverUid || null;
          }

          // ULTRA VERBOSE DEBUG
          console.log(`[Repair] Updating ${u.uid}:`, JSON.parse(JSON.stringify(upData)));

          batch.update(ref, upData);
          updatesCount++;

          if (updatesCount <= 15) {
            const name = (u.nome || u.cognome) ? `${u.nome || ""} ${u.cognome || ""}` : (u.email || u.uid);
            logBuffer.push(`FIX: ${name} (UID risolto: ${isUidDiff ? "SÌ" : "NO"})`);
          }
        }
      }

      if (logBuffer.length > 0) setRepairLog(prev => [...prev, ...logBuffer]);
      if (updatesCount > 15) setRepairLog(prev => [...prev, `...e altri ${updatesCount - 15} utenti.`]);

      if (updatesCount === 0) {
        setRepairLog(prev => [...prev, "✅ Nessuna modifica necessaria. Struttura OK."]);
      } else {
        await batch.commit();
        setRepairLog(prev => [...prev, `✅ COMMIT: Aggiornati ${updatesCount} utenti.`]);
      }

    } catch (e) {
      console.error("[Repair Error]", e);
      setRepairLog(prev => [...prev, `❌ ERRORE: ${e.message}`]);
    } finally {
      setIsRepairing(false);
    }
  }

  return (
    <div className="main admin-page">
      <div className="main-header">
        <div className="main-header-left">
          <div className="main-title">Pannello Admin</div>
          <div className="main-subtitle">Gestione permessi e accessi collaboratori (Firebase).</div>
        </div>

        <div className="main-header-right" style={{ display: "flex", gap: 12, alignItems: "center" }}>
          <div className="badge-status" style={{ display: "inline-flex", gap: 8, alignItems: "center" }}>
            <Shield size={16} />
            Admin Mode
          </div>

          {/* ✅ Utente loggato */}
          <div
            className="badge-status"
            style={{
              display: "inline-flex",
              gap: 10,
              alignItems: "center",
              padding: "8px 10px",
              borderRadius: 999,
              background: "rgba(255,255,255,0.04)",
              border: "1px solid rgba(148,163,184,0.16)",
              color: "var(--text-main)",
              maxWidth: 280,
            }}
            title={currentName}
          >
            <div
              style={{
                width: 28,
                height: 28,
                borderRadius: 999,
                display: "grid",
                placeItems: "center",
                fontWeight: 900,
                fontSize: 12,
                letterSpacing: 0.4,
                color: "#0b1220",
                background: "linear-gradient(135deg, rgba(167,139,250,1), rgba(236,72,153,1))",
                boxShadow: "0 8px 22px rgba(0,0,0,0.35)",
                flex: "0 0 auto",
              }}
            >
              {currentInitials}
            </div>
            <div style={{ minWidth: 0 }}>
              <div
                style={{
                  fontWeight: 900,
                  fontSize: 13,
                  lineHeight: 1.1,
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                }}
              >
                {currentName}
              </div>
              <div style={{ fontSize: 11.5, color: "var(--text-muted)", lineHeight: 1.1 }}>utente loggato</div>
            </div>
          </div>

          <button
            className="btn-secondary"
            type="button"
            title="Refresh (realtime già attivo)"
            onClick={() => {
              setUsersError("");
              setSaveState({ type: "", text: "" });
            }}
            style={{ display: "inline-flex", gap: 8, alignItems: "center" }}
          >
            <RefreshCcw size={16} />
            Sync
          </button>
        </div>
      </div>

      {usersError && (
        <div
          style={{
            padding: 12,
            borderRadius: 12,
            border: "1px solid rgba(239,68,68,0.35)",
            background: "rgba(239,68,68,0.08)",
            color: "#fecaca",
            marginBottom: 14,
          }}
        >
          {usersError}
        </div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
        {/* RILASCIO VERSIONE (REALE) */}
        <section className="card">
          <div className="card-header">
            <div>
              <div className="card-title" style={{ color: "#fff" }}>
                Rilascio Versione
              </div>
              <div className="card-subtitle">Invia un update reale in-app (Firestore: appMeta/update).</div>
            </div>

            <div
              className="badge-status"
              style={{
                background: "rgba(16, 185, 129, 0.10)",
                color: "var(--accent-green)",
                border: "1px solid rgba(16, 185, 129, 0.20)",
                display: "flex",
                alignItems: "center",
                gap: 8,
              }}
            >
              <CheckCircle2 size={16} />
              {versionBadge}
            </div>
          </div>

          <div className="card-body" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <div style={{ fontSize: 13, color: "var(--text-muted)", lineHeight: 1.5 }}>
              Questo NON è un “hard refresh remoto” (non esiste su web in modo garantito).
              <br />
              È la soluzione professionale: update push + reload controllato (e, se c’è PWA/SW, fa update prima del reload).
            </div>

            <button
              className="btn-primary"
              style={{
                background: "var(--accent-green)",
                boxShadow: "0 0 15px rgba(16, 185, 129, 0.35)",
                display: "inline-flex",
                alignItems: "center",
                gap: 10,
                width: "fit-content",
              }}
              onClick={() => setIsUpdateModalOpen(true)}
              disabled={pushingUpdate}
            >
              <Rocket size={18} />
              Lancia Aggiornamento
            </button>
          </div>
        </section>

        {/* SECTION: AUDIT GERARCHIA */}
        <section className="card">
          <div className="card-header">
            <div>
              <div className="card-title">Audit Gerarchia (Sola Lettura)</div>
              <div className="card-subtitle">Ispeziona i collegamenti tecnici tra gli utenti.</div>
            </div>
            <button
              className="btn-secondary"
              onClick={handleLoadAudit}
              disabled={isAuditing}
              style={{ display: "inline-flex", alignItems: "center", gap: 8 }}
            >
              <RefreshCcw size={16} className={isAuditing ? "animate-spin" : ""} />
              {isAuditing ? "Caricamento..." : "Carica Dati"}
            </button>
          </div>

          <div className="card-body">
            <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: "1rem" }}>
              <input
                type="text"
                className="form-input"
                placeholder="Cerca per nome, email o UID..."
                value={auditSearch}
                onChange={(e) => setAuditSearch(e.target.value)}
                style={{ flex: 1, maxWidth: "400px" }}
              />
              <button className="btn-secondary" onClick={handleExportJSON} disabled={auditUsers.length === 0}>
                Scarica JSON (Analisi)
              </button>
            </div>

            {/* ✅ NUOVO: Visualizzazione Percorso Personale */}
            {user && auditUsers.length > 0 && (
              <div
                style={{
                  background: "rgba(255,255,255,0.03)",
                  padding: "15px",
                  borderRadius: "8px",
                  marginBottom: "1.5rem",
                  border: "1px solid rgba(255,255,255,0.1)"
                }}
              >
                <div style={{ fontWeight: "bold", color: "var(--accent-blue)", marginBottom: "8px", fontSize: "14px", display: "flex", alignItems: "center", gap: 8 }}>
                  <Shield size={16} />
                  PERCORSO GERARCHICO {(!inspectedUserUid || inspectedUserUid === user.uid) ? "(IL TUO)" : "(UTENTE SELEZIONATO)"}
                </div>

                {auditUsers.length > 0 && (
                  <div style={{ marginBottom: "12px", fontSize: "11px", display: "flex", gap: 15, opacity: 0.8 }}>
                    <span>📈 Utenti in DB: {auditUsers.length}</span>
                    <span style={{ color: auditUsers.filter(u => !u.driverUid).length > 3 ? "var(--accent-red)" : "inherit" }}>
                      ⚠️ Orfani: {auditUsers.filter(u => !u.driverUid).length}
                    </span>
                  </div>
                )}

                {(() => {
                  const targetUid = inspectedUserUid || user.uid;
                  const me = auditUsers.find(u => u.uid === targetUid);
                  if (!me) return <div style={{ fontSize: "13px", opacity: 0.7 }}>Seleziona un utente dalla tabella (clicca "Ispeziona") per vederne il percorso...</div>;

                  const directParent = auditUsers.find(u => u.uid === me.driverUid);
                  const chain = (me.driverChain || []).filter(cid => cid && cid.trim().length > 0);
                  const ResolvedChain = chain.map(cid => {
                    const found = auditUsers.find(u => u.uid === cid);
                    return found ? (found.nome || found.name || "Utente") : `UID: ${cid.substring(0, 6)}...`;
                  }).reverse();

                  const isMarziaCorrect = me.driverUid === "BP1f7s4ymsOZY4TjhKRAa6PFZq2";
                  const isAdminAccount = targetUid === user.uid;

                  return (
                    <div style={{ fontSize: "13px" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "8px", borderBottom: "1px solid rgba(255,255,255,0.05)", paddingBottom: "5px" }}>
                        <div style={{ fontWeight: "bold", color: "#fff" }}>
                          {me.nome} {me.cognome}
                          {isAdminAccount && <span style={{ marginLeft: 8, fontSize: 10, background: "var(--accent-blue)", padding: "2px 6px", borderRadius: 4 }}>TU</span>}
                        </div>
                        <div style={{ opacity: 0.5, fontSize: "11px" }}>UID: {me.uid}</div>
                      </div>

                      <div style={{ marginBottom: "10px" }}>
                        <span style={{ color: "var(--text-muted)" }}>Percorso Genitori:</span>{" "}
                        {ResolvedChain.length > 0 ? (
                          <span style={{ fontWeight: "600", color: "#fff" }}> {ResolvedChain.join(" → ")}</span>
                        ) : (
                          <span style={{ color: "var(--accent-red)" }}>Account Orfano (Base)</span>
                        )}
                      </div>

                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", background: "rgba(0,0,0,0.2)", padding: "10px", borderRadius: "6px" }}>
                        <div>
                          <div style={{ color: "var(--text-muted)", fontSize: "11px", marginBottom: "2px" }}>Driver Diretto (Capo):</div>
                          <div style={{ fontWeight: "bold", color: directParent ? "var(--accent-green)" : "var(--accent-red)" }}>
                            {directParent ? `${directParent.nome || "Utente"} (${directParent.email})` : "NESSUNO"}
                          </div>
                        </div>

                        <div style={{ display: "flex", gap: 8 }}>
                          {isAdminAccount && !isMarziaCorrect && (
                            <button
                              className="btn-secondary"
                              style={{ background: "var(--accent-blue)", color: "#fff", border: "none", fontSize: "11px", padding: "4px 10px" }}
                              onClick={() => handleForceLink(user.uid, "BP1f7s4ymsOZY4TjhKRAa6PFZq2")}
                            >
                              Aggancia a Marzia Martini
                            </button>
                          )}
                        </div>
                      </div>

                      {/* --- NUOVA FUNZIONE: CAMBIO BOSS --- */}
                      <div style={{ marginTop: "1rem", paddingTop: "1rem", borderTop: "1px solid rgba(255,255,255,0.05)" }}>
                        <div style={{ fontWeight: "bold", color: "var(--accent-blue)", marginBottom: "8px", fontSize: "12px" }}>
                          CAMBIA CAPO (UPLINE)
                        </div>
                        <div style={{ display: "flex", gap: 10 }}>
                          <select
                            className="form-input"
                            style={{ flex: 1, height: "36px", fontSize: "13px" }}
                            value={newParentUid}
                            onChange={(e) => setNewParentUid(e.target.value)}
                          >
                            <option value="">-- Seleziona Nuovo Driver --</option>
                            {auditUsers
                              .filter(u => u.uid !== targetUid) // Non può essere capo di se stesso
                              .sort((a, b) => (a.nome || "").localeCompare(b.nome || ""))
                              .map(u => (
                                <option key={u.uid} value={u.uid}>
                                  {u.nome} {u.cognome} ({u.email})
                                </option>
                              ))
                            }
                          </select>
                          <button
                            className="btn-primary"
                            style={{ fontSize: "11px", height: "36px", padding: "0 15px", background: "var(--accent-green)" }}
                            disabled={!newParentUid}
                            onClick={() => {
                              handleForceLink(targetUid, newParentUid);
                              setNewParentUid(""); // Reset dopo invio
                            }}
                          >
                            Conferma Cambio
                          </button>
                        </div>
                        <div style={{ marginTop: "5px", fontSize: "11px", opacity: 0.5 }}>
                          * Questa azione sposterà l'utente (e tutta la sua struttura) sotto il nuovo Driver selezionato.
                        </div>
                      </div>

                      <div style={{ marginTop: "15px", display: "flex", gap: 8 }}>
                        {inspectedUserUid && (
                          <button
                            className="btn-secondary"
                            style={{ fontSize: "11px", padding: "4px 10px" }}
                            onClick={() => setInspectedUserUid(null)}
                          >
                            Chiudi Ispezione (Torna a Me)
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })()}
              </div>
            )}

            <div style={{ overflowX: "auto" }}>
              <table className="admin-table" style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr style={{ textAlign: "left", borderBottom: "1px solid rgba(255,255,255,0.1)" }}>
                    <th style={{ padding: "12px 8px" }}>Utente</th>
                    <th style={{ padding: "12px 8px" }}>Driver UID</th>
                    <th style={{ padding: "12px 8px" }}>Chain Size</th>
                    <th style={{ padding: "12px 8px" }}>Chain Content</th>
                    <th style={{ padding: "12px 8px" }}>Azioni</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredAudit.map(u => (
                    <tr key={u.uid} style={{ borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
                      <td style={{ padding: "12px 8px" }}>
                        <div style={{ fontWeight: "bold" }}>{u.nome} {u.cognome}</div>
                        <div style={{ fontSize: "10px", opacity: 0.7 }}>{u.uid}</div>
                      </td>
                      <td style={{ padding: "12px 8px" }}>{u.driverUid || <span style={{ opacity: 0.3 }}>N/A</span>}</td>
                      <td style={{ padding: "12px 8px" }}>{(u.driverChain || []).length}</td>
                      <td style={{ padding: "12px 8px", fontSize: "10px", maxWidth: "200px", overflow: "hidden", textOverflow: "ellipsis" }}>
                        {JSON.stringify(u.driverChain || [])}
                      </td>
                      <td style={{ padding: "12px 8px" }}>
                        <div style={{ display: "flex", gap: 5 }}>
                          <button
                            className="btn-secondary"
                            style={{ fontSize: 10, padding: "4px 8px" }}
                            onClick={() => setInspectedUserUid(u.uid)}
                          >
                            Ispeziona
                          </button>
                          {u.uid !== user.uid && u.driverUid !== user.uid && (
                            <button
                              className="btn-primary"
                              style={{ fontSize: 10, padding: "4px 8px", background: "var(--accent-blue)" }}
                              onClick={() => handleForceLink(u.uid)}
                            >
                              Fai Mio Downline
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                  {filteredAudit.length === 0 && auditUsers.length > 0 && (
                    <tr><td colSpan="5" style={{ textAlign: "center", padding: "2rem" }}>Nessun utente trovato con questo filtro.</td></tr>
                  )}
                  {auditUsers.length === 0 && !isAuditing && (
                    <tr><td colSpan="5" style={{ textAlign: "center", padding: "2rem" }}>Clicca "Carica Dati" per iniziare l'esame.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </section>

        {/* SECTION: SELEZIONE COLLABORATORE (PER PERMESSI) */}
        <section className="card">
          <div className="card-header">
            <div>
              <div className="card-title">Seleziona Collaboratore</div>
              <div className="card-subtitle">Cerca e seleziona un utente per gestirne i permessi.</div>
            </div>
          </div>

          <div className="card-body" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <div className="form-group">
              <label className="form-label">Cerca utente</label>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  padding: "0 12px",
                  height: 44,
                  borderRadius: 12,
                  background: "rgba(255,255,255,0.04)",
                  border: "1px solid rgba(148,163,184,0.18)",
                }}
              >
                <Search size={18} style={{ opacity: 0.75 }} />
                <input
                  type="text"
                  className="form-input"
                  placeholder="Nome, email o telefono..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  style={{ border: 0, background: "transparent", outline: "none", padding: 0, height: "100%", width: "100%" }}
                />
              </div>
            </div>

            <div className="form-group">
              <label className="form-label">Lista risultati</label>
              <CustomSelect
                value={selectedUserId}
                onChange={setSelectedUserId}
                options={dropdownOptions}
                placeholder={usersLoading ? "Caricamento..." : "Seleziona collaboratore..."}
              />
            </div>

            <div
              style={{
                padding: 12,
                borderRadius: 14,
                background: "rgba(255,255,255,0.03)",
                border: "1px solid rgba(148,163,184,0.14)",
              }}
            >
              {selectedUser ? (
                <>
                  <div style={{ fontWeight: 800, marginBottom: 6 }}>
                    {`${selectedUser.nome || ""} ${selectedUser.cognome || ""}`.trim() || "Senza nome"}
                  </div>
                  <div style={{ color: "var(--text-muted)", fontSize: 13, lineHeight: 1.4 }}>
                    {selectedUser.telefono ? <div>Tel: {selectedUser.telefono}</div> : null}
                    {selectedUser.email ? <div>Email: {selectedUser.email}</div> : null}
                    {selectedUser.role ? <div>Ruolo: {selectedUser.role}</div> : null}
                    <div style={{ marginTop: 8, opacity: 0.9 }}>
                      <span style={{ color: "#a78bfa", fontWeight: 700 }}>UID:</span> {selectedUser.uid || selectedUser.id}
                    </div>
                  </div>
                </>
              ) : (
                <div style={{ color: "var(--text-muted)" }}>Nessun collaboratore selezionato.</div>
              )}
            </div>
          </div>
        </section>

        {/* PERMESSI */}
        <section className="card">
          <div className="card-header">
            <div>
              <div className="card-title">Configurazione Permessi</div>
              <div className="card-subtitle">Attiva o disattiva funzionalità del CRM per questo utente.</div>
            </div>
          </div>

          <div className="card-body">
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {PERM_DEFS.map((p) => (
                <div
                  key={p.key}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: 14,
                    padding: "12px 12px",
                    borderRadius: 14,
                    background: "rgba(255,255,255,0.03)",
                    border: "1px solid rgba(148,163,184,0.14)",
                  }}
                >
                  <div style={{ minWidth: 0 }}>
                    <div
                      style={{
                        fontSize: 14,
                        fontWeight: 800,
                        marginBottom: 2,
                        lineHeight: 1.25,
                        color:
                          p.tone === "blue"
                            ? "var(--accent-blue)"
                            : p.tone === "pink"
                              ? "var(--secondary)"
                              : p.tone === "green"
                                ? "var(--accent-green)"
                                : "var(--text-main)",
                      }}
                    >
                      {p.label}
                    </div>
                    <div style={{ fontSize: 12.5, color: "var(--text-muted)", lineHeight: 1.35 }}>{p.desc}</div>
                  </div>

                  <label className="toggle-switch" title={p.key}>
                    <input
                      type="checkbox"
                      checked={!!permsDraft[p.key]}
                      onChange={(e) => setPermsDraft((prev) => ({ ...prev, [p.key]: e.target.checked }))}
                      disabled={!selectedUserId || usersLoading}
                    />
                    <span className="toggle-slider" />
                  </label>
                </div>
              ))}
            </div>

            {/* 🔥 [NEW] Accesso Granulare University */}
            <div style={{ marginTop: 24, paddingTop: 20, borderTop: "1px solid rgba(148,163,184,0.15)" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
                <BookOpen size={18} style={{ color: "var(--accent-blue)" }} />
                <div style={{ fontWeight: 800, fontSize: 15, letterSpacing: -0.2 }}>Accesso Granulare University</div>
              </div>
              <div style={{ fontSize: 13, color: "var(--text-muted)", marginBottom: 16, lineHeight: 1.4 }}>
                Gestisci l'accesso alla University: puoi abilitare <b>Intere Sezioni</b> oppure <b>Singoli Moduli</b>.
              </div>

              <div style={{ marginBottom: 12, fontSize: 12, fontWeight: 700, color: "var(--accent-blue)", textTransform: "uppercase", letterSpacing: "0.05em" }}>Abilita Sezioni Intere</div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 10, marginBottom: 24 }}>
                {(() => {
                  const STATIC_FOLDERS = [
                    "I PRIMI PASSI DEL COLLABORATORE", "MASTERCLASS", "CRM", "SCRIPT E STRUMENTI", "CLUB MANAGER", "CLUB LEADER"
                  ];

                  // Estraiamo i topic dai moduli esistenti, mappando i vuoti/Generale/Altro a "(senza sezione)"
                  const dynamicTopics = uniModules.map(m => {
                    const t = (m.topic || "").trim();
                    if (!t || t.toLowerCase() === "generale" || t.toLowerCase() === "altro") return "(senza sezione)";
                    return t;
                  });

                  // Combiniamo dinamici e statici in ordine alfabetico (flat)
                  const allTopics = Array.from(new Set([...dynamicTopics, ...STATIC_FOLDERS])).sort((a, b) => a.localeCompare(b));

                  return allTopics.map(topic => {
                    const isAllowed = (permsDraft.allowedTopics || []).includes(topic);
                    return (
                      <div
                        key={topic}
                        onClick={() => {
                          if (!selectedUserId) return;
                          const list = [...(permsDraft.allowedTopics || [])];
                          const newList = list.includes(topic) ? list.filter(t => t !== topic) : [...list, topic];
                          setPermsDraft(prev => ({ ...prev, allowedTopics: newList }));
                        }}
                        style={{
                          padding: "12px 16px",
                          borderRadius: 14,
                          background: isAllowed ? "rgba(167,139,250,0.12)" : "rgba(255,255,255,0.02)",
                          border: `1px solid ${isAllowed ? "rgba(167,139,250,0.3)" : "rgba(148,163,184,0.1)"}`,
                          cursor: "pointer",
                          transition: "all 0.2s",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "space-between",
                          gap: 10
                        }}
                      >
                        <div style={{ minWidth: 0 }}>
                          <div style={{ fontSize: 10, opacity: 0.6, textTransform: "uppercase", fontWeight: 700, letterSpacing: "0.05em", marginBottom: 2 }}>Sezione</div>
                          <div style={{ fontSize: 13, fontWeight: 800, color: isAllowed ? "#fff" : "var(--text-main)" }}>
                            {topic}
                          </div>
                        </div>
                        <div style={{
                          width: 18, height: 18, borderRadius: 4,
                          border: "1px solid rgba(148,163,184,0.3)",
                          background: isAllowed ? "var(--accent-blue)" : "transparent",
                          display: "grid", placeItems: "center"
                        }}>
                          {isAllowed && <Shield size={12} color="#fff" />}
                        </div>
                      </div>
                    );
                  });
                })()
                }
              </div>

              <div style={{ marginBottom: 12, fontSize: 12, fontWeight: 700, color: "var(--accent-blue)", textTransform: "uppercase", letterSpacing: "0.05em" }}>Abilita Singoli Moduli</div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 10 }}>
                {uniModules.map(m => {
                  const isAllowed = (permsDraft.allowedModuleIds || []).includes(m.id);
                  return (
                    <div
                      key={m.id}
                      onClick={() => {
                        if (!selectedUserId) return;
                        const list = [...(permsDraft.allowedModuleIds || [])];
                        const newList = list.includes(m.id) ? list.filter(id => id !== m.id) : [...list, m.id];
                        setPermsDraft(prev => ({ ...prev, allowedModuleIds: newList }));
                      }}
                      style={{
                        padding: "10px 12px",
                        borderRadius: 12,
                        background: isAllowed ? "rgba(56,189,248,0.12)" : "rgba(255,255,255,0.02)",
                        border: `1px solid ${isAllowed ? "rgba(56,189,248,0.3)" : "rgba(148,163,184,0.1)"}`,
                        cursor: "pointer",
                        transition: "all 0.2s",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        gap: 10
                      }}
                    >
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontSize: 9, opacity: 0.6, textTransform: "uppercase", fontWeight: 700, letterSpacing: "0.02em" }}>{m.topic || "Generale"}</div>
                        <div style={{ fontSize: 12, fontWeight: 700, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", color: isAllowed ? "#fff" : "var(--text-main)" }}>
                          {m.title}
                        </div>
                      </div>
                      <div style={{
                        width: 16, height: 16, borderRadius: 4,
                        border: "1px solid rgba(148,163,184,0.3)",
                        background: isAllowed ? "var(--accent-blue)" : "transparent",
                        display: "grid", placeItems: "center"
                      }}>
                        {isAllowed && <Shield size={10} color="#fff" />}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>


            <div style={{ marginTop: 16, display: "flex", flexWrap: "wrap", alignItems: "center", gap: 12 }}>
              <button
                className="btn-primary"
                onClick={handleSavePerms}
                disabled={!selectedUserId || usersLoading}
                style={{ display: "inline-flex", alignItems: "center", gap: 10 }}
              >
                <Save size={18} />
                Salva Modifiche
              </button>

              {saveState.type === "ok" && (
                <div
                  className="status-message status-ok"
                  style={{
                    padding: "8px 10px",
                    borderRadius: 12,
                    fontSize: 13,
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 8,
                  }}
                >
                  <CheckCircle2 size={16} style={{ flexShrink: 0 }} />
                  <span style={{ whiteSpace: "pre-wrap" }}>{saveState.text}</span>
                  <button
                    onClick={() => setSaveState({ type: "", text: "" })}
                    style={{
                      background: "transparent",
                      border: "none",
                      color: "inherit",
                      marginLeft: "auto",
                      cursor: "pointer",
                      display: "flex",
                      alignItems: "center",
                      padding: 4
                    }}
                    title="Chiudi notifica"
                  >
                    <X size={16} />
                  </button>
                </div>
              )}

              {saveState.type === "error" && (
                <div
                  className="status-message status-error"
                  style={{
                    padding: "8px 10px",
                    borderRadius: 12,
                    fontSize: 13,
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 8,
                  }}
                >
                  <AlertTriangle size={16} />
                  {saveState.text}
                </div>
              )}
            </div>

            <div style={{ marginTop: 10, color: "var(--text-muted)", fontSize: 12.5, lineHeight: 1.45 }}>
              Nota: dopo il salvataggio, le pagine cambiano modalità (gestione/visione) perché leggono permissions in realtime.
            </div>
          </div>
        </section>

        {/* REPAIR STRUTTURA TOOL */}
        <section className="card">
          <div className="card-header">
            <div>
              <div className="card-title text-orange-400" style={{ color: "#fb923c" }}>
                Manutenzione Struttura
              </div>
              <div className="card-subtitle">
                Ricalcola e ripara l'albero gerarchico (campo <code>driverChain</code>) per tutti gli utenti.
                <br />Utile se la pagina "Struttura" non mostra collaboratori o se ci sono errori di visualizzazione.
              </div>
            </div>
            <div className="badge-status" style={{ background: "rgba(251, 146, 60, 0.1)", color: "#fb923c", border: "1px solid rgba(251, 146, 60, 0.2)" }}>
              tool
            </div>
          </div>

          <div className="card-body">
            <button
              className="btn-primary"
              onClick={handleRepairStructure}
              disabled={isRepairing}
              style={{ background: "#c2410c", border: "none", display: "inline-flex", gap: 10, alignItems: "center" }}
            >
              <RefreshCcw size={18} className={isRepairing ? "spin-icon" : ""} />
              {isRepairing ? "Analisi in corso..." : "Rigenera Intera Struttura"}
            </button>

            {repairLog.length > 0 && (
              <div style={{ marginTop: 16, background: "rgba(0,0,0,0.4)", borderRadius: 8, padding: 12, fontFamily: "monospace", fontSize: 12, maxHeight: 200, overflow: "auto" }}>
                {repairLog.map((line, i) => (
                  <div key={i} style={{ marginBottom: 4, borderBottom: "1px solid rgba(255,255,255,0.05)" }}>{line}</div>
                ))}
              </div>
            )}
          </div>
        </section>
      </div >

      {/* MODALE UPDATE (REALE) */}
      {
        isUpdateModalOpen && (
          <div className="modal-overlay open" role="dialog" aria-modal="true">
            <div className="modal" style={{ maxWidth: 520 }}>
              <div className="modal-header">
                <div
                  className="modal-title"
                  style={{ color: "var(--accent-green)", display: "flex", gap: 10, alignItems: "center" }}
                >
                  <BellRing size={18} />
                  Push Aggiornamento
                </div>
                <button className="sidebar-close" onClick={() => setIsUpdateModalOpen(false)} aria-label="Chiudi">
                  <X size={20} />
                </button>
              </div>

              <div className="modal-body" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                <div style={{ fontSize: 13.5, color: "#e2e8f0", lineHeight: 1.5 }}>
                  Quando premi conferma:
                  <br />
                  <b>Firestore</b> aggiorna <code>appMeta/update</code> con una nuova <b>version</b>.
                  <br />
                  I client (se hanno il listener attivo) vedono l’update e fanno refresh (o mostrano il popup).
                </div>

                <div className="form-group">
                  <label className="form-label">Messaggio (che vedranno gli utenti)</label>
                  <textarea
                    value={updateMessage}
                    onChange={(e) => setUpdateMessage(e.target.value)}
                    rows={3}
                    style={{
                      width: "100%",
                      resize: "vertical",
                      borderRadius: 12,
                      padding: 12,
                      border: "1px solid rgba(148,163,184,0.18)",
                      background: "rgba(2, 6, 23, 0.55)",
                      color: "var(--text-main)",
                      outline: "none",
                    }}
                  />
                </div>

                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: 14,
                    padding: "10px 12px",
                    borderRadius: 14,
                    background: "rgba(255,255,255,0.03)",
                    border: "1px solid rgba(148,163,184,0.14)",
                  }}
                >
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 14, fontWeight: 800, marginBottom: 2, lineHeight: 1.25, color: "#fff" }}>
                      Forza reload automatico
                    </div>
                    <div style={{ fontSize: 12.5, color: "var(--text-muted)", lineHeight: 1.35 }}>
                      Se ON: appena arriva la notifica, l’app ricarica (consigliato solo quando sei sicuro).
                    </div>
                  </div>

                  <label className="toggle-switch" title="forceReload">
                    <input type="checkbox" checked={forceReload} onChange={(e) => setForceReload(e.target.checked)} />
                    <span className="toggle-slider" />
                  </label>
                </div>
              </div>

              <div className="modal-footer">
                <button className="btn-secondary" onClick={() => setIsUpdateModalOpen(false)} disabled={pushingUpdate}>
                  Annulla
                </button>
                <button
                  className="btn-primary"
                  onClick={handleConfirmPushUpdate}
                  disabled={pushingUpdate}
                  style={{ background: "var(--accent-green)", boxShadow: "0 0 15px rgba(16, 185, 129, 0.35)" }}
                >
                  {pushingUpdate ? "Invio..." : "Conferma e Invia"}
                </button>
              </div>
            </div>
          </div>
        )
      }
    </div >
  );
}
