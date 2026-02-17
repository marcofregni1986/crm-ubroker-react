
import React from "react";
import { Link } from "react-router-dom";
import { ShieldCheck, ArrowRight, LayoutDashboard, BarChart3, Users, Zap, Calendar, Target } from "lucide-react";

export default function PresentationPage() {
    return (
        <div style={{
            position: "fixed",
            inset: 0,
            width: "100%",
            height: "100dvh",
            overflow: "hidden", // NO SCROLL - Forces fit to screen
            zIndex: 9999,
            background: "#020617",
            color: "#f8fafc",
            fontFamily: "'Inter', sans-serif",
            display: "flex",
            flexDirection: "column"
        }}>

            {/* BACKGROUND ELEMENTS */}
            <div className="bg-gradient-orb-left" />
            <div className="bg-gradient-orb-right" />
            <div className="bg-grid-pattern" style={{ height: "100vh" }} />

            {/* --- NAVBAR --- */}
            <nav style={{
                display: "flex", alignItems: "center", justifyContent: "space-between",
                padding: "24px 60px 0", // Reduced bottom padding, just top and sides
                width: "100%", boxSizing: "border-box",
                position: "relative", zIndex: 10,
                flexShrink: 0 // Prevent navbar from crushing
            }}>
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                    <span style={{ fontWeight: 700, fontSize: 16, letterSpacing: -0.5, color: "#cbd5e1" }}>Team Rise</span>
                </div>

                <Link
                    to="/login"
                    className="nav-btn"
                    style={{
                        padding: "10px 24px",
                        borderRadius: 50,
                        border: "1px solid rgba(255,255,255,0.1)",
                        background: "rgba(255,255,255,0.03)",
                        color: "#fff",
                        textDecoration: "none",
                        fontSize: 14, fontWeight: 600,
                        backdropFilter: "blur(10px)"
                    }}
                >
                    Area Riservata
                </Link>
            </nav>

            {/* --- HERO SPLIT SECTION --- */}
            <div style={{
                flex: 1,
                display: "flex",
                alignItems: "center", // VERTICALLY CENTER CONTENT
                width: "100%",
                padding: "0 5%",
                gap: "5%",
                position: "relative",
                zIndex: 5,
                height: "100%", // Take full remaining height
                boxSizing: "border-box"
            }}>

                {/* LEFT COL: CONTENT */}
                {/* LEFT COL: CONTENT */}
                {/* LEFT COL: CONTENT */}
                <div className="hero-content" style={{
                    flex: 1, minWidth: 300,
                    display: "flex", flexDirection: "column", justifyContent: "center",
                    alignItems: "flex-start",
                    paddingLeft: "40px"
                }}>

                    {/* LOGO CARD - Compacted */}
                    <div style={{
                        display: "flex", justifyContent: "center", alignItems: "center",
                        padding: "24px 32px", background: "white", borderRadius: 32,
                        boxShadow: "0 20px 80px -10px rgba(59, 130, 246, 0.4)",
                        marginBottom: 32, // Reduced from 48
                        animation: "fadeInLeft 0.8s ease",
                    }}>
                        <img src="/rise-logo-program.png" alt="Rise Logo" style={{ width: 240, height: "auto", display: "block" }} />
                    </div>

                    <div style={{
                        display: "inline-flex", alignItems: "center", gap: 8,
                        marginBottom: 16, animation: "fadeInLeft 0.8s ease 0.1s backwards", // Reduced from 24
                        background: "rgba(255,255,255,0.05)", padding: "6px 14px", borderRadius: 100,
                        border: "1px solid rgba(255,255,255,0.1)"
                    }}>
                        <div style={{ width: 6, height: 6, borderRadius: "50%", background: "#4ade80", boxShadow: "0 0 10px #4ade80" }} />
                        <span style={{
                            color: "#e2e8f0", fontSize: 12, fontWeight: 600, letterSpacing: 0.5
                        }}>
                            CRM ENTERPRISE V2.0
                        </span>
                    </div>

                    <h1 style={{
                        fontSize: "clamp(36px, 2.5vw, 52px)", // slightly smaller
                        fontWeight: 800,
                        lineHeight: 1.1,
                        marginBottom: 16, // Reduced from 24
                        letterSpacing: "-0.01em",
                        animation: "fadeInLeft 0.8s ease 0.1s backwards",
                        color: "#fff"
                    }}>
                        L'Ecosistema per<br />
                        <span style={{
                            background: "linear-gradient(135deg, #60a5fa 0%, #a78bfa 100%)",
                            WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent"
                        }}>il tuo Successo.</span>
                    </h1>

                    <p style={{
                        fontSize: "16px", color: "#94a3b8", lineHeight: 1.5, maxWidth: 550, marginBottom: 32, // Reduced from 40
                        animation: "fadeInLeft 0.8s ease 0.2s backwards"
                    }}>
                        La piattaforma all-in-one progettata per massimizzare le performance commerciali del tuo team.
                    </p>

                    <ul style={{
                        margin: "0 0 32px 0", padding: 0, listStyle: "none", // Reduced from 48
                        display: "flex", flexDirection: "column", gap: 16, // Reduced from 24
                        animation: "fadeInLeft 0.8s ease 0.25s backwards"
                    }}>
                        <FeaturePoint
                            icon={<Users color="#38bdf8" size={20} />}
                            title="Archivio Clienti"
                            desc="Gestione completa dello storico e status lead."
                        />
                        <FeaturePoint
                            icon={<Calendar color="#a78bfa" size={20} />}
                            title="Smart Agenda"
                            desc="Sync bidirezionale con Google Calendar."
                        />
                        <FeaturePoint
                            icon={<Target color="#facc15" size={20} />}
                            title="Obiettivi e KPI"
                            desc="Monitoraggio real-time delle performance."
                        />
                    </ul>

                    <div style={{ display: "flex", gap: 20, alignItems: "center", animation: "fadeInLeft 0.8s ease 0.3s backwards" }}>
                        <Link
                            to="/login"
                            className="btn-primary"
                            style={{
                                display: "inline-flex", alignItems: "center", gap: 10,
                                padding: "18px 48px", borderRadius: 50,
                                background: "#2563eb", color: "#fff",
                                textDecoration: "none", fontSize: 16, fontWeight: 700,
                                boxShadow: "0 10px 40px -10px rgba(37, 99, 235, 0.6)",
                                letterSpacing: 0.5
                            }}
                        >
                            Accedi alla Piattaforma <ArrowRight size={18} />
                        </Link>
                    </div>

                    <div style={{ marginTop: 30, display: "flex", gap: 30, opacity: 0.5, animation: "fadeInLeft 0.8s ease 0.4s backwards", fontSize: 12 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                            <ShieldCheck size={16} color="#4ade80" />
                            <span>Crittografia End-to-End</span>
                        </div>
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                            <Zap size={16} color="#fbbf24" />
                            <span>Uptime 99.9%</span>
                        </div>
                    </div>

                </div>

                {/* RIGHT COL: VISUAL (ECOSYSTEM IMAGE) */}
                <div className="hero-visual" style={{
                    flex: 1, display: "flex", justifyContent: "center", alignItems: "center",
                    animation: "fadeInRight 1s ease 0.2s backwards",
                    height: "100%" // Ensure full height for centering
                }}>
                    <img
                        src="/rise-ecosystem-hero.png"
                        alt="Rise CRM Ecosystem"
                        style={{
                            width: "130%", maxWidth: 1100, // Even larger image presence
                            height: "auto",
                            filter: "drop-shadow(0 0 60px rgba(37,99,235,0.3))",
                            transform: "scale(1.1) translateX(40px) rotateY(-5deg)",
                            borderRadius: 24,
                            maxHeight: "85vh",
                            objectFit: "contain" // Ensure it doesn't overflow vertically if too tall
                        }}
                    />
                </div>

            </div>

            {/* --- FLOATING FOOTER --- */}
            <div style={{
                position: "absolute", bottom: 20, width: "100%", textAlign: "center",
                zIndex: 5
            }}>
                <Link to="/privacy" style={{ fontSize: 12, color: "rgba(255,255,255,0.3)", textDecoration: "none" }}>
                    Privacy Policy & Google Data
                </Link>
                <span style={{ margin: "0 10px", color: "rgba(255,255,255,0.2)" }}>|</span>
                <Link to="/terms" style={{ fontSize: 12, color: "rgba(255,255,255,0.3)", textDecoration: "none" }}>
                    Termini di Servizio
                </Link>
            </div>

            <style>{`
        /* Animations */
        @keyframes fadeInLeft { from { opacity: 0; transform: translateX(-40px); } to { opacity: 1; transform: translateX(0); } }
        @keyframes fadeInRight { from { opacity: 0; transform: translateX(40px); } to { opacity: 1; transform: translateX(0); } }

        /* Backgrounds */
        .bg-gradient-orb-left {
          position: absolute; top: -100px; left: -200px; width: 600px; height: 600px;
          background: radial-gradient(circle, rgba(37,99,235,0.15) 0%, rgba(0,0,0,0) 70%);
          filter: blur(80px); z-index: 0;
        }
        .bg-gradient-orb-right {
          position: absolute; bottom: 0; right: -100px; width: 800px; height: 800px;
          background: radial-gradient(circle, rgba(167,139,250,0.1) 0%, rgba(0,0,0,0) 70%);
          filter: blur(100px); z-index: 0;
        }
        .bg-grid-pattern {
          position: absolute; inset: 0;
          background-image: linear-gradient(rgba(255,255,255,0.02) 1px, transparent 1px),
            linear-gradient(90deg, rgba(255,255,255,0.02) 1px, transparent 1px);
          background-size: 60px 60px;
          opacity: 0.6; pointer-events: none; z-index: 0;
        }

        /* Buttons */
        .btn-primary:hover { transform: translateY(-3px); box-shadow: 0 20px 50px -10px rgba(37, 99, 235, 0.8); }
        .nav-btn:hover { background: rgba(255,255,255,0.1) !important; color: #fff; }

        /* Responsive Logic */
        @media (max-width: 1024px) {
           /* ALLOW SCROLLING IF CONTENT IS TOO TALL */
           div[style*="overflow: hidden"] { 
               overflow-y: auto !important; 
               overflow-x: hidden !important; 
               height: auto !important; 
               min-height: 100dvh !important;
               position: relative !important; /* Unfix to allow native scroll */
               inset: auto !important;
           } 
           
           .hero-visual { display: none !important; }

           /* Navbar Compact */
           nav { 
               padding: 15px 20px 0 !important; 
               position: relative !important;
               flex-shrink: 0 !important;
           }

           /* Main Content Container */
           .hero-content { 
             text-align: center !important; 
             align-items: center !important; 
             justify-content: flex-start !important; /* Start from top + margin */
             display: flex !important; 
             flex-direction: column !important; 
             padding: 20px 30px 100px 30px !important; /* Bottom padding for footer */
             width: 100% !important;
             min-height: fit-content !important;
           }

           /* SCALING ELEMENTS TO FIT VERTICALLY */
           
           /* Logo Container */
           div[style*="borderRadius: 32"] {
               padding: 20px 30px !important;
               margin-top: 2vh !important; /* Add space from navbar */
               margin-bottom: 2vh !important;
               margin-left: auto !important;
               margin-right: auto !important;
               border-radius: 28px !important;
           }
           /* Slightly reduce logo size for safety */
           img[alt="Rise Logo"] { width: 160px !important; max-width: 100% !important; }

           /* Badge */
           div[style*="borderRadius: 100"] {
               margin-bottom: 2vh !important;
               padding: 5px 16px !important;
               gap: 8px !important;
               margin-left: auto !important;
               margin-right: auto !important;
           }
           div[style*="fontSize: 12"] { fontSize: 11px !important; }

           /* Title */
           h1 { 
               font-size: 28px !important; /* slightly smaller to fit better */
               line-height: 1.1 !important;
               margin-bottom: 2vh !important;
               text-align: center !important;
               width: 100% !important;
           }

           /* Description */
           p { 
               font-size: 14px !important; 
               margin-bottom: 3vh !important; 
               max-width: 90% !important;
               margin-left: auto !important;
               margin-right: auto !important;
               text-align: center !important;
           }

           /* Feature List */
           /* Center EVERYTHING */
           ul { 
             display: flex !important;
             flex-direction: column !important;
             align-items: center !important; 
             width: 100% !important;
             margin-bottom: 3vh !important;
             padding: 0 !important;
             gap: 20px !important;
           }
           
           li { 
               display: flex !important;
               flex-direction: column !important; /* Stack icon and text for perfect center */
               align-items: center !important;
               justify-content: center !important; 
               text-align: center !important;
               width: 100% !important;
               margin: 0 !important;
           }
           
           li > div:first-child {
               margin-bottom: 8px !important;
               margin-top: 0 !important;
           }
           
           strong { font-size: 15px !important; }
           span { font-size: 13px !important; color: #94a3b8 !important; }

           /* Buttons */
           .btn-primary {
               padding: 16px 40px !important;
               font-size: 15px !important;
               width: 100% !important;
               max-width: 300px !important;
               justify-content: center !important;
           }
           div[style*="display: flex"][style*="gap: 20"] {
             justify-content: center !important;
             width: 100% !important;
             margin-bottom: 40px !important; /* ensure space before footer */
           }
           
           /* Badges Footer (Encryption etc) */
           div[style*="marginTop: 30"] { 
               margin-top: 2vh !important; 
               padding-bottom: 40px !important;
               gap: 20px !important;
               justify-content: center !important;
               width: 100% !important;
               display: none !important; /* Hide non-essential footer badges on mobile to save space if needed, OR keep them but ensure space */
           }
           /* Actually let's keep them but ensure padding */
           
           /* Privacy Link Footer specific positioning for mobile scroll */
           /* We need to target the footer div */
        }
        
        /* Mobile Footer override: make it static/relative at bottom of flow, not absolute fixed */
        @media (max-width: 1024px) {
             div[style*="position: absolute"][style*="bottom: 20"] {
                 position: relative !important;
                 bottom: auto !important;
                 padding: 20px 0 40px 0 !important;
                 margin-top: auto !important;
             }
        }
      `}</style>
        </div>
    );
}

function FeaturePoint({ icon, title, desc }) {
    return (
        <li style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
            <div style={{ marginTop: 2, background: "rgba(255,255,255,0.05)", padding: 6, borderRadius: 8 }}>{icon}</div>
            <div>
                <strong style={{ display: "block", fontSize: 15, color: "#fff", marginBottom: 2 }}>{title}</strong>
                <span style={{ fontSize: 13, color: "#94a3b8" }}>{desc}</span>
            </div>
        </li>
    );
}

