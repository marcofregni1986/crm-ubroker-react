import React, { useState, useMemo, useRef } from "react";
import { useAuth } from "../auth/useAuth";
import DigitalBusinessCard from "../components/DigitalBusinessCard";
import { User, QrCode, Mail, Phone, Building, Camera, Loader2 } from "lucide-react";
import { storage, db } from "../firebase"; // ✅ Import storage
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { doc, updateDoc } from "firebase/firestore";
import "./profile.css";

export default function ProfilePage() {
    const { profile, firebaseUser, loading } = useAuth();
    const [showBusinessCard, setShowBusinessCard] = useState(false);
    const [uploading, setUploading] = useState(false);
    const [uploadedPhotoURL, setUploadedPhotoURL] = useState(null); // ✅ Local state for immediate update
    const fileInputRef = useRef(null);

    // Fallback user data
    const user = useMemo(() => {
        return {
            uid: profile?.uid || firebaseUser?.uid,
            name: profile?.nome || profile?.name || "Utente",
            surname: profile?.cognome || "",
            email: profile?.email || firebaseUser?.email || "",
            phone: profile?.telefono || profile?.phone || profile?.tel || profile?.phoneNumber || "-",
            role: "Business Partner",
            photoURL: uploadedPhotoURL || profile?.photoURL || firebaseUser?.photoURL || null
        };
    }, [profile, firebaseUser, uploadedPhotoURL]);

    if (loading) {
        return (
            <div className="main profile-page">
                <div style={{ padding: 32 }}>Caricamento profilo...</div>
            </div>
        );
    }

    const handleAvatarClick = () => {
        if (fileInputRef.current) {
            fileInputRef.current.click();
        }
    };

    const handleFileChange = async (e) => {
        const file = e.target.files[0];
        if (!file || !user.uid) return;

        setUploading(true);
        try {
            // 1. Upload file
            const storageRef = ref(storage, `profile_photos/${user.uid}`);
            await uploadBytes(storageRef, file);

            // 2. Get URL
            const url = await getDownloadURL(storageRef);

            // 3. Update Firestore
            const userDocRef = doc(db, "users", user.uid);
            await updateDoc(userDocRef, {
                photoURL: url
            });

            // ✅ Update local state immediately
            setUploadedPhotoURL(url);

            // Note: useAuth should detect changes if it listens to real-time updates, 
            // otherwise a reload might be needed to see it immediately.
            alert("Foto profilo aggiornata!");

        } catch (error) {
            console.error("Error uploading photo:", error);
            alert("Errore caricamento foto: " + error.message);
        } finally {
            setUploading(false);
        }
    };

    return (
        <div className="main profile-page">

            {/* HEADER */}
            <div className="profile-header">
                <div>
                    <div className="profile-title">Il Mio Profilo</div>
                    <div className="profile-subtitle">Gestisci le tue informazioni e il tuo biglietto da visita digitale.</div>
                </div>
                <button
                    onClick={() => setShowBusinessCard(true)}
                    className="profile-btn-qr"
                >
                    <QrCode size={20} />
                    <span>Apri Biglietto</span>
                </button>
            </div>

            <div className="profile-grid">

                {/* MAIN INFO CARD */}
                <div className="profile-card">
                    <div className="profile-user-header">

                        {/* Avatar with Upload */}
                        <div className="profile-avatar-container" onClick={handleAvatarClick}>
                            <div className="profile-avatar">
                                {user.photoURL ? (
                                    <img src={user.photoURL} alt="Profile" className="profile-avatar-img" />
                                ) : (
                                    (user.name[0] || "U").toUpperCase()
                                )}

                                {/* Overlay Upload */}
                                <div className="profile-avatar-overlay">
                                    {uploading ? <Loader2 className="animate-spin" /> : <Camera size={24} />}
                                </div>
                            </div>
                            <input
                                type="file"
                                ref={fileInputRef}
                                style={{ display: "none" }}
                                accept="image/*"
                                onChange={handleFileChange}
                            />
                        </div>

                        <div className="profile-user-info">
                            <h2>{user.name} {user.surname}</h2>
                            <div className="profile-user-role">{user.role}</div>
                            <div className="profile-user-action">Clicca sulla foto per cambiarla</div>
                        </div>
                    </div>

                    <div className="profile-fields">
                        <ProfileField icon={Mail} label="Email" value={user.email} />
                        <ProfileField icon={Phone} label="Telefono" value={user.phone} />
                        <ProfileField icon={Building} label="Azienda" value="Rise Program by Ubroker" />
                    </div>
                </div>

                {/* SIDEBAR ACTION */}
                <div>
                    <div
                        onClick={() => setShowBusinessCard(true)}
                        className="profile-action-card"
                    >
                        <div className="profile-action-bg-icon">
                            <QrCode size={120} />
                        </div>
                        <div className="profile-action-title">Digital Card</div>
                        <div className="profile-action-desc">
                            Condividi i tuoi contatti in un attimo con un tocco.
                        </div>
                        <div className="profile-action-link">
                            Mostra QR <span>→</span>
                        </div>
                    </div>
                </div>

            </div>

            <DigitalBusinessCard
                isOpen={showBusinessCard}
                onClose={() => setShowBusinessCard(false)}
            />
        </div>
    );
}

function ProfileField({ icon: Icon, label, value }) {
    return (
        <div className="profile-field-item">
            <div className="profile-field-icon">
                <Icon size={20} />
            </div>
            <div>
                <div className="profile-field-label">{label}</div>
                <div className="profile-field-value">{value}</div>
            </div>
        </div>
    );
}
