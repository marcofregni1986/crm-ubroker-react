// src/pages/ListaNomiPage.jsx
import React, { useEffect, useMemo, useState, useRef } from "react";
import { createPortal } from "react-dom";
import {
  Trash2, ChevronDown, ChevronUp, Save, X, RefreshCw, BookUser,
  Download, CheckCircle, Loader2, AlertTriangle, User, Phone,
  MapPin, Tag, BarChart3, Flag, FileText, Plus
} from "lucide-react";

import SwipeableActionWrapper from "../components/SwipeableActionWrapper";
import { SwipeableList, Type } from "react-swipeable-list";
import ContactPickerButton from "../components/ContactPickerButton";
import "./lista-nomi.css";

// ✅ Firebase
import { db } from "../firebase";
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
} from "firebase/firestore";

import { getAuth, onAuthStateChanged } from "firebase/auth";
import { useAuth } from "../auth/AuthProvider";
import CustomSelect from "../components/CustomSelect";

const STATI = ["Nuovo", "Contattato", "Appuntamento", "Non interessato"];
const PRIORITA = ["Bassa", "Media", "Alta"];
const FONTI = ["Rubrica", "Social", "Referral", "Altro"];

const pillTone = (s) => {
  const v = (s || "").toLowerCase();
  if (v.includes("nuov")) return "info";
  if (v.includes("contatt")) return "ok";
  if (v.includes("appunt")) return "warn";
  if (v.includes("non")) return "danger";
  return "neutral";
};

function safeTrim(v) { return (v || "").toString().trim(); }
function cleanTel(t) { return (t || "").toString().replace(/[^\d+]/g, ''); }

