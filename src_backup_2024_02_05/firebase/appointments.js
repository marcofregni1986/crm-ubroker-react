// src/firebase/appointments.service.js
import {
  collection,
  addDoc,
  getDocs,
  query,
  where,
  Timestamp,
  deleteDoc,
  doc,
} from "firebase/firestore";
import { db } from "./firebase";

const COLLECTION = "appointments";

/**
 * CREA appuntamento
 */
export async function createAppointment(data) {
  const payload = {
    title: data.title,
    type: data.type,
    start: Timestamp.fromDate(new Date(data.start)),
    end: Timestamp.fromDate(new Date(data.end)),
    createdAt: Timestamp.now(),
  };

  await addDoc(collection(db, COLLECTION), payload);
}

/**
 * LEGGI appuntamenti per settimana
 */
export async function getAppointmentsByWeek(start, end) {
  const q = query(
    collection(db, COLLECTION),
    where("start", ">=", Timestamp.fromDate(start)),
    where("start", "<=", Timestamp.fromDate(end))
  );

  const snap = await getDocs(q);

  return snap.docs.map((d) => ({
    id: d.id,
    ...d.data(),
    start: d.data().start.toDate(),
    end: d.data().end.toDate(),
  }));
}

/**
 * CANCELLA appuntamento
 */
export async function deleteAppointment(id) {
  await deleteDoc(doc(db, COLLECTION, id));
}
