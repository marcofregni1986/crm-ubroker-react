// src/pages/DatabasePage.jsx
import React, { useEffect, useMemo, useState } from "react";
import "./database.css";
import "./database_premium.css"; // ✅ Dedicated Premium Styles
import { useAuth } from "../auth/AuthProvider";

import {
  collection,
  doc,
  getDocs,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  where,
} from "firebase/firestore";
import { db } from "../firebase";
import SwipeableActionWrapper from "../components/SwipeableActionWrapper";
import ContactPickerButton from "../components/ContactPickerButton"; // [NEW]

function buildCustomerKey({ nome, cognome, telefono, email }) {
  const n = (nome || "").trim();
  const c = (cognome || "").trim();
  const t = (telefono || "").replace(/\s/g, "");
  const e = (email || "").trim().toLowerCase();
  if (t) return t;
  if (e) return e;
  return `${n}_${c}`.toLowerCase();
}

function safeDocIdFromKey(key) {
  const k = String(key || "").trim().toLowerCase();
  return k.replace(/[^a-z0-9_-]/g, "_").slice(0, 180) || "unknown";
}

function initialsOf(nome = "", cognome = "") {
  const a = (nome.trim().charAt(0) || "").toUpperCase();
  const b = (cognome.trim().charAt(0) || "").toUpperCase();
  return (a + b).trim() || "U";
}

function normalizePhoneForLinks(phoneRaw = "") {
  let clean = (phoneRaw || "").replace(/[^0-9]/g, "");
  if (!clean) return "";
  if (!clean.startsWith("39") && clean.length === 10) clean = "39" + clean;
  return clean;
}

function statusMeta(stato = "programmato") {
  const s = (stato || "").toLowerCase();
  if (s === "esito positivo") return { cls: "ok", label: "Positivo" };
  if (s === "esito negativo") return { cls: "blocked", label: "Negativo" };
  if (s === "annullato") return { cls: "blocked", label: "Annullato" };
  return { cls: "pending", label: "Programmato" };
}

function toDateMaybe(v) {
  if (!v) return null;
  if (typeof v === "object" && typeof v.toDate === "function") return v.toDate();
  if (v instanceof Date) return v;
  const d = new Date(v);
  return isNaN(d.getTime()) ? null : d;
}

function pickAppointmentDate(a) {
  return (
    toDateMaybe(a?.updatedAt) ||
    toDateMaybe(a?.createdAt) ||
    toDateMaybe(a?.data) ||
    toDateMaybe(a?.startAt) ||
    toDateMaybe(a?.start) ||
    toDateMaybe(a?.when) ||
    null
  );
}

function buildCustomersFromAppointments(items, overridesById) {
  const map = new Map();

  items.forEach((a) => {
    const base = {
      nome: (a.nome || "").trim(),
      cognome: (a.cognome || "").trim(),
      telefono: (a.telefono || "").trim(),
      email: (a.email || "").trim().toLowerCase(),
      indirizzo: (a.indirizzo || "").trim(),
    };

    const key = buildCustomerKey(base);
    const customerId = safeDocIdFromKey(key);

    if (!map.has(customerId)) {
      const ov = overridesById.get(customerId) || null;

      map.set(customerId, {
        id: customerId,
        nome: ov?.nome ?? base.nome,
        cognome: ov?.cognome ?? base.cognome,
        telefono: ov?.telefono ?? base.telefono,
        email: ov?.email ?? base.email,
        indirizzo: ov?.indirizzo ?? base.indirizzo,
        appuntamenti: [],
      });
    }

    const cust = map.get(customerId);
    cust.appuntamenti.push({
      id: a.id,
      data: pickAppointmentDate(a),
      tipo: a.tipo || "",
      stato: a.stato || "programmato",
    });
  });

  const list = Array.from(map.values());

  list.sort((a, b) => {
    const A = `${a.nome} ${a.cognome}`.trim().toLowerCase();
    const B = `${b.nome} ${b.cognome}`.trim().toLowerCase();
    return A.localeCompare(B, "it");
  });

  list.forEach((c) => {
    c.appuntamenti.sort(
      (x, y) => (y.data?.getTime?.() || 0) - (x.data?.getTime?.() || 0)
    );
  });

  return list;
}

