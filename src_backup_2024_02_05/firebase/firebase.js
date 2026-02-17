// src/firebase.js
// ✅ Bootstrap Firebase unico per tutto il CRM (React + Vite)
// - Evita doppia inizializzazione con Vite HMR usando getApps/getApp
// - Usa lo storageBucket ufficiale del tuo progetto: crm-ubroker-marco.firebasestorage.app

import { initializeApp, getApp, getApps } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";

// Config presa da Firebase Console → Project settings → SDK setup
const firebaseConfig = {
  apiKey: "AIzaSyDlasyxCJHPdp7x-25BMn_LWf3WaPyiiGY",
  authDomain: "crm-ubroker-marco.firebaseapp.com",
  projectId: "crm-ubroker-marco",
  storageBucket: "crm-ubroker-marco.firebasestorage.app",
  messagingSenderId: "451241630358",
  appId: "1:451241630358:web:093a3806219e855ac240b7",
  measurementId: "G-MKQPG1JE4K",
};

// Init (safe per HMR)
const app = getApps().length ? getApp() : initializeApp(firebaseConfig);

// Istanze servizi
const auth = getAuth(app);
const db = getFirestore(app);
const storage = getStorage(app);

export { app, auth, db, storage };
