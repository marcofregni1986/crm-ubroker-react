// src/auth/AuthProvider.jsx
import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
import { onAuthStateChanged, signOut, GoogleAuthProvider, signInWithRedirect, signInWithPopup, getRedirectResult } from "firebase/auth";
import { doc, getDoc, setDoc, serverTimestamp, onSnapshot } from "firebase/firestore";
import { auth, db } from "../firebase";

/**
 * AuthProvider — Firebase Auth + profilo Firestore + Google Calendar (Hybrid Flow)
 *
 * ✅ Hybrid Strategy:
 *    - Desktop: Popup (evita problemi di cookies/storage partitioning)
 *    - Mobile: Redirect (UX standard)
 *
 * ✅ Profilo: users/{uid} (creato automaticamente se non esiste)
 * ✅ Google Calendar: USIAMO IL REDIRECT (no popup) per compatibilità cross-browser (Firefox/Safari).
 *    - Il token viene salvato in localStorage ("crm_calendar_token")
 *    - LA SESSIONE CRM (token proprietario) NON VIENE TOCCATA.
 */

export const AuthCtx = createContext(null);

// -----------------------------
// Calendar token storage (localStorage)
// -----------------------------
const CAL_TOKEN_KEY = "crm_calendar_token";
const CAL_EXPIRES_KEY = "crm_calendar_expiresAt";

function nowMs() {
  return Date.now();
}

function readCalendarTokenFromStorage() {
  try {
    const token = localStorage.getItem(CAL_TOKEN_KEY) || "";
    // Se non c'è scadenza specifica, assumiamo valido (o gestito da errore API)
    // Per ora non "scadiamo" forzatamente se non c'è data, ma se c'è la rispettiamo.
    const expiresAt = parseInt(localStorage.getItem(CAL_EXPIRES_KEY) || "0", 10) || 0;

    // Se c'è una scadenza ed è passata -> token scaduto
    if (expiresAt > 0 && nowMs() > expiresAt) return { token: "", expiresAt: 0 };

    // Se c'è token (e scadenza ok o assente), lo torniamo
    if (token) return { token, expiresAt };
    return { token: "", expiresAt: 0 };
  } catch {
    return { token: "", expiresAt: 0 };
  }
}

function writeCalendarTokenToStorage(token, expiresAt) {
  try {
    localStorage.setItem(CAL_TOKEN_KEY, token || "");
    localStorage.setItem(CAL_EXPIRES_KEY, String(expiresAt || 0));
  } catch { }
}

function clearCalendarTokenStorage() {
  try {
    localStorage.removeItem(CAL_TOKEN_KEY);
    localStorage.removeItem(CAL_EXPIRES_KEY);
  } catch { }
}

