
import React, { createContext, useContext, useState, useCallback, useRef } from "react";
import { X, CheckCircle2, AlertTriangle, Info, BellRing } from "lucide-react";

const ToastContext = createContext(null);

export function ToastProvider({ children }) {
    const [toasts, setToasts] = useState([]);

    // Ref for generating unique IDs
    const idCounterRef = useRef(0);

    const addToast = useCallback((type, message, duration = 4000) => {
        const id = ++idCounterRef.current;
        const newToast = { id, type, message, duration };

        setToasts((prev) => [...prev, newToast]);

        if (duration > 0) {
            setTimeout(() => {
                removeToast(id);
            }, duration);
        }
    }, []);

    const removeToast = useCallback((id) => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
    }, []);

    const success = useCallback((msg) => addToast("success", msg), [addToast]);
    const error = useCallback((msg) => addToast("error", msg), [addToast]);
    const info = useCallback((msg) => addToast("info", msg), [addToast]);
    const warning = useCallback((msg) => addToast("warning", msg), [addToast]);

    return (
        <ToastContext.Provider value={{ success, error, info, warning, addToast, removeToast }}>
            {children}
            <ToastContainer toasts={toasts} removeToast={removeToast} />
        </ToastContext.Provider>
    );
}

export function useToast() {
    const ctx = useContext(ToastContext);
    if (!ctx) throw new Error("useToast must be used within a ToastProvider");
    return ctx;
}

// --- UI COMPONENTS ---

function ToastContainer({ toasts, removeToast }) {
    return (
        <div
            style={{
                position: "fixed",
                top: 20,
                right: 20,
                zIndex: 99999,
                display: "flex",
                flexDirection: "column",
                gap: 12,
                pointerEvents: "none", // Allows clicking through container
            }}
        >
            {toasts.map((t) => (
                <ToastItem key={t.id} toast={t} onDismiss={() => removeToast(t.id)} />
            ))}
        </div>
    );
}

function ToastItem({ toast, onDismiss }) {
    const { type, message } = toast;

    let icon = <Info size={18} />;
    let styles = {
        background: "#1e293b",
        color: "#fff",
        borderLeft: "4px solid #3b82f6", // blue default
    };

    switch (type) {
        case "success":
            icon = <CheckCircle2 size={18} />;
            styles.borderLeft = "4px solid #10b981"; // green
            styles.background = "rgba(2, 6, 23, 0.95)";
            break;
        case "error":
            icon = <AlertTriangle size={18} />;
            styles.borderLeft = "4px solid #ef4444"; // red
            styles.background = "rgba(2, 6, 23, 0.95)";
            break;
        case "warning":
            icon = <BellRing size={18} />;
            styles.borderLeft = "4px solid #f59e0b"; // orange
            styles.background = "rgba(2, 6, 23, 0.95)";
            break;
        case "info":
        default:
            styles.background = "rgba(2, 6, 23, 0.95)";
            break;
    }

    return (
        <div
            className="toast-enter"
            style={{
                width: 300,
                padding: "12px 16px",
                borderRadius: 8,
                boxShadow: "0 10px 30px rgba(0,0,0,0.5)",
                display: "flex",
                alignItems: "stretch",
                gap: 12,
                pointerEvents: "auto",
                cursor: "pointer",
                backdropFilter: "blur(10px)",
                border: "1px solid rgba(255,255,255,0.08)",
                ...styles,
            }}
            onClick={onDismiss}
        >
            <div style={{ display: "flex", alignItems: "center", color: styles.borderLeft.split(" ")[2] }}>
                {icon}
            </div>
            <div style={{ flex: 1, fontSize: 13.5, lineHeight: 1.45, fontWeight: 500, alignSelf: 'center' }}>
                {message}
            </div>
            <button
                style={{
                    background: "transparent",
                    border: "none",
                    color: "rgba(255,255,255,0.4)",
                    display: "flex",
                    alignItems: "center",
                    cursor: "pointer",
                }}
                onClick={(e) => {
                    e.stopPropagation();
                    onDismiss();
                }}
            >
                <X size={16} />
            </button>
            <style>{`
        @keyframes slideIn {
          from { transform: translateX(100%); opacity: 0; }
          to { transform: translateX(0); opacity: 1; }
        }
        .toast-enter {
          animation: slideIn 0.3s cubic-bezier(0.16, 1, 0.3, 1);
        }
      `}</style>
        </div>
    );
}
