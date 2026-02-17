// src/update/useAppUpdate.js
import { useEffect, useRef, useState } from "react";
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

async function tryUpdateServiceWorker() {
  if (!("serviceWorker" in navigator)) return;

  try {
    const regs = await navigator.serviceWorker.getRegistrations();
    await Promise.all(regs.map((r) => r.update().catch(() => null)));
  } catch {
    // ignore
  }
}

function canUseNotifications() {
  return typeof window !== "undefined" && "Notification" in window;
}

async function ensureNotificationPermissionOnce() {
  if (!canUseNotifications()) return "unsupported";

  // Evitiamo richieste ripetute
  const asked = localStorage.getItem("app_update_notif_asked") === "1";
  if (asked) return Notification.permission;

  if (Notification.permission === "default") {
    try {
      localStorage.setItem("app_update_notif_asked", "1");
      const res = await Notification.requestPermission();
      return res;
    } catch {
      return Notification.permission;
    }
  }

  return Notification.permission;
}

function showUpdateNotification({ title, body, onClick }) {
  if (!canUseNotifications()) return false;
  if (Notification.permission !== "granted") return false;

  try {
    const n = new Notification(title, {
      body,
      // tag evita spam di notifiche duplicate, renotify forza a riproporla
      tag: "app-update",
      renotify: true,
    });

    n.onclick = (e) => {
      e?.preventDefault?.();
      try {
        window.focus();
      } catch {
        // ignore
      }
      try {
        n.close();
      } catch {
        // ignore
      }
      onClick?.();
    };

    return true;
  } catch {
    return false;
  }
}

export function useAppUpdate() {
  const [hasUpdate, setHasUpdate] = useState(false);
  const [message, setMessage] = useState("");
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

        // nuova versione trovata
        lastSeenRef.current = version;
        localStorage.setItem("app_update_version", String(version));

        const msg =
          String(data.message || "").trim() || "Aggiornamento disponibile: riavvia l’app per applicarlo.";
        setMessage(msg);

        const doReload = async () => {
          // ✅ tentiamo prima l'update del SW (se PWA)
          await tryUpdateServiceWorker();

          // ✅ reload “forte”: reload + cache-bust
          const url = new URL(window.location.href);
          url.searchParams.set("_v", String(version));
          window.location.replace(url.toString());
        };

        if (forceReload) {
          await doReload();
          return;
        }

        // ✅ Modalità "soft": notifica + scelta utente
        // 1) prova a ottenere permesso (una volta)
        await ensureNotificationPermissionOnce();

        // 2) prova notifica browser (se consentita)
        const notified = showUpdateNotification({
          title: "Aggiornamento disponibile",
          body: msg,
          onClick: () => {
            doReload();
          },
        });

        // 3) fallback/backup: modale in-app (App.jsx)
        //    anche se la notifica è partita, teniamo la modale come "backup"
        //    (puoi cambiarlo a: if (!notified) setHasUpdate(true); se vuoi modale solo quando non notifica)
        setHasUpdate(true);
      },
      (err) => {
        console.warn("[useAppUpdate] onSnapshot error:", err);
      }
    );

    return () => unsub();
  }, []);

  async function applyUpdate() {
    await tryUpdateServiceWorker();
    const url = new URL(window.location.href);
    url.searchParams.set("_v", String(Date.now()));
    window.location.replace(url.toString());
  }

  function dismiss() {
    setHasUpdate(false);
  }

  return { hasUpdate, message, applyUpdate, dismiss };
}
