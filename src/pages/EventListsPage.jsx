// src/pages/EventListsPage.jsx
import React, { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
    Plus,
    Trash2,
    Loader2,
    Search,
    ArrowRight,
    FileSpreadsheet
} from "lucide-react";
import {
    collection,
    query,
    orderBy,
    onSnapshot,
    addDoc,
    serverTimestamp,
    deleteDoc,
    doc
} from "firebase/firestore";
import { db } from "../firebase";
import { useAuth } from "../auth/AuthProvider";
import "./EventListsPage.css"; // ✅ Import custom CSS
import EventKpiSection from "../components/EventKpiSection"; // ✅ Import KPI

// Helper per formattare data
function formatDate(ts) {
    if (!ts) return "";
    return new Date(ts.seconds * 1000).toLocaleDateString("it-IT", {
        day: "numeric",
        month: "long",
        year: "numeric"
    });
}

export default function EventListsPage() {
    const { user, permissions, isAdmin } = useAuth();
    const navigate = useNavigate();

    const [events, setEvents] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [searchTerm, setSearchTerm] = useState("");

    // Permissions logic
    const canCreate = isAdmin || permissions?.canCreateEvents;
    const canView = isAdmin || permissions?.canAccessEventLists;

    // New Event State
    const [isCreating, setIsCreating] = useState(false);
    const [isFormOpen, setIsFormOpen] = useState(false); // Collapsible state
    const [newTitle, setNewTitle] = useState("");
    const [newDate, setNewDate] = useState("");

    useEffect(() => {
        // Se non ha i permessi di visualizzazione, redirect handled by wrapper mostly
        // ma qui possiamo fare check extra
        if (!loading && !canView) {
            // navigate("/dashboard"); 
        }

        const q = query(collection(db, "eventGuestLists"), orderBy("date", "desc"));
        const unsub = onSnapshot(q,
            (snap) => {
                const items = snap.docs.map(d => ({ id: d.id, ...d.data() }));
                setEvents(items);
                setLoading(false);
            },
            (err) => {
                console.error("Error fetching events:", err);
                setError("Impossibile caricare gli eventi. Verifica i permessi.");
                setLoading(false);
            }
        );

        return () => unsub();
    }, [canView]);

    async function handleCreateEvent(e) {
        e.preventDefault();
        if (!newTitle.trim()) return;

        setIsCreating(true);
        try {
            await addDoc(collection(db, "eventGuestLists"), {
                title: newTitle,
                date: newDate ? new Date(newDate) : serverTimestamp(), // Se vuota usa oggi
                createdBy: user?.uid,
                createdAt: serverTimestamp(),
            });
            setNewTitle("");
            setNewDate("");
        } catch (err) {
            console.error(err);
            alert("Errore creazione evento: " + err.message);
        } finally {
            setIsCreating(false);
        }
    }

    async function handleDelete(id, e) {
        e.preventDefault(); // prevent link navigation
        if (!window.confirm("Sei sicuro di voler eliminare questo evento e TUTTI i suoi ospiti?")) return;

        try {
            await deleteDoc(doc(db, "eventGuestLists", id));
            // TODO: Dovremmo eliminare anche la subcollection 'guests' manualmente o via Cloud Function.
            // Per ora lasciamo orfani (in Firestore client-side delete subcollection è costoso).
        } catch (err) {
            alert("Errore eliminazione: " + err.message);
        }
    }

    // Filter
    const filteredEvents = events.filter(ev =>
        ev.title.toLowerCase().includes(searchTerm.toLowerCase())
    );

    if (!canView) {
        return (
            <div className="event-empty-state">
                <h2>Accesso Negato</h2>
                <p>Non hai i permessi per visualizzare le liste eventi.</p>
            </div>
        );
    }

    return (
        <div className="event-lists-container">

            {/* HEADER */}
            <div className="event-lists-header">
                <div>
                    <div className="event-lists-title">
                        <FileSpreadsheet className="text-violet-400" size={32} />
                        Eventi Team
                    </div>
                    <p className="event-lists-subtitle">
                        Gestisci le liste invitati per le serate e gli eventi.
                    </p>
                </div>

                {/* CREATE FORM */}
                {canCreate && (
                    <div className="event-create-wrapper">
                        {!isCreating && !isFormOpen && (
                            <button
                                onClick={() => setIsFormOpen(true)}
                                className="btn-create-event-toggle"
                            >
                                <Plus size={18} />
                                Nuova Lista
                            </button>
                        )}

                        {(isFormOpen || isCreating) && (
                            <form onSubmit={handleCreateEvent} className="event-create-form open">
                                <div className="event-form-group">
                                    <label className="event-form-label">Titolo Evento</label>
                                    <input
                                        type="text"
                                        required
                                        placeholder="Es. StepOne 11 Feb"
                                        className="event-form-input"
                                        value={newTitle}
                                        onChange={e => setNewTitle(e.target.value)}
                                        autoFocus
                                    />
                                </div>
                                <div className="event-form-group">
                                    <label className="event-form-label">Data</label>
                                    <input
                                        type="date"
                                        className="event-form-input"
                                        value={newDate}
                                        onChange={e => setNewDate(e.target.value)}
                                    />
                                </div>
                                <div className="event-form-actions">
                                    <button
                                        type="button"
                                        onClick={() => setIsFormOpen(false)}
                                        className="btn-cancel-create"
                                        disabled={isCreating}
                                    >
                                        Annulla
                                    </button>
                                    <button
                                        type="submit"
                                        disabled={isCreating}
                                        className="btn-create-event"
                                    >
                                        {isCreating ? <Loader2 className="animate-spin" size={16} /> : <Plus size={16} />}
                                        Crea
                                    </button>
                                </div>
                            </form>
                        )}
                    </div>
                )}
            </div>

            {/* ✅ KPI DASHBOARD */}
            {canView && events.length > 0 && (
                <EventKpiSection events={events} />
            )}

            {/* SEARCH & LIST */}
            <div>
                {/* Search Bar */}
                <div className="event-search-wrapper">
                    <Search className="event-search-icon" size={18} />
                    <input
                        type="text"
                        placeholder="Cerca evento..."
                        className="event-search-input"
                        value={searchTerm}
                        onChange={e => setSearchTerm(e.target.value)}
                    />
                </div>

                {loading ? (
                    <div style={{ display: "flex", justifyContent: "center", padding: "48px" }}>
                        <Loader2 className="animate-spin" size={32} color="#10b981" />
                    </div>
                ) : error ? (
                    <div className="event-error-state">
                        {error}
                    </div>
                ) : filteredEvents.length === 0 ? (
                    <div className="event-empty-state">
                        <FileSpreadsheet style={{ opacity: 0.2, margin: "0 auto 16px" }} size={48} />
                        <p>Nessun evento trovato.</p>
                    </div>
                ) : (
                    <div className="event-grid">
                        {filteredEvents.map(ev => {
                            // Parse date
                            let dateObj = null;
                            if (ev.date?.toDate) dateObj = ev.date.toDate();
                            else if (ev.date?.seconds) dateObj = new Date(ev.date.seconds * 1000);
                            else if (ev.date) dateObj = new Date(ev.date);

                            return (
                                <Link
                                    key={ev.id}
                                    to={`/events/${ev.id}`}
                                    className="event-card"
                                >
                                    <div className="event-card-accent" />

                                    <div className="event-card-header">
                                        <div className="event-date-badge">
                                            {dateObj ? dateObj.toLocaleDateString() : "No Data"}
                                        </div>
                                        {/* Delete Button */}
                                        {canCreate && (
                                            <button
                                                onClick={(e) => handleDelete(ev.id, e)}
                                                className="btn-delete-event"
                                                title="Elimina Evento"
                                            >
                                                <Trash2 size={16} />
                                            </button>
                                        )}
                                    </div>

                                    <h3 className="event-card-title">
                                        {ev.title}
                                    </h3>

                                    <div className="event-card-footer">
                                        <span>Apri Lista</span>
                                        <ArrowRight size={14} className="arrow-icon" />
                                    </div>
                                </Link>
                            );
                        })}
                    </div>
                )}
            </div>
        </div>
    );
}
