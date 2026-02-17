import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthProvider";
import { Calendar, ShieldCheck, ArrowRight } from "lucide-react";
import "./connect-calendar.css";

export default function ConnectCalendarPage() {
    const { connectGoogleCalendar, calendarToken } = useAuth();
    const navigate = useNavigate();
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");

    // ✅ Redirect automatico se il token appare (perché salvato in AuthProvider)
    useEffect(() => {
        if (calendarToken?.token) {
            console.log("📅 Calendar Token detected, redirecting to dashboard...");
            navigate("/dashboard", { replace: true });
        }
    }, [calendarToken, navigate]);

    const handleConnect = async () => {
        setLoading(true);
        setError("");
        try {
            await connectGoogleCalendar();
            // AuthProvider calls handleAuthSuccess which saves the token.
            // The RequireGoogleCalendar guard in App.jsx will detect the change and redirect.
        } catch (err) {
            console.error("Connection error:", err);
            setError("Impossibile collegare Google Calendar. Riprova.");
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="connect-calendar-page">
            <div className="connect-card">
                <div className="connect-logo-container">
                    <img
                        src="/logo-crm.jpg"
                        alt="Team Rise Program"
                        className="connect-logo"
                        draggable={false}
                    />
                </div>

                <div className="connect-icon-stack">
                    <div className="icon-wrapper">
                        <ShieldCheck size={32} />
                    </div>
                    <div className="icon-divider"></div>
                    <div className="icon-wrapper active">
                        <Calendar size={32} />
                    </div>
                </div>

                <h1 className="connect-title">Collega il tuo Calendario</h1>

                <p className="connect-description">
                    Per utilizzare le funzionalità del CRM e sincronizzare i tuoi appuntamenti,
                    è necessario collegare il tuo account Google Calendar.
                    Questo ci permette di gestire la tua agenda in modo sicuro e professionale.
                </p>

                {error && (
                    <div style={{ color: "#ef4444", marginBottom: "1.5rem", fontSize: "0.875rem" }}>
                        {error}
                    </div>
                )}

                <button
                    className="connect-btn"
                    onClick={handleConnect}
                    disabled={loading}
                >
                    {loading ? (
                        <div className="spinner"></div>
                    ) : (
                        <>
                            Collega Google Calendar
                            <ArrowRight size={20} />
                        </>
                    )}
                </button>

                <p className="connect-footer">
                    Connessione sicura e crittografata. Privacy garantita.
                </p>
            </div>
        </div>
    );
}
