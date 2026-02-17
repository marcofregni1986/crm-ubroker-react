// src/pages/ListaNomiPage.jsx
import React, { useEffect, useMemo, useState, useRef } from "react";
import {
  Trash2, ChevronDown, ChevronUp, Save, X, RefreshCw, BookUser,
  Download, CheckCircle, Loader2, AlertTriangle, User, Phone,
  MapPin, Tag, BarChart3, Flag, FileText, Plus
} from "lucide-react";

import SwipeableActionWrapper from "../components/SwipeableActionWrapper";
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
    const unsub = onSnapshot(query(listRef, orderBy("createdAt", "desc")), (snap) => {
      const out = []; snap.forEach(d => out.push({ id: d.id, ...d.data() }));
      setRows(out); setLoading(false);
    }, () => setLoading(false));
    return () => unsub();
  }, [listRef]);

  const filtered = useMemo(() => {
    const qq = qTxt.trim().toLowerCase();
    return rows.filter(r => {
      const mQ = !qq || (r.nome || "").toLowerCase().includes(qq) || (r.note || "").toLowerCase().includes(qq);
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
    try {
      setSyncing(true);
      await addDoc(listRef, { ...addDraft, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
      setIsAddOpen(false);
      setAddDraft({ nome: "", telefono: "", citta: "", fonte: "Rubrica", stato: "Nuovo", priorita: "Media", note: "" });
    } catch (e) { console.error(e); } finally { setSyncing(false); }
  };

  const manualSync = () => { setSyncing(true); setTimeout(() => setSyncing(false), 300); };

  const [deleteUI, setDeleteUI] = useState({ visible: false, id: null, name: "" });
  const confirmDelete = (e, id, name) => { e.stopPropagation(); setDeleteUI({ visible: true, id, name }); };
  const performDelete = async () => { const id = deleteUI.id; setDeleteUI({ visible: false }); await removeRow(id); };

  const [importUI, setImportUI] = useState({ visible: false, step: 'idle', data: [] });
  const importContacts = async () => {
    try {
      const c = await navigator.contacts.select(['name', 'tel'], { multiple: true });
      if (c?.length) setImportUI({ visible: true, step: 'confirm', data: c });
    } catch (e) { console.error(e); }
  };

  const performImport = async () => {
    setImportUI(v => ({ ...v, step: 'saving' }));
    let saved = 0;
    for (const c of importUI.data) {
      const n = c.name?.[0] || "Senza Nome"; const t = c.tel?.[0] || "";
      try { await addDoc(listRef, { nome: n, telefono: t, fonte: "Rubrica", stato: "Nuovo", priorita: "Media", createdAt: serverTimestamp() }); saved++; } catch (e) { }
    }
    setImportUI(v => ({ ...v, step: 'result', savedCount: saved }));
    manualSync();
  };

  return (
    <div className="page lista-nomi-page">
      <div className="crm-page-header">
        <div>
          <h1 className="crm-title">Lista Nomi <span style={{ fontSize: '0.45em', background: '#ec4899', color: '#fff', padding: '2px 8px', borderRadius: 4, marginLeft: 8 }}>v.LIGHT-DETAIL-PRO</span></h1>
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
            filtered.length === 0 ? <div className="ln-empty">Nessun contatto.</div> :
              filtered.map(row => (
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
                          <button className="btn btn-ghost" onClick={() => { setOpenId(null); setEditDraft(null); }}>Chiudi</button>
                          <button className="btn btn-primary" onClick={() => saveRow(row.id)}>Salva</button>
                        </div>
                      </div>
                    )}
                  </div>
                </SwipeableActionWrapper>
              ))}
        </div>
      </div>

      {/* --- PREMIUM MODAL ADD --- */}
      {isAddOpen && (
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
        </div>
      )}

      {/* --- IMPORT MODAL --- */}
      {importUI.visible && (
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
        </div>
      )}

      {/* --- DELETE MODAL --- */}
      {deleteUI.visible && (
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
        </div>
      )}
    </div>
  );
}
