import React, { createContext, useContext, useEffect, useState } from "react";

const ThemeContext = createContext();

export const ThemeProvider = ({ children }) => {
    // Leggi il tema salvato o usa 'dark' come default
    const [theme, setTheme] = useState(() => {
        return localStorage.getItem("crm_theme") || "dark";
    });

    useEffect(() => {
        // 1. Salva in localStorage
        localStorage.setItem("crm_theme", theme);

        // 2. Applica l'attributo al body (per il CSS)
        document.body.setAttribute("data-theme", theme);
    }, [theme]);

    const toggleTheme = (newTheme) => {
        setTheme(newTheme);
    };

    return (
        <ThemeContext.Provider value={{ theme, setTheme: toggleTheme }}>
            {children}
        </ThemeContext.Provider>
    );
};

export const useTheme = () => useContext(ThemeContext);
