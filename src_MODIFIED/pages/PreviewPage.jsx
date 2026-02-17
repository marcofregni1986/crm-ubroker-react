import React from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft } from "lucide-react";

export default function PreviewPage() {
    const navigate = useNavigate();

    return (
        <div style={{
            minHeight: "100vh",
            background: "var(--bg-main, #0f172a)",
            color: "var(--text-main, #f8fafc)",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            padding: 24,
            fontFamily: "var(--font-sans, sans-serif)"
        }}>
            <div style={{
                maxWidth: 800,
                width: "100%",
                textAlign: "center"
            }}>
                <h1 style={{ fontSize: "clamp(2rem, 5vw, 3.5rem)", fontWeight: 800, marginBottom: 16, background: "linear-gradient(135deg, #fbbf24, #d97706)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>
                    Anteprima Web App
                </h1>

                <p style={{ fontSize: "1.2rem", color: "#94a3b8", marginBottom: 40, lineHeight: 1.6 }}>
                    Questa è la pagina di anteprima locale.
                    <br />
                    Qui puoi visualizzare componenti, layout o funzionalità speciali prima del rilascio.
                </p>

                <div style={{ display: "flex", gap: 16, justifyContent: "center", flexWrap: "wrap" }}>
                    <button
                        onClick={() => navigate("/login")}
                        style={{
                            padding: "12px 24px",
                            borderRadius: 12,
                            border: "1px solid rgba(255,255,255,0.1)",
                            background: "rgba(255,255,255,0.05)",
                            color: "white",
                            fontSize: 16,
                            fontWeight: 600,
                            cursor: "pointer",
                            transition: "all 0.2s"
                        }}
                    >
                        Vai al Login
                    </button>

                    <button
                        onClick={() => navigate("/dashboard")}
                        style={{
                            padding: "12px 24px",
                            borderRadius: 12,
                            background: "#fbbf24",
                            color: "#0f172a",
                            border: "none",
                            fontSize: 16,
                            fontWeight: 700,
                            cursor: "pointer",
                            transition: "all 0.2s"
                        }}
                    >
                        Vai alla Dashboard
                    </button>
                </div>
            </div>
        </div>
    );
}
