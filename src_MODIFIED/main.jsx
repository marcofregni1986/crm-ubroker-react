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
// 3) temi alla fine (solo variabili / override colori)
import "./themes/themes.css";
import { ThemeProvider } from "./context/ThemeContext";
import { ToastProvider } from "./context/ToastContext"; // Assuming we want Toast too
import { AppUpdateProvider } from "./update/useAppUpdate.jsx"; // Assuming checks

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <AuthProvider>
      <AppUpdateProvider>
        <ThemeProvider>
          <ToastProvider>
            <App />
          </ToastProvider>
        </ThemeProvider>
      </AppUpdateProvider>
    </AuthProvider>
  </React.StrictMode>
);
