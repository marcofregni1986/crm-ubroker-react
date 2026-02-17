// src/pages/EventSheetPage.jsx
import React, { useEffect, useState, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
    ArrowLeft,
    Users,
    Plus,
    Trash2,
    Loader2,
    Save,
    Check,
    X,
    UserPlus
} from "lucide-react";
import {
    doc,
    collection,
    query,
    orderBy,
    onSnapshot,
    addDoc,
    updateDoc,
    deleteDoc,
    serverTimestamp,
    getDoc
} from "firebase/firestore";
import { db } from "../firebase";
import { useAuth } from "../auth/AuthProvider";
import "./EventSheetPage.css"; // ✅ Custom CSS

// Simple Table Row Component
function GuestRow({ guest, canEdit, canDelete, onUpdate, onDelete, isAdmin }) {
    const [isEditing, setIsEditing] = useState(false);
    const [data, setData] = useState(guest);

    // Sync internal state if external guest prop changes
    useEffect(() => {
        setData(guest);
    }, [guest]);

    const handleSave = () => {
        onUpdate(guest.id, data);
        setIsEditing(false);
    };

    const handleChange = (field, val) => {
        setData(prev => ({ ...prev, [field]: val }));
    };

    if (isEditing) {
        return (
            <tr className="sheet-tr editing">
                <td className="sheet-td" data-label="Nome">
                    <input
                        value={data.nome || ""}
                        onChange={e => handleChange("nome", e.target.value)}
                        placeholder="Nome"
                    />
                </td>
                <td className="sheet-td" data-label="Cognome">
                    <input
                        value={data.cognome || ""}
                        onChange={e => handleChange("cognome", e.target.value)}
                        placeholder="Cognome"
                    />
                </td>
                <td className="sheet-td" data-label="Cellulare">
                    <input
                        value={data.telefono || ""}
                        onChange={e => handleChange("telefono", e.target.value)}
                        placeholder="Telefono"
                    />
                </td>
                <td className="sheet-td" data-label="Driver">
                    <input
                        value={data.driver || ""}
                        onChange={e => handleChange("driver", e.target.value)}
                        placeholder="Driver"
                    />
                </td>
                <td className="sheet-td" data-label="Conferma" style={{ textAlign: "center" }}>
                    <input
                        type="checkbox"
                        checked={data.conferma === 'Confermato'}
                        onChange={e => handleChange("conferma", e.target.checked ? "Confermato" : "In attesa")}
                        className="sheet-checkbox"
                    />
                </td>
                <td className="sheet-td" data-label="Presente" style={{ textAlign: "center" }}>
                    {/* Cant edit checkbox in inline edit mode easily without confusing UI */}
                    <div style={{ fontSize: 10, opacity: 0.5 }}>-</div>
                </td>
                <td className="sheet-td" data-label="Azioni">
                    <div className="sheet-actions" style={{ opacity: 1 }}>
                        <button onClick={handleSave} className="btn-action save" title="Salva">
                            <Check size={18} />
                        </button>
                        <button onClick={() => setIsEditing(false)} className="btn-action cancel" title="Annulla">
                            <X size={18} />
                        </button>
                    </div>
                </td>
            </tr>
        );
    }

    // Determine status class
    const statusClass =
        guest.conferma === 'Confermato' ? 'status-confirmed' :
            guest.conferma === 'Declinato' ? 'status-declined' :
                'status-waiting';

    return (
        <tr className="sheet-tr">
            <td className="sheet-td" data-label="Nome">{guest.nome}</td>
            <td className="sheet-td" data-label="Cognome">{guest.cognome}</td>
            <td className="sheet-td sheet-td-mono" data-label="Cellulare">{guest.telefono}</td>
            <td className="sheet-td sheet-td-highlight" data-label="Driver">{guest.driver}</td>
            {/* CONFERMATO CHECKBOX */}
            <td className="sheet-td" data-label="Conferma" style={{ textAlign: "center" }}>
                <input
                    type="checkbox"
                    checked={guest.conferma === 'Confermato'}
                    disabled={!isAdmin && !canEdit}
                    onChange={(e) => {
                        const val = e.target.checked ? "Confermato" : "In attesa";
                        if (isAdmin || canEdit) onUpdate(guest.id, { conferma: val });
                    }}
                    className="sheet-checkbox"
                />
            </td>

            {/* PRESENTE CHECKBOX */}
            <td className="sheet-td" data-label="Presente" style={{ textAlign: "center" }}>
                <input
                    type="checkbox"
                    checked={!!guest.presente}
                    disabled={!isAdmin && !canEdit}
                    onChange={(e) => {
                        if (isAdmin || canEdit) onUpdate(guest.id, { presente: e.target.checked });
                    }}
                    className="sheet-checkbox"
                />
            </td>
            <td className="sheet-td" data-label="Azioni">
                <div className="sheet-actions">
                    {canEdit && (
                        <button
                            onClick={() => setIsEditing(true)}
                            className="btn-action edit"
                            title="Modifica Riga"
                        >
                            Modifica
                        </button>
                    )}
                    {canDelete && (
                        <button
                            onClick={() => onDelete(guest.id)}
                            className="btn-action delete"
                            title="Elimina"
                        >
                            <Trash2 size={16} />
                        </button>
                    )}
                </div>
            </td>
        </tr>
    );
}

