// src/main.jsx
import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.jsx";
import { AuthProvider } from "./auth/AuthProvider.jsx";

// 1) FONT PRIMA DI TUTTO (base)
import "./fonts.css";

// 2) CSS principale
import "./style.css";

// 3) temi alla fine (solo variabili / override colori)
import "./themes/light.css";

// ✅ Applica preferenze salvate PRIMA del render
let savedTheme = localStorage.getItem("crm_theme") || "dark";
if (savedTheme === "white") savedTheme = "light";
if (savedTheme !== "dark" && savedTheme !== "light") savedTheme = "dark";

document.body.classList.remove("theme-dark", "theme-light");
document.body.classList.add(`theme-${savedTheme}`);

ReactDOM.createRoot(document.getElementById("root")).render(
  <AuthProvider>
    <App />
  </AuthProvider>
);
