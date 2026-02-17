// src/pages/LoginPage.jsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import "./loginpage.css";

// ✅ Firebase
import { auth, db } from "../firebase";
import { signInWithEmailAndPassword, sendPasswordResetEmail } from "firebase/auth";
import { collection, doc, getDoc, getDocs, limit, query, where } from "firebase/firestore";

// ✅ Auth context (Google Calendar token)
import { useAuth } from "../auth/AuthProvider";

/**
 * LOGIN — Firebase Auth + Firestore (telefono + password) + Google Calendar
 *
 * Flusso:
 * 1) Login CRM (telefono + password)
 * 2) Se token Google già valido => entra
 * 3) Se token Google NON valido => STEP 2 con bottone "Collega Google Calendar"
 * 4) Recupero password (step 3)
 *
 * NOTE UI:
 * - Icone input: usiamo background-image (no SVG inline) per evitare glitch dei browser sugli <input>.
 */

function normPhone(s) {
  return String(s || "").replace(/\s+/g, "").trim();
}

// localStorage keys (devono combaciare con AuthProvider)
const CAL_TOKEN_KEY = "crm_calendar_token";
const CAL_EXPIRES_KEY = "crm_calendar_expiresAt";

function readCalendarToken() {
  try {
    const token = localStorage.getItem(CAL_TOKEN_KEY) || "";
    const expiresAt = parseInt(localStorage.getItem(CAL_EXPIRES_KEY) || "0", 10) || 0;
    if (!token || !expiresAt) return { token: "", expiresAt: 0 };
    if (Date.now() > expiresAt) return { token: "", expiresAt: 0 };
    return { token, expiresAt };
  } catch {
    return { token: "", expiresAt: 0 };
  }
}

