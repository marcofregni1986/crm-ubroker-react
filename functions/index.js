/**
 * STRADA 2 — HARD DELETE (Firebase Functions v2)
 * Google Calendar -> Firestore (appointments)
 *
 * Se un evento [CRM] (CA/CVA) viene eliminato da Google Calendar:
 * -> elimina DEFINITIVAMENTE il documento Firestore corrispondente (hard delete).
 *
 * Miglioria "definitiva":
 * - Se nell'evento Google esiste extendedProperties.private.crmId
 *   allora cancelliamo direttamente appointments/{crmId} (hard delete certo).
 * - Altrimenti fallback: cerchiamo per googleEventId.
 *
 * Requisiti Firestore:
 * - collection "config" doc "googleCalendar" con:
 *   {
 *     accessToken: "...",            // OK, ma se scade non va più
 *     calendarId: "primary"          // o id calendario
 *     lastSyncUpdatedMin: "..."      // opzionale (ISO)
 *   }
 */

const admin = require("firebase-admin");
const { google } = require("googleapis");

// Firebase Functions v2
const { onRequest } = require("firebase-functions/v2/https");
const { setGlobalOptions } = require("firebase-functions/v2");
const functions = require("firebase-functions/v1");

admin.initializeApp();
const db = admin.firestore();

// Regione unica
setGlobalOptions({ region: "europe-west1" });

const CRM_PREFIXES = ["[CRM] CA", "[CRM] CVA"];
const CONFIG_DOC_PATH = "config/googleCalendar";

function isCrmSummary(summary = "") {
  const s = String(summary || "").trim();
  return CRM_PREFIXES.some((p) => s.startsWith(p));
}

async function getCalendarClient() {
  const snap = await db.doc(CONFIG_DOC_PATH).get();
  if (!snap.exists) throw new Error(`Config mancante: crea Firestore doc ${CONFIG_DOC_PATH}`);

  const { accessToken, calendarId } = snap.data() || {};
  if (!accessToken) throw new Error("Config googleCalendar: accessToken mancante");
  if (!calendarId) throw new Error("Config googleCalendar: calendarId mancante (es: 'primary')");

  const auth = new google.auth.OAuth2();
  auth.setCredentials({ access_token: accessToken });

  const calendar = google.calendar({ version: "v3", auth });
  return { calendar, calendarId };
}

// ✅ hard delete diretto per crmId (SUPER affidabile)
async function hardDeleteByCrmId(crmId) {
  if (!crmId) return { deleted: false, reason: "no_crmId" };

  const ref = db.collection("appointments").doc(String(crmId));
  const snap = await ref.get();
  if (!snap.exists) return { deleted: false, reason: "doc_not_found" };

  await ref.delete();
  return { deleted: true, reason: "deleted_by_crmId" };
}

// ✅ fallback: hard delete per googleEventId (il tuo metodo attuale)
async function hardDeleteByGoogleEventId(googleEventId) {
  if (!googleEventId) return 0;

  const q = await db.collection("appointments").where("googleEventId", "==", googleEventId).get();
  if (q.empty) return 0;

  const batch = db.batch();
  q.docs.forEach((d) => batch.delete(d.ref));
  await batch.commit();
  return q.size;
}

