import React, { useMemo } from "react";
import QRCode from "react-qr-code";
import { X, Share2 } from "lucide-react";
import { useAuth } from "../auth/useAuth";
import "./DigitalBusinessCard.css"; // ✅ Import custom CSS

const DigitalBusinessCard = ({ isOpen, onClose }) => {
    const { profile, firebaseUser } = useAuth();

    const userDetails = useMemo(() => {
        const name = profile?.nome || profile?.name || "";
        const surname = profile?.cognome || "";
        const fullName = (name + " " + surname).trim() || firebaseUser?.email || "Utente Rise";

        // Fallback logic for phone similar to Sidebar
        let phone =
            profile?.telefono ||
            profile?.phone ||
            profile?.tel ||
            profile?.phoneNumber ||
            "";

        if (!phone) {
            try {
                const s = JSON.parse(localStorage.getItem("crm_session") || "{}");
                phone = s?.phone || "";
            } catch { }
        }

        return {
            name: fullName,
            phone: String(phone).trim(),
            email: firebaseUser?.email || "",
            role: "Business Partner", // Default title, could be dynamic
            company: "Rise Program by Ubroker",
            photoURL: profile?.photoURL || firebaseUser?.photoURL || null
        };
    }, [profile, firebaseUser]);

    // Generate Public URL for QR Code
    const cardUrl = useMemo(() => {
        // Usa window.location.origin per essere dinamico (localhost o dominio vero)
        // E fallback su firebaseUser.uid se profile.uid non c'è (dovrebbe esserci sempre auth cmq)
        const uid = profile?.uid || firebaseUser?.uid;
        if (!uid) return "";

        return `${window.location.origin}/card/${uid}`;
    }, [profile, firebaseUser]);

    if (!isOpen) return null;

    return (
        <div className="dbc-overlay" onClick={onClose}>
            <div className="dbc-modal" onClick={e => e.stopPropagation()}>

                {/* Header Background Effect */}
                <div className="dbc-header-bg">
                    <div className="dbc-header-glow"></div>
                </div>

                {/* Close Button */}
                <button onClick={onClose} className="dbc-close-btn" aria-label="Chiudi">
                    <X size={20} />
                </button>

                {/* Content */}
                <div className="dbc-content">

                    {/* Avatar/Logo Area */}
                    <div className="dbc-avatar-wrapper">
                        {userDetails.photoURL ? (
                            <img src={userDetails.photoURL} alt="Profile" className="dbc-avatar-img" />
                        ) : (
                            <div className="dbc-avatar-text">
                                {(userDetails.name[0] || "R").toUpperCase()}
                            </div>
                        )}
                        <div className="dbc-avatar-glow"></div>
                    </div>

                    {/* User Info */}
                    <div className="dbc-name">
                        {userDetails.name}
                    </div>
                    <div className="dbc-role">
                        {userDetails.role}
                    </div>

                    {/* QR Code Container */}
                    <div className="dbc-qr-box">
                        <QRCode
                            value={cardUrl}
                            size={180}
                            level="M"
                            fgColor="#0f172a" // Slate-900
                            bgColor="#ffffff"
                        />
                    </div>

                    {/* ✅ PREVIEW LINK */}
                    {cardUrl && (
                        <a
                            href={cardUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="dbc-preview-link"
                        >
                            Apri pagina nel browser ↗
                        </a>
                    )}

                    {/* Brand Footer */}
                    <div className="dbc-brand-footer">
                        <div className="dbc-brand-main">Rise Program</div>
                        <div className="dbc-brand-sub">by Ubroker</div>
                    </div>

                    {/* Action Hint */}
                    <div className="dbc-hint">
                        <Share2 size={12} />
                        <span>Scansiona per salvare</span>
                    </div>

                </div>
            </div>
        </div>
    );
};

export default DigitalBusinessCard;
