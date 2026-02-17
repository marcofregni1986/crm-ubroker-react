
import React from 'react';
import { Eye, StickyNote, Phone, RefreshCw, Calendar } from "lucide-react";
// import SwipeableActionWrapper from "./SwipeableActionWrapper"; // Removed for Dashboard

/**
 * Helper per convertire timestamp/date/stringhe in millis
 */
function toMillis(ts) {
    if (!ts) return null;
    // Firestore
    if (ts && typeof ts.toMillis === 'function') return ts.toMillis();
    if (ts instanceof Date) return ts.getTime();
    if (typeof ts === "number") return ts;
    // String iso
    const d = new Date(ts);
    const ms = d.getTime();
    return Number.isFinite(ms) ? ms : null;
}

/**
 * Helper per classificare lo stato (duplicato da dashboard/appuntamenti)
 * per determinare il colore del dot/badge
 */
function classifyAppointment(a) {
    const s = String(a?.stato ?? a?.status ?? a?.esito ?? "").trim().toLowerCase();

    const positive = ["positivo", "ok", "chiuso positivo", "contratto", "venduto", "chiusura", "completato positivo", "concluso positivo", "vinto"];
    const negative = ["negativo", "ko", "annullato", "cancellato", "saltato", "non presentato", "rifiutato", "concluso negativo", "chiuso negativo", "perso"];

    // Tutto il resto è "scheduled" o "unknown"
    if (positive.some(t => s.includes(t))) return "positive";
    if (negative.some(t => s.includes(t))) return "negative";
    return "scheduled"; // default
}

export default function PersonAgendaCard({ person, firebaseUser, openView, openEdit, onReschedule }) {
    // person: { nameDisplay, appointments: [], latestDate }

    // Ordina per data decrescente (dal più recente)
    const sortedAppts = [...person.appointments].sort((a, b) => (toMillis(b.dataOra) || 0) - (toMillis(a.dataOra) || 0));

    // Raggruppa per data
    const groups = [];
    let lastLabel = null;
    let currentGroup = null;

    sortedAppts.forEach(a => {
        const ms = toMillis(a.dataOra);
        let label = "Data sconosciuta";
        if (ms) {
            const d = new Date(ms);
            const today = new Date();
            // Reset hours per confronto giorni
            const t0 = new Date(today); t0.setHours(0, 0, 0, 0);
            const d0 = new Date(d); d0.setHours(0, 0, 0, 0);

            const diff = t0.getTime() - d0.getTime();
            const oneDay = 86400000;

            if (diff === 0) label = "Oggi";
            else if (diff === oneDay) label = "Ieri";
            else if (diff === -oneDay) label = "Domani";
            else label = d.toLocaleDateString("it-IT", { day: 'numeric', month: 'long', year: 'numeric' });
        }

        if (label !== lastLabel) {
            currentGroup = { label, items: [] };
            groups.push(currentGroup);
            lastLabel = label;
        }
        currentGroup.items.push(a);
    });

    return (
        <div className="person-agenda-group">
            {groups.map((g, i) => (
                <div key={i} className="agenda-group">
                    <div className="agenda-date-header">
                        <Calendar size={12} style={{ color: '#8b5cf6' }} />
                        {g.label}
                    </div>

                    <div className="agenda-list">
                        {g.items.map(a => {
                            const ms = toMillis(a.dataOra);
                            const hh = ms ? new Date(ms).toLocaleTimeString("it-IT", { hour: '2-digit', minute: '2-digit' }) : "--:--";
                            const statusType = classifyAppointment(a);

                            // Map status to readable label
                            const statusLabels = {
                                positive: "Esito Positivo",
                                negative: "Esito Negativo",
                                scheduled: a.stato || "In programma"
                            };

                            let dotClass = "sched";
                            if (statusType === "positive") dotClass = "pos";
                            else if (statusType === "negative") dotClass = "neg";

                            const isMe = a.uid && firebaseUser?.uid && a.uid === firebaseUser.uid;

                            return (
                                <div key={a.id || i} className={`agenda-card-modern ${dotClass}`}>
                                    <div className="agenda-time-box">
                                        <div className="agenda-time">{hh}</div>
                                        <div className="agenda-type">{a.tipo || "CA"}</div>
                                    </div>

                                    <div className="agenda-info">
                                        <div className="agenda-client">{(a.nome || "") + " " + (a.cognome || "")}</div>
                                        <div className={`status-badge-premium ${dotClass}`}>
                                            <span style={{ fontSize: '14px', marginRight: '6px', lineHeight: 1 }}>•</span>
                                            {statusLabels[statusType]}
                                        </div>
                                    </div>

                                    <div className="agenda-actions">
                                        {a.telefono && (
                                            <button
                                                type="button"
                                                className="btn-icon-soft btn-call"
                                                onClick={() => window.location.href = `tel:${a.telefono}`}
                                                title="Chiama"
                                            >
                                                <Phone size={16} />
                                            </button>
                                        )}

                                        <button type="button" className="btn-icon-soft btn-view" onClick={() => openView(a)} title="Visualizza">
                                            <Eye size={16} />
                                        </button>

                                        {isMe && (
                                            <button type="button" className="btn-icon-soft" onClick={() => openEdit(a)} title="Modifica">
                                                <StickyNote size={16} />
                                            </button>
                                        )}

                                        {isMe && onReschedule && (
                                            <button type="button" className="btn-icon-soft" onClick={() => onReschedule(a)} title="Rifissa">
                                                <RefreshCw size={16} />
                                            </button>
                                        )}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            ))}
        </div>
    );
}

