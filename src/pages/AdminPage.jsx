// src/pages/AdminPage.jsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import "./admin-patch.css"; // ✅ FIX TOGGLE PATCH
import { Navigate } from "react-router-dom";
import { Shield, Search, Save, Rocket, X, CheckCircle2, AlertTriangle, RefreshCcw, BellRing, BookOpen, Sparkles, Eye } from "lucide-react";

import { useAuth } from "../auth/AuthProvider";
import CustomSelect from "../components/CustomSelect";
import ChangelogModal from "../components/ChangelogModal";

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
    deleteDoc,
    limit,
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
    { key: "canSeeKpiPage", label: "Accesso KPI Analytics", desc: "Abilita la pagina KPI avanzata.", tone: "blue" },
    { key: "canSeeClassificaPage", label: "Accesso Classifica", desc: "Abilita la pagina Classifica." },
    { key: "canAccessForumPage", label: "Accesso Forum", desc: "Abilita la pagina Forum." },

    // ✅ UNIVERSITY
    { key: "canAccessUniversity", label: "Accesso University", desc: "Abilita la visualizzazione della sezione University." },
    { key: "canManageUniversity", label: "University: Gestione", desc: "Crea/modifica/elimina moduli, contenuti, PDF, foto e video.", tone: "green" },

    // ✅ EVENT LISTS (Guest Sheets)
    { key: "canAccessEventLists", label: "Accesso Eventi Team", desc: "Visualizza e modifica le liste invitati (Foglio Presenze).", tone: "blue" },
    { key: "canCreateEvents", label: "Crea Nuovi Eventi", desc: "Permette di creare nuove Liste/Eventi.", tone: "green" },
    { key: "canAccessRiseAi", label: "Accesso Rise AI Coach", desc: "Abilita la sezione AI Coach nel menu.", tone: "blue" },

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



// ==========================================
// 🌳 HIERARCHY TREE COMPONENTS
// ==========================================

function TreeNode({ node, level = 0 }) {
    const [expanded, setExpanded] = useState(true);
    const hasChildren = node.children && node.children.length > 0;

    return (
        <div style={{ marginLeft: level * 20, borderLeft: level > 0 ? "1px solid rgba(255,255,255,0.1)" : "none" }}>
            <div
                style={{
                    display: "flex",
                    alignItems: "center",
                    padding: "4px 8px",
                    margin: "2px 0",
                    borderRadius: 6,
                    background: "rgba(255,255,255,0.02)",
                    cursor: hasChildren ? "pointer" : "default",
                    fontSize: "13px"
                }}
                onClick={() => hasChildren && setExpanded(!expanded)}
            >
                {hasChildren && (
                    <span style={{ marginRight: 6, opacity: 0.6, fontSize: 10 }}>
                        {expanded ? "▼" : "▶"}
                    </span>
                )}
                {!hasChildren && <span style={{ width: 16 }}></span>}

                <span style={{ fontWeight: level === 0 ? "bold" : "normal", color: level === 0 ? "#a78bfa" : "var(--text-main)" }}>
                    {node.nome} {node.cognome}
                </span>

                <span style={{ marginLeft: 8, opacity: 0.4, fontSize: 11 }}>
                    ({node.children.length > 0 ? `${node.children.length} downline` : "User"})
                </span>

                <span style={{ marginLeft: "auto", opacity: 0.3, fontSize: 10, fontFamily: "monospace" }}>
                    {node.uid.slice(0, 6)}...
                </span>
            </div>

            {hasChildren && expanded && (
                <div>
                    {node.children.map(child => (
                        <TreeNode key={child.uid} node={child} level={level + 1} />
                    ))}
                </div>
            )}
        </div>
    );
}

function HierarchyTree({ users }) {
    // Build Tree
    const tree = useMemo(() => {
        const userMap = {};
        const roots = [];

        // 1. Init Map
        users.forEach(u => {
            userMap[u.uid] = { ...u, children: [] };
        });

        // 2. Link Children
        users.forEach(u => {
            // Normalizzazione Driver UID (trim)
            let dUid = String(u.driverUid || "").trim();
            if (dUid === "undefined" || dUid === "null" || dUid === "") dUid = null;

            // Se ha un driver valido E il driver esiste nella lista
            if (dUid && userMap[dUid]) {
                userMap[dUid].children.push(userMap[u.uid]);
            } else {
                // Altrimenti è una root (Top Level)
                roots.push(userMap[u.uid]);
            }
        });

        // Sort roots by name
        return roots.sort((a, b) => (a.cognome || "").localeCompare(b.cognome || ""));
    }, [users]);

    return (
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <div style={{ fontSize: 11, fontStyle: "italic", opacity: 0.7, marginBottom: 8 }}>
                Trovati {tree.length} Utenti Top Level (su {users.length} totali).
            </div>
            {tree.map(root => (
                <TreeNode key={root.uid} node={root} level={0} />
            ))}
        </div>
    );
}

