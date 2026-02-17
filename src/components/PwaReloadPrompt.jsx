import React, { useEffect } from "react";
import { useRegisterSW } from "virtual:pwa-register/react";

/**
 * PwaReloadPrompt
 * Gestisce l'aggiornamento manuale del Service Worker e la pulizia della cache.
 */
export default function PwaReloadPrompt() {
    const {
        offlineReady: [offlineReady, setOfflineReady],
        needRefresh: [needRefresh, setNeedRefresh],
        updateServiceWorker,
    } = useRegisterSW({
        onRegistered(r) {
            console.log("✅ SW Registered:", r);
        },
        onRegisterError(error) {
            console.error("❌ SW Registration Error:", error);
        },
    });

    const [visible, setVisible] = React.useState(false);

    // ✅ Delay visualizzazione per evitare bug click (5 secondi)
    useEffect(() => {
        if (needRefresh) {
            const timer = setTimeout(() => {
                setVisible(true);
            }, 5000); // 5 secondi di delay cauto
            return () => clearTimeout(timer);
        } else {
            setVisible(false);
        }
    }, [needRefresh]);

    // Funzione per eseguire refresh + pulizia cache
    const handleRefresh = async () => {
        console.log("🔄 Updating Service Worker & Clearing Cache...");

        try {
            // 1. Forza update del SW
            await updateServiceWorker(true);

            // 2. Opzionale: Pulizia manuale cache (se necessario)
            // Spesso updateServiceWorker(true) è sufficiente se configurato bene,
            // ma per sicurezza svuotiamo le cache note.
            if ('caches' in window) {
                const keyList = await caches.keys();
                await Promise.all(keyList.map(key => caches.delete(key)));
                console.log("🧹 Cache Cleared.");
            }

        } catch (e) {
            console.error("Update failed:", e);
            // Fallback reload
            window.location.reload();
        }
    };

    const close = () => {
        setOfflineReady(false);
        setNeedRefresh(false);
        setVisible(false);
    };

    // Mostra solo se offlineReady (subito) oppure se needRefresh E sono passati i 5 secondi (visible)
    const shouldShow = offlineReady || (needRefresh && visible);

    if (!shouldShow) return null;

    return (
        <div className="pwa-toast" role="alert" aria-live="polite">
            <div className="pwa-toast-content">
                <div className="pwa-toast-message">
                    {offlineReady ? (
                        <span>App pronta per l'uso offline.</span>
                    ) : (
                        <span>
                            <strong>Nuova versione disponibile!</strong> <br />
                            Aggiorna per caricare le ultime modifiche.
                        </span>
                    )}
                </div>

                <div className="pwa-toast-actions">
                    {needRefresh && (
                        <button
                            className="pwa-refresh-btn"
                            onClick={handleRefresh}
                        >
                            Aggiorna Ora
                        </button>
                    )}
                    <button className="pwa-close-btn" onClick={close}>
                        Chiudi
                    </button>
                </div>
            </div>

            <style>{`
        .pwa-toast {
          position: fixed;
          bottom: 20px;
          right: 20px;
          z-index: 10000;
          background-color: var(--bg-card, #1e293b);
          border: 1px solid var(--border-color, rgba(255,255,255,0.1));
          box-shadow: 0 10px 30px rgba(0,0,0,0.5);
          border-radius: 12px;
          padding: 16px;
          color: white;
          font-family: inherit;
          animation: slideIn 0.3s ease-out;
          max-width: 320px;
        }
        
        .pwa-toast-message {
          margin-bottom: 12px;
          font-size: 14px;
          line-height: 1.4;
        }

        .pwa-toast-actions {
          display: flex;
          gap: 8px;
          justify-content: flex-end;
        }

        .pwa-refresh-btn {
          background-color: #3b82f6; 
          color: white;
          border: none;
          padding: 8px 12px;
          border-radius: 6px;
          cursor: pointer;
          font-weight: 600;
          font-size: 13px;
        }
        .pwa-refresh-btn:hover {
          background-color: #2563eb;
        }

        .pwa-close-btn {
          background-color: transparent;
          color: #94a3b8;
          border: 1px solid rgba(255,255,255,0.1);
          padding: 8px 12px;
          border-radius: 6px;
          cursor: pointer;
          font-size: 13px;
        }
        .pwa-close-btn:hover {
          background-color: rgba(255,255,255,0.05);
          color: white;
        }

        @keyframes slideIn {
          from { transform: translateY(20px); opacity: 0; }
          to { transform: translateY(0); opacity: 1; }
        }
      `}</style>
        </div>
    );
}
