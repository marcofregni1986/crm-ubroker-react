
import { initializeApp } from "firebase/app";
import { getFirestore, doc, setDoc, writeBatch, serverTimestamp } from "firebase/firestore";

const firebaseConfig = {
    apiKey: "AIzaSyDlasyxCJHPdp7x-25BMn_LWf3WaPyiiGY",
    authDomain: "crm-ubroker-marco.firebaseapp.com",
    projectId: "crm-ubroker-marco",
    storageBucket: "crm-ubroker-marco.firebasestorage.app",
    messagingSenderId: "451241630358",
    appId: "1:451241630358:web:093a3806219e855ac240b7",
    measurementId: "G-MKQPG1JE4K",
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

async function pushUpdate() {
    const now = Date.now();
    const batch = writeBatch(db);

    console.log("Pushing Changelog to appMeta/changelog...");
    batch.set(doc(db, "appMeta", "changelog"), {
        title: "⚡ Sincronizzazione Potenziata & Pull-to-Refresh",
        description: "Abbiamo introdotto il **Pull-to-Refresh** (trascina verso il basso per ricaricare) e risolto i problemi di sincronizzazione dei permessi tra i tuoi dispositivi. Ora il CRM è più veloce e reattivo che mai!",
        imageUrl: "/preview-sync.png",
        version: now.toString(),
        timestamp: serverTimestamp()
    });

    console.log("Pushing Update Trigger to appMeta/update...");
    batch.set(doc(db, "appMeta", "update"), {
        version: now,
        forceReload: true,
        mode: "news",
        message: "Nuova versione disponibile: Sincronizzazione migliorata!",
        createdAt: serverTimestamp()
    });

    try {
        await batch.commit();
        console.log("✅ Aggiornamento lanciato con successo!");
        process.exit(0);
    } catch (e) {
        console.error("❌ Errore durante il lancio dell'aggiornamento:", e);
        process.exit(1);
    }
}

pushUpdate();