export default function AdminPage() {
    const { user, firebaseUser, permissions, loading, userDoc, profile, isAdmin, logout } = useAuth(); // ✅ Added logout

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
    const [refreshKey, setRefreshKey] = useState(0); // 🔥 Per forzare ricaricamento
    const [isDirty, setIsDirty] = useState(false);   // 🔥 Per evitare sovrascritture mentre editi

    // 🔥 [NEW] What's New / Changelog
    const [clTitle, setClTitle] = useState("");
    const [clDesc, setClDesc] = useState("");
    const [clImage, setClImage] = useState("");
    const [clVersion, setClVersion] = useState(Date.now().toString());
    const [pushingCl, setPushingCl] = useState(false);
    const [showClPreview, setShowClPreview] = useState(false);
    const [forceReload, setForceReload] = useState(false); // ✅ Aggiunto qui per unificare
    const [generatingImage, setGeneratingImage] = useState(false);
    const [updateMode, setUpdateMode] = useState("news"); // "news" | "critical" | "silent"


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

    // ✅ [NEW] Toggle per nascondere i tool di emergenza (Recupero, Merge, Audit)
    const [showRecoveryTools, setShowRecoveryTools] = useState(false);

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

                // selezione default: PRIMA l'utente loggato, altrimenti il primo della lista
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
    }, [user?.uid, selectedUserId, refreshKey]); // 🔥 refreshKey aggiunto

    const filteredUsers = useMemo(() => {
        const term = search.trim().toLowerCase();
        if (!term) return allUsers;
        return allUsers.filter((u) => {
            const full = `${u.nome || ""} ${u.cognome || ""}`.trim().toLowerCase();
            return (
                full.includes(term) ||
                (u.telefono || "").toLowerCase().includes(term) ||
                (u.email || "").toLowerCase().includes(term) ||
                (u.id || "").toLowerCase().includes(term)
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
        setIsDirty(false); // 🔥 Reset dirty flag quando cambi utente
    }, [selectedUserId]);

    // 2) Quando cambiano i dati dell'utente (anche dopo save) -> ricarico draft, MA NON cancello i messaggi
    useEffect(() => {
        if (!selectedUser) {
            setPermsDraft(normalizePerms({}));
            return;
        }
        // 🔥 Se l'utente sta modificando (isDirty), NON sovrascriviamo con i dati dal server 
        // finché non salva o cambia utente, per evitare che i toggle "saltino" indietro
        if (!isDirty) {
            setPermsDraft(normalizePerms(selectedUser.permissions || {}));
        }
    }, [selectedUser, isDirty]);

    async function handleSavePerms() {
        if (!selectedUserId) return;

        setSaveState({ type: "", text: "" });

        try {
            await updateDoc(doc(db, "users", selectedUserId), {
                permissions: permsDraft,
                updatedAt: serverTimestamp(),
            });

            setIsDirty(false); // 🔥 Salvato -> non più dirty

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
                    message: (updateMessage || "").trim() || "Aggiornamento disponibile: riavvia l'app per applicarlo.",
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

    // 🔥 MIGRAZIONE DATI (Emergency Tool)
    const [migrationSourceUid, setMigrationSourceUid] = useState("");
    const [migrationTargetUid, setMigrationTargetUid] = useState("");
    const [isMigrating, setIsMigrating] = useState(false);
    const [migrationStatus, setMigrationStatus] = useState("");

    // Helper per trovare/liberare numero
    const [phoneLookup, setPhoneLookup] = useState("");
    const [foundOldUid, setFoundOldUid] = useState("");

    async function handleCheckPhone() {
        if (!phoneLookup) return;
        try {
            // Normalizzazione base (rimuovi spazi)
            const p = phoneLookup.replace(/\s/g, "");
            const ref = doc(db, "phoneIndex", p);
            const snap = await getDoc(ref);
            if (snap.exists()) {
                const d = snap.data();
                setFoundOldUid(d.uid);
                setMigrationSourceUid(d.uid); // Auto-fill source
                alert(`Trovato UID associato: ${d.uid}\n(L'ho copiato nel campo 'Da Vecchio UID')`);
            } else {
                alert("Nessun UID trovato per questo numero (il numero è libero o il formato è diverso).");
                setFoundOldUid("");
            }
        } catch (e) {
            alert("Errore ricerca: " + e.message);
        }
    }

    async function handleFreePhone() {
        if (!phoneLookup) return;
        if (!window.confirm(`Sei sicuro di voler CANCELLARE l'associazione del numero ${phoneLookup}?\n\nFallo SOLO dopo aver salvato il Vecchio UID (${foundOldUid || "nessuno trovato"}), altrimenti non potrai più recuperare i dati vecchi!`)) return;

        try {
            const p = phoneLookup.replace(/\s/g, "");
            await deleteDoc(doc(db, "phoneIndex", p));
            alert("Numero sganciato! Ora Livia puÃ² registrarsi senza errori.");
            setFoundOldUid("");
        } catch (e) {
            alert("Errore sgancio: " + e.message);
        }
    }

    async function handleMigrateUserData() {
        if (!migrationSourceUid || !migrationTargetUid) return;
        if (migrationSourceUid === migrationTargetUid) {
            alert("L'UID di origine e destinazione non possono essere uguali.");
            return;
        }
        if (!window.confirm(`Sei SICURO di voler spostare TUTTI i dati da:\n${migrationSourceUid}\n\nA:\n${migrationTargetUid}\n\nQuesta azione è irreversibile.`)) return;

        setIsMigrating(true);
        setMigrationStatus("Avvio migrazione...");

        try {
            const batch = writeBatch(db);
            let count = 0;

            // 1. Sposta Appuntamenti (Uid field update)
            setMigrationStatus("Scansione appuntamenti...");
            const qAppts = query(collection(db, "appointments"), where("uid", "==", migrationSourceUid));
            const snapAppts = await getDocs(qAppts);

            snapAppts.forEach(d => {
                batch.update(doc(db, "appointments", d.id), { uid: migrationTargetUid });
                count++;
            });
            setMigrationStatus(`Trovati ${count} appuntamenti. Scansione clienti...`);

            // 2. Sposta Customer Overrides (users/{old}/customers -> users/{new}/customers)
            const qCust = collection(db, "users", migrationSourceUid, "customers");
            const snapCust = await getDocs(qCust);

            snapCust.forEach(d => {
                // Copy to new
                const newRef = doc(db, "users", migrationTargetUid, "customers", d.id);
                batch.set(newRef, d.data());
                // Delete old (optional, but cleaner)
                batch.delete(d.ref);
                count++;
            });

            setMigrationStatus(`Pronto a migrare ${count} record. Esecuzione...`);

            if (count > 0) {
                await batch.commit();
                setMigrationStatus(`✅ SUCCESSO! Migrati ${count} elementi (Appuntamenti + Clienti).`);
                alert("Migrazione completata con successo!");
                setMigrationSourceUid("");
                setMigrationTargetUid("");
            } else {
                setMigrationStatus("⚠️ Nessun dato trovato sul vecchio UID.");
            }

        } catch (e) {
            console.error("Migration error:", e);
            setMigrationStatus("❌ ERRORE: " + e.message);
        } finally {
            setIsMigrating(false);
        }
    }

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

        if (targetUid === parentToSet) {
            alert("Errore: Non puoi essere capo di te stesso.");
            return;
        }

        // 🛡️ CYCLIC CHECK (Prevent A -> B -> A)
        // 1. Find the proposed Parent in our audit list
        const parentObj = auditUsers.find(u => u.uid === parentToSet);
        if (parentObj) {
            // 2. Check if the Parent is currently a descendant of Target
            // Strategy: Look at Parent's CURRENT chain. Does it contain Target?
            // Note: chain is Bottom-Up or Top-Down depending on implementation,
            // but usually contains all ancestors.
            const pChain = parentObj.driverChain || [];
            const isCyclic = pChain.includes(targetUid);

            if (isCyclic) {
                alert(`⛔ ERRORE CICLO: L'utente che stai cercando di impostare come Capo (${parentObj.nome}) è attualmente nella TUA struttura (sotto di te).\n\nDevi prima "sganciare" ${parentObj.nome} (rendilo Top Level/Orfano) e poi riprovare.`);
                return;
            }
        }

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

            alert("Collegamento aggiornato! Rigenero la struttura...");

            // AUTO REPAIR
            await handleRepairStructure(true); // true = skip confirm
        } catch (e) {
            alert("Errore: " + e.message);
            console.error(e);
        }
    }

    async function handleUnlinkDriver(targetUid) {
        if (!window.confirm("Sei sicuro di voler scollegare questo utente dal suo Driver? Diventerà un utente 'Top Level' (Orfano).")) return;

        try {
            await updateDoc(doc(db, "users", targetUid), {
                driverUid: null,
                driverChain: [targetUid], // Reset chain to self
                driverPhone: null, // Clear phone link to prevent auto-relink !
                phoneDriver: null, // Clear phone link to prevent auto-relink !
                updatedAt: serverTimestamp()
            });
            alert("Utente scollegato! Anche il 'ricordo' del numero è stato cancellato per evitare ricollegamenti automatici.");
            await handleRepairStructure(true);
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

    // --- 🗑️ DELETE USER FUNCTION ---
    async function handleDeleteUser(targetUid) {
        if (!targetUid) return;
        const u = auditUsers.find(x => x.uid === targetUid);
        if (!u) return alert("Utente non trovato in auditUsers.");

        // 1. Safety Check: Downlines
        const children = auditUsers.filter(x => x.driverUid === targetUid);
        let unlinkChildren = false;

        if (children.length > 0) {
            const confirmDownlines = window.confirm(`⛔ ATTENZIONE: Questo utente ha ${children.length} collaboratori sotto di sé (es. ${children[0].nome}).\n\nVuoi SCOLLEGARLI TUTTI (renderli orfani/Top Level) e procedere con l'eliminazione?\n\nPremi OK per SCOLLEGARE E CANCELLARE.\nPremi ANNULLA per fermarti.`);
            if (!confirmDownlines) return;
            unlinkChildren = true;
        }

        // 2. Double Confirmation
        const confirm1 = window.confirm(`⚠️ ATTENZIONE: STAI PER CANCELLARE DEFINITIVAMENTE L'UTENTE:\n\nNome: ${u.nome} ${u.cognome}\nEmail: ${u.email}\nUID: ${targetUid}\n\nQuesta azione è IRREVERSIBILE. Vuoi procedere?`);
        if (!confirm1) return;

        const confirm2 = window.confirm(`SEI DAVVERO SICURO?\n\nIl profilo verrà rimosso dal database e il numero di telefono (${u.telefono || "N/A"}) sarà liberato per nuove registrazioni.\n\nPremi OK per DISTRUGGERE l'account.`);
        if (!confirm2) return;

        setIsRepairing(true); // Usa lo stato di loading generico o creane uno specifico
        try {
            const batch = writeBatch(db);

            // A. Delete Main User Doc
            const userRef = doc(db, "users", targetUid);
            batch.delete(userRef);

            // B. Delete Phone Index (if handy)
            const p = (u.telefono || "").replace(/\D/g, "");
            if (p && p.length >= 10) {
                const cleanP = p.slice(-10);
                batch.delete(doc(db, "phoneIndex", cleanP));
            }

            // C. Delete "customers" subcollection (Best Effort for first 500)
            const custQ = collection(db, "users", targetUid, "customers");
            const custSnap = await getDocs(custQ);
            let custCount = 0;
            custSnap.forEach(d => {
                batch.delete(d.ref);
                custCount++;
            });

            await batch.commit();

            alert(`✅ UTENTE ELIMINATO CON SUCCESSO.\n\n- Doc Utente rimosso\n- Index Telefono rimosso\n- ${custCount} Clienti rimossi\n\nLa pagina si aggiornerà.`);

            // Refresh
            if (selectedUserId === targetUid) setSelectedUserId("");
            if (inspectedUserUid === targetUid) setInspectedUserUid(null);
            await handleRepairStructure(true); // Clean up any stale references

        } catch (e) {
            console.error(e);
            alert("❌ ERRORE DURANTE L'ELIMINAZIONE: " + e.message);
        } finally {
            setIsRepairing(false);
        }
    }

    // ==========================================
    // 📊 STATS SIMULATOR
    // ==========================================
    const [simTargetUid, setSimTargetUid] = useState("");
    const [simStats, setSimStats] = useState(null); // { total: {}, breakdown: [] }
    const [simLoading, setSimLoading] = useState(false);

    async function handleSimulateStats() {
        if (!simTargetUid) return alert("Seleziona un utente per l'analisi.");

        setSimLoading(true);
        setSimStats(null);

        try {
            // 1. Identify Downline (Subtree)
            // Users whose driverChain contains simTargetUid
            // USE allUsers (Realtime) instead of auditUsers (Manual)
            const targetUser = allUsers.find(u => u.id === simTargetUid);
            if (!targetUser) throw new Error("Utente non trovato.");

            const team = allUsers.filter(u => {
                if (u.id === simTargetUid) return true; // Include Self
                return (u.driverChain || []).includes(simTargetUid);
            });

            const teamUids = team.map(u => u.id);

            // 2. Fetch Appointments for this team (optimized? or just all recent?)
            // For accuracy, let's fetch ALL appointments for these users.
            // Firestore 'in' limit is 30. If team > 30, we must chunk or fetch global.
            // For this tool, let's fetch ALL appointments (simple) or use chunks.
            // Let's try fetching all appointments for the current month/period if possible,
            // but to be safe and simple, let's fetch all appointments where `uid` is in list (chunked).

            let allAppts = [];
            const chunks = [];
            const chunkSize = 10;
            for (let i = 0; i < teamUids.length; i += chunkSize) {
                chunks.push(teamUids.slice(i, i + chunkSize));
            }

            for (const chunk of chunks) {
                const q = query(collection(db, "appointments"), where("uid", "in", chunk));
                const snap = await getDocs(q);
                snap.forEach(d => allAppts.push({ id: d.id, ...d.data() }));
            }

            // 3. Process Stats
            // We want to see: CA, CVA, Executed (Pos/Neg)
            // Group by User
            const breakdown = team.map(member => {
                const memberAppts = allAppts.filter(a => a.uid === member.id);

                let stats = {
                    uid: member.id,
                    name: `${member.nome} ${member.cognome}`,
                    ca: 0, cva: 0,
                    executed: 0,
                    total: 0
                };

                memberAppts.forEach(a => {
                    // Filter by Month? Or Total? Let's do TOTAL for now, or add date picker later.
                    // User asked for "verification", usually implied "current state".
                    // Let's allow ALL time for now to see everything.

                    const type = (a.tipo || "").toUpperCase();
                    const s = (a.stato || "").toLowerCase();

                    // Count Logic (Same as Dashboard roughly)
                    if (type === "CA") stats.ca++;
                    if (type === "CVA") stats.cva++;
                    stats.total++;

                    // Executed
                    let isExec = false;
                    if (typeof a.outcome_executed === 'boolean') {
                        isExec = a.outcome_executed;
                    } else {
                        isExec = s.includes("positivo") || s.includes("negativo") || s.includes("ok") || s.includes("ko");
                    }
                    if (isExec) stats.executed++;
                });

                return stats;
            });

            // Sort by production
            breakdown.sort((a, b) => b.total - a.total);

            // Totals
            const total = breakdown.reduce((acc, curr) => ({
                ca: acc.ca + curr.ca,
                cva: acc.cva + curr.cva,
                executed: acc.executed + curr.executed,
                total: acc.total + curr.total
            }), { ca: 0, cva: 0, executed: 0, total: 0 });

            setSimStats({ total, breakdown, teamSize: team.length });

        } catch (e) {
            console.error(e);
            alert("Errore simulazione: " + e.message);
        } finally {
            setSimLoading(false);
        }
    }

    // ==========================================
    // 🛠️ TOOL: RIGENERA STRUTTURA
    // ==========================================
    async function handleRepairStructure(skipConfirm = false) {
        if (!skipConfirm && !window.confirm("Sei sicuro? Questo ricalcolerà la driverChain di TUTTI gli utenti in base al driverUid/driverPhone.")) return;

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

            // 3. Helper to calculate chain (Bottom-Up: [Self, Parent, Grandparent...])
            const getChain = (startUserUid) => {
                const chain = [startUserUid];
                let currentUid = startUserUid;
                const visited = new Set([startUserUid]);

                while (true) {
                    const u = userMap.get(currentUid);
                    if (!u) break;

                    let dUid = u.driverUid;
                    // Try resolve via phone if missing
                    if (!dUid && (u.driverPhone || u.phoneDriver)) {
                        dUid = phoneMap.get(norm(u.driverPhone || u.phoneDriver)) || null;
                    }

                    // Clean dUid
                    if (dUid === "undefined" || dUid === "null") dUid = null;
                    if (!dUid) break; // Top/Root reached

                    if (visited.has(dUid)) {
                        console.error(`Loop detected for user ${startUserUid} involving ${dUid}`);
                        break; // Loop detected
                    }

                    visited.add(dUid);
                    chain.push(dUid);
                    currentUid = dUid;

                    if (chain.length > 50) break; // Safety break
                }
                return chain;
            };

            // 4. Analyze & Batch Update (CHUNKED 400)
            let updatesCount = 0;
            let logBuffer = [];

            const CHUNK_SIZE = 400; // Safe limit (max 500)
            let batches = [];
            let currentBatch = writeBatch(db);
            let opsInBatch = 0;

            for (const u of docs) {
                const calculatedChain = getChain(u.uid);

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

                    currentBatch.update(ref, upData);
                    opsInBatch++;
                    updatesCount++;

                    if (updatesCount <= 10) {
                        const name = (u.nome || u.cognome) ? `${u.nome || ""} ${u.cognome || ""}` : (u.email || u.uid);
                        logBuffer.push(`FIX: ${name} (Chain: ${calculatedChain.length})`);
                    }

                    if (opsInBatch >= CHUNK_SIZE) {
                        batches.push(currentBatch);
                        currentBatch = writeBatch(db);
                        opsInBatch = 0;
                    }
                }
            }

            // Add last batch
            if (opsInBatch > 0) batches.push(currentBatch);

            if (logBuffer.length > 0) setRepairLog(prev => [...prev, ...logBuffer]);

            if (updatesCount === 0) {
                setRepairLog(prev => [...prev, "✅ Nessuna modifica necessaria. Struttura OK."]);
            } else {
                // Commit all batches
                setRepairLog(prev => [...prev, `💾 Salvataggio in corso (${batches.length} blocchi)...`]);
                for (const b of batches) {
                    await b.commit();
                }
                setRepairLog(prev => [...prev, `✅ COMMIT: Aggiornati ${updatesCount} utenti.`]);
            }

        } catch (e) {
            console.error("[Repair Error]", e);
            setRepairLog(prev => [...prev, `âŒ ERRORE: ${e.message}`]);
        } finally {
            setIsRepairing(false);
            handleLoadAudit();
        }
    }

    // --- MERGE ACCOUNTS LOGIC ---
    const [mergeSourceUid, setMergeSourceUid] = useState("");
    const [mergeTargetUid, setMergeTargetUid] = useState("");

    // --- SURGICAL LOGIN FIX (Final Restoration) ---
    const handleFixLoginBinding = async (targetUid) => {
        // ... (previous function content)
    };

    // --- 🔥 ULTIMA EMERGENCY RECOVERY (Marco Fregni) ---
    const handleEmergencyRecovery = async () => {
        const targetUid = "HPhryWrSoNUr8uMwudewp9wUcRN2"; // Account con 42 Appuntamenti
        const targetName = "Marco Fregni (TUTTI I TUOI DATI)";

        setRepairLog(["🚀 Avvio Ripristino DEFINITIVO..."]);

        const manualPhone = window.prompt("🆘 RIPRISTINO DATI 🆘\n\nInserisci il tuo NUMERO DI TELEFONO (10 cifre) per collegarlo ai tuoi 42 appuntamenti:");
        if (!manualPhone) return;

        const cleanPhone = manualPhone.replace(/\D/g, "").slice(-10);
        if (cleanPhone.length < 9) return alert("Numero non valido.");

        setIsRepairing(true);
        try {
            const batch = writeBatch(db);

            // 1. Forza il registro telefonico a puntare all'account GIUSTO (...RN2 con outlook.it)
            const phoneRef = doc(db, "phoneIndex", cleanPhone);
            setRepairLog(prev => [...prev, `🔗 Collegamento numero ${cleanPhone} -> Account Marco Fregni (...RN2)`]);
            batch.set(phoneRef, {
                uid: targetUid,
                email: "marco.fregni@outlook.it",
                telefono: cleanPhone,
                updatedAt: serverTimestamp()
            }, { merge: true });

            // 2. Assicurati che l'account target abbia i riferimenti corretti (set merge true per evitare errore "No document")
            const targetRef = doc(db, "users", targetUid);
            batch.set(targetRef, {
                nome: "Marco",
                cognome: "Fregni",
                telefono: cleanPhone,
                email: "marco.fregni@outlook.it",
                updatedAt: serverTimestamp(),
                role: "admin",
                permissions: { isAdmin: true }
            }, { merge: true });

            // 3. Cancella l'account fantasma attuale per non creare doppioni in futuro
            if (user.uid !== targetUid) {
                setRepairLog(prev => [...prev, "🗑️ Pulizia account vuoto attuale..."]);
                batch.delete(doc(db, "users", user.uid));
            }

            await batch.commit();
            setRepairLog(prev => [...prev, "✅ RIPRISTINO COMPLETATO CON SUCCESSO!"]);

            alert("MISSIONE COMPIUTA!\n\nIl tuo numero è stato collegato correttamente.\nVerrai disconnesso ora. Rientra con il tuo numero e troverai tutto.");

            await logout();
            window.location.href = "/login";
        } catch (e) {
            console.error("Emergency fail:", e);
            alert("Errore critico: " + e.message);
        } finally {
            setIsRepairing(false);
        }
    };

    const handleMergeAccounts = async () => {
        if (!mergeSourceUid || !mergeTargetUid) return;
        if (mergeSourceUid === mergeTargetUid) return alert("Source e Target devono essere diversi!");

        // Get user names for confirmation
        const sourceUser = auditUsers.find(u => u.uid === mergeSourceUid);
        const targetUser = auditUsers.find(u => u.uid === mergeTargetUid);
        const sourceName = sourceUser ? `${sourceUser.nome} ${sourceUser.cognome}` : mergeSourceUid;
        const targetName = targetUser ? `${targetUser.nome} ${targetUser.cognome}` : mergeTargetUid;

        const confirmMsg = `ATTENZIONE: Stai per fondere due account.\n\n` +
            `Sorgente (verrà ELIMINATO): ${sourceName}\n` +
            `Destinazione (verrà MANTENUTO): ${targetName}\n\n` +
            `Tutti i collaboratori diretti di ${sourceName} verranno spostati sotto ${targetName}.\n` +
            `Sei sicuro di voler procedere? QUESTA AZIONE È IRREVERSIBILE.`;

        if (!window.confirm(confirmMsg)) return;

        setIsRepairing(true);
        setRepairLog([]);
        setRepairLog(prev => [...prev, `🚀 Inizio Fusione: ${sourceName} -> ${targetName}`]);

        try {
            // 1. Find all children of Source
            const qChildren = query(collection(db, "users"), where("driverUid", "==", mergeSourceUid));
            const snapChildren = await getDocs(qChildren);

            const childrenToMove = snapChildren.docs;

            // 2. Batch Update (Main Data)
            const batch = writeBatch(db);

            // 2a. Move Downline
            childrenToMove.forEach(childDoc => {
                batch.update(childDoc.ref, {
                    driverUid: mergeTargetUid,
                    updatedAt: serverTimestamp()
                });
            });
            setRepairLog(prev => [...prev, `📦 Preparato spostamento di ${childrenToMove.length} collaboratori.`]);

            // 2b. Transfer Profile Data (Credential Handover)
            const updates = { updatedAt: serverTimestamp() };
            // Se dest non ha certi dati, prendiamoli da sorgente
            if (!targetUser.telefono && sourceUser.telefono) updates.telefono = sourceUser.telefono;
            if (!targetUser.email && sourceUser.email) updates.email = sourceUser.email;
            if (!targetUser.nome && sourceUser.nome) updates.nome = sourceUser.nome;
            if (!targetUser.cognome && sourceUser.cognome) updates.cognome = sourceUser.cognome;
            if (!targetUser.role && (sourceUser.role === "admin" || !targetUser.role)) updates.role = sourceUser.role;

            batch.update(doc(db, "users", mergeTargetUid), updates);

            // 2c. Update phoneIndex (Critical for login mapping)
            // First, find ANY phone pointing to Source
            const qPhone = query(collection(db, "phoneIndex"), where("uid", "==", mergeSourceUid));
            const snapPhone = await getDocs(qPhone);
            snapPhone.forEach(d => {
                setRepairLog(prev => [...prev, `🔍 Ricalibratura Indice Telefonico per ${d.id}...`]);
                batch.set(doc(db, "phoneIndex", d.id), {
                    uid: mergeTargetUid,
                    email: targetUser.email || sourceUser.email || d.data()?.email || "",
                    updatedAt: serverTimestamp()
                }, { merge: true });
            });

            // 2d. Move Appointments
            const qApp = query(collection(db, "appointments"), where("uid", "==", mergeSourceUid));
            const snapApp = await getDocs(qApp);
            snapApp.forEach(d => {
                batch.update(d.ref, { uid: mergeTargetUid, updatedAt: serverTimestamp() });
            });
            setRepairLog(prev => [...prev, `📅 Spostamento di ${snapApp.size} appuntamenti.`]);

            // 2e. Move Leads (Lista Nomi - SUBCOLLECTION)
            const qLeads = query(collection(db, "users", mergeSourceUid, "listaNomi"));
            const snapLeads = await getDocs(qLeads);
            snapLeads.forEach(d => {
                const leadRef = doc(collection(db, "users", mergeTargetUid, "listaNomi"));
                batch.set(leadRef, { ...d.data(), updatedAt: serverTimestamp() });
                batch.delete(d.ref);
            });
            setRepairLog(prev => [...prev, `📇 Spostamento di ${snapLeads.size} contatti Lista Nomi.`]);

            // 2f. Move Customers (SUBCOLLECTION)
            const qCust = query(collection(db, "users", mergeSourceUid, "customers"));
            const snapCust = await getDocs(qCust);
            snapCust.forEach(d => {
                const custRef = doc(db, "users", mergeTargetUid, "customers", d.id);
                batch.set(custRef, { ...d.data(), updatedAt: serverTimestamp() });
                batch.delete(d.ref);
            });
            setRepairLog(prev => [...prev, `👥 Spostamento di ${snapCust.size} overrides Clienti.`]);

            // 3. Delete Source User Profile
            const sourceRef = doc(db, "users", mergeSourceUid);
            batch.delete(sourceRef);
            setRepairLog(prev => [...prev, `🗑️ Eliminazione profilo utente sorgente.`]);

            // 4. Commit Changes
            await batch.commit();
            setRepairLog(prev => [...prev, `✅ Fusione completata nel Database!`]);

            // 5. Run Global Repair to fix chains
            setRepairLog(prev => [...prev, `🔧 Avvio ricalcolo catene e struttura...`]);
            // Reset selection
            setMergeSourceUid("");
            setMergeTargetUid("");

            // Call standard repair (without confirm)
            await handleRepairStructure(true);

            alert("Fusione completata con successo!");

            // Critical fix: If we just deleted our own profile, logout immediately
            // to prevent AuthProvider from re-creating it.
            if (mergeSourceUid === user?.uid) {
                await logout();
                window.location.href = "/login";
            } else {
                window.location.reload();
            }

        } catch (e) {
            console.error("Merge error:", e);
            setRepairLog(prev => [...prev, `❌ ERRORE: ${e.message}`]);
            alert("Errore durante la fusione: " + e.message);
        } finally {
            setIsRepairing(false);
        }
    };

    const isMarco = user?.email === "marco.fregni1986@gmail.com";

    const [myDataAudit, setMyDataAudit] = useState({
        appts: 0,
        leads: 0,
        globalSearchDone: false,
        suggestions: [],
        phoneMapping: null,
        sample: null,
        userSearchTerm: ""
    });

    const fetchSample = async (uid) => {
        try {
            const q = query(collection(db, "appointments"), where("uid", "==", uid));
            const snap = await getDocs(q);
            const items = snap.docs.map(d => ({ id: d.id, ...d.data() }));
            setMyDataAudit(prev => ({ ...prev, sample: { uid, items } }));
        } catch (e) { alert("Errore caricamento: " + e.message); }
    };

    useEffect(() => {
        if (isMarco && user?.uid) {
            // 1. Check current account
            const qApp = query(collection(db, "appointments"), where("uid", "==", user.uid));
            getDocs(qApp).then(s => setMyDataAudit(prev => ({ ...prev, appts: s.size })));

            const qLeads = query(collection(db, "users", user.uid, "listaNomi"));
            getDocs(qLeads).then(s => setMyDataAudit(prev => ({ ...prev, leads: s.size })));

            // 2. Lookup phoneIndex
            const phoneToSearch = "3351605276";
            getDoc(doc(db, "phoneIndex", phoneToSearch)).then(snap => {
                if (snap.exists()) setMyDataAudit(prev => ({ ...prev, phoneMapping: snap.data() }));
            });

            // 3. Global deep scan
            const deepScan = async () => {
                try {
                    const qAll = query(collection(db, "appointments"));
                    const snap = await getDocs(qAll);
                    const clusters = {};
                    snap.forEach(d => {
                        const rawUid = d.data().uid;
                        if (rawUid) clusters[rawUid] = (clusters[rawUid] || 0) + 1;
                    });

                    const results = Object.entries(clusters).map(([uid, count]) => {
                        const uInfo = auditUsers.find(u => u.uid === uid.trim());
                        return {
                            uid,
                            count,
                            uidLength: uid.length,
                            hasSpaces: uid.length !== uid.trim().length,
                            name: uInfo ? `${uInfo.nome || ""} ${uInfo.cognome || ""}`.trim() : "Unknown Account",
                            email: uInfo ? uInfo.email : "N/A"
                        };
                    });

                    setMyDataAudit(prev => ({
                        ...prev,
                        globalSearchDone: true,
                        suggestions: results.sort((a, b) => b.count - a.count)
                    }));
                } catch (e) { console.error("Deep scan error:", e); }
            };

            if (auditUsers.length > 0) deepScan();
        }
    }, [user?.uid, isMarco, auditUsers.length]);


    return (
        <div className="main admin-page">      {/* 🛠️ GESTIONE AGGIORNAMENTI (RI PROGETTATA) 🛠️ */}
            {isMarco && (
                <div style={{
                    background: "linear-gradient(145deg, rgba(139, 92, 246, 0.1) 0%, rgba(2, 6, 23, 0.6) 100%)",
                    border: "1px solid rgba(139, 92, 246, 0.3)",
                    padding: "24px",
                    borderRadius: "20px",
                    marginBottom: "32px",
                    color: "#fff",
                    boxShadow: "0 20px 40px rgba(0,0,0,0.3)"
                }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 16, marginBottom: 24 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                            <div style={{
                                width: 44, height: 44, borderRadius: 12,
                                background: "rgba(167, 139, 250, 0.1)",
                                display: "grid", placeItems: "center", color: "#a78bfa"
                            }}>
                                <Rocket size={22} />
                            </div>
                            <div>
                                <h2 style={{ margin: 0, fontSize: "1.3rem", fontWeight: 900, letterSpacing: "-0.01em" }}>CENTRO RILASCI & AGGIORNAMENTI</h2>
                                <p style={{ margin: 0, fontSize: 12, opacity: 0.5 }}>Gestione rollout versioni e changelog in-app</p>
                            </div>
                        </div>

                        {/* Segmented Control */}
                        <div style={{
                            display: "flex",
                            background: "rgba(0,0,0,0.3)",
                            padding: 4,
                            borderRadius: 14,
                            border: "1px solid rgba(255,255,255,0.05)"
                        }}>
                            {["news", "critical", "silent"].map(m => (
                                <button
                                    key={m}
                                    onClick={() => setUpdateMode(m)}
                                    style={{
                                        padding: "8px 16px",
                                        borderRadius: 10,
                                        border: "none",
                                        fontSize: 11,
                                        fontWeight: 800,
                                        cursor: "pointer",
                                        background: updateMode === m ? "rgba(139, 92, 246, 0.2)" : "transparent",
                                        color: updateMode === m ? "#a78bfa" : "rgba(255,255,255,0.4)",
                                        transition: "all 0.2s",
                                        textTransform: "uppercase",
                                        letterSpacing: "0.05em"
                                    }}
                                >
                                    {m === "news" ? "NOVITÀ" : m === "critical" ? "CRITICO" : "SILENZIOSO"}
                                </button>
                            ))}
                        </div>
                    </div>

                    <div style={{
                        background: "rgba(139, 92, 246, 0.05)",
                        padding: 16,
                        borderRadius: 16,
                        marginBottom: 20,
                        border: "1px dashed rgba(139, 92, 246, 0.2)"
                    }}>
                        <p style={{ margin: 0, fontSize: 13, opacity: 0.8, lineHeight: 1.5 }}>
                            {updateMode === "news" && "🚀 Modalità Novità: Mostra solo il popup informativo al prossimo accesso. Ideale per nuove funzioni non urgenti."}
                            {updateMode === "critical" && "🔴 Modalità Critica: Forza il ricaricamento immediato dell'app per tutti e mostra il popup dopo il refresh. Ideale per bug fix urgenti."}
                            {updateMode === "silent" && "🤫 Modalità Silenziosa: Forza il ricaricamento immediato dell'app senza mostrare alcun popup. Ideale per fix di codice invisibili."}
                        </p>
                    </div>

                    {(updateMode === "news" || updateMode === "critical") && (
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "24px", animation: "fadeIn 0.3s ease" }}>
                            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                                <div>
                                    <label style={{ fontSize: 11, opacity: 0.5, fontWeight: 800, textTransform: "uppercase", marginBottom: 6, display: "block" }}>Titolo Novità</label>
                                    <input
                                        type="text"
                                        value={clTitle}
                                        onChange={e => setClTitle(e.target.value)}
                                        placeholder="Es: Arriva l'intelligenza artificiale!"
                                        style={{ width: "100%", padding: "12px", borderRadius: "10px", background: "rgba(0,0,0,0.3)", border: "1px solid rgba(255,255,255,0.1)", color: "#fff" }}
                                    />
                                </div>
                                <div>
                                    <label style={{ fontSize: 11, opacity: 0.5, fontWeight: 800, textTransform: "uppercase", marginBottom: 6, display: "block" }}>Immagine (opzionale)</label>
                                    <input
                                        type="text"
                                        value={clImage}
                                        onChange={e => setClImage(e.target.value)}
                                        placeholder="https://immagine-premium.png"
                                        style={{ width: "100%", padding: "12px", borderRadius: "10px", background: "rgba(0,0,0,0.3)", border: "1px solid rgba(255,255,255,0.1)", color: "#fff" }}
                                    />
                                </div>
                            </div>

                            <div>
                                <label style={{ fontSize: 11, opacity: 0.5, fontWeight: 800, textTransform: "uppercase", marginBottom: 6, display: "block" }}>Cosa c'è di nuovo?</label>
                                <textarea
                                    value={clDesc}
                                    onChange={e => setClDesc(e.target.value)}
                                    placeholder="Descrivi le migliorie..."
                                    style={{ width: "100%", height: "115px", padding: "12px", borderRadius: "10px", background: "rgba(0,0,0,0.3)", border: "1px solid rgba(255,255,255,0.1)", color: "#fff", resize: "none", lineHeight: 1.4 }}
                                />
                            </div>
                        </div>
                    )}

                    <div style={{ display: "flex", gap: 12, marginTop: 24, flexWrap: "wrap" }}>
                        {(updateMode === "news" || updateMode === "critical") && (
                            <button
                                className="btn-secondary"
                                style={{
                                    flex: "1 1 auto",
                                    minWidth: "140px",
                                    padding: "14px",
                                    borderRadius: 12,
                                    display: "flex",
                                    alignItems: "center",
                                    justifyContent: "center",
                                    gap: 10,
                                    background: "rgba(255,255,255,0.05)"
                                }}
                                onClick={() => {
                                    if (!clTitle || !clDesc) return alert("Dati insufficienti per l'anteprima!");
                                    setShowClPreview(true);
                                }}
                            >
                                <Eye size={18} /> ANTEPRIMA
                            </button>
                        )}
                        <button
                            className="btn-secondary"
                            style={{
                                flex: "1 1 auto",
                                minWidth: "140px",
                                padding: "14px",
                                borderRadius: 12,
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                                gap: 10
                            }}
                            onClick={() => {
                                localStorage.removeItem("last_seen_changelog");
                                localStorage.removeItem("app_update_version");
                                window.location.reload();
                            }}
                        >
                            <RefreshCcw size={18} /> RESET LOCALE
                        </button>
                        <button
                            className="btn-primary"
                            style={{
                                flex: "2 1 auto",
                                minWidth: "200px",
                                padding: "14px",
                                borderRadius: 12,
                                background: updateMode === "silent" ? "#475569" : "#8b5cf6",
                                border: "none",
                                display: "flex", alignItems: "center", justifyContent: "center", gap: 10,
                                boxShadow: updateMode === "silent" ? "none" : "0 10px 20px rgba(139, 92, 246, 0.3)"
                            }}
                            disabled={pushingCl}
                            onClick={async () => {
                                if (updateMode !== "silent" && (!clTitle || !clDesc)) return alert("Inserisci titolo e descrizione per pubblicare!");
                                if (!window.confirm(`Stai per pubblicare un rilascio in Modalità ${updateMode.toUpperCase()}. Procedere?`)) return;

                                setPushingCl(true);
                                try {
                                    const now = Date.now();
                                    const batch = writeBatch(db);

                                    // 1. Logica Popup (Changelog)
                                    // Mostriamo la modale sia per Novità che per Critico
                                    if (updateMode === "news" || updateMode === "critical") {
                                        batch.set(doc(db, "appMeta", "changelog"), {
                                            title: clTitle,
                                            description: clDesc,
                                            imageUrl: clImage,
                                            version: now.toString(),
                                            timestamp: serverTimestamp()
                                        });
                                    }

                                    // 2. Logica Refresh (Update Trigger)
                                    // - Critico e Silenzioso: Forza reload immediato per tutti
                                    // - Novità: Possiamo decidere se forzare reload o lasciarlo soft. 
                                    //   Per pulizia cache, usiamo forceReload: true anche per news se vogliamo "Hard Reset".
                                    batch.set(doc(db, "appMeta", "update"), {
                                        version: now,
                                        forceReload: true, // Sempre true per garantire allineamento versioni
                                        mode: updateMode,
                                        message: updateMode === "critical" ? "Aggiornamento Critico: l'app verrà riavviata." : "Nuova versione disponibile.",
                                        createdAt: serverTimestamp()
                                    });

                                    await batch.commit();
                                    alert("✅ Rilascio completato con successo!");
                                    // Reset campi
                                    if (updateMode !== "silent") {
                                        setClTitle("");
                                        setClDesc("");
                                        setClImage("");
                                    }
                                } catch (e) {
                                    alert("Errore rilascio: " + e.message);
                                } finally {
                                    setPushingCl(false);
                                }
                            }}
                        >
                            <Rocket size={20} />
                            {updateMode === "news" ? "PUBBLICA NOVITÀ" : updateMode === "critical" ? "PUBBLICA FIX CRITICO" : "ESEGUI PATCH SILENZIOSA"}
                        </button>
                    </div>
                </div>
            )}

            <div className="main-header" style={{ marginBottom: 32, flexWrap: "wrap", gap: 24 }}>
                <div className="main-header-left">
                    <div className="main-title" style={{ fontSize: "2rem", fontWeight: 950, letterSpacing: "-0.02em" }}>Pannello Admin</div>
                    <div className="main-subtitle">Gestione permessi e accessi collaboratori (Firebase).</div>
                </div>

                <div className="main-header-right" style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                        <button
                            className="btn-secondary"
                            style={{ display: "inline-flex", gap: 8, height: 42, paddingInline: 16, borderRadius: 12 }}
                            onClick={() => handleRepairStructure(false)}
                            disabled={isRepairing}
                        >
                            <RefreshCcw size={16} className={isRepairing ? "animate-spin" : ""} />
                            Rigenera Struttura
                        </button>

                        <div className="badge-status" style={{
                            display: "inline-flex", gap: 8, alignItems: "center",
                            height: 42, paddingInline: 16, borderRadius: 12,
                            background: "rgba(139, 92, 246, 0.1)", color: "#a78bfa",
                            border: "1px solid rgba(139, 92, 246, 0.2)",
                            fontWeight: 700, fontSize: 13
                        }}>
                            <Shield size={16} />
                            Admin Mode
                        </div>
                    </div>

                    <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                        {/* ✅ User Badge Premium */}
                        <div
                            className="badge-status"
                            style={{
                                display: "inline-flex",
                                gap: 12,
                                alignItems: "center",
                                padding: "6px 16px 6px 6px",
                                borderRadius: 999,
                                background: "rgba(255,255,255,0.03)",
                                border: "1px solid rgba(148,163,184,0.12)",
                                color: "var(--text-main)",
                                height: 42,
                                maxWidth: 280,
                                boxShadow: "0 4px 12px rgba(0,0,0,0.1)"
                            }}
                            title={currentName}
                        >
                            <div
                                style={{
                                    width: 30,
                                    height: 30,
                                    borderRadius: 999,
                                    display: "grid",
                                    placeItems: "center",
                                    fontWeight: 900,
                                    fontSize: 11,
                                    color: "#fff",
                                    background: "linear-gradient(135deg, #7c3aed, #db2777)",
                                    boxShadow: "0 2px 8px rgba(124, 58, 237, 0.3)",
                                    flex: "0 0 auto",
                                }}
                            >
                                {currentInitials}
                            </div>
                            <div style={{ minWidth: 0 }}>
                                <div
                                    style={{
                                        fontWeight: 800,
                                        fontSize: 13,
                                        lineHeight: 1.1,
                                        whiteSpace: "nowrap",
                                        overflow: "hidden",
                                        textOverflow: "ellipsis",
                                    }}
                                >
                                    {currentName}
                                </div>
                                <div style={{ fontSize: 10, color: "var(--text-muted)", lineHeight: 1.1, textTransform: "uppercase", letterSpacing: "0.05em", fontWeight: 700 }}>online</div>
                            </div>
                        </div>

                        <button
                            className="btn-secondary"
                            type="button"
                            title="Sincronizza realtime"
                            onClick={() => {
                                setUsersError("");
                                setSaveState({ type: "", text: "" });
                                setRefreshKey(prev => prev + 1); // 🔥 Forza re-mount listener
                                alert("Sincronizzazione forzata avviata!");
                            }}
                            style={{
                                display: "inline-flex", gap: 8, alignItems: "center",
                                height: 42, width: 42, justifyContent: "center",
                                borderRadius: 12, padding: 0,
                                background: refreshKey > 0 ? "rgba(59,130,246,0.15)" : ""
                            }}
                        >
                            <RefreshCcw size={17} className={usersLoading ? "spin-icon" : ""} />
                        </button>
                    </div>
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

                {/* TOGGLE STRUMENTI AVANZATI */}
                <div style={{ display: "flex", justifyContent: "center", margin: "32px 0" }}>
                    <button
                        onClick={() => setShowRecoveryTools(!showRecoveryTools)}
                        style={{
                            background: showRecoveryTools ? "rgba(239, 68, 68, 0.1)" : "rgba(139, 92, 246, 0.05)",
                            border: `1px solid ${showRecoveryTools ? "rgba(239, 68, 68, 0.2)" : "rgba(139, 92, 246, 0.2)"}`,
                            padding: "10px 24px",
                            borderRadius: 14,
                            color: showRecoveryTools ? "#ef4444" : "#a78bfa",
                            fontSize: 12,
                            fontWeight: 800,
                            cursor: "pointer",
                            display: "flex",
                            alignItems: "center",
                            gap: 10,
                            backdropFilter: "blur(10px)",
                            transition: "all 0.3s cubic-bezier(0.4, 0, 0.2, 1)",
                            textTransform: "uppercase",
                            letterSpacing: "0.05em",
                            boxShadow: showRecoveryTools ? "0 8px 16px rgba(239, 68, 68, 0.15)" : "0 4px 12px rgba(0,0,0,0.1)"
                        }}
                    >
                        {showRecoveryTools ? <X size={16} /> : <RefreshCcw size={16} />}
                        {showRecoveryTools ? "CHIUDI STRUMENTI DI EMERGENZA" : "MOSTRA STRUMENTI DI EMERGENZA"}
                    </button>
                </div>

                {
                    showRecoveryTools && (
                        <>
                            {/* 🛠️ MARCO REPAIR STATION 🛠️ */}
                            {isMarco && (
                                <div style={{
                                    background: "rgba(2, 6, 23, 0.8)",
                                    border: `1px solid ${isCorrectAccount ? "rgba(16, 185, 129, 0.4)" : "rgba(239, 68, 68, 0.4)"}`,
                                    padding: "24px",
                                    borderRadius: "24px",
                                    marginBottom: "32px",
                                    color: "#fff",
                                    boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.5)",
                                    backdropFilter: "blur(20px)"
                                }}>
                                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 24 }}>
                                        <div>
                                            <h2 style={{ margin: 0, fontSize: "1.4rem", color: isCorrectAccount ? "#34d399" : "#f87171", display: "flex", alignItems: "center", gap: 12 }}>
                                                <ShieldCheck size={32} />
                                                DIAGNOSTICA AVANZATA ACCOUNT
                                            </h2>
                                            <p style={{ margin: "4px 0 0 44px", fontSize: 13, opacity: 0.5 }}>Analisi chirurgica per il recupero di identità e dati</p>
                                        </div>
                                        <div style={{
                                            padding: "8px 16px",
                                            borderRadius: 12,
                                            background: isCorrectAccount ? "rgba(16, 185, 129, 0.1)" : "rgba(239, 68, 68, 0.1)",
                                            border: `1px solid ${isCorrectAccount ? "rgba(16, 185, 129, 0.2)" : "rgba(239, 68, 68, 0.2)"}`,
                                            fontSize: 12,
                                            fontWeight: 700,
                                            color: isCorrectAccount ? "#34d399" : "#f87171"
                                        }}>
                                            {isCorrectAccount ? "ACCOUNT OTTIMIZZATO" : "PROBLEMI RILEVATI"}
                                        </div>
                                    </div>

                                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "24px", fontSize: "13px" }}>
                                        <div style={{
                                            padding: "20px",
                                            background: "rgba(255,255,255,0.03)",
                                            borderRadius: "16px",
                                            border: "1px solid rgba(255,255,255,0.05)",
                                            display: "flex",
                                            flexDirection: "column",
                                            gap: 12
                                        }}>
                                            <div style={{ fontWeight: 800, fontSize: 11, opacity: 0.4, textTransform: "uppercase", letterSpacing: 1 }}>
                                                🔍 Sessione Attiva
                                            </div>
                                            <div style={{ fontSize: 15, fontWeight: 700 }}>{user?.email}</div>
                                            <code style={{ fontSize: 11, opacity: 0.5, background: "rgba(0,0,0,0.3)", padding: "4px 8px", borderRadius: 6 }}>UID: {user.uid}</code>

                                            <div style={{ display: "flex", gap: 12, marginTop: 4 }}>
                                                <div style={{
                                                    flex: 1,
                                                    padding: "12px",
                                                    background: myDataAudit.appts > 0 ? "rgba(16, 185, 129, 0.1)" : "rgba(255,255,255,0.05)",
                                                    borderRadius: "12px",
                                                    textAlign: "center"
                                                }}>
                                                    <div style={{ fontSize: 20, fontWeight: 800, color: myDataAudit.appts > 0 ? "#34d399" : "#fff" }}>{myDataAudit.appts}</div>
                                                    <div style={{ fontSize: 10, opacity: 0.5 }}>Appuntamenti</div>
                                                </div>
                                                <div style={{
                                                    flex: 1,
                                                    padding: "12px",
                                                    background: myDataAudit.leads > 0 ? "rgba(59, 130, 246, 0.1)" : "rgba(255,255,255,0.05)",
                                                    borderRadius: "12px",
                                                    textAlign: "center"
                                                }}>
                                                    <div style={{ fontSize: 20, fontWeight: 800, color: myDataAudit.leads > 0 ? "#60a5fa" : "#fff" }}>{myDataAudit.leads}</div>
                                                    <div style={{ fontSize: 10, opacity: 0.5 }}>Leads</div>
                                                </div>
                                            </div>
                                            {myDataAudit.appts === 0 && (
                                                <div style={{
                                                    display: "flex",
                                                    alignItems: "center",
                                                    gap: 10,
                                                    padding: 12,
                                                    background: "rgba(239, 68, 68, 0.1)",
                                                    borderRadius: 12,
                                                    border: "1px solid rgba(239, 68, 68, 0.2)",
                                                    color: "#fca5a5",
                                                    fontSize: 12
                                                }}>
                                                    <AlertTriangle size={18} />
                                                    <span>Questo account non ha appuntamenti.</span>
                                                </div>
                                            )}
                                        </div>

                                        <div style={{
                                            padding: "20px",
                                            background: "rgba(255,255,255,0.03)",
                                            borderRadius: "16px",
                                            border: "1px solid rgba(245, 158, 11, 0.3)",
                                            display: "flex",
                                            flexDirection: "column",
                                            gap: 12
                                        }}>
                                            <div style={{ fontWeight: 800, fontSize: 11, opacity: 0.4, textTransform: "uppercase", letterSpacing: 1 }}>
                                                📱 Registro Login (phoneIndex)
                                            </div>
                                            <div style={{ fontSize: 15, fontWeight: 700, color: "#f59e0b" }}>3351605276</div>

                                            {myDataAudit.phoneMapping ? (
                                                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                                                    <div style={{ padding: "10px", background: "rgba(0,0,0,0.2)", borderRadius: "10px" }}>
                                                        <div style={{ fontSize: 12, opacity: 0.6 }}>Attualmente collegato a:</div>
                                                        <div style={{ fontWeight: 700, fontSize: 13 }}>{myDataAudit.phoneMapping.email}</div>
                                                        <code style={{ fontSize: 10, opacity: 0.4 }}>...{myDataAudit.phoneMapping.uid?.slice(-12)}</code>
                                                    </div>

                                                    {myDataAudit.phoneMapping.uid !== user.uid && (
                                                        <div style={{
                                                            padding: "12px",
                                                            background: "rgba(239, 68, 68, 0.1)",
                                                            borderRadius: "10px",
                                                            border: "1px solid rgba(239, 68, 68, 0.2)",
                                                            color: "#fca5a5",
                                                            fontSize: 11,
                                                            display: "flex",
                                                            gap: 10
                                                        }}>
                                                            <AlertTriangle size={18} style={{ flexShrink: 0 }} />
                                                            <b>DISALLINEAMENTO:</b> Il numero punta a un account diverso!
                                                        </div>
                                                    )}
                                                </div>
                                            ) : (
                                                <div style={{ padding: 12, background: "rgba(255,255,255,0.05)", borderRadius: 10, fontSize: 11, opacity: 0.5 }}>
                                                    Nessuna mappatura trovata nel registro.
                                                </div>
                                            )}
                                        </div>

                                        <div style={{
                                            gridColumn: "1 / -1",
                                            padding: "20px",
                                            background: "rgba(255,255,255,0.03)",
                                            borderRadius: "16px",
                                            border: myDataAudit.globalSearchDone ? "1px solid rgba(59, 130, 246, 0.3)" : "1px dashed rgba(255,255,255,0.1)",
                                            display: "flex",
                                            flexDirection: "column",
                                            gap: 16
                                        }}>
                                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                                                <div style={{ fontWeight: 800, fontSize: 11, opacity: 0.4, textTransform: "uppercase", letterSpacing: 1 }}>
                                                    📡 Ricerca Globale Clusters
                                                </div>
                                                {myDataAudit.globalSearchDone && (
                                                    <div style={{ fontSize: 11, color: "#60a5fa", fontWeight: 700 }}>
                                                        {myDataAudit.suggestions.length} CLUSTER TROVATI
                                                    </div>
                                                )}
                                            </div>

                                            {myDataAudit.globalSearchDone ? (
                                                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: 16, maxHeight: "400px", overflowY: "auto", paddingRight: 8 }}>
                                                    {myDataAudit.suggestions.map((s, idx) => {
                                                        const isMe = s.uid.trim() === user.uid;
                                                        const isTarget = s.uid.trim() === targetUid;
                                                        return (
                                                            <div key={idx} style={{
                                                                padding: "16px",
                                                                background: isMe ? "rgba(16, 185, 129, 0.1)" : "rgba(255,255,255,0.03)",
                                                                borderRadius: 16,
                                                                border: `1px solid ${isMe ? "rgba(16, 185, 129, 0.3)" : "rgba(255,255,255,0.1)"}`,
                                                                display: "flex",
                                                                flexDirection: "column",
                                                                gap: 12,
                                                                position: "relative",
                                                                overflow: "hidden"
                                                            }}>
                                                                {isMe && (
                                                                    <div style={{ position: "absolute", top: 0, right: 0, background: "#34d399", color: "#000", fontSize: 9, fontWeight: 900, padding: "2px 8px", borderRadius: "0 0 0 8px" }}>
                                                                        IL TUO ACCOUNT
                                                                    </div>
                                                                )}

                                                                <div>
                                                                    <div style={{ fontWeight: 800, fontSize: 14 }}>{s.name}</div>
                                                                    <div style={{ fontSize: 12, opacity: 0.5 }}>{s.email}</div>
                                                                </div>

                                                                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", background: "rgba(0,0,0,0.2)", padding: "10px", borderRadius: "10px" }}>
                                                                    <span style={{ fontSize: 11, opacity: 0.6 }}>Appuntamenti:</span>
                                                                    <strong style={{ fontSize: 18, color: s.count > 0 ? "#fff" : "rgba(255,255,255,0.3)" }}>{s.count}</strong>
                                                                </div>

                                                                <div style={{ fontSize: 9, opacity: 0.3, fontFamily: "monospace" }}>UID: {s.uid}</div>

                                                                <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                                                                    <button
                                                                        className="btn-secondary"
                                                                        style={{ flex: 1, fontSize: 10, padding: "6px 8px", borderRadius: 8 }}
                                                                        onClick={() => fetchSample(s.uid)}
                                                                    >
                                                                        🔍 ISPEZIONA
                                                                    </button>

                                                                    {!isMe && s.name.toLowerCase().includes("marco fregni") && (
                                                                        <button
                                                                            className="btn-primary"
                                                                            style={{ flex: 1, fontSize: 10, padding: "6px 8px", background: "rgba(239, 68, 68, 0.3)", border: "1px solid rgba(239, 68, 68, 0.3)", borderRadius: 8 }}
                                                                            onClick={async () => {
                                                                                if (!window.confirm(`💥 ELIMINAZIONE DOPPIONE 💥\n\nVuoi eliminare definitivamente l'account fantasma\nUID: ${s.uid}?\n\n(I dati rimarranno nel tuo account principale)`)) return;
                                                                                setIsRepairing(true);
                                                                                try {
                                                                                    const batch = writeBatch(db);
                                                                                    batch.delete(doc(db, "users", s.uid.trim()));
                                                                                    const qOrphans = query(collection(db, "appointments"), where("uid", "==", s.uid));
                                                                                    const snapOrphans = await getDocs(qOrphans);
                                                                                    snapOrphans.forEach(d => batch.delete(d.ref));
                                                                                    await batch.commit();
                                                                                    alert("Account doppione eliminato.");
                                                                                    window.location.reload();
                                                                                } catch (e) { alert(e.message); } finally { setIsRepairing(false); }
                                                                            }}
                                                                        >
                                                                            🗑️ ELIMINA
                                                                        </button>
                                                                    )}

                                                                    {!isMe && (
                                                                        <button
                                                                            className="btn-primary"
                                                                            style={{ flex: 1, fontSize: 10, padding: "6px 8px", background: "#f59e0b", border: "none", borderRadius: 8, color: "#000", fontWeight: 700 }}
                                                                            onClick={async () => {
                                                                                const phone = window.prompt("CONFERMA RIPRISTINO\n\nInserisci il tuo numero di telefono (10 cifre):");
                                                                                if (!phone) return;
                                                                                const cleanPhone = phone.replace(/\D/g, "").slice(-10);
                                                                                setIsRepairing(true);
                                                                                try {
                                                                                    const batch = writeBatch(db);
                                                                                    batch.set(doc(db, "phoneIndex", cleanPhone), { uid: s.uid, email: "marco.fregni@outlook.it", telefono: cleanPhone, updatedAt: serverTimestamp() }, { merge: true });
                                                                                    batch.update(doc(db, "users", s.uid.trim()), { telefono: cleanPhone, updatedAt: serverTimestamp(), role: "admin", permissions: { isAdmin: true } });
                                                                                    if (user.uid !== s.uid) batch.delete(doc(db, "users", user.uid));
                                                                                    await batch.commit();
                                                                                    alert("RIPRISTINATO! Verrai disconnesso.");
                                                                                    await logout();
                                                                                    window.location.href = "/login";
                                                                                } catch (e) { alert(e.message); } finally { setIsRepairing(false); }
                                                                            }}
                                                                        >
                                                                            🚀 RIPRISTINA
                                                                        </button>
                                                                    )}

                                                                    {!isMe && (
                                                                        <button
                                                                            className="btn-primary"
                                                                            style={{ flex: "1 1 100%", fontSize: 10, padding: "6px 8px", background: "rgba(59, 130, 246, 0.4)", border: "none", borderRadius: 8 }}
                                                                            onClick={async () => {
                                                                                if (!window.confirm(`⚠️ TRASLOCO DATI ⚠️\nVuoi spostare tutti i dati di questo cluster nel tuo account Gmail attuale?`)) return;
                                                                                setIsRepairing(true);
                                                                                try {
                                                                                    const qApp = query(collection(db, "appointments"), where("uid", "==", s.uid));
                                                                                    const snapApp = await getDocs(qApp);
                                                                                    const batch = writeBatch(db);
                                                                                    snapApp.forEach(d => { batch.update(d.ref, { uid: user.uid, updatedAt: serverTimestamp() }); });
                                                                                    const qLeads = query(collection(db, "users", s.uid.trim(), "listaNomi"));
                                                                                    const snapLeads = await getDocs(qLeads);
                                                                                    snapLeads.forEach(d => { batch.set(doc(db, "users", user.uid, "listaNomi", d.id), d.data()); });
                                                                                    batch.update(doc(db, "users", user.uid), { nome: "Marco", cognome: "Fregni", telefono: "3351605276", role: "admin", permissions: { isAdmin: true }, updatedAt: serverTimestamp() });
                                                                                    batch.set(doc(db, "phoneIndex", "3351605276"), { uid: user.uid, email: user.email, telefono: "3351605276", updatedAt: serverTimestamp() }, { merge: true });
                                                                                    await batch.commit();
                                                                                    alert("TRASLOCO COMPLETATO!");
                                                                                    window.location.reload();
                                                                                } catch (e) { alert(e.message); } finally { setIsRepairing(false); }
                                                                            }}
                                                                        >
                                                                            🏠 SPOSTA TUTTO QUI (GMAIL)
                                                                        </button>
                                                                    )}
                                                                </div>
                                                            </div>
                                                        );
                                                    })}
                                                </div>
                                            ) : (
                                                <div style={{ textAlign: "center", padding: "40px" }}>
                                                    <p style={{ opacity: 0.4, fontStyle: "italic", fontSize: 14 }}>Analisi globale non ancora eseguita.</p>
                                                    <button
                                                        className="btn-primary"
                                                        style={{ marginTop: 16, padding: "10px 24px", borderRadius: 12, background: "#3b82f6" }}
                                                        onClick={handleLoadAudit}
                                                    >
                                                        ESEGUI AUDIT GLOBALE CLUSTER
                                                    </button>
                                                </div>
                                            )}
                                        </div>
                                    </div>

                                </div>
                            )}
                            {/* --- RICERCA MANUALE (GHOST ACCOUNTS) --- */}
                            <div style={{
                                marginBottom: 24,
                                padding: "24px",
                                background: "rgba(255,255,255,0.02)",
                                borderRadius: "20px",
                                border: "1px solid rgba(255,255,255,0.1)",
                                boxShadow: "0 10px 25px rgba(0,0,0,0.2)"
                            }}>
                                <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
                                    <div style={{ padding: 10, background: "rgba(59, 130, 246, 0.1)", borderRadius: 12, color: "#60a5fa" }}>
                                        <Search size={24} />
                                    </div>
                                    <div>
                                        <div style={{ fontWeight: 800, fontSize: 13, textTransform: "uppercase", letterSpacing: 1 }}>
                                            Ricerca Manuale Utenti
                                        </div>
                                        <div style={{ fontSize: 11, opacity: 0.5 }}>Individua account fantasma o duplicati</div>
                                    </div>
                                </div>

                                <div style={{ position: "relative", marginBottom: 20 }}>
                                    <input
                                        type="text"
                                        placeholder="Cerca per nome, cognome o email..."
                                        style={{
                                            width: "100%",
                                            padding: "14px 16px 14px 44px",
                                            borderRadius: "14px",
                                            background: "rgba(0,0,0,0.3)",
                                            border: "1px solid rgba(255,255,255,0.1)",
                                            color: "#fff",
                                            fontSize: 14,
                                            outline: "none",
                                            transition: "border-color 0.2s"
                                        }}
                                        value={myDataAudit.userSearchTerm}
                                        onChange={(e) => setMyDataAudit(prev => ({ ...prev, userSearchTerm: e.target.value }))}
                                    />
                                    <Search size={18} style={{ position: "absolute", left: 16, top: "50%", transform: "translateY(-50%)", opacity: 0.3 }} />
                                </div>

                                <div style={{
                                    maxHeight: "300px",
                                    overflowY: "auto",
                                    display: "flex",
                                    flexDirection: "column",
                                    gap: 10,
                                    paddingRight: 6
                                }}>
                                    {myDataAudit.userSearchTerm.length >= 2 ? (
                                        allUsers
                                            .filter(u => {
                                                const full = `${u.nome || ""} ${u.cognome || ""} ${u.email || ""}`.toLowerCase();
                                                return full.includes(myDataAudit.userSearchTerm.toLowerCase());
                                            })
                                            .map(u => (
                                                <div key={u.id} style={{
                                                    padding: "14px",
                                                    background: "rgba(255,255,255,0.03)",
                                                    borderRadius: 14,
                                                    display: "flex",
                                                    justifyContent: "space-between",
                                                    alignItems: "center",
                                                    border: "1px solid rgba(255,255,255,0.05)",
                                                    transition: "transform 0.2s, background 0.2s"
                                                }}>
                                                    <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                                                        <div style={{
                                                            width: 36,
                                                            height: 36,
                                                            borderRadius: 10,
                                                            background: u.id === user.uid ? "rgba(52, 211, 153, 0.2)" : "rgba(255,255,255,0.05)",
                                                            display: "flex",
                                                            alignItems: "center",
                                                            justifyContent: "center",
                                                            fontSize: 14,
                                                            fontWeight: 800,
                                                            color: u.id === user.uid ? "#34d399" : "#fff"
                                                        }}>
                                                            {(u.nome?.[0] || u.email?.[0] || "?").toUpperCase()}
                                                        </div>
                                                        <div>
                                                            <div style={{ fontSize: 13, fontWeight: 700, display: "flex", alignItems: "center", gap: 6 }}>
                                                                {u.nome} {u.cognome}
                                                                {u.id === user.uid && <Shield size={12} style={{ color: "#34d399" }} />}
                                                            </div>
                                                            <div style={{ fontSize: 11, opacity: 0.5 }}>{u.email}</div>
                                                        </div>
                                                    </div>
                                                    {u.id !== user.uid && (
                                                        <button
                                                            className="btn-primary"
                                                            style={{
                                                                fontSize: 11,
                                                                padding: "6px 14px",
                                                                background: "rgba(239, 68, 68, 0.1)",
                                                                border: "1px solid rgba(239, 68, 68, 0.2)",
                                                                color: "#fca5a5",
                                                                borderRadius: 10
                                                            }}
                                                            onClick={async () => {
                                                                if (!window.confirm(`💥 ELIMINAZIONE DEFINITIVA 💥\n\nStai per cancellare l'account di:\n${u.nome} ${u.cognome}\n(${u.email})\n\nQuesta azione è IRREVERSIBILE. Procedere?`)) return;
                                                                setIsRepairing(true);
                                                                try {
                                                                    await deleteDoc(doc(db, "users", u.id));
                                                                    alert("Account eliminato.");
                                                                } catch (e) { alert(e.message); } finally { setIsRepairing(false); }
                                                            }}
                                                        >
                                                            ELIMINA
                                                        </button>
                                                    )}
                                                </div>
                                            ))
                                    ) : (
                                        <div style={{ padding: "30px 20px", textAlign: "center", opacity: 0.3, fontSize: 13, fontStyle: "italic" }}>
                                            Inserisci almeno 2 caratteri per iniziare la ricerca...
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* Sample Viewer */}
                            {myDataAudit.sample && (
                                <div style={{ marginBottom: 20, padding: 15, background: "rgba(0,0,0,0.3)", borderRadius: 12, border: "1px solid rgba(255,255,255,0.1)" }}>
                                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 10 }}>
                                        <strong style={{ color: "var(--accent-orange)" }}>🔎 ISPEZIONE TOTALE ({myDataAudit.sample.items.length} risultati):</strong>
                                        <button onClick={() => setMyDataAudit(p => ({ ...p, sample: null }))} style={{ background: "none", border: "none", color: "#fff", cursor: "pointer", fontSize: 20 }}>×</button>
                                    </div>
                                    {myDataAudit.sample.items.length > 0 ? (
                                        <div style={{ display: "grid", gap: 5, maxHeight: "400px", overflowY: "auto", paddingRight: 10 }}>
                                            {myDataAudit.sample.items.map((it, i) => (
                                                <div key={i} style={{ fontSize: 12, padding: "6px 10px", background: "rgba(255,255,255,0.05)", borderRadius: 4, display: "flex", justifyContent: "space-between" }}>
                                                    <span>👤 <b>{it.paziente || it.nome || "Senza Nome"}</b></span>
                                                    <span style={{ opacity: 0.6 }}>📅 {it.formatedDate || it.date}</span>
                                                </div>
                                            ))}
                                        </div>
                                    ) : <p>Nessun appuntamento trovato per questo UID.</p>}
                                </div>
                            )}

                            <div style={{ marginBottom: "20px" }}>
                                <button
                                    className="btn-secondary"
                                    style={{ width: "100%", padding: "12px" }}
                                    onClick={() => window.location.reload()}
                                >
                                    <RefreshCcw size={16} /> Reset Interfaccia
                                </button>
                            </div>

                            {/* SECTION: MIGRAZIONE UTENTE (Premium Redesign) */}
                            <section className="card" style={{
                                background: "linear-gradient(165deg, rgba(30, 41, 59, 0.4) 0%, rgba(15, 23, 42, 0.6) 100%)",
                                border: "1px solid rgba(249, 115, 22, 0.2)",
                                borderRadius: "24px",
                                padding: "24px",
                                boxShadow: "0 20px 40px rgba(0,0,0,0.3)",
                                backdropFilter: "blur(20px)"
                            }}>
                                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
                                    <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
                                        <div style={{ padding: 12, background: "rgba(249, 115, 22, 0.1)", borderRadius: 14, color: "#f97316" }}>
                                            <Users size={28} />
                                        </div>
                                        <div>
                                            <h2 style={{ margin: 0, fontSize: "1.2rem", fontWeight: 800 }}>MIGRAZIONE DATI UTENTE</h2>
                                            <p style={{ margin: 0, fontSize: 13, opacity: 0.5 }}>Sposta appuntamenti e leads tra account</p>
                                        </div>
                                    </div>
                                    <div style={{
                                        padding: "6px 14px",
                                        borderRadius: 10,
                                        background: "rgba(249, 115, 22, 0.1)",
                                        border: "1px solid rgba(249, 115, 22, 0.2)",
                                        fontSize: 11,
                                        fontWeight: 700,
                                        color: "#f97316",
                                        textTransform: "uppercase"
                                    }}>
                                        Urgency Fix
                                    </div>
                                </div>

                                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24 }}>
                                    {/* GUIDA PASSO PASSO */}
                                    <div style={{
                                        padding: "20px",
                                        background: "rgba(0,0,0,0.2)",
                                        borderRadius: "16px",
                                        border: "1px solid rgba(255,255,255,0.05)"
                                    }}>
                                        <div style={{ fontWeight: 800, fontSize: 11, opacity: 0.4, textTransform: "uppercase", letterSpacing: 1, marginBottom: 16 }}>
                                            📚 Procedura di Emergenza
                                        </div>
                                        {[
                                            "Trova il 'Vecchio UID' tramite Controllo Numero.",
                                            "Libera il numero se necessario.",
                                            "Crea il NUOVO account (se non esiste).",
                                            "Incolla gli UID e avvia la migrazione."
                                        ].map((step, idx) => (
                                            <div key={idx} style={{ display: "flex", gap: 12, marginBottom: 10, fontSize: 13 }}>
                                                <div style={{
                                                    width: 20,
                                                    height: 20,
                                                    borderRadius: 6,
                                                    background: "#f97316",
                                                    color: "#000",
                                                    display: "flex",
                                                    alignItems: "center",
                                                    justifyContent: "center",
                                                    fontSize: 11,
                                                    fontWeight: 900,
                                                    flexShrink: 0
                                                }}>{idx + 1}</div>
                                                <span style={{ opacity: 0.7 }}>{step}</span>
                                            </div>
                                        ))}
                                    </div>

                                    {/* CONTROLLO NUMERO */}
                                    <div style={{
                                        padding: "20px",
                                        background: "rgba(255,255,255,0.03)",
                                        borderRadius: "16px",
                                        border: "1px solid rgba(255,255,255,0.1)",
                                        display: "flex",
                                        flexDirection: "column",
                                        gap: 12
                                    }}>
                                        <div style={{ fontWeight: 800, fontSize: 11, opacity: 0.4, textTransform: "uppercase", letterSpacing: 1 }}>
                                            STEP 1: SALVA VECCHIO UID & LIBERA NUMERO
                                        </div>
                                        <input
                                            style={{
                                                width: "100%",
                                                padding: "12px",
                                                borderRadius: "12px",
                                                background: "rgba(0,0,0,0.3)",
                                                border: "1px solid rgba(255,255,255,0.1)",
                                                color: "#fff",
                                                fontSize: 14
                                            }}
                                            placeholder="Inserisci Numero (10 cifre)"
                                            value={phoneLookup}
                                            onChange={e => setPhoneLookup(e.target.value)}
                                        />
                                        <div style={{ display: "flex", gap: 10 }}>
                                            <button
                                                className="btn-secondary"
                                                style={{ flex: 1, padding: "10px", borderRadius: 10 }}
                                                onClick={handleCheckPhone}
                                            >
                                                CERCA UID
                                            </button>
                                            <button
                                                className="btn-secondary"
                                                style={{ flex: 1, padding: "10px", borderRadius: 10, color: "#f87171", borderColor: "rgba(248, 113, 113, 0.4)" }}
                                                onClick={handleFreePhone}
                                            >
                                                LIBERA NUMERO
                                            </button>
                                        </div>
                                        {foundOldUid && (
                                            <div style={{
                                                marginTop: 4,
                                                padding: 10,
                                                background: "rgba(52, 211, 153, 0.1)",
                                                borderRadius: 8,
                                                fontSize: 12,
                                                color: "#34d399",
                                                border: "1px solid rgba(52, 211, 153, 0.2)"
                                            }}>
                                                <b>UID TROVATO:</b> {foundOldUid}
                                            </div>
                                        )}
                                    </div>

                                    {/* FORM MIGRAZIONE */}
                                    <div style={{
                                        gridColumn: "1 / -1",
                                        padding: "24px",
                                        background: "rgba(255,255,255,0.03)",
                                        borderRadius: "20px",
                                        border: "1px solid rgba(255,255,255,0.1)",
                                        display: "flex",
                                        flexDirection: "column",
                                        gap: 20
                                    }}>
                                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
                                            <div>
                                                <label style={{ display: "block", fontSize: 11, fontWeight: 800, opacity: 0.4, marginBottom: 8, textTransform: "uppercase" }}>Sorgente (Vecchio UID)</label>
                                                <input
                                                    style={{
                                                        width: "100%",
                                                        padding: "12px",
                                                        borderRadius: "12px",
                                                        background: "rgba(0,0,0,0.3)",
                                                        border: "1px solid rgba(239, 68, 68, 0.3)",
                                                        color: "#fff",
                                                        fontSize: 13,
                                                        fontFamily: "monospace"
                                                    }}
                                                    placeholder="Incolla UID sorgente..."
                                                    value={migrationSourceUid}
                                                    onChange={(e) => setMigrationSourceUid(e.target.value.trim())}
                                                />
                                            </div>
                                            <div>
                                                <label style={{ display: "block", fontSize: 11, fontWeight: 800, opacity: 0.4, marginBottom: 8, textTransform: "uppercase" }}>Destinazione (Nuovo UID)</label>
                                                <input
                                                    style={{
                                                        width: "100%",
                                                        padding: "12px",
                                                        borderRadius: "12px",
                                                        background: "rgba(0,0,0,0.3)",
                                                        border: "1px solid rgba(52, 211, 153, 0.3)",
                                                        color: "#fff",
                                                        fontSize: 13,
                                                        fontFamily: "monospace"
                                                    }}
                                                    placeholder="Incolla UID destinazione..."
                                                    value={migrationTargetUid}
                                                    onChange={(e) => setMigrationTargetUid(e.target.value.trim())}
                                                />
                                            </div>
                                        </div>

                                        <button
                                            className="btn-primary"
                                            style={{
                                                width: "100%",
                                                padding: "16px",
                                                borderRadius: "16px",
                                                background: "linear-gradient(135deg, #f97316 0%, #ea580c 100%)",
                                                boxShadow: "0 10px 20px rgba(234, 88, 12, 0.3)",
                                                fontSize: 15,
                                                fontWeight: 800,
                                                border: "none",
                                                color: "#000"
                                            }}
                                            onClick={handleMigrateData}
                                            disabled={isRepairing}
                                        >
                                            {isRepairing ? "MIGRAZIONE IN CORSO..." : "ESEGUI MIGRAZIONE COMPLETA DATI"}
                                        </button>
                                    </div>
                                </div>
                                <div style={{ marginBottom: "20px", marginTop: "24px" }}>
                                    <button
                                        className="btn-secondary"
                                        style={{ width: "100%", padding: "14px", borderRadius: 16, fontWeight: 700, border: "1px solid rgba(255,255,255,0.1)", background: "rgba(255,255,255,0.05)" }}
                                        onClick={() => window.location.reload()}
                                    >
                                        <RefreshCcw size={18} /> RESET INTERFACCIA TECNICA
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
                                                                    style={{ flex: 1, height: "36px", fontSize: "13px", background: "#1f2937", color: "#fff", borderColor: "#374151" }}
                                                                    value={newParentUid}
                                                                    onChange={(e) => setNewParentUid(e.target.value)}
                                                                >
                                                                    <option value="" style={{ background: "#1f2937", color: "#9ca3af" }}>-- Seleziona Nuovo Driver --</option>
                                                                    {/* Option 1: ME (Current User) */}
                                                                    {user && targetUid !== user.uid && (
                                                                        <option value={user.uid} style={{ fontWeight: "bold", background: "#1e3a8a", color: "#93c5fd" }}>
                                                                            👉 IO (Assegna a ME: {user.displayName || user.email})
                                                                        </option>
                                                                    )}
                                                                    <option disabled style={{ background: "#1f2937", color: "#4b5563" }}>-------------------</option>
                                                                    {auditUsers
                                                                        .filter(u => u.uid !== targetUid && u.uid !== user?.uid)
                                                                        .sort((a, b) => (a.nome || "").localeCompare(b.nome || ""))
                                                                        .map(u => {
                                                                            // Calculate metadata string
                                                                            const createdStr = u.createdAt?.seconds ? new Date(u.createdAt.seconds * 1000).toLocaleDateString() : "";
                                                                            const updateStr = u.updatedAt?.seconds ? new Date(u.updatedAt.seconds * 1000).toLocaleDateString() : "";
                                                                            // Use create date as primary differentiator if available, else update
                                                                            const activityLabel = createdStr ? `[Creato: ${createdStr}]` : (updateStr ? `[Aggiornato: ${updateStr}]` : "[No Data]");

                                                                            return (
                                                                                <option key={u.uid} value={u.uid} style={{ background: "#1f2937", color: "#fff" }}>
                                                                                    {u.nome} {u.cognome} — {u.email} — {activityLabel} (UID: ...{u.uid.slice(-4)})
                                                                                </option>
                                                                            );
                                                                        })
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

                                                                <button
                                                                    className="btn-secondary"
                                                                    style={{ fontSize: "11px", height: "36px", padding: "0 15px", marginLeft: "10px", background: "rgba(239,68,68,0.2)", color: "#fca5a5", border: "1px solid rgba(239,68,68,0.3)" }}
                                                                    onClick={() => handleUnlinkDriver(targetUid)}
                                                                    title="Rimuove il driver attuale e rende questo utente indipendente (Top Level)"
                                                                >
                                                                    Rendi Top Level (No Driver)
                                                                </button>
                                                            </div>

                                                            {/* DELETE BUTTON */}
                                                            <div style={{ marginTop: 10, display: "flex", justifyContent: "flex-end" }}>
                                                                <button
                                                                    className="btn-secondary"
                                                                    style={{
                                                                        fontSize: "10px",
                                                                        padding: "4px 8px",
                                                                        background: "rgba(239,68,68,0.1)",
                                                                        color: "var(--accent-red)",
                                                                        border: "1px dashed rgba(239,68,68,0.3)"
                                                                    }}
                                                                    onClick={() => handleDeleteUser(targetUid)}
                                                                >
                                                                    🗑️ ELIMINA ACCOUNT (DANGER)
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
                                    {/* --- NEW SECTION: AUDIT DATI (TROVA DATI PERSI) --- */}
                                    <div className="admin-card" style={{ marginTop: "2rem", border: "1px solid var(--accent-orange)", background: "rgba(249, 115, 22, 0.05)" }}>
                                        <h3>📊 AUDIT DATI (TROVA DATI PERSI)</h3>
                                        <p style={{ fontSize: "12px", opacity: 0.7, marginBottom: "1rem" }}>
                                            Se dopo la fusione non trovi i tuoi dati, usa questo strumento per vedere quale account "nasconde" gli appuntamenti e i contatti.
                                        </p>

                                        <button
                                            className="btn-secondary"
                                            onClick={async () => {
                                                setIsRepairing(true);
                                                setRepairLog(["🔍 Scansione globale dati in corso..."]);
                                                try {
                                                    const updatedUsers = [...auditUsers];
                                                    for (let i = 0; i < updatedUsers.length; i++) {
                                                        const u = updatedUsers[i];
                                                        const qApp = query(collection(db, "appointments"), where("uid", "==", u.uid));
                                                        const snapApp = await getDocs(qApp);
                                                        const qLeads = query(collection(db, "users", u.uid, "listaNomi"));
                                                        const snapLeads = await getDocs(qLeads);

                                                        updatedUsers[i] = {
                                                            ...u,
                                                            _apptCount: snapApp.size,
                                                            _leadCount: snapLeads.size
                                                        };
                                                        if (i % 5 === 0) setRepairLog(prev => [...prev, `⏳ Analizzati ${i + 1}/${updatedUsers.length} utenti...`]);
                                                    }
                                                    setAuditUsers(updatedUsers);
                                                    setRepairLog(prev => [...prev, "✅ Scansione completata! Controlla la tabella sotto (colonne DATI)."]);
                                                } catch (e) {
                                                    alert("Errore audit: " + e.message);
                                                } finally {
                                                    setIsRepairing(false);
                                                }
                                            }}
                                            disabled={isRepairing || auditUsers.length === 0}
                                        >
                                            {isRepairing ? "Analisi..." : "🔍 ANALIZZA QUANTITÀ DATI (Appuntamenti/Leads)"}
                                        </button>

                                        <div style={{ marginTop: "15px", fontSize: "11px", color: "var(--text-muted)" }}>
                                            * Nota: Questa operazione richiede tempo se ci sono molti utenti. Una volta finita, appariranno due nuove colonne nella tabella in fondo.
                                        </div>
                                    </div>

                                    {/* --- NEW SECTION: MERGE ACCOUNTS --- */}
                                    <div className="admin-card" style={{ marginTop: "2rem", border: "1px solid var(--accent-purple)", background: "rgba(139, 92, 246, 0.05)" }}>
                                        <h3>FUSIONE ACCOUNT (MERGE)</h3>
                                        <p style={{ fontSize: "12px", opacity: 0.7, marginBottom: "1rem" }}>
                                            Usa questo strumento se un utente ha due account (es. uno vecchio e uno nuovo).
                                            Sposta tutta la struttura e i dati dal "Vecchio" al "Nuovo", poi elimina il Vecchio.
                                        </p>

                                        {/* CURRENT USER INFO BANNER */}
                                        <div style={{ padding: "15px", background: "rgba(254, 243, 199, 0.1)", color: "#fcd34d", borderRadius: "8px", marginBottom: "20px", border: "1px solid rgba(252, 211, 77, 0.3)", fontSize: "13px" }}>
                                            <strong style={{ color: "var(--accent-orange)", fontSize: "14px" }}>ℹ️ IL TUO ACCESSO ATTUALE:</strong> <br />
                                            <div style={{ marginTop: "8px", display: "grid", gridTemplateColumns: "150px 1fr", gap: "5px" }}>
                                                <span>👤 Nome Profilo:</span> <strong>{userDoc?.nome} {userDoc?.cognome} {(!userDoc?.nome && !userDoc?.cognome) && "[Senza Nome]"}</strong>
                                                <span>📱 Telefono Doc:</span> <strong>{userDoc?.telefono || "Non trovato nel profilo"}</strong>
                                                <span>📧 Email Tecnica:</span> <strong>{user?.email}</strong>
                                                <span>🆔 UID:</span> <code style={{ fontSize: "11px", opacity: 0.8 }}>{user?.uid}</code>
                                            </div>
                                            <div style={{ marginTop: "12px", padding: "8px", background: "rgba(0,0,0,0.2)", borderRadius: "8px", borderLeft: "3px solid var(--accent-orange)" }}>
                                                <strong>✅ SICUREZZA LOGIN:</strong> Ho aggiornato lo strumento. <br />
                                                Anche se elimini l'account attuale (il "doppione"), <strong>manterrai le stesse identiche credenziali</strong> (Numero e Password) perché verranno trasferite automaticamente al nuovo profilo. <br />
                                                <br />
                                                Visto che sei loggato con questo account (UID: <strong>...NB8D3</strong>), se vuoi unirlo a quello giusto seleziona <strong>"👉 IO"</strong> nel menu a <strong>SINISTRA</strong>.
                                            </div>
                                        </div>

                                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "20px", marginBottom: "20px" }}>
                                            <div>
                                                <label style={{ display: "block", marginBottom: "5px", color: "var(--accent-red)", fontWeight: "bold" }}>
                                                    1. Account DA ELIMINARE (Vecchio/Doppione)
                                                </label>
                                                <select
                                                    className="form-input"
                                                    style={{ width: "100%", background: "#1f2937", color: "#fff" }}
                                                    value={mergeSourceUid}
                                                    onChange={e => setMergeSourceUid(e.target.value)}
                                                >
                                                    <option value="">-- Seleziona Doppione --</option>
                                                    {user && mergeTargetUid !== user.uid && (
                                                        <option value={user.uid} style={{ background: "#fca5a5", color: "#b91c1c", fontWeight: "bold" }}>
                                                            👉 IO (Attenzione: ELIMINA IL TUO ACCOUNT ATTUALE)
                                                        </option>
                                                    )}
                                                    {auditUsers
                                                        .filter(u => u.uid !== mergeTargetUid && u.uid !== user?.uid)
                                                        .sort((a, b) => (a.nome || "").localeCompare(b.nome || ""))
                                                        .map(u => {
                                                            const createdStr = u.createdAt?.seconds ? new Date(u.createdAt.seconds * 1000).toLocaleDateString() : "";
                                                            const displayName = (u.nome || u.cognome) ? `${u.nome || ""} ${u.cognome || ""}` : `[SENZA NOME - UID: ...${u.uid.slice(-5)}]`;
                                                            return (
                                                                <option key={u.uid} value={u.uid}>
                                                                    {displayName} ({u.email || "No Email"}) [Creato: {createdStr}]
                                                                </option>
                                                            );
                                                        })}
                                                </select>
                                            </div>

                                            <div>
                                                <label style={{ display: "block", marginBottom: "5px", color: "var(--accent-green)", fontWeight: "bold" }}>
                                                    2. Account DA MANTENERE (Nuovo/Attivo)
                                                </label>
                                                <select
                                                    className="form-input"
                                                    style={{ width: "100%", background: "#1f2937", color: "#fff" }}
                                                    value={mergeTargetUid}
                                                    onChange={e => setMergeTargetUid(e.target.value)}
                                                >
                                                    <option value="">-- Seleziona Account Giusto --</option>
                                                    {user && mergeSourceUid !== user.uid && (
                                                        <option value={user.uid} style={{ background: "#e0f2fe", color: "#1e3a8a", fontWeight: "bold" }}>
                                                            👉 IO (Mantieni il mio account attuale)
                                                        </option>
                                                    )}
                                                    {auditUsers
                                                        .filter(u => u.uid !== mergeSourceUid && u.uid !== user?.uid)
                                                        .sort((a, b) => (a.nome || "").localeCompare(b.nome || ""))
                                                        .map(u => {
                                                            const createdStr = u.createdAt?.seconds ? new Date(u.createdAt.seconds * 1000).toLocaleDateString() : "";
                                                            const displayName = (u.nome || u.cognome) ? `${u.nome || ""} ${u.cognome || ""}` : `[SENZA NOME - UID: ...${u.uid.slice(-5)}]`;
                                                            return (
                                                                <option key={u.uid} value={u.uid}>
                                                                    {displayName} ({u.email || "No Email"}) [Creato: {createdStr}]
                                                                </option>
                                                            );
                                                        })}
                                                </select>
                                            </div>
                                        </div>

                                        <div style={{ textAlign: "right" }}>
                                            <button
                                                className="btn-primary"
                                                disabled={!mergeSourceUid || !mergeTargetUid || mergeSourceUid === mergeTargetUid || isRepairing}
                                                onClick={handleMergeAccounts}
                                                style={{ background: "var(--accent-purple)", opacity: (!mergeSourceUid || !mergeTargetUid) ? 0.5 : 1 }}
                                            >
                                                {isRepairing ? "Fusione in corso..." : "🔄 UNISCI GLI ACCOUNT"}
                                            </button>
                                        </div>
                                    </div>

                                    <div style={{ height: "40px" }}></div>

                                    <h3 style={{ marginTop: "2rem" }}>Utenti ({auditUsers.length})</h3>
                                    <div style={{ overflowX: "auto" }}>
                                        <table className="admin-table" style={{ width: "100%", borderCollapse: "collapse" }}>
                                            <thead>
                                                <tr style={{ textAlign: "left", borderBottom: "1px solid rgba(255,255,255,0.1)" }}>
                                                    <th style={{ padding: "12px 8px" }}>Utente</th>
                                                    <th style={{ padding: "12px 8px" }}>DATI (App/Lead)</th>
                                                    <th style={{ padding: "12px 8px" }}>Driver UID</th>
                                                    <th style={{ padding: "12px 8px" }}>Chain Size</th>
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
                                                        <td style={{ padding: "12px 8px" }}>
                                                            {u._apptCount !== undefined ? (
                                                                <div style={{ fontWeight: "bold", color: u._apptCount > 0 ? "var(--accent-green)" : "var(--text-muted)" }}>
                                                                    📅 {u._apptCount} / 📇 {u._leadCount}
                                                                </div>
                                                            ) : (
                                                                <span style={{ opacity: 0.3, fontSize: 10 }}>Usa "Analizza"</span>
                                                            )}
                                                        </td>
                                                        <td style={{ padding: "12px 8px" }}>{u.driverUid || <span style={{ opacity: 0.3 }}>N/A</span>}</td>
                                                        <td style={{ padding: "12px 8px" }}>{(u.driverChain || []).length}</td>
                                                        <td style={{ padding: "12px 8px" }}>
                                                            <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
                                                                <button
                                                                    className="btn-secondary"
                                                                    style={{ fontSize: 10, padding: "4px 8px" }}
                                                                    onClick={() => setInspectedUserUid(u.uid)}
                                                                >
                                                                    Ispeziona
                                                                </button>

                                                                {/* RECUPERO LOGIN DI EMERGENZA */}
                                                                {u.uid !== user.uid && (u._apptCount > 0 || u.uid === "HPhryWrSoNUr8uMwudewp9wUcRN2") && (
                                                                    <button
                                                                        className="btn-primary"
                                                                        style={{
                                                                            fontSize: 10,
                                                                            padding: "4px 8px",
                                                                            background: "var(--accent-orange)",
                                                                            border: "1px solid #000"
                                                                        }}
                                                                        onClick={() => handleFixLoginBinding(u.uid)}
                                                                        title="IMPORTANTE: Se questo è il tuo vero account, clicca qui per ricollegare il tuo numero di telefono e riavere i tuoi dati."
                                                                    >
                                                                        🔄 RIPRISTINA MIO LOGIN
                                                                    </button>
                                                                )}

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

                        </>
                    )
                }

                {/* SECTION: ALBERO GERARCHICO VISUALE */}
                <section className="card">
                    <div className="card-header">
                        <div>
                            <div className="card-title" style={{ color: "#a78bfa" }}>Albero della Struttura (Visuale)</div>
                            <div className="card-subtitle">
                                Visualizza la gerarchia completa. Clicca sui nomi per espandere/comprimere.
                            </div>
                        </div>
                        <button
                            className="btn-secondary"
                            onClick={handleLoadAudit}
                            disabled={isAuditing}
                        >
                            <RefreshCcw size={16} className={isAuditing ? "animate-spin" : ""} />
                            Aggiorna Dati
                        </button>
                    </div>

                    <div className="card-body" style={{ overflowX: "auto", paddingBottom: 20 }}>
                        {auditUsers.length === 0 ? (
                            <div style={{ padding: 20, textAlign: "center", color: "var(--text-muted)" }}>
                                Clicca "Aggiorna Dati" per caricare l'albero.
                            </div>
                        ) : (
                            <HierarchyTree users={auditUsers} />
                        )}
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
                                            onChange={(e) => {
                                                setIsDirty(true);
                                                setPermsDraft((prev) => ({ ...prev, [p.key]: e.target.checked }));
                                            }}
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
                                        const isAlwaysUnlocked = topic.toUpperCase() === "I PRIMI PASSI DEL COLLABORATORE";
                                        const isAllowed = isAlwaysUnlocked || (permsDraft.allowedTopics || []).includes(topic);
                                        return (
                                            <div
                                                key={topic}
                                                onClick={() => {
                                                    if (!selectedUserId || isAlwaysUnlocked) return;
                                                    setIsDirty(true); // 🔥
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
                                                    background: isAllowed ? (isAlwaysUnlocked ? "rgba(16, 185, 129, 0.4)" : "var(--accent-blue)") : "transparent",
                                                    display: "grid", placeItems: "center",
                                                    opacity: isAlwaysUnlocked ? 0.6 : 1
                                                }}>
                                                    {isAllowed && (isAlwaysUnlocked ? <CheckCircle2 size={12} color="#fff" /> : <Shield size={12} color="#fff" />)}
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
                                                setIsDirty(true); // 🔥
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
                            Nota: dopo il salvataggio, le pagine cambiano Modalità (gestione/visione) perché leggono permissions in realtime.
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

                {/* STATS SIMULATOR TOOL */}
                <section className="card" style={{ border: "1px solid rgba(16, 185, 129, 0.2)", overflow: "visible" }}>
                    <div className="card-header">
                        <div>
                            <div className="card-title" style={{ color: "var(--accent-green)" }}>
                                Simulatore Provvigioni / Statistiche
                            </div>
                            <div className="card-subtitle">
                                Verifica i calcoli della Dashboard per un utente specifico. <br />
                                Mostra il totale appuntamenti di <b>TUTTA LA DOWNLINE</b> (Struttura completa) e chi ha contribuito.
                            </div>
                        </div>
                        <div className="badge-status" style={{ background: "rgba(16, 185, 129, 0.1)", color: "var(--accent-green)", border: "1px solid rgba(16, 185, 129, 0.2)" }}>
                            audit
                        </div>
                    </div>

                    <div className="card-body" style={{ overflow: "visible" }}>
                        <div style={{ display: "flex", gap: 10, alignItems: "flex-end", flexWrap: "wrap", marginBottom: 20 }}>
                            <div style={{ flex: 1, minWidth: 250 }}>
                                <label className="form-label">Seleziona Leader da analizzare</label>
                                <CustomSelect
                                    value={simTargetUid}
                                    onChange={setSimTargetUid}
                                    options={dropdownOptions} // Reusing existing list
                                    placeholder="Cerca utente..."
                                    searchable={true}
                                />
                            </div>
                            <button
                                className="btn-primary"
                                onClick={handleSimulateStats}
                                disabled={simLoading || !simTargetUid}
                                style={{ height: 44, background: "var(--accent-green)", minWidth: 120 }}
                            >
                                {simLoading ? "Calcolo..." : "Analizza Produzione"}
                            </button>
                        </div>

                        {simStats && (
                            <div style={{ animation: "fadeIn 0.3s ease" }}>

                                {/* HEADLINE TOTALS */}
                                <div className="grid-3" style={{ marginBottom: 20 }}>
                                    <div style={{ background: "rgba(255,255,255,0.03)", padding: 15, borderRadius: 12, border: "1px solid rgba(255,255,255,0.08)" }}>
                                        <div style={{ fontSize: 11, textTransform: "uppercase", opacity: 0.7, fontWeight: 700 }}>Totale Appuntamenti</div>
                                        <div style={{ fontSize: 28, fontWeight: 900, color: "#fff" }}>{simStats.total.total}</div>
                                    </div>
                                    <div style={{ background: "rgba(255,255,255,0.03)", padding: 15, borderRadius: 12, border: "1px solid rgba(255,255,255,0.08)" }}>
                                        <div style={{ fontSize: 11, textTransform: "uppercase", opacity: 0.7, fontWeight: 700 }}>Totale Eseguiti (Pos/Neg)</div>
                                        <div style={{ fontSize: 28, fontWeight: 900, color: "var(--accent-blue)" }}>{simStats.total.executed}</div>
                                    </div>
                                    <div style={{ background: "rgba(255,255,255,0.03)", padding: 15, borderRadius: 12, border: "1px solid rgba(255,255,255,0.08)" }}>
                                        <div style={{ fontSize: 11, textTransform: "uppercase", opacity: 0.7, fontWeight: 700 }}>Breakdown Tipo</div>
                                        <div style={{ fontSize: 13, marginTop: 4 }}>
                                            <span style={{ color: "#fb923c" }}>CA: <b>{simStats.total.ca}</b></span> â€¢ <span style={{ color: "#38bdf8" }}>CVA: <b>{simStats.total.cva}</b></span>
                                        </div>
                                    </div>
                                </div>

                                <div style={{ fontSize: 13, marginBottom: 10, opacity: 0.8 }}>
                                    Dettaglio contributi ({simStats.teamSize} utenti nella struttura):
                                </div>

                                <div style={{ overflowX: "auto", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 12 }}>
                                    <table className="admin-table" style={{ width: "100%", fontSize: 13 }}>
                                        <thead>
                                            <tr style={{ background: "rgba(255,255,255,0.03)" }}>
                                                <th style={{ padding: 10, textAlign: "left" }}>Collaboratore</th>
                                                <th style={{ padding: 10, textAlign: "center" }}>Totale</th>
                                                <th style={{ padding: 10, textAlign: "center" }}>CA</th>
                                                <th style={{ padding: 10, textAlign: "center" }}>CVA</th>
                                                <th style={{ padding: 10, textAlign: "center" }}>Eseguiti</th>
                                                <th style={{ padding: 10, textAlign: "right" }}>% Contributo</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {simStats.breakdown.map(row => {
                                                const pct = simStats.total.total > 0 ? Math.round((row.total / simStats.total.total) * 100) : 0;
                                                return (
                                                    <tr key={row.uid} style={{ borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
                                                        <td style={{ padding: 10 }}>
                                                            <div style={{ fontWeight: 600 }}>{row.name}</div>
                                                            <div style={{ fontSize: 10, opacity: 0.5 }}>{row.uid.slice(0, 5)}...</div>
                                                        </td>
                                                        <td style={{ padding: 10, textAlign: "center", fontWeight: "bold" }}>{row.total}</td>
                                                        <td style={{ padding: 10, textAlign: "center" }}>{row.ca}</td>
                                                        <td style={{ padding: 10, textAlign: "center" }}>{row.cva}</td>
                                                        <td style={{ padding: 10, textAlign: "center", color: row.executed > 0 ? "var(--accent-blue)" : "inherit" }}>
                                                            {row.executed}
                                                        </td>
                                                        <td style={{ padding: 10, textAlign: "right" }}>
                                                            <span style={{
                                                                padding: "2px 6px", borderRadius: 4,
                                                                background: `rgba(255,255,255,${0.05 + (pct / 100) * 0.2})`,
                                                                fontSize: 11
                                                            }}>
                                                                {pct}%
                                                            </span>
                                                        </td>
                                                    </tr>
                                                );
                                            })}
                                        </tbody>
                                    </table>
                                </div>

                            </div>
                        )}

                    </div>
                </section>
            </div >

            {/* ✅ ANTEPRIMA WHAT'S NEW */}
            < ChangelogModal
                isOpen={showClPreview}
                onClose={() => setShowClPreview(false)}
                data={{ title: clTitle, description: clDesc, imageUrl: clImage }}
            />
        </div >
    );
}
