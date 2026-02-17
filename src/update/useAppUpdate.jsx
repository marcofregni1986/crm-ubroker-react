// src/update/useAppUpdate.js
import React, { useEffect, useRef, useState, createContext, useContext } from "react";
import { doc, onSnapshot } from "firebase/firestore";
import { db } from "../firebase";

/**
 * useAppUpdate
 * - Ascolta Firestore doc: appMeta/update
 * - Quando cambia "version", capisce che è uscito un update
 *
 * ✅ NOVITÀ:
 * - Se forceReload === false:
 *   1) prova a mostrare una NOTIFICA browser (Notification API)
 *   2) al click sulla notifica -> applyUpdate() (reload)
 *   3) fallback: stato hasUpdate=true per mostrare la modale in-app (già in App.jsx)
 *
 * Nota:
 * - Le notifiche browser funzionano in modo affidabile SOLO se l'app è aperta (tab attivo o in background).
 * - Se vuoi notifiche anche a browser chiuso: serve Push Notification (FCM + Service Worker) → step separato.
 */

function safeGetNumber(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}



export function useAppUpdate() {
  const lastSeenRef = useRef(safeGetNumber(localStorage.getItem("app_update_version")));

  useEffect(() => {
    const unsub = onSnapshot(
      doc(db, "appMeta", "update"),
      async (snap) => {
        const data = snap.data() || {};
        const version = safeGetNumber(data.version);
        const forceReload = !!data.forceReload;

        if (!version) return;
        if (version <= lastSeenRef.current) return;

        // Nuova versione trovata
        lastSeenRef.current = version;
        localStorage.setItem("app_update_version", String(version));

        // Se è forceReload, aggiorniamo subito (soluzione drastica per bug critici)
        if (forceReload) {
          applyUpdate();
        }
      },
      (err) => {
        console.warn("[useAppUpdate] onSnapshot error:", err);
      }
    );

    return () => unsub();
  }, []);

  async function applyUpdate() {
    console.log("🔄 Force applying update...");

    // 1. Unregister all Service Workers to force fresh fetch next load
    if ('serviceWorker' in navigator) {
      try {
        const regs = await navigator.serviceWorker.getRegistrations();
        for (const reg of regs) {
          await reg.unregister();
          console.log("Service Worker unregistered");
        }
      } catch (e) {
        console.error("SW unregister failed:", e);
      }
    }

    // 2. Clear known caches (nuclear update)
    if ('caches' in window) {
      try {
        const keys = await caches.keys();
        await Promise.all(keys.map(key => caches.delete(key)));
        console.log("Caches cleared");
      } catch (e) {
        console.error("Cache clear failed:", e);
      }
    }

    // 3. Reload with cache bursting timestamp
    const url = new URL(window.location.href);
    url.searchParams.set("_v", String(Date.now()));
    window.location.replace(url.toString());
  }

  return { applyUpdate };
}

// ✅ Context per l'update (opzionale, ma utile per componenti sparsi)
const AppUpdateContext = createContext(null);

export function AppUpdateProvider({ children }) {
  const updateInfo = useAppUpdate();

  return (
    <AppUpdateContext.Provider value={updateInfo}>
      {children}
    </AppUpdateContext.Provider>
  );
}

export const useAppUpdateContext = () => useContext(AppUpdateContext);
