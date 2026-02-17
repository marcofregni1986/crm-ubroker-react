// src/pages/ImpostazioniPage.jsx
import React, { useEffect, useState } from "react";
import "./impostazioni.css";

const THEMES = [
  { key: "dark", title: "Dark", desc: "Consigliato — perfetto per lavorare molte ore." },
  { key: "light", title: "Light", desc: "Chiaro e leggibile — ideale di giorno e in presentazione." },
];

function getSavedTheme() {
  return localStorage.getItem("crm_theme") || "dark";
}

function applyTheme(themeKey) {
  document.body.classList.remove("theme-dark", "theme-light");
  document.body.classList.add(`theme-${themeKey}`);
  localStorage.setItem("crm_theme", themeKey);
}

export default function ImpostazioniPage() {
  const [theme, setTheme] = useState(getSavedTheme());

  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  const activeLabel = theme === "dark" ? "Dark" : "Light";

  return (
    <div className="page impostazioni-page">
      <div className="settings-wrap">
        {/* HEADER */}
        <div className="settings-head">
          <div>
            <div className="settings-title">Impostazioni</div>
            <div className="settings-sub">Scegli il tema grafico del CRM.</div>
          </div>

          <div className="settings-pill" title="Tema attivo">
            <span className="tag">ATTIVO</span>
            <span className="value">{activeLabel}</span>
          </div>
        </div>

        {/* CARD */}
        <div className="settings-card">
          <div className="settings-section">
            <div className="section-label">Tema</div>

            {THEMES.map((t) => {
              const active = theme === t.key;

              return (
                <button
                  key={t.key}
                  type="button"
                  className={"theme-option" + (active ? " is-active" : "")}
                  onClick={() => setTheme(t.key)}
                >
                  <div>
                    <div className="theme-name">{t.title}</div>
                    <div className="theme-desc">{t.desc}</div>
                  </div>

                  {/* Radio “reale” per accessibilità, ma il click lo gestisce il bottone */}
                  <input
                    type="radio"
                    name="theme"
                    checked={active}
                    readOnly
                    aria-label={`Tema ${t.title}`}
                  />
                </button>
              );
            })}
          </div>

          <div className="settings-footnote">La scelta viene salvata su questo dispositivo.</div>
        </div>
      </div>
    </div>
  );
}