exports.gcalWebhook = onRequest(async (req, res) => {
  try {
    const resourceState = req.header("x-goog-resource-state") || "";
    const configRef = db.doc(CONFIG_DOC_PATH);
    const configSnap = await configRef.get();
    const config = configSnap.data() || {};

    const lastUpdatedMin = config.lastSyncUpdatedMin || null;

    const { calendar, calendarId } = await getCalendarClient();

    // ✅ Leggiamo modifiche/cancellazioni da lastSyncUpdatedMin
    // showDeleted:true -> include i "cancelled"
    const params = {
      calendarId,
      singleEvents: true,
      showDeleted: true,
      maxResults: 2500,
      orderBy: "updated",
    };

    if (lastUpdatedMin) params.updatedMin = lastUpdatedMin;

    const resp = await calendar.events.list(params);
    const items = resp?.data?.items || [];

    // ⚠️ Importante: per non perdere eventi tra "inizio list" e "now",
    // usiamo come nuovo checkpoint l'updated più alto visto, non "now".
    let nextUpdatedMin = lastUpdatedMin || "1970-01-01T00:00:00.000Z";
    for (const ev of items) {
      const upd = ev?.updated;
      if (upd && String(upd) > String(nextUpdatedMin)) nextUpdatedMin = String(upd);
    }

    // se non abbiamo trovato niente, comunque avanzare leggermente è ok,
    // ma qui teniamo quello che abbiamo (non peggioriamo).
    await configRef.set(
      {
        lastSyncUpdatedMin: nextUpdatedMin,
        lastWebhookAt: admin.firestore.FieldValue.serverTimestamp(),
        lastWebhookState: resourceState || null,
        lastWebhookCount: items.length,
      },
      { merge: true }
    );

    let hardDeletedDocs = 0;
    const debug = {
      scanned: items.length,
      cancelledCrmEvents: 0,
      deletedByCrmId: 0,
      deletedByGoogleEventId: 0,
      missingLinkFallback: 0,
    };

    for (const ev of items) {
      const id = ev?.id;
      const summary = ev?.summary || "";
      const status = ev?.status || "";

      // Solo eventi CRM
      if (!isCrmSummary(summary)) continue;

      if (status !== "cancelled") continue;
      debug.cancelledCrmEvents += 1;

      // ✅ 1) prova hard delete diretto per crmId (se presente)
      const crmId = ev?.extendedProperties?.private?.crmId || null;
      if (crmId) {
        const r = await hardDeleteByCrmId(crmId);
        if (r.deleted) {
          hardDeletedDocs += 1;
          debug.deletedByCrmId += 1;
          continue;
        }
        // se crmId c'è ma doc non esiste, non facciamo niente (già ok)
      }

      // ✅ 2) fallback: elimina per googleEventId
      debug.missingLinkFallback += 1;
      const n = await hardDeleteByGoogleEventId(id);
      hardDeletedDocs += n;
      if (n > 0) debug.deletedByGoogleEventId += n;
    }

    res.status(200).json({
      ok: true,
      resourceState: resourceState || null,
      checkpointUpdatedMin: nextUpdatedMin,
      hardDeletedDocs,
      debug,
    });
  } catch (err) {
    console.error("gcalWebhook error:", err);
    res.status(500).json({ ok: false, error: String(err?.message || err) });
  }
});


/**
 * ✅ Sync Custom Claim: canManageUniversity (GEN 1 - niente Eventarc)
 * Quando cambia users/{uid}.permissions.canManageUniversity in Firestore,
 * aggiorna la Custom Claim dell'utente in Firebase Auth:
 *   request.auth.token.canManageUniversity
 *
 * Perché GEN 1:
 * - Evita Eventarc (che ti sta dando Permission denied)
 * - È perfetta per un trigger semplice di sincronizzazione claim
 */
exports.syncUniversityClaim = functions
  .region("europe-west1")
  .firestore.document("users/{uid}")
  .onWrite(async (change, context) => {
    const uid = context.params.uid;

    // Doc cancellato -> claim false
    if (!change.after.exists) {
      const user = await admin.auth().getUser(uid).catch(() => null);
      const existing = user?.customClaims || {};
      await admin.auth().setCustomUserClaims(uid, {
        ...existing,
        canManageUniversity: false,
      });
      return;
    }

    const after = change.after.data() || {};
    const perms = after.permissions || {};
    const desired = perms.canManageUniversity === true;

    const user = await admin.auth().getUser(uid);
    const existing = user.customClaims || {};
    const current = existing.canManageUniversity === true;

    // Aggiorna solo se cambia
    if (current !== desired) {
      await admin.auth().setCustomUserClaims(uid, {
        ...existing,
        canManageUniversity: desired,
      });
    }
  });

