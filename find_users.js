const admin = require("firebase-admin");

// Try to initialize with default credentials
try {
    admin.initializeApp({
        projectId: "crm-ubroker-marco"
    });
    const db = admin.firestore();

    const emails = ["sibap.be@gmail.com", "info@armonieimmobiliare.it"];

    (async () => {
        for (const email of emails) {
            console.log(`\n--- Searching for: ${email} ---`);
            const snapshot = await db.collection("users").where("email", "==", email).get();

            if (snapshot.empty) {
                console.log("No user found.");
                continue;
            }

            for (const doc of snapshot.docs) {
                const uid = doc.id;
                const data = doc.data();
                console.log(`UID: ${uid}`);
                console.log(`Name: ${data.nome} ${data.cognome}`);
                console.log(`Phone: ${data.telefono}`);

                const appts = await db.collection("appointments").where("uid", "==", uid).get();
                console.log(`Appointments: ${appts.size}`);

                const customers = await db.collection("users").document(uid).collection("customers").get();
                console.log(`Customers: ${customers.size}`);
            }
        }
    })();
} catch (e) {
    console.error("Initialization error:", e);
}
