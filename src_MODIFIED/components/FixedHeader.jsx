import React from "react";
import { LOGO_BASE64 } from "../assets/logoBase64";

const FixedHeader = () => {
    return (
        <header
            style={{
                position: "fixed",
                top: 0,
                left: 0,
                width: "100%",
                height: "60px",
                backgroundColor: "#0f172a", // Slate 900 (matches theme)
                borderBottom: "1px solid rgba(148, 163, 184, 0.1)",
                display: "flex",
                alignItems: "center",
                padding: "0 20px",
                zIndex: 50, // Ensure it's above other content
                boxShadow: "0 4px 6px -1px rgba(0, 0, 0, 0.1)",
            }}
        >
            <img
                src={LOGO_BASE64}
                alt="Logo"
                style={{
                    height: "40px",
                    width: "auto",
                    objectFit: "contain",
                }}
            />
        </header>
    );
};

export default FixedHeader;
