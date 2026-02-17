
import React from "react";
import { ArrowLeft, ShieldCheck, Lock, Calendar } from "lucide-react";
import { Link } from "react-router-dom";

export default function GoogleConsentPage() {
    return (
        <div className="privacy-page" style={{
            minHeight: "100vh",
            height: "auto",
            overflowY: "auto",
            background: "#020617", /* Matched to PresentationPage & Meta Theme */
            color: "#e2e8f0",
            fontFamily: "'Inter', sans-serif",
            padding: "40px 20px"
        }}>
            <div style={{ maxWidth: 800, margin: "0 auto" }}>

                {/* Heather */}
                <div style={{ marginBottom: 40 }}>
                    <Link to="/login" style={{ display: "inline-flex", alignItems: "center", gap: 8, color: "rgba(255,255,255,0.6)", textDecoration: "none", marginBottom: 20 }}>
                        <ArrowLeft size={18} /> Torna al Login
                    </Link>
                    <h1 style={{ fontSize: 32, fontWeight: 800, color: "#fff", marginBottom: 12 }}>Privacy Policy & Google Data Usage</h1>
                    <p style={{ fontSize: 16, lineHeight: 1.6, color: "rgba(255,255,255,0.7)" }}>
                        Informativa sull'utilizzo dei dati e integrazione con Google Calendar.
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
                            <ShieldCheck size={24} color="#4ade80" />
                            <h2 style={{ fontSize: 20, fontWeight: 700, color: "#fff", margin: 0 }}>Privacy & Sicurezza</h2>
                        </div>
                        <p style={{ lineHeight: 1.6, opacity: 0.9 }}>
                            La tua privacy è fondamentale per noi. Questa applicazione (CRM Rise) raccoglie e utilizza i dati personali forniti esclusivamente per finalità funzionali alla gestione dell'attività lavorativa, inclusi la gestione dei contatti, degli appuntamenti e delle performance. Nessun dato viene venduto a terze parti.
                        </p>
                    </section>

                    {/* Section 2: Google Calendar */}
                    <section style={{ marginBottom: 40 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
                            <Calendar size={24} color="#3b82f6" />
                            <h2 style={{ fontSize: 20, fontWeight: 700, color: "#fff", margin: 0 }}>Integrazione Google Calendar</h2>
                        </div>
                        <p style={{ lineHeight: 1.6, opacity: 0.9, marginBottom: 16 }}>
                            Per offrirti un'esperienza completa, l'applicazione richiede l'accesso al tuo Google Calendar. Questo ci permette di:
                        </p>
                        <ul style={{ listStyle: "none", padding: 0, opacity: 0.9 }}>
                            <li style={{ marginBottom: 12, display: "flex", gap: 10 }}>
                                <span style={{ color: "#3b82f6" }}>✓</span>
                                <span>Visualizzare la tua disponibilità direttamente nel calendario del CRM.</span>
                            </li>
                            <li style={{ marginBottom: 12, display: "flex", gap: 10 }}>
                                <span style={{ color: "#3b82f6" }}>✓</span>
                                <span>Creare automaticamente eventi nel tuo Google Calendar quando fissi un appuntamento nel CRM.</span>
                            </li>
                            <li style={{ marginBottom: 12, display: "flex", gap: 10 }}>
                                <span style={{ color: "#3b82f6" }}>✓</span>
                                <span>Mantenere sincronizzati gli appuntamenti (modifiche o cancellazioni).</span>
                            </li>
                        </ul>
                        <div style={{ background: "rgba(59, 130, 246, 0.1)", borderLeft: "4px solid #3b82f6", padding: 16, marginTop: 24, borderRadius: 4 }}>
                            <strong style={{ color: "#fff", display: "block", marginBottom: 4 }}>Utilizzo dei Dati Google</strong>
                            <span style={{ fontSize: 13, opacity: 0.8 }}>
                                L'applicazione accede ai dati del calendario solo quando l'utente effettua esplicitamente il login con Google e concede i permessi. I dati sono utilizzati esclusivamente per la sincronizzazione bidirezionale e i dati vengono conservati solo per il tempo necessario all’erogazione delle funzionalità richieste. L’accesso ai dati Google è limitato esclusivamente a quanto strettamente necessario per il funzionamento delle funzionalità di calendario dell’applicazione. L'uso delle informazioni ricevute dalle API di Google aderisce alla <a href="https://developers.google.com/terms/api-services-user-data-policy" target="_blank" style={{ color: "#60a5fa" }}>Google API Services User Data Policy</a>, inclusi i requisiti di utilizzo limitato.
                            </span>
                        </div>
                    </section>

                    {/* Section: Google OAuth Specifics */}
                    <section style={{ marginBottom: 40 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
                            <ShieldCheck size={24} color="#ef4444" />
                            <h2 style={{ fontSize: 20, fontWeight: 700, color: "#fff", margin: 0 }}>Utilizzo dei dati Google (Google OAuth)</h2>
                        </div>
                        <p style={{ lineHeight: 1.6, opacity: 0.9, marginBottom: 16 }}>
                            La nostra applicazione utilizza Google OAuth esclusivamente per consentire all’utente di collegare il proprio account Google e gestire i propri appuntamenti tramite Google Calendar. L’accesso ai dati Google avviene solo dopo che l’utente ha effettuato il login con Google e ha fornito consenso esplicito tramite OAuth.
                        </p>

                        <div style={{ marginBottom: 16 }}>
                            <strong style={{ color: "#fff", display: "block", marginBottom: 8 }}>Dati Google trattati:</strong>
                            <ul style={{ listStyle: "none", paddingLeft: 0, opacity: 0.9 }}>
                                <li style={{ marginBottom: 6, display: "flex", gap: 10 }}>
                                    <span style={{ color: "#ef4444" }}>•</span>
                                    <span>Informazioni di base dell’account (nome, email, immagine profilo)</span>
                                </li>
                                <li style={{ marginBottom: 6, display: "flex", gap: 10 }}>
                                    <span style={{ color: "#ef4444" }}>•</span>
                                    <span>Dati del calendario dell’utente autenticato (eventi), utilizzati per creare, modificare o eliminare appuntamenti</span>
                                </li>
                            </ul>
                        </div>

                        <div style={{ marginBottom: 16 }}>
                            <strong style={{ color: "#fff", display: "block", marginBottom: 8 }}>Limitazioni di accesso:</strong>
                            <p style={{ lineHeight: 1.6, opacity: 0.9, margin: 0 }}>
                                L’applicazione accede esclusivamente al calendario dell’utente loggato. Non accede a calendari di altri utenti né a calendari condivisi o di terze parti.
                            </p>
                        </div>

                        <div style={{ marginBottom: 16 }}>
                            <strong style={{ color: "#fff", display: "block", marginBottom: 8 }}>Condivisione e trasferimento dei dati:</strong>
                            <p style={{ lineHeight: 1.6, opacity: 0.9, margin: 0 }}>
                                Non condividiamo, non trasferiamo e non divulghiamo i dati Google degli utenti a terze parti. I dati vengono utilizzati unicamente per fornire le funzionalità richieste dall’utente all’interno dell’applicazione. Non utilizziamo i dati per pubblicità o profilazione.
                            </p>
                        </div>

                        <div>
                            <strong style={{ color: "#fff", display: "block", marginBottom: 8 }}>Revoca dell’accesso:</strong>
                            <p style={{ lineHeight: 1.6, opacity: 0.9, margin: 0 }}>
                                L’utente può revocare in qualsiasi momento l’accesso dell’app ai dati Google tramite le <a href="https://myaccount.google.com/permissions" target="_blank" style={{ color: "#ef4444", textDecoration: "underline" }}>impostazioni di sicurezza del proprio account Google</a>.
                            </p>
                        </div>
                    </section>

                    {/* Section 3: Data Protection */}
                    <section>
                        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
                            <Lock size={24} color="#f59e0b" />
                            <h2 style={{ fontSize: 20, fontWeight: 700, color: "#fff", margin: 0 }}>Protezione dei Dati</h2>
                        </div>
                        <p style={{ lineHeight: 1.6, opacity: 0.9 }}>
                            I dati sono conservati in sicurezza utilizzando Firebase di Google, con protocolli di crittografia standard per il trasferimento e la conservazione. Hai il diritto di richiedere la cancellazione completa del tuo account e dei dati associati in qualsiasi momento contattando l'amministratore.
                        </p>
                    </section>

                </div>

                {/* Footer */}
                <div style={{ textAlign: "center", marginTop: 40, opacity: 0.5, fontSize: 13 }}>
                    <div>&copy; {new Date().getFullYear()} CRM Rise. All rights reserved.</div>
                    <div style={{ marginTop: 8 }}>
                        <Link to="/privacy" style={{ color: "inherit", textDecoration: "none", margin: "0 8px" }}>Privacy</Link>
                        <span>|</span>
                        <Link to="/terms" style={{ color: "inherit", textDecoration: "none", margin: "0 8px" }}>Termini</Link>
                    </div>
                </div>

            </div>
        </div>
    );
}
