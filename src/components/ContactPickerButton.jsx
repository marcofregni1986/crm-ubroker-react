import React, { useState } from 'react';
import { BookUser } from 'lucide-react';

/**
 * ContactPickerButton
 * 
 * Shows a button that opens the native device contact picker (supported on Android/iOS Chrome/Safari).
 * If not supported, the button is hidden or shows an alert (configurable).
 * 
 * Props:
 * - onContactSelected: (contact: { name: string, tel: string }) => void
 * - className: string (optional)
 * - iconSize: number (optional)
 */
export default function ContactPickerButton({ onContactSelected, className = "", iconSize = 20 }) {
    const handlePick = async (e) => {
        e.preventDefault();
        e.stopPropagation();

        if (!('contacts' in navigator)) {
            const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
            const debugInfo = `\n\n(Browser: ${navigator.userAgent}\nSecure: ${window.isSecureContext}\nProtocol: ${window.location.protocol})`;

            if (isIOS) {
                alert("Per usare la rubrica su iPhone:\n1. Impostazioni iOS > Safari > Avanzate\n2. Feature Flags\n3. Attiva 'Contact Picker API'" + debugInfo);
            } else {
                alert("Il tuo browser non supporta la selezione contatti nativa. Assicurati di usare Chrome e che il sito sia in HTTPS." + debugInfo);
            }
            return;
        }

        try {
            // Check properties (helpful for debugging)
            // const supported = await navigator.contacts.getProperties();

            const props = ['name', 'tel'];
            const opts = { multiple: false };

            const contacts = await navigator.contacts.select(props, opts);

            if (contacts && contacts.length > 0) {
                const contact = contacts[0];
                const nameStr = (contact.name && contact.name[0]) || "";
                let telStr = (contact.tel && contact.tel[0]) || "";

                // Sanitize: keep digits and + sign
                telStr = telStr.replace(/[^\d+]/g, '');

                if (onContactSelected) {
                    onContactSelected({
                        name: nameStr,
                        tel: telStr
                    });
                }
            }
        } catch (err) {
            console.error("Contact picker error:", err);
            // Don't alert on User Cancel (AbortError)
            if (err.name !== 'AbortError') {
                alert("Errore accesso rubrica: " + err.message);
            }
        }
    };

    return (
        <button
            type="button"
            className={`contact-picker-btn ${className}`}
            onClick={handlePick}
            title="Apri Rubrica"
            style={{
                background: 'transparent',
                border: 'none',
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '4px',
                color: 'var(--text-dim, #666)'
            }}
        >
            <BookUser size={iconSize} />
        </button>
    );
}
