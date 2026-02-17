// src/pages/RegisterPage.jsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import ContactPickerButton from "../components/ContactPickerButton"; // [NEW]
import "./registerpage.css";

// ✅ Firebase
import { auth, db } from "../firebase";
import { createUserWithEmailAndPassword } from "firebase/auth";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  query,
  setDoc,
  serverTimestamp,
  where,
} from "firebase/firestore";

/**
 * REGISTER — Firebase Auth + Firestore (telefono + mail)
 *
 * Fix PC "numero che riappare":
 * - Disattivo autocomplete sui campi telefono (Chrome tende a reinserire valori mentre cancelli)
 * - Lookup driver debounce 200ms rimane, ma NON tocca mai il valore dell'input
 */

function normPhone(s) {
  return String(s || "").replace(/\s+/g, "").trim();
}
function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email || "").trim());
}

export default function RegisterPage() {
  const nav = useNavigate();

  const [nome, setNome] = useState("");
  const [cognome, setCognome] = useState("");
  const [telefono, setTelefono] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [driverPhone, setDriverPhone] = useState("");
  const [driverUid, setDriverUid] = useState("");
  const [driverLabel, setDriverLabel] = useState("");
  const [driverStatus, setDriverStatus] = useState("idle"); // idle | searching | found | notfound | error

  const [isFirstUser, setIsFirstUser] = useState(false);

  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const passwordTooShort = password.length > 0 && password.length < 6;

  const debounceRef = useRef(null);
  const lastQueryRef = useRef("");

  function showError(msg) {
    setError(String(msg || "Errore"));
  }
  function hideError() {
    setError("");
  }

  useEffect(() => {
    let alive = true;

    async function checkFirstUser() {
      try {
        const qAny = query(collection(db, "users"), limit(1));
        const anySnap = await getDocs(qAny);
        if (!alive) return;
        setIsFirstUser(anySnap.empty);
      } catch (e) {
        console.warn("Impossibile verificare primo utente:", e);
        if (!alive) return;
        setIsFirstUser(false);
      }
    }

    checkFirstUser();
    return () => {
      alive = false;
    };
  }, []);

  async function findDriverByPhone(raw) {
    const p = normPhone(raw);

    if (!p || p.length < 6) {
      setDriverStatus("idle");
      setDriverUid("");
      setDriverLabel("");
      lastQueryRef.current = "";
      return;
    }

    if (lastQueryRef.current === p) return;
    lastQueryRef.current = p;

    setDriverStatus("searching");
    setDriverUid("");
    setDriverLabel("");

    try {
      const qy = query(collection(db, "users"), where("telefono", "==", p), limit(1));
      const snap = await getDocs(qy);

      if (snap.empty) {
        setDriverStatus("notfound");
        return;
      }

      const d = snap.docs[0];
      const data = d.data() || {};
      const label =
        `${data.nome || ""} ${data.cognome || ""}`.trim() ||
        data.email ||
        "Driver trovato";

      setDriverStatus("found");
      setDriverUid(d.id);
      setDriverLabel(label);
    } catch (e) {
      console.error(e);
      setDriverStatus("error");
      setDriverUid("");
      setDriverLabel("");
    }
  }

  useEffect(() => {
    if (isFirstUser) return;

    const p = normPhone(driverPhone);

    if (!p) {
      setDriverStatus("idle");
      setDriverUid("");
      setDriverLabel("");
      lastQueryRef.current = "";
      return;
    }

    if (debounceRef.current) clearTimeout(debounceRef.current);

    debounceRef.current = setTimeout(() => {
      findDriverByPhone(driverPhone);
    }, 200);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [driverPhone, isFirstUser]);

  const canSubmit = useMemo(() => {
    if (loading) return false;

    const okBase =
      nome.trim().length >= 2 &&
      cognome.trim().length >= 2 &&
      normPhone(telefono).length >= 6 &&
      isValidEmail(email) &&
      String(password || "").length >= 6;

    if (!okBase) return false;

    if (!isFirstUser) {
      if (!driverUid) return false;
      if (driverStatus !== "found") return false;
    }

    return true;
  }, [nome, cognome, telefono, email, password, loading, isFirstUser, driverUid, driverStatus]);

  async function handleSubmit(e) {
    e.preventDefault();
    hideError();

    const n = nome.trim();
    const c = cognome.trim();
    const t = normPhone(telefono);
    const em = email.trim().toLowerCase();
    const pw = String(password || "");

    if (!n || !c || !t || !em || !pw) return showError("Compila tutti i campi obbligatori (*).");
    if (!isValidEmail(em)) return showError("Email non valida.");
    if (pw.length < 6) return showError("La password deve contenere almeno 6 caratteri.");

    if (!isFirstUser) {
      if (!driverPhone.trim()) return showError("Inserisci il numero di telefono del driver.");
      if (driverStatus !== "found" || !driverUid) return showError("Driver non valido. Controlla il numero.");
    }

    setLoading(true);

    try {
      const cred = await createUserWithEmailAndPassword(auth, em, pw);
      const uid = cred.user.uid;

      const role = isFirstUser ? "driver" : "collaborator";

      // Fetch driver data to build driverChain correctly
      let newDriverChain = [];
      if (!isFirstUser && driverUid) {
        const driverRef = doc(db, "users", driverUid);
        const driverSnap = await getDoc(driverRef);
        if (driverSnap.exists()) {
          const dData = driverSnap.data();
          const parentChain = Array.isArray(dData.driverChain) ? dData.driverChain : [];
          newDriverChain = [...parentChain, driverUid];
        }
      }

      await setDoc(
        doc(db, "users", uid),
        {
          uid,
          nome: n,
          cognome: c,
          telefono: t,
          email: em,
          driverUid: isFirstUser ? null : driverUid,
          driverPhone: isFirstUser ? null : normPhone(driverPhone),
          driverChain: newDriverChain, // ✅ CHAIN FOR HIERARCHY
          role,
          permissions: {
            isAdmin: false,
            isDriver: isFirstUser,
            canSeeStepOne: false,
            canAccessAppointmentsPage: true,
            canAccessStructurePage: false,
            canSeeKpiPage: false,
            canAccessDatabasePage: true,
            canSeeClassificaPage: false,
            canAccessForumPage: false,
            canAccessUniversity: true,
            canAccessRiseAi: false,
            allowedTopics: [],
            allowedModuleIds: []
          },
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );

      // phoneIndex per login telefono+password
      await setDoc(
        doc(db, "phoneIndex", t),
        { uid, email: em, telefono: t, updatedAt: serverTimestamp() },
        { merge: true }
      );

      localStorage.setItem(
        "crm_session",
        JSON.stringify({ uid, name: n + " " + c, email: em, phone: t, ts: Date.now() })
      );

      nav("/dashboard");
    } catch (e2) {
      console.error(e2);
      const code = e2?.code || "";

      if (code.includes("auth/email-already-in-use")) showError("Email già utilizzata. Fai login.");
      else if (code.includes("auth/weak-password")) showError("Password troppo debole (min 6 caratteri).");
      else if (code.includes("auth/invalid-email")) showError("Email non valida.");
      else if (code.includes("permission-denied")) showError("Permessi Firestore negati (rules).");
      else showError(e2?.message || "Errore durante la registrazione.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="register-page">
      <div className="register-wrapper">
        <div className="logo">
          <span>CRM uBroker</span>
          <div className="subtitle">Crea il tuo account collaboratore</div>
        </div>

        <form className="form-content" onSubmit={handleSubmit} autoComplete="off">
          <div className="form-row">
            <div className="field-group">
              <label className="field-label" htmlFor="nome">Nome*</label>
              <div className="input-wrapper">
                <input
                  type="text"
                  id="nome"
                  className="field-input"
                  placeholder="Marco"
                  value={nome}
                  onChange={(e) => setNome(e.target.value)}
                  autoComplete="given-name"
                />
                <svg className="input-icon" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                </svg>
              </div>
            </div>

            <div className="field-group">
              <label className="field-label" htmlFor="cognome">Cognome*</label>
              <div className="input-wrapper">
                <input
                  type="text"
                  id="cognome"
                  className="field-input"
                  placeholder="Fregni"
                  value={cognome}
                  onChange={(e) => setCognome(e.target.value)}
                  autoComplete="family-name"
                />
                <svg className="input-icon" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                </svg>
              </div>
            </div>
          </div>

          <div className="field-group">
            <label className="field-label" htmlFor="telefono">Numero di telefono*</label>
            <div className="input-wrapper">
              <input
                type="tel"
                id="telefono"
                name="crm_reg_phone"
                className="field-input"
                placeholder="333 1234567"
                value={telefono}
                onChange={(e) => setTelefono(e.target.value)}
                autoComplete="off"
                inputMode="tel"
              />
              <svg className="input-icon" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
              </svg>
            </div>
            <div className="helper">Utilizzato per l'accesso e le comunicazioni.</div>
          </div>

          <div className="field-group">
            <label className="field-label" htmlFor="email">Email*</label>
            <div className="input-wrapper">
              <input
                type="email"
                id="email"
                className="field-input"
                placeholder="email@esempio.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
              />
              <svg className="input-icon" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
              </svg>
            </div>
          </div>

          <div className="field-group">
            <label className="field-label" htmlFor="password">Password*</label>
            <div className="input-wrapper">
              <input
                type="password"
                id="password"
                className="field-input"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="new-password"
              />
              <svg className="input-icon" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
              </svg>
            </div>

            {passwordTooShort && <div className="helper error-text">La password deve contenere almeno 6 caratteri.</div>}
          </div>

          <div className="field-group">
            <label className="field-label" htmlFor="driverPhone">
              Telefono driver{isFirstUser ? "" : "*"}
            </label>

            <div className="input-wrapper">
              <input
                type="tel"
                id="driverPhone"
                name="crm_driver_phone"
                className="field-input"
                placeholder={isFirstUser ? "Non serve (sei il primo utente)" : "Inserisci numero telefono driver"}
                value={driverPhone}
                onChange={(e) => {
                  const v = e.target.value;
                  setDriverPhone(v);

                  setDriverUid("");
                  setDriverLabel("");
                  setDriverStatus("idle");
                  lastQueryRef.current = "";
                }}
                disabled={isFirstUser}
                autoComplete="off"
                inputMode="tel"
                style={{ paddingRight: 40 }}
              />
              <ContactPickerButton
                className="absolute-picker-reg"
                iconSize={18}
                onContactSelected={(c) => {
                  if (c.tel) {
                    setDriverPhone(c.tel);
                    setDriverUid("");
                    setDriverLabel("");
                    setDriverStatus("idle");
                    lastQueryRef.current = "";
                  }
                }}
              />
              <style>{`
                .absolute-picker-reg {
                  position: absolute;
                  right: 12px;
                  top: 50%;
                  transform: translateY(-50%);
                  color: #94a3b8 !important;
                  z-index: 5;
                }
              `}</style>
              <svg className="input-icon" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
              </svg>
            </div>

            {!isFirstUser && <div className="helper">Appena digiti il numero, lo cerco in automatico.</div>}
            {!isFirstUser && driverStatus === "searching" && <div className="helper">Ricerca driver...</div>}
            {!isFirstUser && driverStatus === "found" && (
              <div className="helper">✅ Driver trovato: <b>{driverLabel}</b></div>
            )}
            {!isFirstUser && driverStatus === "notfound" && (
              <div className="helper error-text">❌ Driver non trovato. Controlla il numero.</div>
            )}
            {!isFirstUser && driverStatus === "error" && (
              <div className="helper error-text">❌ Errore nella ricerca driver (controlla connessione/rules).</div>
            )}
          </div>

          <div className={"error" + (error ? " visible" : "")}>{error}</div>

          <button type="submit" className={"btn btn-register" + (loading ? " loading" : "")} disabled={!canSubmit}>
            {loading ? "Registrazione in corso..." : "REGISTRATI"}
          </button>

          <NavLink to="/login" className="btn btn-back">
            TORNA AL LOGIN
          </NavLink>

          <div className="note-small">Tutti i campi contrassegnati con * sono obbligatori.</div>
        </form>
      </div>
    </div>
  );
}
