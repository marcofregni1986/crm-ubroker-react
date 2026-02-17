import React, { useState, useEffect, useRef } from "react";
import "./CustomSelect.css"; // ✅ Force Premium Styles

// ---------- Custom Select Component ----------
const CustomSelect = ({ options, value, onChange, placeholder = "Seleziona...", disabled = false, labelPrefix = "" }) => {
    const [isOpen, setIsOpen] = useState(false);
    const containerRef = useRef(null);

    // Close on click outside
    useEffect(() => {
        const handleClickOutside = (event) => {
            if (containerRef.current && !containerRef.current.contains(event.target)) {
                setIsOpen(false);
            }
        };
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, []);

    const selectedOption = options.find(o => o.value === value);

    return (
        <div className={`custom-select-container ${disabled ? "disabled" : ""}`} ref={containerRef}>
            <div
                className={`custom-select-trigger ${isOpen ? "is-open" : ""} ${disabled ? "is-disabled" : ""}`}
                onClick={() => !disabled && setIsOpen(!isOpen)}
                style={{}} // Removed inline styles to let CSS take control
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
            {isOpen && !disabled && (
                <div className="custom-select-options">
                    {options.map((opt) => (
                        <div
                            key={opt.value}
                            className={`custom-option ${value === opt.value ? "selected" : ""}`}
                            onClick={() => {
                                onChange(opt.value);
                                setIsOpen(false);
                            }}
                        >
                            {opt.label}
                            {opt.sub && <div style={{ fontSize: "11px", color: "#94a3b8" }}>{opt.sub}</div>}
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};

export default CustomSelect;