export default function LoginPage() {
  const nav = useNavigate();

  // ✅ Google Calendar connect (secondary auth)
  const { connectGoogleCalendar, logout, calendarToken } = useAuth();

  // ✅ Redirect automatico se abbiamo sessione + calendar token (es. ritorno da OAuth)
  // Questo gestisce il "Redirect finale /dashboard" richiesto
  useEffect(() => {
    try {
      const session = localStorage.getItem("crm_session");
      console.log("🔥 DEBUG LoginPage session check:", !!session, "Token:", !!calendarToken?.token);
      if (session && calendarToken?.token) {
        console.log("🔥 DEBUG Redirecting to Dashboard...");
        nav("/dashboard", { replace: true });
      }
    } catch { }
  }, [calendarToken, nav]);

  // step state: 1=login, 2=google connect, 3=recovery
  const [step, setStep] = useState(1);
  const pendingRef = useRef(null); // { uid,name,phoneNorm,email }

  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");

  // Recovery
  const [recPhone, setRecPhone] = useState("");
  const [recSuccess, setRecSuccess] = useState("");

  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);
  const [loadingGoogle, setLoadingGoogle] = useState(false);

  // Clear errors when switching steps
  useEffect(() => {
    setErr("");
    setRecSuccess("");
  }, [step]);

  const canSubmit = useMemo(() => {
    const p = normPhone(phone);
    const pass = String(password || "");
    return p.length >= 6 && pass.length >= 6 && !loading && !loadingGoogle;
  }, [phone, password, loading, loadingGoogle]);

  function showError(msg) {
    setErr(String(msg || "Errore"));
  }
  function hideError() {
    setErr("");
  }

  async function findAccountByPhone(phoneNorm) {
    // 1) Tentativo: phoneIndex/{telefono}
    try {
      const ref = doc(db, "phoneIndex", phoneNorm);
      const snap = await getDoc(ref);
      if (snap.exists()) {
        const data = snap.data() || {};
        const uid = String(data.uid || "").trim();
        const email = String(data.email || "").trim().toLowerCase();
        if (email) return { uid, email, source: "phoneIndex" };
      }
    } catch {
      // ignore -> fallback
    }

    // 2) Fallback: users where telefono == telefono
    const qy = query(collection(db, "users"), where("telefono", "==", phoneNorm), limit(1));
    const snap2 = await getDocs(qy);
    if (snap2.empty) return null;

    const d = snap2.docs[0];
    const data2 = d.data() || {};
    const email2 = String(data2.email || "").trim().toLowerCase();
    if (!email2) return null;

    return { uid: d.id, email: email2, source: "usersFallback" };
  }

  function persistSession({ uid, name, phoneNorm, email, calExpiresAt }) {
    const fallbackExpiresAt = Date.now() + 55 * 60 * 1000;
    const expiresAt = calExpiresAt || fallbackExpiresAt;

    localStorage.setItem(
      "crm_session",
      JSON.stringify({
        uid,
        name,
        phone: phoneNorm,
        email,
        ts: Date.now(),
        expiresAt,
      })
    );
  }

  async function handleSubmit(e) {
    e.preventDefault();
    hideError();

    const p = normPhone(phone);
    const pass = String(password || "");

    if (!p || !pass) return showError("Inserisci numero di telefono e password.");
    if (pass.length < 6) return showError("La password deve contenere almeno 6 caratteri.");

    setLoading(true);

    try {
      // --- 1) trova account + login CRM
      const found = await findAccountByPhone(p);
      if (!found?.email) {
        setLoading(false);
        return showError("Numero non trovato. Controlla il telefono oppure registrati.");
      }

      const cred = await signInWithEmailAndPassword(auth, found.email, pass);
      const uid = cred.user.uid;

      // --- profilo (opzionale)
      let name = "Utente";
      try {
        const uSnap = await getDoc(doc(db, "users", uid));
        if (uSnap.exists()) {
          const u = uSnap.data() || {};
          const full = `${u.nome || ""} ${u.cognome || ""}`.trim();
          if (full) name = full;
        }
      } catch {
        // ignore
      }

      // --- 2) Google Calendar: se token già valido -> ok. Se no -> STEP 2
      const existing = readCalendarToken();

      if (existing.token) {
        persistSession({ uid, name, phoneNorm: p, email: found.email, calExpiresAt: existing.expiresAt });
        setLoading(false);
        nav("/dashboard");
        return;
      }

      pendingRef.current = { uid, name, phoneNorm: p, email: found.email };
      setStep(2);
      setLoading(false);
    } catch (e2) {
      console.error(e2);
      const code = e2?.code || "";

      if (code.includes("auth/invalid-credential") || code.includes("auth/wrong-password")) {
        showError("Password non corretta.");
      } else if (code.includes("auth/user-not-found")) {
        showError("Utente non trovato.");
      } else if (code.includes("permission-denied")) {
        showError("Permessi Firestore negati (rules).");
      } else {
        showError(e2?.message || "Errore durante il login.");
      }
      setLoading(false);
    }
  }

  async function handleConnectGoogle() {
    hideError();

    const pending = pendingRef.current;
    if (!pending?.uid) {
      setStep(1);
      return showError("Sessione non valida. Ripeti il login.");
    }

    setLoadingGoogle(true);

    try {
      // ✅ UNIVERSAL POPUP FLOW (Mobile + Desktop)
      // Awaiting this means the user closed the popup successfully (or error)
      await connectGoogleCalendar();

      // If we are here, Popup success!
      console.log("✅ Universal Popup Success! Finalizing login...");

      // Recupera token appena salvato
      const { expiresAt } = readCalendarToken();

      persistSession({
        uid: pending.uid,
        name: pending.name,
        phoneNorm: pending.phoneNorm,
        email: pending.email,
        calExpiresAt: expiresAt
      });

      nav("/dashboard", { replace: true });

    } catch (gErr) {
      console.error(gErr);
      setLoadingGoogle(false);
      // Se l'utente chiude il popup...
      showError("Connessione Google annullata o fallita.");
    }
  }

  async function handleRecovery(e) {
    e.preventDefault();
    hideError();
    setRecSuccess("");

    const rPhone = normPhone(recPhone);
    if (!rPhone || rPhone.length < 6) {
      return showError("Inserisci un numero di telefono valido.");
    }

    setLoading(true);

    try {
      // 1) Find email from phone
      const found = await findAccountByPhone(rPhone);
      if (!found?.email) {
        setLoading(false);
        return showError("Nessun account trovato con questo numero.");
      }

      // 2) Send reset email
      await sendPasswordResetEmail(auth, found.email);
      setRecSuccess("Ti abbiamo inviato una email per resettare la password. Controlla la tua casella di posta.");
      setLoading(false);
    } catch (error) {
      console.error("Recovery error:", error);
      setLoading(false);
      showError("Errore durante l'invio della email. Riprova più tardi.");
    }
  }

  return (
    <div className="login-page">
      <div className="login-wrapper login-anim">
        <div className="logo">
          <img
            src="/logo-crm.jpg"
            alt="Team Rise Program"
            className="login-logo"
            draggable={false}
          />
          <div className="login-brand" aria-label="Team Rise Program">
            <div className="login-brand-line-1">Team</div>
            <div className="login-brand-line-2">Rise Program</div>
          </div>
          <div className="subtitle">
            {step === 1 && "Accedi per gestire il tuo business"}
            {step === 2 && "Collega Google Calendar per continuare"}
            {step === 3 && "Recupera la tua password"}
          </div>      </div>

        {step === 1 ? (
          <form className="form-content" onSubmit={handleSubmit} autoComplete="off">
            <div className="field-group">
              <label className="field-label" htmlFor="phone">Numero di telefono</label>
              <input
                type="tel"
                id="phone"
                name="crm_phone"
                className="field-input field-input--phone"
                placeholder="Inserisci il tuo numero"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                autoComplete="off"
                inputMode="tel"
              />
            </div>

            <div className="field-group">
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                <label className="field-label" htmlFor="password">Password</label>
                <div
                  className="forgot-link"
                  onClick={() => setStep(3)}
                  style={{ fontSize: 13, color: "var(--primary)", cursor: "pointer", textDecoration: "underline", opacity: 0.8 }}
                >
                  Password dimenticata?
                </div>
              </div>
              <input
                type="password"
                id="password"
                name="crm_password"
                className="field-input field-input--password"
                placeholder="Inserisci la tua password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
              />
            </div>

            <button type="submit" className={"btn btn-login" + (loading ? " loading" : "")} disabled={!canSubmit}>
              <span className="spinner" />
              <span>{loading ? "ACCESSO..." : "ACCEDI"}</span>
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M14 5l7 7m0 0l-7 7m7-7H3" />
              </svg>
            </button>

            <div className={"error" + (err ? " visible" : "")}>{err}</div>

            <div className="divider">oppure</div>

            <NavLink to="/register" className="btn btn-register">
              CREA UN ACCOUNT
            </NavLink>
          </form>
        ) : step === 3 ? (
          /* RECOVERY FORM */
          <form className="form-content" onSubmit={handleRecovery}>
            <div className="field-group">
              <label className="field-label" htmlFor="recPhone">Il tuo numero di telefono</label>
              <input
                type="tel"
                id="recPhone"
                name="crm_rec_phone"
                className="field-input field-input--phone"
                placeholder="Inserisci il tuo numero"
                value={recPhone}
                onChange={(e) => setRecPhone(e.target.value)}
                autoComplete="off"
                inputMode="tel"
              />
            </div>

            <button type="submit" className={"btn btn-login" + (loading ? " loading" : "")} disabled={loading || !recPhone}>
              <span className="spinner" />
              <span>{loading ? "INVIO..." : "INVIA LINK DI RESET"}</span>
            </button>

            <div className={"error" + (err ? " visible" : "")}>{err}</div>
            {recSuccess && (
              <div style={{ marginTop: 12, padding: 12, borderRadius: 8, background: "rgba(16, 185, 129, 0.1)", color: "#10b981", fontSize: 13, border: "1px solid rgba(16, 185, 129, 0.2)" }}>
                {recSuccess}
              </div>
            )}

            <button
              type="button"
              className="btn btn-register"
              style={{ marginTop: 24 }}
              onClick={() => {
                setStep(1);
                hideError();
                setRecSuccess("");
              }}
            >
              TORNA AL LOGIN
            </button>
          </form>
        ) : (
          /* GOOGLE CONNECT STEP */
          <div className="form-content">
            <button
              type="button"
              className={"btn btn-login" + (loadingGoogle ? " loading" : "")}
              onClick={handleConnectGoogle}
              disabled={loadingGoogle}
            >
              <span className="spinner" />
              <span>{loadingGoogle ? "CONNESSIONE..." : "COLLEGA GOOGLE CALENDAR"}</span>
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M14 5l7 7m0 0l-7 7m7-7H3" />
              </svg>
            </button>

            <button
              type="button"
              className="btn btn-register"
              style={{ marginTop: 12 }}
              onClick={() => {
                pendingRef.current = null;
                setStep(1);
                setLoadingGoogle(false);
                hideError();
              }}
            >
              INDIETRO
            </button>

            <div className={"error" + (err ? " visible" : "")}>{err}</div>
          </div>
        )}

        {/* PRIVACY FOOTER */}
        <div style={{ marginTop: 24, textAlign: "center", fontSize: 11, opacity: 0.5 }}>
          <NavLink to="/privacy" style={{ color: "inherit", textDecoration: "none" }}>Privacy Policy & Google Usage</NavLink>
        </div>
      </div>
    </div>
  );
}
