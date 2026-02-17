
import React from "react";
import { ArrowLeft, FileText, Scale, ShieldAlert } from "lucide-react";
import { Link } from "react-router-dom";

export default function TermsPage() {
    return (
        <div className="terms-page" style={{
            minHeight: "100vh",
            height: "auto",
            overflowY: "auto",
            background: "#020617",
            color: "#e2e8f0",
            fontFamily: "'Inter', sans-serif",
            padding: "40px 20px"
        }}>
            <div style={{ maxWidth: 800, margin: "0 auto" }}>

                {/* Header */}
                <div style={{ marginBottom: 40 }}>
                    <Link to="/login" style={{ display: "inline-flex", alignItems: "center", gap: 8, color: "rgba(255,255,255,0.6)", textDecoration: "none", marginBottom: 20 }}>
                        <ArrowLeft size={18} /> Torna al Login
                    </Link>
                    <h1 style={{ fontSize: 32, fontWeight: 800, color: "#fff", marginBottom: 12 }}>Termini di Servizio</h1>
                    <p style={{ fontSize: 16, lineHeight: 1.6, color: "rgba(255,255,255,0.7)" }}>
                        Ultimo aggiornamento: {new Date().getFullYear()}
                    </p>
                </div>

                {/* Card */}
                <div style={{
                    background: "rgba(30, 41, 59, 0.5)",
                    border: "1px solid rgba(255,255,255,0.08)",
                    borderRadius: 16,
                    padding: 32
                }}>

                    {/* Section 1: Introduction */}
                    <section style={{ marginBottom: 40 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
                            <FileText size={24} color="#38bdf8" />
                            <h2 style={{ fontSize: 20, fontWeight: 700, color: "#fff", margin: 0 }}>Introduzione</h2>
                        </div>
                        <p style={{ lineHeight: 1.6, opacity: 0.9 }}>
                            Benvenuto su <strong>Team Rise CRM</strong>. L'utilizzo di questa applicazione è riservato esclusivamente ai membri autorizzati del team. Accedendo alla piattaforma, accetti di utilizzare gli strumenti forniti solo per scopi lavorativi professionali e nel rispetto delle normative vigenti.
                        </p>
                    </section>

                    {/* Section 2: Usage Rules */}
                    <section style={{ marginBottom: 40 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
                            <Scale size={24} color="#a78bfa" />
                            <h2 style={{ fontSize: 20, fontWeight: 700, color: "#fff", margin: 0 }}>Regole di Utilizzo</h2>
                        </div>
                        <ul style={{ listStyle: "none", padding: 0, opacity: 0.9 }}>
                            <li style={{ marginBottom: 12, display: "flex", gap: 10 }}>
                                <span style={{ color: "#a78bfa" }}>•</span>
                                <span>È vietato condividere le proprie credenziali di accesso con terzi non autorizzati.</span>
                            </li>
                            <li style={{ marginBottom: 12, display: "flex", gap: 10 }}>
                                <span style={{ color: "#a78bfa" }}>•</span>
                                <span>I dati dei clienti presenti nel CRM sono confidenziali e non devono essere esportati o utilizzati al di fuori delle attività previste dal team.</span>
                            </li>
                            <li style={{ marginBottom: 12, display: "flex", gap: 10 }}>
                                <span style={{ color: "#a78bfa" }}>•</span>
                                <span>L'amministratore si riserva il diritto di sospendere l'account in caso di uso improprio o violazione delle policy aziendali.</span>
                            </li>
                        </ul>
                    </section>

                    {/* Section 3: Liability */}
                    <section>
                        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
                            <ShieldAlert size={24} color="#facc15" />
                            <h2 style={{ fontSize: 20, fontWeight: 700, color: "#fff", margin: 0 }}>Limitazione di Responsabilità</h2>
                        </div>
                        <p style={{ lineHeight: 1.6, opacity: 0.9 }}>
                            Team Rise CRM è fornito "così com'è" per supportare l'attività lavorativa. Non siamo responsabili per eventuali interruzioni del servizio, perdita di dati accidentale o danni derivanti dall'uso non corretto della piattaforma.
                        </p>
                    </section>

                </div>

                {/* Footer */}
                <div style={{ textAlign: "center", marginTop: 40, opacity: 0.5, fontSize: 13 }}>
                    &copy; {new Date().getFullYear()} CRM Rise. All rights reserved.
                </div>

            </div>
        </div>
    );
}
