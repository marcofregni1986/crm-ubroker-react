import React, { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom"; // ✅ Import Portals
import "./CustomSelect.css";

const CustomSelect = ({ options, value, onChange, placeholder = "Seleziona...", disabled = false, labelPrefix = "", searchable = false }) => {
    const [isOpen, setIsOpen] = useState(false);
    const [searchTerm, setSearchTerm] = useState("");
    const [portalStyles, setPortalStyles] = useState({}); // ✅ Per il posizionamento dinamico
    const containerRef = useRef(null);
    const triggerRef = useRef(null);
    const searchInputRef = useRef(null);

    // Gestione chiusura al click esterno
    useEffect(() => {
        const handleClickOutside = (event) => {
            if (containerRef.current && !containerRef.current.contains(event.target)) {
                // Se il click è fuori dal trigger, chiudi (ma non se è dentro il portale)
                // Usiamo una classe specifica per identificare il portale nel DOM
                const portalElem = document.querySelector(".custom-select-portal-root");
                if (portalElem && portalElem.contains(event.target)) return;

                setIsOpen(false);
                setSearchTerm("");
            }
        };
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, []);

    // Calcolo posizione quando si apre
    useEffect(() => {
        if (isOpen && triggerRef.current) {
            const rect = triggerRef.current.getBoundingClientRect();
            setPortalStyles({
                position: "fixed",
                top: rect.bottom + 6 + "px",
                left: rect.left + "px",
                width: rect.width + "px",
                zIndex: 99999
            });
        }
    }, [isOpen]);

    // Focus sull'input di ricerca
    useEffect(() => {
        if (isOpen && searchable && searchInputRef.current) {
            searchInputRef.current.focus();
        }
    }, [isOpen, searchable]);

    const selectedOption = options.find(o => o.value === value);

    const filteredOptions = searchable
        ? options.filter(o => o.label.toLowerCase().includes(searchTerm.toLowerCase()))
        : options;

    return (
        <div className={`custom-select-container ${disabled ? "disabled" : ""}`} ref={containerRef}>
            <div
                ref={triggerRef}
                className={`custom-select-trigger ${isOpen ? "is-open" : ""} ${disabled ? "is-disabled" : ""}`}
                onClick={() => !disabled && setIsOpen(!isOpen)}
                tabIndex={disabled ? -1 : 0}
            >
                <span>{selectedOption ? (labelPrefix + selectedOption.label) : placeholder}</span>
                <svg
                    className="custom-select-arrow"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={2}
                    style={{ width: "18px", height: "18px", flexShrink: 0 }}
                >
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                </svg>
            </div>

            {/* ✅ RENDERIZZAZIONE TRAMITE PORTAL */}
            {isOpen && !disabled && createPortal(
                <div
                    className="custom-select-options custom-select-portal-root"
                    style={portalStyles}
                    onClick={(e) => e.stopPropagation()} // Evita la chiusura cliccando nel menu
                >
                    {searchable && (
                        <div style={{ padding: "8px 8px 4px 8px", position: "sticky", top: 0, background: "inherit", zIndex: 10 }}>
                            <input
                                ref={searchInputRef}
                                type="text"
                                placeholder="Cerca..."
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                onClick={(e) => e.stopPropagation()}
                                style={{
                                    width: "100%",
                                    padding: "8px 10px",
                                    borderRadius: "8px",
                                    border: "1px solid rgba(148,163,184,0.2)",
                                    background: "rgba(0,0,0,0.2)",
                                    color: "inherit",
                                    outline: "none",
                                    fontSize: "13px"
                                }}
                            />
                        </div>
                    )}
                    <div style={{ maxHeight: "250px", overflowY: "auto" }}>
                        {filteredOptions.length > 0 ? (
                            filteredOptions.map((opt) => (
                                <div
                                    key={opt.value}
                                    className={`custom-option ${value === opt.value ? "selected" : ""}`}
                                    onClick={() => {
                                        onChange(opt.value);
                                        setIsOpen(false);
                                        setSearchTerm("");
                                    }}
                                >
                                    {opt.label}
                                    {opt.sub && <div style={{ fontSize: "11px", color: "#94a3b8" }}>{opt.sub}</div>}
                                </div>
                            ))
                        ) : (
                            <div style={{ padding: "12px", textAlign: "center", fontSize: "13px", opacity: 0.6 }}>
                                Nessun risultato
                            </div>
                        )}
                    </div>
                </div>,
                document.body // ✅ Appende al body
            )}
        </div>
    );
};

export default CustomSelect;

