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
    const isSupported = ('contacts' in navigator && 'ContactsManager' in window);

    const [error, setError] = useState(null);

    const handlePick = async (e) => {
        // Prevent form submission if inside a form
        e.preventDefault();
        e.stopPropagation();

        if (!isSupported) {
            alert("La rubrica non è accessibile da questo browser. Usa Chrome su Android o Safari su iOS.");
            return;
        }

        try {
            const props = ['name', 'tel'];
            const opts = { multiple: false };

            const contacts = await navigator.contacts.select(props, opts);

            if (contacts && contacts.length > 0) {
                const contact = contacts[0];
                // contact.name is array, contact.tel is array

                const nameStr = contact.name ? contact.name[0] : "";
                const telStr = contact.tel ? contact.tel[0] : "";

                if (onContactSelected) {
                    onContactSelected({
                        name: nameStr,
                        tel: telStr
                    });
                }
            }
        } catch (err) {
            console.error("Contact picker error:", err);
            // Ignore abort errors
        }
    };

    // If strictly not supported, we can either hide or show disabled. 
    // User requested this feature specifically, so showing it (and alerting if not supported) 
    // is better for feedback than invisible button.

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
