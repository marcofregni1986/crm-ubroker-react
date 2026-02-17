import React from "react";
import { useTheme } from "../context/ThemeContext";
import { Palette, Moon, Sun, LayoutGrid, Cpu } from "lucide-react";

export default function ThemeSwitcher() {
    const { theme, setTheme } = useTheme();

    const themes = [
        { id: "dark", label: "Dark", icon: <Moon size={16} />, color: "#1e293b" },
        { id: "light", label: "Light", icon: <Sun size={16} />, color: "#f1f5f9" },
        { id: "bento", label: "Bento", icon: <LayoutGrid size={16} />, color: "#0b0f19" },
        { id: "jarvis", label: "Jarvis", icon: <Cpu size={16} />, color: "#000000" },
    ];

    return (
        <div style={{
            position: 'fixed',
            bottom: 20,
            left: 20,
            zIndex: 9999,
            display: 'flex',
            gap: 8,
            background: 'var(--bg-card)',
            padding: 8,
            borderRadius: 99,
            border: '1px solid var(--border-soft)',
            boxShadow: '0 10px 30px rgba(0,0,0,0.5)'
        }}>
            {themes.map(t => (
                <button
                    key={t.id}
                    onClick={() => setTheme(t.id)}
                    title={t.label}
                    style={{
                        background: theme === t.id ? 'var(--accent-primary)' : 'transparent',
                        color: theme === t.id ? '#fff' : 'var(--text-muted)',
                        border: 'none',
                        borderRadius: '50%',
                        width: 36,
                        height: 36,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        cursor: 'pointer',
                        transition: 'all 0.2s'
                    }}
                >
                    {t.icon}
                </button>
            ))}
        </div>
    );
}
