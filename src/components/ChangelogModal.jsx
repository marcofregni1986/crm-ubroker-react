import React from 'react';
import { X, Sparkles } from 'lucide-react';

/**
 * ChangelogModal
 * Componente premium per annunciare le novità agli utenti.
 */
export default function ChangelogModal({ isOpen, onClose, data }) {
    if (!isOpen || !data) return null;

    return (
        <div style={{
            position: 'fixed', inset: 0, zIndex: 10000,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(10px)',
            padding: '20px', animation: 'fadeIn 0.3s ease-out'
        }} onClick={onClose}>
            <style>{`
        @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
        @keyframes popIn { from { transform: scale(0.95); opacity: 0; } to { transform: scale(1); opacity: 1; } }
      `}</style>

            <div
                style={{
                    width: '100%', maxWidth: 500, background: '#0f172a', borderRadius: 32,
                    overflow: 'hidden', position: 'relative', animation: 'popIn 0.4s cubic-bezier(0.34, 1.56, 0.64, 1)',
                    boxShadow: '0 25px 50px -12px rgba(0,0,0,0.5), 0 0 40px rgba(139, 92, 246, 0.2)',
                    border: '1px solid rgba(255,255,255,0.1)'
                }}
                onClick={e => e.stopPropagation()}
            >
                {/* Pulsante Chiusura */}
                <button
                    onClick={onClose}
                    style={{
                        position: 'absolute', right: 20, top: 20, zIndex: 10,
                        background: 'rgba(0,0,0,0.5)', border: 'none', color: '#fff',
                        width: 36, height: 36, borderRadius: '50%', cursor: 'pointer',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        backdropFilter: 'blur(4px)'
                    }}
                >
                    <X size={20} />
                </button>

                {/* Immagine News con Effetto 3D Mockup */}
                {data.imageUrl && (
                    <div style={{
                        width: '100%', height: 320,
                        position: 'relative',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        background: 'radial-gradient(circle at center, rgba(139, 92, 246, 0.15) 0%, transparent 70%)',
                        perspective: '1000px',
                        overflow: 'hidden' // Assicura che nulla esca dal container
                    }}>
                        {/* CSS Phone Frame */}
                        <div style={{
                            width: '260px', height: 'auto', maxHeight: '500px', // Lascia che l'immagine definisca l'altezza ma max
                            borderRadius: '24px',
                            border: '4px solid #1e293b',
                            boxShadow: '0 25px 50px -12px rgba(0,0,0,0.5), 0 0 0 1px rgba(255,255,255,0.1)',
                            overflow: 'hidden',
                            transform: 'rotateX(5deg) scale(0.95)',
                            transition: 'transform 0.4s ease',
                            position: 'relative',
                            zIndex: 2,
                            background: '#0f172a' // Sfondo scuro per il frame
                        }}
                            onMouseEnter={e => e.currentTarget.style.transform = 'rotateX(0deg) scale(1)'}
                            onMouseLeave={e => e.currentTarget.style.transform = 'rotateX(5deg) scale(0.95)'}
                        >
                            <img
                                src={data.imageUrl}
                                alt="Feature Highlight"
                                onError={(e) => {
                                    console.error("Errore caricamento immagine:", data.imageUrl);
                                    e.target.style.display = 'none';
                                    e.target.parentElement.style.background = '#334155';
                                    e.target.parentElement.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;height:100%;color:#94a3b8;font-size:12px;">IMMAGINE NON TROVATA</div>';
                                }}
                                style={{
                                    width: '100%', display: 'block',
                                    // Se l'immagine è uno screenshot intero, ok. Se è parziale, object-cover
                                    objectFit: 'cover', minHeight: '100%'
                                }}
                            />
                            {/* Vetro riflesso sopra */}
                            <div style={{
                                position: 'absolute', inset: 0,
                                background: 'linear-gradient(135deg, rgba(255,255,255,0.1) 0%, transparent 40%)',
                                pointerEvents: 'none'
                            }} />
                        </div>

                        {/* Glow Sfondo */}
                        <div style={{
                            position: 'absolute', inset: 0,
                            background: 'linear-gradient(to top, #0f172a 0%, transparent 100%)',
                            zIndex: 3, pointerEvents: 'none'
                        }} />
                    </div>
                )}

                <div style={{ padding: '30px', textAlign: 'center' }}>
                    <div style={{
                        display: 'inline-flex', alignItems: 'center', gap: 8,
                        background: 'rgba(139, 92, 246, 0.15)', color: '#a78bfa',
                        padding: '6px 14px', borderRadius: 100, fontSize: 11, fontWeight: 800,
                        textTransform: 'uppercase', marginBottom: 16, border: '1px solid rgba(139, 92, 246, 0.2)'
                    }}>
                        <Sparkles size={12} /> Novità nel CRM
                    </div>

                    <h2 style={{ fontSize: 24, fontWeight: 900, color: '#fff', marginBottom: 12 }}>
                        {data.title || "Qualcosa di nuovo è arrivato!"}
                    </h2>

                    <p style={{ fontSize: 14, color: '#94a3b8', lineHeight: 1.6, marginBottom: 30 }}>
                        {data.description || "Abbiamo aggiornato il CRM per darti un'esperienza ancora più fluida e potente. Scopri le ultime novità!"}
                    </p>

                    <button
                        onClick={onClose}
                        style={{
                            width: '100%', padding: '18px', borderRadius: 20,
                            background: 'linear-gradient(135deg, #8b5cf6 0%, #6d28d9 100%)',
                            border: 'none', color: '#fff', fontWeight: 800, fontSize: 15,
                            cursor: 'pointer', boxShadow: '0 10px 25px rgba(139, 92, 246, 0.4)',
                            transition: 'transform 0.2s ease'
                        }}
                        onMouseEnter={e => e.currentTarget.style.transform = 'scale(1.02)'}
                        onMouseLeave={e => e.currentTarget.style.transform = 'scale(1)'}
                    >
                        VAI ALLA DASHBOARD
                    </button>
                </div>
            </div>
        </div>
    );
}
