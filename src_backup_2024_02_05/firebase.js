// src/firebase.js
// ✅ Firebase bootstrap unico per tutto il CRM (React + Vite)
// Fix principali:
// 1) Evita doppia inizializzazione in dev (HMR) usando getApps/getApp
// 3) Esporta app, auth, db, storage

import { initializeApp, getApp, getApps } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";

// ⚠️ Config presa da Firebase Console → Project settings → SDK setup
const firebaseConfig = {
  apiKey: "AIzaSyDlasyxCJHPdp7x-25BMn_LWf3WaPyiiGY",
  authDomain: "crm-ubroker-marco.firebaseapp.com",
  projectId: "crm-ubroker-marco",
  // ✅ bucket corretto standard Firebase Storage
  storageBucket: "crm-ubroker-marco.firebasestorage.app",
  messagingSenderId: "451241630358",
  appId: "1:451241630358:web:093a3806219e855ac240b7",
  measurementId: "G-MKQPG1JE4K",
};

// Init (safe per HMR)
export const app = getApps().length ? getApp() : initializeApp(firebaseConfig);

// Export istanze
export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);