export default function DatabasePage() {
  const { uid, loading } = useAuth();

  const [customers, setCustomers] = useState([]);
  const [search, setSearch] = useState("");

  const [isOpen, setIsOpen] = useState(false);
  const [currentId, setCurrentId] = useState(null);

  const [isEditing, setIsEditing] = useState(false);
  const [editNome, setEditNome] = useState("");
  const [editCognome, setEditCognome] = useState("");
  const [editTelefono, setEditTelefono] = useState("");
  const [editEmail, setEditEmail] = useState("");
  const [editIndirizzo, setEditIndirizzo] = useState("");

  const [overridesById, setOverridesById] = useState(() => new Map());
  const [appointments, setAppointments] = useState([]);

  const currentCustomer = useMemo(
    () => customers.find((c) => c.id === currentId) || null,
    [customers, currentId]
  );

  useEffect(() => {
    let unsub = null;
    let cancelled = false;

    async function run() {
      if (loading) return;

      if (!uid) {
        setCustomers([]);
        setAppointments([]);
        setOverridesById(new Map());
        return;
      }

      // overrides
      try {
        const snap = await getDocs(collection(db, "users", uid, "customers"));
        if (cancelled) return;
        const m = new Map();
        snap.forEach((d) => {
          const data = d.data() || {};
          m.set(d.id, {
            id: d.id,
            nome: (data.nome || "").trim(),
            cognome: (data.cognome || "").trim(),
            telefono: (data.telefono || "").trim(),
            email: (data.email || "").trim().toLowerCase(),
            indirizzo: (data.indirizzo || "").trim(),
          });
        });
        setOverridesById(m);
      } catch (e) {
        console.error("[Database] get customers overrides error:", e);
        setOverridesById(new Map());
      }

      // appointments (NO orderBy -> NO index)
      try {
        const q = query(collection(db, "appointments"), where("uid", "==", uid));

        unsub = onSnapshot(
          q,
          (qs) => {
            const list = [];
            qs.forEach((d) => list.push({ id: d.id, ...(d.data() || {}) }));

            // ordina in locale (updatedAt/createdAt/date)
            list.sort((a, b) => {
              const da = pickAppointmentDate(a)?.getTime?.() || 0;
              const dbb = pickAppointmentDate(b)?.getTime?.() || 0;
              return dbb - da;
            });

            setAppointments(list);
          },
          (err) => {
            console.error("[Database] onSnapshot appointments error:", err);
            setAppointments([]);
          }
        );
      } catch (e) {
        console.error("[Database] subscribe appointments error:", e);
        setAppointments([]);
      }
    }

    run();

    return () => {
      cancelled = true;
      if (typeof unsub === "function") unsub();
    };
  }, [uid, loading]);

  useEffect(() => {
    if (!uid) {
      setCustomers([]);
      return;
    }
    setCustomers(buildCustomersFromAppointments(appointments, overridesById));
  }, [uid, appointments, overridesById]);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return customers;
    return customers.filter((c) => {
      const full = `${c.nome} ${c.cognome}`.trim().toLowerCase();
      const tel = (c.telefono || "").toLowerCase();
      const mail = (c.email || "").toLowerCase();
      return full.includes(term) || tel.includes(term) || mail.includes(term);
    });
  }, [customers, search]);

  const grouped = useMemo(() => {
    const groups = [];
    let currentLetter = "";
    let bucket = null;

    for (const c of filtered) {
      const full = `${c.nome} ${c.cognome}`.trim();
      const first = (full.charAt(0) || "#").toUpperCase();
      const letter = /[A-Z]/.test(first) ? first : "#";

      if (letter !== currentLetter) {
        currentLetter = letter;
        bucket = { letter, items: [] };
        groups.push(bucket);
      }
      bucket.items.push(c);
    }
    return groups;
  }, [filtered]);

  function openModal(id) {
    const c = customers.find((x) => x.id === id);
    if (!c) return;

    setCurrentId(id);
    setEditNome(c.nome || "");
    setEditCognome(c.cognome || "");
    setEditTelefono(c.telefono || "");
    setEditEmail(c.email || "");
    setEditIndirizzo(c.indirizzo || "");
    setIsEditing(false);
    setIsOpen(true);
  }

  function closeModal() {
    setIsOpen(false);
    setCurrentId(null);
    setIsEditing(false);
  }

  async function saveCustomerFirestore() {
    if (!uid) return;
    if (!currentCustomer?.id) return;

    const nuovoNome = editNome.trim();
    const nuovoCognome = editCognome.trim();
    const nuovoTelefono = editTelefono.trim();
    const nuovaEmail = editEmail.trim().toLowerCase();
    const nuovoIndirizzo = editIndirizzo.trim();

    if (!nuovoNome || !nuovoCognome) {
      alert("Nome e Cognome sono obbligatori.");
      return;
    }

    try {
      await setDoc(
        doc(db, "users", uid, "customers", currentCustomer.id),
        {
          nome: nuovoNome,
          cognome: nuovoCognome,
          telefono: nuovoTelefono,
          email: nuovaEmail,
          indirizzo: nuovoIndirizzo,
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );

      setOverridesById((prev) => {
        const next = new Map(prev);
        next.set(currentCustomer.id, {
          id: currentCustomer.id,
          nome: nuovoNome,
          cognome: nuovoCognome,
          telefono: nuovoTelefono,
          email: nuovaEmail,
          indirizzo: nuovoIndirizzo,
        });
        return next;
      });

      setIsEditing(false);
    } catch (e) {
      console.error("[Database] save customer error:", e);
      alert("Errore salvataggio contatto. Controlla la console.");
    }
  }

  const fullName = `${editNome} ${editCognome}`.trim() || "Cliente";

  const actionPhone = normalizePhoneForLinks(editTelefono || "");
  const hasPhone = !!actionPhone;
  const hasEmail = !!(editEmail || "").trim();
  const hasAddress = !!(editIndirizzo || "").trim();
  const encodedAddr = hasAddress ? encodeURIComponent(editIndirizzo) : "";

  const history = useMemo(() => currentCustomer?.appuntamenti || [], [currentCustomer]);

  return (
    <div className="page db-page">
      <div className="db-header crm-page-header">
        <div>
          <h1 className="crm-title">Database</h1>
          <p className="crm-subtitle">
            Rubrica clienti generata dagli appuntamenti (Firebase).
          </p>
        </div>

        <div className="db-search">
          <span className="db-search-icon">⌕</span>
          <input
            className="db-input"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Cerca nome, telefono, email..."
          />
        </div>
      </div>

      <div className="db-list">
        {!uid && !loading ? (
          <div className="db-empty">Devi essere loggato per vedere il Database.</div>
        ) : loading ? (
          <div className="db-empty">Caricamento…</div>
        ) : filtered.length === 0 ? (
          <div className="db-empty">Nessun contatto trovato.</div>
        ) : (
          grouped.map((g) => (
            <div key={g.letter} className="db-group">
              <div className="db-letter">{g.letter}</div>

              {g.items.map((c) => {
                const full = `${c.nome} ${c.cognome}`.trim();
                const sub = c.telefono || c.email || c.indirizzo || "Nessun dettaglio";

                return (
                  <SwipeableActionWrapper
                    key={c.id}
                    item={c}
                    onCall={(item) => item.telefono ? window.location.href = `tel:${item.telefono}` : alert("Nessun telefono")}
                    onWhatsApp={(item) => item.telefono ? window.open(`https://wa.me/${item.telefono.replace(/\D/g, '')}`, '_blank') : alert("Nessun telefono")}
                  >
                    <button
                      type="button"
                      className="database-card-modern"
                      // onClick is handled by the button, but swipe wraps it.
                      // Note: SwipeableListItem typically handles events. Ensure clicking still works.
                      onClick={() => openModal(c.id)}
                      style={{ width: "100%", textAlign: "left" }} // Ensure full width
                    >
                      <div className="db-avatar">{initialsOf(c.nome, c.cognome)}</div>

                      <div className="db-info">
                        <div className="db-name">{full}</div>
                        <div className="db-details">{sub}</div>
                      </div>

                      <div className="db-chevron">›</div>
                    </button>
                  </SwipeableActionWrapper>
                );
              })}
            </div>
          ))
        )}
      </div>

      {isOpen && currentCustomer && (
        <div
          className="db-modal-overlay"
          onMouseDown={(e) => e.target === e.currentTarget && closeModal()}
        >
          <div className="db-modal" role="dialog" aria-modal="true">
            <button className="db-modal-close" type="button" onClick={closeModal}>
              ×
            </button>

            <div className="db-modal-body">
              <div className="dbm-head">
                <div className="dbm-avatar">
                  {initialsOf(currentCustomer.nome, currentCustomer.cognome)}
                </div>

                <div className="dbm-name">{fullName}</div>
                <div className="dbm-role">Cliente</div>

                <div className="dbm-controls">
                  {!isEditing ? (
                    <button
                      type="button"
                      className="dbm-btn dbm-btn-primary"
                      onClick={() => setIsEditing(true)}
                    >
                      Modifica
                    </button>
                  ) : (
                    <>
                      <button type="button" className="dbm-btn" onClick={() => setIsEditing(false)}>
                        Annulla
                      </button>
                      <button
                        type="button"
                        className="dbm-btn dbm-btn-primary"
                        onClick={saveCustomerFirestore}
                      >
                        Salva
                      </button>
                    </>
                  )}
                </div>
              </div>

              <div className="db-actions">
                <a
                  className={`db-action ${hasPhone ? "" : "is-disabled"}`}
                  href={hasPhone ? `tel:+${actionPhone}` : undefined}
                  onClick={(e) => !hasPhone && e.preventDefault()}
                >
                  <div className="db-action-btn">📞</div>
                  <div className="db-action-label">Chiama</div>
                </a>

                <a
                  className={`db-action ${hasPhone ? "" : "is-disabled"}`}
                  href={hasPhone ? `https://wa.me/${actionPhone}` : undefined}
                  target={hasPhone ? "_blank" : undefined}
                  rel={hasPhone ? "noreferrer" : undefined}
                  onClick={(e) => !hasPhone && e.preventDefault()}
                >
                  <div className="db-action-btn">💬</div>
                  <div className="db-action-label">WhatsApp</div>
                </a>

                <a
                  className={`db-action ${hasEmail ? "" : "is-disabled"}`}
                  href={hasEmail ? `mailto:${editEmail}` : undefined}
                  onClick={(e) => !hasEmail && e.preventDefault()}
                >
                  <div className="db-action-btn">✉️</div>
                  <div className="db-action-label">Email</div>
                </a>

                <a
                  className={`db-action ${hasAddress ? "" : "is-disabled"}`}
                  href={
                    hasAddress
                      ? `https://www.google.com/maps/search/?api=1&query=${encodedAddr}`
                      : undefined
                  }
                  target={hasAddress ? "_blank" : undefined}
                  rel={hasAddress ? "noreferrer" : undefined}
                  onClick={(e) => !hasAddress && e.preventDefault()}
                >
                  <div className="db-action-btn">📍</div>
                  <div className="db-action-label">Mappa</div>
                </a>
              </div>

              <div className="db-section-title">Dettagli contatto</div>

              <div className="dbm-form">
                <div className="dbm-grid">
                  <div className="dbm-field">
                    <div className="db-label">Nome</div>
                    <input
                      className="db-field"
                      value={editNome}
                      onChange={(e) => setEditNome(e.target.value)}
                      placeholder="Nome"
                      disabled={!isEditing}
                    />
                  </div>

                  <div className="dbm-field">
                    <div className="db-label">Cognome</div>
                    <input
                      className="db-field"
                      value={editCognome}
                      onChange={(e) => setEditCognome(e.target.value)}
                      placeholder="Cognome"
                      disabled={!isEditing}
                    />
                  </div>

                  <div className="dbm-field">
                    <div className="db-label">Telefono</div>
                    <div style={{ position: "relative" }}>
                      <input
                        className="db-field"
                        value={editTelefono}
                        onChange={(e) => setEditTelefono(e.target.value)}
                        placeholder="Telefono"
                        disabled={!isEditing}
                        style={{ paddingRight: 40 }}
                      />
                      {isEditing && (
                        <ContactPickerButton
                          className="absolute-picker-db"
                          iconSize={18}
                          onContactSelected={(c) => {
                            // Only if editing is active
                            if (!isEditing) return;
                            setEditTelefono(c.tel || "");
                            // If name/surname are empty, try fill
                            const parts = (c.name || "").trim().split(" ");
                            if ((!editNome) && parts.length > 0) setEditNome(parts[0]);
                            if ((!editCognome) && parts.length > 1) setEditCognome(parts.slice(1).join(" "));
                          }}
                        />
                      )}

                      <style>{`
                        .absolute-picker-db {
                          position: absolute;
                          right: 12px;
                          top: 50%;
                          transform: translateY(-50%);
                          color: #94a3b8 !important;
                        }
                      `}</style>
                    </div>
                  </div>

                  <div className="dbm-field">
                    <div className="db-label">Email</div>
                    <input
                      className="db-field"
                      value={editEmail}
                      onChange={(e) => setEditEmail(e.target.value)}
                      placeholder="Email"
                      disabled={!isEditing}
                    />
                  </div>
                </div>

                <div className="dbm-field" style={{ marginTop: 12 }}>
                  <div className="db-label">Indirizzo</div>
                  <input
                    className="db-field"
                    value={editIndirizzo}
                    onChange={(e) => setEditIndirizzo(e.target.value)}
                    placeholder="Indirizzo"
                    disabled={!isEditing}
                  />
                </div>
              </div>

              {/* History section removed as per user request */}

              <button
                type="button"
                className="db-save"
                onClick={saveCustomerFirestore}
                disabled={!isEditing}
                title={!isEditing ? "Premi Modifica per cambiare i dati" : "Salva"}
              >
                Salva Modifiche
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