export function AuthProvider({ children }) {
  const [firebaseUser, setFirebaseUser] = useState(null);
  const [profile, setProfile] = useState(null);

  const [authLoading, setAuthLoading] = useState(true);
  const [profileLoading, setProfileLoading] = useState(false);
  const [redirectProcessing, setRedirectProcessing] = useState(true); // check redirect al mount

  // Stato token calendar locale
  const [calendarToken, setCalendarToken] = useState(() => readCalendarTokenFromStorage());

  // ✅ FORCE LOGOUT via query param (?forceLogout=1)
  useEffect(() => {
    const url = new URL(window.location.href);
    const force = url.searchParams.get("forceLogout");
    if (force === "1") {
      url.searchParams.delete("forceLogout");
      window.history.replaceState({}, "", url.toString());

      (async () => {
        try {
          clearCalendarTokenStorage();
          setCalendarToken({ token: "", expiresAt: 0 });
          await signOut(auth);
        } catch (e) {
          console.error("forceLogout error:", e);
        } finally {
          window.location.reload();
        }
      })();
    }
  }, []);

  // 1) Firebase Auth State
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (user) => {
      setFirebaseUser(user || null);
      setAuthLoading(false);
    });
    return () => unsub();
  }, []);

  /**
   * Helper centrale per gestire il successo del login (Popup o Redirect)
   */
  async function handleAuthSuccess(credential) {
    if (!credential?.accessToken) return;

    console.log("✅ Google Calendar: Auth success, token received.");

    // Salviamo il token
    const token = credential.accessToken;
    // Nessuna stima di scadenza: se l'API darà 401, l'utente riconnetterà.
    const expiresAt = 0;

    writeCalendarTokenToStorage(token, expiresAt);
    setCalendarToken({ token, expiresAt });

    // (Opzionale) Aggiorna user (Identità CRM)
    let targetUid = null;
    try {
      const sessionStr = localStorage.getItem("crm_session");
      if (sessionStr) {
        const session = JSON.parse(sessionStr);
        if (session?.uid) targetUid = session.uid;
      }
    } catch { }

    if (targetUid) {
      // NON-BLOCKING: Fire and forget update
      const ref = doc(db, "users", targetUid);
      setDoc(ref, {
        googleCalendar: { connected: true, connectedAt: serverTimestamp() },
        updatedAt: serverTimestamp(),
      }, { merge: true })
        .then(() => console.log("🔥 DEBUG Firestore Updated (Background) for UID:", targetUid))
        .catch((err) => console.warn("Update user googleCalendar status failed:", err));

    } else {
      console.warn("Google Calendar connected, but no CRM session UID found. Firestore update skipped.");
    }
  }

  // 2) Handle Redirect Result (Google Calendar) - Solo per Mobile Flow
  useEffect(() => {
    async function checkRedirect() {
      setRedirectProcessing(true);
      try {
        const result = await getRedirectResult(auth);
        console.log("🔥 DEBUG Redirect Result:", result ? "OK" : "NULL");
        if (result) {
          const credential = GoogleAuthProvider.credentialFromResult(result);
          await handleAuthSuccess(credential);
        }
      } catch (error) {
        console.error("❌ Google Redirect Error:", error);
      } finally {
        setRedirectProcessing(false);
      }
    }
    checkRedirect();
  }, []);

  // 3) Firestore profile users/{uid} (Real-time Snapshot)
  useEffect(() => {
    if (!firebaseUser?.uid) {
      setProfile(null);
      setProfileLoading(false);
      return;
    }

    setProfileLoading(true);

    const ref = doc(db, "users", firebaseUser.uid);
    const unsub = onSnapshot(ref, (snap) => {
      setProfileLoading(false);
      if (snap.exists()) {
        const data = snap.data();
        console.log("[AuthProvider] Profile UPDATE received:", { id: snap.id, permissions: data.permissions }); // 🔥 Trace
        setProfile({ id: snap.id, ...data });
      } else {
        // Crea se non esiste (tipico primo login)
        const base = {
          email: firebaseUser.email || "",
          displayName: firebaseUser.displayName || "",
          photoURL: firebaseUser.photoURL || "",
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
          permissions: {
            canSeeStepOne: false,
            canAccessAppointmentsPage: true,
            canAccessStructurePage: false,
            canSeeKpiPage: false,
            canAccessDatabasePage: true,
            canSeeClassificaPage: false,
            canAccessForumPage: false,
            canAccessUniversity: true,
            canAccessRiseAi: false,
            isAdmin: false,
            allowedTopics: [],
            allowedModuleIds: []
          },
          role: "user",
        };
        setDoc(ref, base, { merge: true });
        // onSnapshot scatterà di nuovo con i dati appena creati
      }
    }, (err) => {
      console.error("[AuthProvider] Snapshot error:", err);
      setProfileLoading(false);
      // Fallback minimo per non rompere l'app
      if (!profile) {
        setProfile({
          id: firebaseUser.uid,
          email: firebaseUser.email || "",
          permissions: {},
        });
      }
    });

    return () => unsub();
  }, [firebaseUser?.uid]);


  async function logout() {
    clearCalendarTokenStorage();
    setCalendarToken({ token: "", expiresAt: 0 });
    await signOut(auth);
  }

  /**
   * connectGoogleCalendar()
   * - UNIVERSAL POPUP: Works on Desktop & Mobile (New Tab).
   * - Avoids Redirect Loop issues on mobile browsers.
   */
  /**
   * connectGoogleCalendarRedirect()
   * - USES REDIRECT: Better for auto-recovery (no popup blockers).
   */
  async function connectGoogleCalendarRedirect() {
    // 1. Configura Provider
    const provider = new GoogleAuthProvider();
    provider.addScope('https://www.googleapis.com/auth/calendar');
    provider.addScope('https://www.googleapis.com/auth/calendar.events');

    console.log("🔄 Auto-Recovery: Starting Redirect Flow...");
    try {
      await signInWithRedirect(auth, provider);
    } catch (error) {
      console.error("❌ Google Redirect Error:", error);
      throw error;
    }
  }

  /**
   * connectGoogleCalendar()
   * - UNIVERSAL POPUP: Works on Desktop & Mobile (New Tab).
   * - Avoids Redirect Loop issues on mobile browsers.
   */
  async function connectGoogleCalendar() {
    // 1. Configura Provider
    const provider = new GoogleAuthProvider();
    provider.addScope('https://www.googleapis.com/auth/calendar');
    provider.addScope('https://www.googleapis.com/auth/calendar.events');

    // 2. Always use Popup
    console.log("🌎 Universal: Starting Popup Flow...");
    try {
      const result = await signInWithPopup(auth, provider);
      const credential = GoogleAuthProvider.credentialFromResult(result);
      await handleAuthSuccess(credential);
    } catch (error) {
      console.error("❌ Google Popup Error:", error);
      throw error;
    }
  }

  async function ensureGoogleToken() {
    const existing = readCalendarTokenFromStorage();
    if (existing.token) {
      setCalendarToken(existing);
      return existing;
    }
    // Se non c'è token, non possiamo fare "silent refresh" col redirect flow senza interazione.
    // Ritorniamo vuoto, la UI dovrà chiedere di connettere.
    return { token: "", expiresAt: 0 };
  }

  async function disconnectGoogleCalendar() {
    clearCalendarTokenStorage();
    setCalendarToken({ token: "", expiresAt: 0 });

    try {
      if (auth.currentUser?.uid) {
        const ref = doc(db, "users", auth.currentUser.uid);
        await setDoc(
          ref,
          {
            googleCalendar: { connected: false, disconnectedAt: serverTimestamp() },
            updatedAt: serverTimestamp(),
          },
          { merge: true }
        );
      }
    } catch (e) {
      console.warn("Impossibile aggiornare users/{uid} googleCalendar:", e);
    }
  }

  /**
   * gcalFetch()
   * central helper for Google Calendar API calls.
   * Automatically handles 401 Unauthorized by disconnecting and clearing local state.
   */
  async function gcalFetch(path, init = {}) {
    const token = calendarToken?.token;
    if (!token) {
      throw new Error("Google Calendar non collegato.");
    }

    const res = await fetch(`https://www.googleapis.com/calendar/v3${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        ...(init.headers || {}),
      },
    });

    if (res.status === 401 || res.status === 403) {
      // 401 = Token expired / Invalid
      // 403 = Often "Insufficient Permission" or "Usage Limit", but can imply token issues.
      // We process the body to be sure, or just treat as Auth error if it's 401.
      const body = await res.text().catch(() => "");

      // If 403, only treat as Auth error if related to token/permissions
      const bodyLow = body.toLowerCase();
      if (res.status === 403 && !bodyLow.includes("permission") && !bodyLow.includes("auth") && !bodyLow.includes("token")) {
        // generic 403 might be rate limit? rethrow normal error
        throw new Error(`Google Calendar API error (403): ${body}`);
      }

      console.warn(`⚠️ Google Token issue (${res.status}). Resetting calendar connection...`);
      disconnectGoogleCalendar();

      // Throw a specific error that can be caught and ignored by the UI to avoid alerts
      const error = new Error("Sessione Google scaduta. Verrai reindirizzato al login.");
      error.isGcalAuthError = true;
      throw error;
    }

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`Google Calendar API error (${res.status}): ${body || res.statusText}`);
    }

    if (res.status === 204) return null;
    return res.json();
  }

  const permissions = useMemo(() => (profile?.permissions ? profile.permissions : {}), [profile]);

  const isAdmin = useMemo(() => {
    // 1. Check flag in permissions
    if (!!permissions?.isAdmin) return true;

    // 2. Check role (case-insensitive)
    const role = String(profile?.role || "").toLowerCase();
    if (role === "admin") return true;

    // 3. Fallback Session (localStorage/sessionStorage)
    try {
      const s = localStorage.getItem("crm_session") || sessionStorage.getItem("crm_session");
      if (s) {
        const sess = JSON.parse(s);
        if (!!sess.isAdmin || sess.role === "admin") return true;
        // Check phone in session too
        const sPhone = String(sess.phone || sess.telefono || "").replace(/\s+/g, "");
        if (sPhone.includes("3351605276")) return true;
      }
    } catch (e) { /* ignore */ }

    // 4. Fallback DEFINITIVO: check sul numero o email del creatore (Marco)
    // Controlliamo tutti i possibili campi telefono
    const pPhone = String(
      profile?.telefono ||
      profile?.phone ||
      profile?.tel ||
      profile?.phoneNumber ||
      ""
    ).replace(/\s+/g, "");

    if (pPhone.includes("3351605276")) return true;

    // Check Email (Marco Fregni)
    const email = String(profile?.email || firebaseUser?.email || "").toLowerCase();
    if (email.includes("marcofregni")) return true;

    return false;
  }, [permissions, profile, firebaseUser]);

  // Loading globale: auth firebase + profilo + check redirect iniziale
  const loading = authLoading || (firebaseUser?.uid ? profileLoading : false) || redirectProcessing;

  const value = useMemo(
    () => ({
      firebaseUser,
      profile,

      // alias usati nel CRM
      user: firebaseUser,
      uid: firebaseUser?.uid || "",
      email: firebaseUser?.email || "",
      userDoc: profile,
      permissions,
      isAdmin,
      loading,

      calendarToken,
      connectGoogleCalendar,
      connectGoogleCalendarRedirect, // [NEW] exposed
      ensureGoogleToken,
      disconnectGoogleCalendar,
      gcalFetch,

      logout,
    }),
    [firebaseUser, profile, permissions, isAdmin, loading, calendarToken]
  );

  return <AuthCtx.Provider value={value}>{children}</AuthCtx.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthCtx);
  if (!ctx) throw new Error("useAuth deve essere usato dentro <AuthProvider>");
  return ctx;
}