export default function EventSheetPage() {
    const { id } = useParams();
    const navigate = useNavigate();
    const { user, permissions, isAdmin } = useAuth();

    const [eventData, setEventData] = useState(null);
    const [guests, setGuests] = useState([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState("");
    const [sortConfig, setSortConfig] = useState({ key: 'nome', direction: 'asc' });

    const canView = isAdmin || permissions?.canAccessEventLists;

    // New Guest Form
    const [newGuest, setNewGuest] = useState({
        nome: "", cognome: "", telefono: "", driver: "", conferma: "In attesa"
    });
    const [isAdding, setIsAdding] = useState(false);

    // Filter and Sort Logic
    const sortedAndFilteredGuests = React.useMemo(() => {
        let items = [...guests];

        // Search Filter
        if (searchTerm) {
            const low = searchTerm.toLowerCase();
            items = items.filter(g =>
                (g.nome || "").toLowerCase().includes(low) ||
                (g.cognome || "").toLowerCase().includes(low) ||
                (g.telefono || "").toLowerCase().includes(low) ||
                (g.driver || "").toLowerCase().includes(low)
            );
        }

        // Sort
        items.sort((a, b) => {
            const valA = (a[sortConfig.key] || "").toString().toLowerCase();
            const valB = (b[sortConfig.key] || "").toString().toLowerCase();

            if (valA < valB) return sortConfig.direction === 'asc' ? -1 : 1;
            if (valA > valB) return sortConfig.direction === 'asc' ? 1 : -1;
            return 0;
        });

        return items;
    }, [guests, searchTerm, sortConfig]);

    const requestSort = (key) => {
        let direction = 'asc';
        if (sortConfig.key === key && sortConfig.direction === 'asc') {
            direction = 'desc';
        }
        setSortConfig({ key, direction });
    };

    const getSortIcon = (key) => {
        if (sortConfig.key !== key) return <span style={{ opacity: 0.3, marginLeft: 6 }}>⇅</span>;
        return sortConfig.direction === 'asc' ? <span style={{ marginLeft: 6 }}>↑</span> : <span style={{ marginLeft: 6 }}>↓</span>;
    };

    // Load Event Metadata
    useEffect(() => {
        if (!canView) return;

        async function loadEvent() {
            try {
                const docRef = doc(db, "eventGuestLists", id);
                const snap = await getDoc(docRef);
                if (snap.exists()) {
                    setEventData({ id: snap.id, ...snap.data() });
                } else {
                    alert("Evento non trovato.");
                    navigate("/events");
                }
            } catch (e) {
                console.error(e);
            }
        }
        loadEvent();

        const q = query(collection(db, "eventGuestLists", id, "guests"), orderBy("createdAt", "desc"));
        const unsub = onSnapshot(q, (snap) => {
            const g = snap.docs.map(d => ({ id: d.id, ...d.data() }));
            setGuests(g);
            setLoading(false);
        });

        return () => unsub();
    }, [id, canView]);

    // Set default driver name
    useEffect(() => {
        if (user && !newGuest.driver) {
            const myName = `${user.nome || ""} ${user.cognome || ""}`.trim();
            setNewGuest(prev => ({ ...prev, driver: myName }));
        }
    }, [user]);

    async function handleAddGuest(e) {
        e.preventDefault();
        if (!newGuest.nome) return;

        setIsAdding(true);
        try {
            await addDoc(collection(db, "eventGuestLists", id, "guests"), {
                ...newGuest,
                addedBy: user.uid,
                createdAt: serverTimestamp(),
                presente: false
            });
            setNewGuest(prev => ({
                nome: "", cognome: "", telefono: "",
                conferma: "In attesa",
                driver: prev.driver
            }));
        } catch (e) {
            alert("Errore aggiunta: " + e.message);
        } finally {
            setIsAdding(false);
        }
    }

    async function handleUpdateGuest(guestId, changes) {
        try {
            await updateDoc(doc(db, "eventGuestLists", id, "guests", guestId), changes);
        } catch (e) {
            alert("Errore aggiornamento: " + e.message);
        }
    }

    async function handleDeleteGuest(guestId) {
        if (!window.confirm("Eliminare questo ospite?")) return;
        try {
            await deleteDoc(doc(db, "eventGuestLists", id, "guests", guestId));
        } catch (e) {
            alert("Errore eliminazione: " + e.message);
        }
    }

    if (!canView) {
        return <div style={{ padding: 40, textAlign: "center", color: "white" }}>Accesso Negato</div>;
    }

    if (loading && !eventData) {
        return <div style={{ padding: 40, textAlign: "center", color: "var(--primary)" }}>Caricamento...</div>;
    }

    return (
        <div className="sheet-container">
            {/* HEADER */}
            <div className="sheet-header-wrapper">
                <button onClick={() => navigate("/events")} className="btn-back">
                    <ArrowLeft size={20} className="text-violet-400" />
                </button>
                <div>
                    <h1 className="sheet-title">
                        <span className="text-violet-400">{eventData?.title}</span>
                        <span style={{ color: "#64748b", fontSize: 16, fontWeight: 400 }}>
                            ({guests.length} ospiti)
                        </span>
                    </h1>
                    <div className="sheet-subtitle">
                        {eventData?.date ? new Date(eventData.date.seconds * 1000).toLocaleDateString() : ""}
                    </div>
                </div>
            </div>

            {/* TABLE DATA */}
            <div className="sheet-content">
                <div className="sheet-card">

                    {/* SEARCH & ADD ROW HEADER */}
                    <div className="sheet-toolbar">
                        <div className="sheet-search-box">
                            <input
                                placeholder="Filtra ospiti (nome, cognome, tel...)"
                                className="sheet-input search-input"
                                value={searchTerm}
                                onChange={e => setSearchTerm(e.target.value)}
                            />
                        </div>
                    </div>

                    <div className="sheet-add-row">
                        <form onSubmit={handleAddGuest} className="add-guest-form">
                            <div className="add-inputs-grid">
                                <input
                                    placeholder="Nome"
                                    className="sheet-input"
                                    value={newGuest.nome}
                                    onChange={e => setNewGuest({ ...newGuest, nome: e.target.value })}
                                    required
                                />
                                <input
                                    placeholder="Cognome"
                                    className="sheet-input"
                                    value={newGuest.cognome}
                                    onChange={e => setNewGuest({ ...newGuest, cognome: e.target.value })}
                                    required
                                />
                                <input
                                    placeholder="Telefono"
                                    className="sheet-input"
                                    value={newGuest.telefono}
                                    onChange={e => setNewGuest({ ...newGuest, telefono: e.target.value })}
                                />
                                <input
                                    placeholder="Driver Proponente"
                                    className="sheet-input"
                                    style={{ color: "#a5b4fc" }}
                                    value={newGuest.driver}
                                    onChange={e => setNewGuest({ ...newGuest, driver: e.target.value })}
                                />
                            </div>
                            <button
                                type="submit"
                                disabled={isAdding}
                                className="btn-add-guest"
                            >
                                {isAdding ? <Loader2 className="animate-spin" size={16} /> : <UserPlus size={16} />}
                                Aggiungi
                            </button>
                        </form>
                    </div>

                    <div className="sheet-table-wrapper">
                        <table className="sheet-table">
                            <thead>
                                <tr>
                                    <th className="sheet-th sortable" onClick={() => requestSort('nome')}>
                                        Nome {getSortIcon('nome')}
                                    </th>
                                    <th className="sheet-th sortable" onClick={() => requestSort('cognome')}>
                                        Cognome {getSortIcon('cognome')}
                                    </th>
                                    <th className="sheet-th sortable" onClick={() => requestSort('telefono')}>
                                        Cellulare {getSortIcon('telefono')}
                                    </th>
                                    <th className="sheet-th sortable" onClick={() => requestSort('driver')}>
                                        Driver {getSortIcon('driver')}
                                    </th>
                                    <th className="sheet-th" style={{ textAlign: "center" }}>Conferma</th>
                                    <th className="sheet-th" style={{ textAlign: "center" }}>Presente</th>
                                    <th className="sheet-th" style={{ textAlign: "right" }}>Azioni</th>
                                </tr>
                            </thead>
                            <tbody>
                                {sortedAndFilteredGuests.map(g => (
                                    <GuestRow
                                        key={g.id}
                                        guest={g}
                                        isAdmin={isAdmin}
                                        canEdit={isAdmin || g.addedBy === user.uid}
                                        canDelete={isAdmin || g.addedBy === user.uid}
                                        onUpdate={handleUpdateGuest}
                                        onDelete={handleDeleteGuest}
                                    />
                                ))}
                                {sortedAndFilteredGuests.length === 0 && (
                                    <tr>
                                        <td colSpan="7" style={{ padding: "32px", textAlign: "center", color: "#64748b", fontStyle: "italic" }}>
                                            {searchTerm ? "Nessun ospite trovato con questo filtro." : "Nessun ospite in lista. Aggiungi il primo sopra!"}
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        </div>
    );
}
