import React, { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { doc, getDoc } from "firebase/firestore";
import { db } from "../firebase";
import { UserPlus, Phone, Mail, Globe, MapPin, Loader2, Share2, QrCode, Plus } from "lucide-react";
import "./public-card.css";

export default function PublicCardPage() {
    const { uid } = useParams();
    const [userData, setUserData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(false);

    useEffect(() => {
        async function fetchUser() {
            if (!uid) {
                setError(true);
                setLoading(false);
                return;
            }

            try {
                const docRef = doc(db, "users", uid);
                const docSnap = await getDoc(docRef);

                if (docSnap.exists()) {
                    setUserData(docSnap.data());
                } else {
                    setError(true);
                }
            } catch (err) {
                console.error("Error fetching card data:", err);
                setError(true);
            } finally {
                setLoading(false);
            }
        }

        fetchUser();
    }, [uid]);

    const handleDownloadVCard = () => {
        if (!userData) return;

        const name = userData.nome || userData.name || "Utente";
        const surname = userData.cognome || "";
        const fullName = `${name} ${surname}`.trim();
        const phone = userData.telefono || userData.phone || "";
        const email = userData.email || "";

        const vCardContent = `BEGIN:VCARD
VERSION:3.0
FN:${fullName}
N:${surname};${name};;;
ORG:Rise Program by Ubroker
TITLE:Business Partner
TEL;TYPE=CELL:${phone}
EMAIL:${email}
END:VCARD`;

        const blob = new Blob([vCardContent], { type: "text/vcard" });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = `${fullName || "contact"}.vcf`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    if (loading) {
        return (
            <div className="public-card-page">
                <Loader2 className="animate-spin text-amber-500" size={48} />
            </div>
        );
    }

    if (error || !userData) {
        return (
            <div className="public-card-page">
                <div className="pc-container" style={{ textAlign: "center", padding: 32 }}>
                    <h2 style={{ fontSize: 24, fontWeight: 800, marginBottom: 16 }}>Utente non trovato</h2>
                    <p style={{ color: "#94a3b8" }}>Il profilo che stai cercando non esiste o è stato rimosso.</p>
                </div>
            </div>
        );
    }

    const name = userData.nome || userData.name || "Utente";
    const surname = userData.cognome || "";
    const fullName = `${name} ${surname}`.trim();
    const phone = userData.telefono || userData.phone || "";
    const email = userData.email || "";
    // const role = userData.role || "Business Partner"; // Use static for now or from DB if available
    const role = "Business Partner";
    const company = "Rise Program";

    // Fallback image if no photoURL
    const hasPhoto = Boolean(userData.photoURL);

    return (
        <div className="public-card-page">

            {/* 1. HERO SECTION (Image + Text Overlay) */}
            <div className={`pc-hero ${!hasPhoto ? 'no-photo' : ''}`}>
                {hasPhoto ? (
                    <img src={userData.photoURL} alt={fullName} className="pc-hero-img" />
                ) : (
                    <div className="pc-hero-placeholder">
                        <span>{(name[0] || "U").toUpperCase()}</span>
                    </div>
                )}

                {/* Gradient Overlay for Text Readability */}
                <div className="pc-hero-gradient"></div>

                {/* Text Overlay */}
                <div className="pc-hero-content">
                    <h1 className="pc-hero-name">
                        {name}<br />
                        <span style={{ fontWeight: 300 }}>{surname}</span>
                    </h1>
                    <div className="pc-hero-role">{role}</div>

                    <div className="pc-hero-company">
                        <img src="/rise-logo.png" alt="Rise Logo" className="pc-company-logo-img" />
                        <div className="pc-company-text">Rise Program</div>
                    </div>
                </div>
            </div>

            {/* 2. ICON ACTIONS ROW */}
            <div className="pc-icon-row">
                {phone && (
                    <a href={`tel:${phone}`} className="pc-icon-btn">
                        <Phone size={24} />
                    </a>
                )}
                {email && (
                    <a href={`mailto:${email}`} className="pc-icon-btn">
                        <Mail size={24} />
                    </a>
                )}
                <a href="https://ubroker.it" target="_blank" rel="noopener noreferrer" className="pc-icon-btn">
                    <Globe size={24} />
                </a>
                <button onClick={() => {
                    if (navigator.share) {
                        navigator.share({
                            title: fullName,
                            text: `Contatto Rise Program: ${fullName}`,
                            url: window.location.href
                        }).catch(console.error);
                    } else {
                        alert("Link copiato!");
                        navigator.clipboard.writeText(window.location.href);
                    }
                }}
                    className="pc-icon-btn"
                >
                    <Share2 size={24} />
                </button>
            </div>

            {/* 3. CONTENT SECTION (About) */}
            <div className="pc-content-area">
                <div className="pc-card-section">
                    <h3 className="pc-section-title">About Me</h3>
                    <div className="pc-section-text">
                        <p style={{ margin: 0, fontWeight: 700, color: "#fff" }}>Co-Founder – Team Rise Program</p>
                        <p style={{ margin: "4px 0", fontWeight: 700, color: "#e2e8f0" }}>Partner Associato uBroker</p>
                        <p style={{ margin: "16px 0 4px 0" }}>Sviluppo reti commerciali strutturate</p>
                        <p style={{ margin: 0 }}>Modelli di crescita scalabili e sostenibili</p>
                    </div>
                </div>
            </div>

            {/* 4. BOTTOM BAR (Sticky) */}
            <div className="pc-bottom-bar">
                <button onClick={handleDownloadVCard} className="pc-save-btn">
                    <UserPlus size={20} />
                    <span>Salva Contatto</span>
                </button>

                {/* Optional secondary button, e.g. Call or More */}
                {/* <button className="pc-more-btn">
                    <Plus size={24} />
                </button> */}
            </div>

        </div>
    );
}