export default function ListaNomiPage() {
  const [isDark, setIsDark] = useState(() => document.body.classList.contains("theme-dark"));
  useEffect(() => {
    const obs = new MutationObserver(() => setIsDark(document.body.classList.contains("theme-dark")));
    obs.observe(document.body, { attributes: true, attributeFilter: ["class"] });
    return () => obs.disconnect();
  }, []);

  const auth = useAuth?.() || {};
  const user = auth.user || auth.currentUser || null;
  const [fbUid, setFbUid] = useState(null);
  useEffect(() => {
    const unsub = onAuthStateChanged(getAuth(), (u) => setFbUid(u?.uid || null));
    return () => unsub();
  }, []);
  const uid = user?.uid || fbUid || null;

  const [rows, setRows] = useState([]);
  const [openId, setOpenId] = useState(null);
  const [editDraft, setEditDraft] = useState(null);
  const [qTxt, setQTxt] = useState("");
  const [fStato, setFStato] = useState("Tutti");
  const [fPrio, setFPrio] = useState("Tutte");

  const [isAddOpen, setIsAddOpen] = useState(false);
  const [addDraft, setAddDraft] = useState({
    nome: "", telefono: "", citta: "", fonte: "Rubrica", stato: "Nuovo", priorita: "Media", note: "",
  });

  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);

  const listRef = useMemo(() => uid ? collection(db, "users", uid, "listaNomi") : null, [uid]);

  useEffect(() => {
    if (!listRef) { setLoading(false); return; }
    setLoading(true);
    const unsub = onSnapshot(query(listRef, orderBy("createdAt", "desc"), orderBy("__name__", "desc")), (snap) => {
      const out = []; snap.forEach(d => out.push({ id: d.id, ...d.data() }));
      setRows(out); setLoading(false);
    }, () => setLoading(false));
    return () => unsub();
  }, [listRef]);

  const filtered = useMemo(() => {
    const qq = qTxt.trim().toLowerCase();

    // Sort logic: use createdAt (fallback to ID for stability)
    const sorted = [...rows].sort((a, b) => {
      const ta = a.createdAt?.seconds || 0;
      const tb = b.createdAt?.seconds || 0;
      if (ta !== tb) return tb - ta; // Descending
      return b.id.localeCompare(a.id); // Stable secondary
    });

    return sorted.filter(r => {
      const name = String(Array.isArray(r.nome) ? r.nome[0] : (r.nome || ""));
      const note = String(r.note || "");
      const tel = String(r.telefono || "");

      const mQ = !qq ||
        name.toLowerCase().includes(qq) ||
        note.toLowerCase().includes(qq) ||
        tel.toLowerCase().includes(qq);

      const mS = fStato === "Tutti" || r.stato === fStato;
      const mP = fPrio === "Tutte" || r.priorita === fPrio;
      return mQ && mS && mP;
    });
  }, [rows, qTxt, fStato, fPrio]);

  const initials = (name) => {
    const parts = (Array.isArray(name) ? name[0] : (name || "")).trim().split(/\s+/).filter(Boolean);
    return ((parts[0]?.[0] || "U") + (parts[1]?.[0] || "")).toUpperCase();
  };

  const saveRow = async (id) => {
    if (!editDraft) return;
    try {
      setSyncing(true);
      await updateDoc(doc(db, "users", uid, "listaNomi", id), {
        ...editDraft,
        updatedAt: serverTimestamp(),
      });
      setOpenId(null);
      setEditDraft(null);
    } catch (e) {
      console.error(e);
    } finally {
      setSyncing(false);
    }
  };

  const removeRow = async (id) => {
    try {
      setSyncing(true);
      await deleteDoc(doc(db, "users", uid, "listaNomi", id));
      if (openId === id) setOpenId(null);
    } catch (e) { console.error(e); } finally { setSyncing(false); }
  };

  const addNew = async () => {
    if (!addDraft.nome) { alert("Nome richiesto"); return; }
    const phone = cleanTel(addDraft.telefono);
    const isDup = rows.some(r => cleanTel(r.telefono) === phone && phone !== "");
    if (isDup) {
      if (!window.confirm("Attenzione: esiste già un contatto con questo numero. Continuare?")) return;
    }
    try {
      setSyncing(true);
      await addDoc(listRef, { ...addDraft, telefono: phone, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
      setIsAddOpen(false);
      setAddDraft({ nome: "", telefono: "", citta: "", fonte: "Rubrica", stato: "Nuovo", priorita: "Media", note: "" });
    } catch (e) { console.error(e); } finally { setSyncing(false); }
  };

  const manualSync = () => { setSyncing(true); setTimeout(() => setSyncing(false), 300); };

  const [deleteUI, setDeleteUI] = useState({ visible: false, id: null, name: "" });
  const confirmDelete = (e, id, name) => { e.stopPropagation(); setDeleteUI({ visible: true, id, name }); };
  const performDelete = async () => { const id = deleteUI.id; setDeleteUI({ visible: false }); await removeRow(id); };

  const [importUI, setImportUI] = useState({ visible: false, step: 'idle', data: [] });

  // ✅ DEBUG LOGIC
  const [debugClicks, setDebugClicks] = useState(0);
  const [debugOpen, setDebugOpen] = useState(false);
  const handleDebugStep = () => {
    setDebugClicks(c => {
      if (c >= 4) { setDebugOpen(true); return 0; }
      return c + 1;
    });
  };
  const importContacts = async () => {
    try {
      if (!('contacts' in navigator)) {
        alert("Il tuo browser non supporta l'importazione contatti nativa. Assicurati di usare Chrome su Android o attiva il flag su Safari iOS.");
        return;
      }
      const c = await navigator.contacts.select(['name', 'tel'], { multiple: true });
      if (c?.length) setImportUI({ visible: true, step: 'confirm', data: c });
    } catch (e) {
      if (e.name !== 'AbortError') {
        alert("Errore durante l'importazione: " + e.message);
      }
      console.error("Import error:", e);
    }
  };

  const performImport = async () => {
    setImportUI(v => ({ ...v, step: 'saving' }));
    let saved = 0;
    const existingPhones = new Set(rows.map(r => cleanTel(r.telefono)).filter(p => p !== ""));

    for (const c of importUI.data) {
      const n = c.name?.[0] || "Senza Nome";
      const phoneNumbers = c.tel || [];

      for (const rawT of phoneNumbers) {
        const t = cleanTel(rawT);
        if (!t) continue;

        // Skip duplicates
        if (existingPhones.has(t)) continue;

        try {
          await addDoc(listRef, {
            nome: n,
            telefono: t,
            fonte: "Rubrica",
            stato: "Nuovo",
            priorita: "Media",
            createdAt: serverTimestamp()
          });
          saved++;
          existingPhones.add(t);
        } catch (e) { }
      }
    }
    setImportUI(v => ({ ...v, step: 'result', savedCount: saved }));
    manualSync();
  };

  return (
    <div className="page lista-nomi-page">
      <div className="crm-page-header">
        <div>
          <h1 className="crm-title" onClick={handleDebugStep} style={{ cursor: 'default', userSelect: 'none' }}>
            Lista Nomi
          </h1>
          <p className="crm-subtitle">Gestione contatti premium.</p>
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          <button className="btn btn-secondary" onClick={importContacts}><BookUser size={18} /></button>
          <button className={"btn btn-secondary" + (syncing ? " is-loading" : "")} onClick={manualSync}><RefreshCw size={18} /></button>
          <button className="btn btn-primary" onClick={() => setIsAddOpen(true)} style={{ gap: 8 }}><Plus size={20} /> <span className="desktop-only">Nuovo</span></button>
        </div>
      </div>

      <div className="card ln-main-card">
        <div className="ln-toolbar">
          <input className="ln-search-input" value={qTxt} onChange={e => setQTxt(e.target.value)} placeholder="Cerca..." />
          <div className="ln-filters">
            <CustomSelect value={fStato} options={["Tutti", ...STATI].map(o => ({ value: o, label: o }))} onChange={setFStato} />
            <CustomSelect value={fPrio} options={["Tutte", ...PRIORITA].map(o => ({ value: o, label: o }))} onChange={setFPrio} />
          </div>
        </div>

        <div className="ln-list">
          {loading ? <div className="ln-empty">Caricamento...</div> :
            filtered.length === 0 ? <div className="ln-empty">Nessun contatto.</div> : (
              <SwipeableList fullSwipe={false} type={Type.IOS}>
                {filtered.map(row => (
                  <SwipeableActionWrapper key={row.id} item={row}
                    onCall={i => i.telefono && (window.location.href = `tel:${i.telefono}`)}
                    onWhatsApp={i => i.telefono && window.open(`https://wa.me/${i.telefono.replace(/\D/g, '')}`)}
                  >
                    <div className={`ln-row ${pillTone(row.stato)} ${openId === row.id ? 'open' : ''}`}>
                      <div className="ln-row-head" onClick={() => {
                        if (openId === row.id) {
                          setOpenId(null);
                          setEditDraft(null);
                        } else {
                          setOpenId(row.id);
                          setEditDraft({ ...row });
                        }
                      }}>
                        <div style={{ display: 'flex', gap: 14, alignItems: 'center', flex: 1, minWidth: 0 }}>
                          <div className="ln-avatar">{initials(row.nome)}</div>
                          <div style={{ minWidth: 0, overflow: 'hidden' }}>
                            <div className="ln-name" style={{ whiteSpace: 'nowrap', textOverflow: 'ellipsis', overflow: 'hidden' }}>{Array.isArray(row.nome) ? row.nome[0] : row.nome}</div>
                            <div className="ln-sub-note">{row.telefono || "Nessun numero"}</div>
                          </div>
                        </div>
                        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                          <button className="btn btn-danger-ghost ln-icon-btn" onClick={e => confirmDelete(e, row.id, row.nome)}><Trash2 size={16} /></button>
                          <span className="ln-expand-ico">{openId === row.id ? <ChevronUp size={18} /> : <ChevronDown size={18} />}</span>
                        </div>
                      </div>

                      {openId === row.id && editDraft && (
                        <div className="ln-row-body" onClick={e => e.stopPropagation()}>
                          <div className="ln-edit-grid">
                            <div className="form-field">
                              <label className="label"><User size={14} /> Nome</label>
                              <input className="input" value={editDraft.nome || ""} onChange={e => setEditDraft({ ...editDraft, nome: e.target.value })} />
                            </div>
                            <div className="form-field">
                              <label className="label"><Phone size={14} /> Telefono</label>
                              <input className="input" value={editDraft.telefono || ""} onChange={e => setEditDraft({ ...editDraft, telefono: e.target.value })} />
                            </div>
                            <div className="form-field">
                              <label className="label"><MapPin size={14} /> Città</label>
                              <input className="input" value={editDraft.citta || ""} onChange={e => setEditDraft({ ...editDraft, citta: e.target.value })} />
                            </div>
                            <div className="form-field">
                              <label className="label"><Tag size={14} /> Fonte</label>
                              <CustomSelect value={editDraft.fonte} options={FONTI.map(o => ({ value: o, label: o }))} onChange={v => setEditDraft({ ...editDraft, fonte: v })} />
                            </div>
                            <div className="form-field">
                              <label className="label"><BarChart3 size={14} /> Stato</label>
                              <CustomSelect value={editDraft.stato} options={STATI.map(o => ({ value: o, label: o }))} onChange={v => setEditDraft({ ...editDraft, stato: v })} />
                            </div>
                            <div className="form-field">
                              <label className="label"><Flag size={14} /> Priorità</label>
                              <CustomSelect value={editDraft.priorita} options={PRIORITA.map(o => ({ value: o, label: o }))} onChange={v => setEditDraft({ ...editDraft, priorita: v })} />
                            </div>
                            <div className="form-field full-row">
                              <label className="label"><FileText size={14} /> Note</label>
                              <textarea className="textarea" rows={2} value={editDraft.note || ""} onChange={e => setEditDraft({ ...editDraft, note: e.target.value })} />
                            </div>
                          </div>
                          <div className="ln-edit-actions">
                            <button className="btn btn-ghost" onClick={() => { setOpenId(null); setEditDraft(null); }}><X size={18} /> Annulla</button>
                            <button className="btn btn-primary" onClick={() => saveRow(row.id)}><Save size={18} /> Salva</button>
                          </div>
                        </div>
                      )}
                    </div>
                  </SwipeableActionWrapper>
                ))}
              </SwipeableList>
            )}
        </div>
      </div>

      {/* --- PREMIUM MODAL ADD --- */}
      {isAddOpen && createPortal(
        <div className="modal-backdrop ln-modal-backdrop" onMouseDown={e => e.target === e.currentTarget && setIsAddOpen(false)}>
          <div className="modal ln-modal" style={{ background: isDark ? '#1e293b' : '#fff' }} onMouseDown={e => e.stopPropagation()}>
            <div className="modal-header ln-modal-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div className="ln-icon-box"><User size={20} /></div>
                <h3 className="modal-title">Nuovo Contatto</h3>
              </div>
              <button className="modal-close" onClick={() => setIsAddOpen(false)}><X size={20} /></button>
            </div>

            <div className="modal-body ln-modal-body">
              <div className="ln-edit-grid">
                <div className="form-field">
                  <label className="label"><User size={14} /> Nome *</label>
                  <input className="input" value={addDraft.nome} onChange={e => setAddDraft({ ...addDraft, nome: e.target.value })} placeholder="Es. Mario Rossi" />
                </div>
                <div className="form-field">
                  <label className="label"><Phone size={14} /> Telefono</label>
                  <div className="phone-wrapper">
                    <input className="input" value={addDraft.telefono} onChange={e => setAddDraft({ ...addDraft, telefono: e.target.value })} placeholder="+39 ..." />
                    <ContactPickerButton className="abs-picker" onContactSelected={(c) => setAddDraft(p => ({ ...p, nome: c.name || p.nome, telefono: c.tel || p.telefono }))} />
                  </div>
                </div>
                <div className="form-field">
                  <label className="label"><MapPin size={14} /> Città</label>
                  <input className="input" value={addDraft.citta} onChange={e => setAddDraft({ ...addDraft, citta: e.target.value })} placeholder="Roma" />
                </div>
                <div className="form-field">
                  <label className="label"><Tag size={14} /> Fonte</label>
                  <CustomSelect value={addDraft.fonte} options={FONTI.map(o => ({ value: o, label: o }))} onChange={v => setAddDraft({ ...addDraft, fonte: v })} />
                </div>
                <div className="form-field">
                  <label className="label"><BarChart3 size={14} /> Stato</label>
                  <CustomSelect value={addDraft.stato} options={STATI.map(o => ({ value: o, label: o }))} onChange={v => setAddDraft({ ...addDraft, stato: v })} />
                </div>
                <div className="form-field">
                  <label className="label"><Flag size={14} /> Priorità</label>
                  <CustomSelect value={addDraft.priorita} options={PRIORITA.map(o => ({ value: o, label: o }))} onChange={v => setAddDraft({ ...addDraft, priorita: v })} />
                </div>
                <div className="form-field full-row">
                  <label className="label"><FileText size={14} /> Note</label>
                  <textarea className="textarea" rows={3} value={addDraft.note} onChange={e => setAddDraft({ ...addDraft, note: e.target.value })} placeholder="Dettagli..." />
                </div>
              </div>
            </div>

            <div className="modal-footer ln-modal-footer">
              <button className="btn btn-ghost" onClick={() => setIsAddOpen(false)}>Annulla</button>
              <button className="btn btn-primary" onClick={addNew}>Crea Contatto</button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* --- IMPORT MODAL --- */}
      {importUI.visible && createPortal(
        <div className="modal-backdrop ln-modal-backdrop">
          <div className="modal ln-modal-small" style={{ background: isDark ? '#1e293b' : '#fff' }}>
            {importUI.step === 'confirm' ? (
              <>
                <div style={{ color: '#eab308', marginBottom: 15 }}><BookUser size={30} /></div>
                <h3 style={{ marginBottom: 10 }}>Importazione</h3>
                <p>Vuoi importare {importUI.data.length} contatti?</p>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 25 }}>
                  <button className="btn btn-ghost" onClick={() => setImportUI({ visible: false })}>No</button>
                  <button className="btn btn-primary" onClick={performImport}>Sì</button>
                </div>
              </>
            ) : importUI.step === 'saving' ? (
              <div><Loader2 className="spin" size={30} /><p>In corso...</p></div>
            ) : (
              <>
                <div style={{ color: '#22c55e', marginBottom: 15 }}><CheckCircle size={30} /></div>
                <p>Salvati {importUI.savedCount} contatti.</p>
                <button className="btn btn-primary" style={{ width: '100%', marginTop: 20 }} onClick={() => setImportUI({ visible: false })}>OK</button>
              </>
            )}
          </div>
        </div>,
        document.body
      )}

      {/* --- DELETE MODAL --- */}
      {deleteUI.visible && createPortal(
        <div className="modal-backdrop ln-modal-backdrop">
          <div className="modal ln-modal-small" style={{ background: isDark ? '#1e293b' : '#fff', border: '1px solid rgba(220,38,38,0.2)' }}>
            <div style={{ color: '#ef4444', marginBottom: 15 }}><AlertTriangle size={30} /></div>
            <h3>Sei sicuro?</h3>
            <p>Vuoi eliminare <strong>{deleteUI.name}</strong>?</p>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 25 }}>
              <button className="btn btn-ghost" onClick={() => setDeleteUI({ visible: false })}>No</button>
              <button className="btn btn-danger" onClick={performDelete}>Elimina</button>
            </div>
          </div>
        </div>,
        document.body
      )}
      {/* --- DEBUG MODAL --- */}
      {debugOpen && createPortal(
        <div className="modal-backdrop ln-modal-backdrop" onClick={() => setDebugOpen(false)}>
          <div className="modal ln-modal-small" style={{ background: '#0f172a', color: '#f8fafc', border: '1px solid #334155' }} onClick={e => e.stopPropagation()}>
            <h3 style={{ marginBottom: 15, color: '#38bdf8' }}>Diagnostic Info</h3>
            <div style={{ fontSize: '11px', textAlign: 'left', wordBreak: 'break-all', fontFamily: 'monospace' }}>
              <p><strong>UA:</strong> {navigator.userAgent}</p>
              <p><strong>Secure:</strong> {window.isSecureContext ? "YES" : "NO"}</p>
              <p><strong>Proto:</strong> {window.location.protocol}</p>
              <p><strong>Contacts API:</strong> {('contacts' in navigator) ? "SUPPORTED" : "MISSING"}</p>
              <p><strong>Standalone:</strong> {window.matchMedia('(display-mode: standalone)').matches ? "YES" : "NO"}</p>
            </div>
            <button className="btn btn-primary" style={{ marginTop: 20, width: '100%' }} onClick={() => setDebugOpen(false)}>Chiudi</button>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
