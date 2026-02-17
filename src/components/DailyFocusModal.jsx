
import React, { useEffect, useState, useMemo } from "react";
import { X, Rocket, Target, Phone, CalendarCheck, ChevronRight } from "lucide-react";
import { collection, query, where, getDocs, Timestamp } from "firebase/firestore";
import { db } from "../firebase";
import { useAuth } from "../auth/AuthProvider";

// Helper date
function startOfDay(d) {
    const n = new Date(d);
    n.setHours(0, 0, 0, 0);
    return n;
}
function endOfDay(d) {
    const n = new Date(d);
    n.setHours(23, 59, 59, 999);
    return n;
}

export default function DailyFocusModal({ isOpen, onClose }) {
    const { user, userDoc } = useAuth();

    // Data State
    const [stats, setStats] = useState({ appointments: 0, toCall: 0 });
    const [lists, setLists] = useState({ appointments: [], toCall: [] });
    const [loading, setLoading] = useState(true);

    // UI State
    const [expandedView, setExpandedView] = useState(null); // 'appointments' | 'calls' | null

    // Motivational quotes
    const QUOTES = [
        "Sei a un passo dal tuo record settimanale!",
        "Ogni 'no' ti avvicina a un 'sì'.",
        "La disciplina batte il talento.",
        "Oggi è il giorno giusto per chiudere quel contratto.",
        "Fai che accada!",
        "Il successo è la somma di piccoli sforzi ripetuti.",
    ];
    const quote = useMemo(() => QUOTES[Math.floor(Math.random() * QUOTES.length)], []);

    useEffect(() => {
        if (!isOpen) return;

        async function fetchStats() {
            if (!user?.uid && !userDoc?.id) return;
            const uid = user?.uid || userDoc?.id;

            try {
                setLoading(true);
                const now = new Date();
                const start = startOfDay(now);
                const end = endOfDay(now);

                // 1. Appuntamenti di OGGI
                const qApp = query(
                    collection(db, "appointments"),
                    where("uid", "==", uid),
                    where("dataOra", ">=", Timestamp.fromDate(start)),
                    where("dataOra", "<=", Timestamp.fromDate(end))
                );
                const snapApp = await getDocs(qApp);
                const appList = snapApp.docs.map(d => ({ id: d.id, ...d.data() }));

                // 2. Da Richiamare
                const qCall = query(
                    collection(db, "appointments"),
                    where("uid", "==", uid),
                    where("stato", "in", ["Da Richiamare", "da_richiamare"])
                );
                const snapCall = await getDocs(qCall);
                const callList = snapCall.docs.map(d => ({ id: d.id, ...d.data() }));

                setStats({
                    appointments: snapApp.size,
                    toCall: snapCall.size
                });
                setLists({
                    appointments: appList,
                    toCall: callList
                });

            } catch (e) {
                console.warn("Daily stats fetch failed", e);
            } finally {
                setLoading(false);
            }
        }

        fetchStats();
    }, [isOpen, user, userDoc]);

    if (!isOpen) return null;

    // Helper renderers
    const renderList = (type) => {
        const data = type === 'appointments' ? lists.appointments : lists.toCall;
        const color = type === 'appointments' ? "#4ade80" : "#fb923c";
        const title = type === 'appointments' ? "Appuntamenti di Oggi" : "Da Richiamare";

        return (
            <div className="expanded-list" style={{ animation: "fadeIn 0.3s ease" }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
                    <h3 style={{ fontSize: 16, fontWeight: 700, color: color }}>{title} ({data.length})</h3>
                    <button onClick={() => setExpandedView(null)} style={{ background: "none", border: "none", color: "rgba(255,255,255,0.5)", cursor: "pointer" }}>Indietro</button>
                </div>
                <div style={{ maxHeight: 200, overflowY: "auto", display: "flex", flexDirection: "column", gap: 8, paddingRight: 4 }}>
                    {data.length === 0 && <div style={{ fontSize: 13, opacity: 0.5, fontStyle: "italic" }}>Nessun elemento.</div>}
                    {data.map(item => (
                        <div key={item.id} style={{
                            background: "rgba(255,255,255,0.03)", padding: "10px 12px", borderRadius: 10, border: "1px solid rgba(255,255,255,0.05)",
                            display: "flex", alignItems: "center", justifyContent: "space-between"
                        }}>
                            <div style={{ textAlign: 'left' }}>
                                <div style={{ fontWeight: 600, fontSize: 13.5, color: '#f1f5f9' }}>{item.nome} {item.cognome}</div>
                                <div style={{ fontSize: 11, opacity: 0.6, color: '#cbd5e1' }}>{item.telefono}</div>
                            </div>
                            {type === 'appointments' && (
                                <div style={{ fontSize: 12, fontWeight: 700, color: "#fff", background: "rgba(255,255,255,0.1)", padding: "2px 6px", borderRadius: 4 }}>
                                    {item.dataOra ? new Date(item.dataOra.toMillis ? item.dataOra.toMillis() : item.dataOra).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ""}
                                </div>
                            )}
                        </div>
                    ))}
                </div>
            </div>
        );
    };

    return (
        <div
            className="modal-overlay open"
            style={{
                backdropFilter: "blur(8px)",
                background: "rgba(0,0,0,0.6)",
                zIndex: 9998
            }}
        >
            <div
                className="modal daily-focus-modal"
                style={{
                    width: 500,
                    maxWidth: "90vw",
                    borderRadius: 24,
                    background: "linear-gradient(145deg, rgba(15, 23, 42, 0.98) 0%, rgba(2, 6, 23, 1) 100%)",
                    border: "1px solid rgba(251, 191, 36, 0.3)",
                    boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.8), 0 0 30px rgba(251, 191, 36, 0.1)",
                    color: "#fff",
                    padding: 0,
                    overflow: "hidden",
                    animation: "dailyPop 0.5s cubic-bezier(0.16, 1, 0.3, 1)"
                }}
            >
                {/* Glow Effects */}
                <div style={{ position: "absolute", top: -100, left: -50, width: 200, height: 200, background: "rgba(251, 191, 36, 0.15)", filter: "blur(80px)", borderRadius: "50%" }} />

                <div style={{ position: "relative", padding: "24px 24px", textAlign: "center" }}>

                    <h2 style={{ fontSize: 22, fontWeight: 800, marginBottom: 4, letterSpacing: -0.5 }}>
                        Buongiorno, {user?.nome || "Campione"}! ☀️
                    </h2>
                    <p style={{ fontSize: 13, color: "rgba(255,255,255,0.5)", marginBottom: 24 }}>
                        Il tuo centro di comando per oggi.
                    </p>

                    {expandedView ? (
                        renderList(expandedView)
                    ) : (
                        <div style={{ display: "flex", justifyContent: "center", gap: 20, marginBottom: 32 }}>

                            {/* 1. Appuntamenti */}
                            <div
                                className="stat-circle interactive"
                                onClick={() => setExpandedView('appointments')}
                                style={{ cursor: "pointer", transition: "transform 0.2s" }}
                                onMouseOver={e => e.currentTarget.style.transform = "scale(1.05)"}
                                onMouseOut={e => e.currentTarget.style.transform = "scale(1)"}
                            >
                                <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
                                    <div style={{
                                        width: 64, height: 64, borderRadius: "50%",
                                        border: "2px solid rgba(34, 197, 94, 0.6)",
                                        background: "rgba(34, 197, 94, 0.1)",
                                        display: "grid", placeItems: "center",
                                        boxShadow: "0 0 15px rgba(34, 197, 94, 0.2)"
                                    }}>
                                        {loading ? <span className="mini-spinner" /> : <span style={{ fontSize: 24, fontWeight: 800, color: "#4ade80" }}>{stats.appointments}</span>}
                                    </div>
                                    <span style={{ fontSize: 11, fontWeight: 600, color: "#86efac" }}>OGGI</span>
                                </div>
                            </div>

                            {/* 2. Da Richiamare */}
                            <div
                                className="stat-circle interactive"
                                onClick={() => setExpandedView('calls')}
                                style={{ cursor: "pointer", transition: "transform 0.2s" }}
                                onMouseOver={e => e.currentTarget.style.transform = "scale(1.05)"}
                                onMouseOut={e => e.currentTarget.style.transform = "scale(1)"}
                            >
                                <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
                                    <div style={{
                                        width: 64, height: 64, borderRadius: "50%",
                                        border: "2px solid rgba(249, 115, 22, 0.6)",
                                        background: "rgba(249, 115, 22, 0.1)",
                                        display: "grid", placeItems: "center",
                                        boxShadow: "0 0 15px rgba(249, 115, 22, 0.2)"
                                    }}>
                                        {loading ? <span className="mini-spinner" /> : <span style={{ fontSize: 24, fontWeight: 800, color: "#fb923c" }}>{stats.toCall}</span>}
                                    </div>
                                    <span style={{ fontSize: 11, fontWeight: 600, color: "#fdba74" }}>RICHIAMA</span>
                                </div>
                            </div>

                            {/* 3. Obiettivo */}
                            <div>
                                <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
                                    <div style={{
                                        width: 76, height: 76, borderRadius: "50%",
                                        border: "2px solid rgba(251, 191, 36, 0.8)",
                                        background: "rgba(251, 191, 36, 0.15)",
                                        display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
                                        boxShadow: "0 0 25px rgba(251, 191, 36, 0.4)",
                                        transform: "translateY(-5px)"
                                    }}>
                                        <span style={{ fontSize: 20, fontWeight: 900, color: "#fbbf24" }}>1</span>
                                        <span style={{ fontSize: 9, fontWeight: 700, color: "#fcd34d", textTransform: "uppercase" }}>CONTRATTO</span>
                                    </div>
                                    <span style={{ fontSize: 11, fontWeight: 600, color: "#fcd34d" }}>OBIETTIVO</span>
                                </div>
                            </div>
                        </div>
                    )}

                    {!expandedView && (
                        <div style={{ marginBottom: 32, fontStyle: "italic", color: "rgba(255,255,255,0.7)", fontSize: 15, fontFamily: "serif" }}>
                            "{quote}"
                        </div>
                    )}

                    <button
                        type="button"
                        onClick={onClose}
                        style={{
                            width: "100%",
                            padding: "16px",
                            borderRadius: 16,
                            border: "none",
                            background: "linear-gradient(135deg, #8b5cf6 0%, #ec4899 100%)",
                            color: "white",
                            fontSize: 16,
                            fontWeight: 700,
                            cursor: "pointer",
                            boxShadow: "0 10px 25px rgba(236, 72, 153, 0.4)",
                            display: "flex", alignItems: "center", justifyContent: "center", gap: 10,
                            transition: "transform 0.2s"
                        }}
                        onMouseOver={(e) => e.target.style.transform = "scale(1.02)"}
                        onMouseOut={(e) => e.target.style.transform = "scale(1)"}
                    >
                        Inizia la Giornata <Rocket size={20} />
                    </button>

                </div>
            </div>
            <style>{`
        @keyframes dailyPop {
          from { opacity: 0; transform: scale(0.9) translateY(20px); }
          to { opacity: 1; transform: scale(1) translateY(0); }
        }
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(5px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .mini-spinner {
          width: 20px; height: 20px; border: 2px solid rgba(255,255,255,0.3); border-top-color: #fff; borderRadius: 50%; animation: spin 1s linear infinite;
        }
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>
        </div>
    );
}
