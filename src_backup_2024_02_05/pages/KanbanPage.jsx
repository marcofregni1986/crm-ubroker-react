import React, { useEffect, useMemo, useState } from "react";
import {
    DndContext,
    DragOverlay,
    closestCorners,
    KeyboardSensor,
    PointerSensor,
    useSensor,
    useSensors,
} from "@dnd-kit/core";
import {
    SortableContext,
    sortableKeyboardCoordinates,
    verticalListSortingStrategy,
    useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { db } from "../firebase";
import { collection, query, orderBy, onSnapshot, doc, updateDoc, serverTimestamp } from "firebase/firestore";
import { useAuth } from "../auth/AuthProvider";
import "./KanbanPage.css"; // [NEW] Custom CSS

// --- CONFIG ---
const KANBAN_COLS = ["Nuovo", "Contattato", "Appuntamento", "Non interessato", "Chiuso"];

const COLUMN_CLASSES = {
    "Nuovo": "col-nuovo",
    "Contattato": "col-contattato",
    "Appuntamento": "col-appuntamento",
    "Non interessato": "col-non-interessato",
    "Chiuso": "col-chiuso",
};

// --- COMPONENTS ---

function SortableItem({ id, item }) {
    const {
        attributes,
        listeners,
        setNodeRef,
        transform,
        transition,
        isDragging,
    } = useSortable({ id });

    const style = {
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.3 : 1,
    };

    return (
        <div
            ref={setNodeRef}
            style={style}
            {...attributes}
            {...listeners}
            className="kanban-card"
        >
            <div className="card-title">{item.nome}</div>
            <div className="card-meta">
                <span>{item.telefono || "No tel"}</span>
                <span className="card-pill">{item.priorita || "Media"}</span>
            </div>
            {item.note && <div className="card-note">{item.note}</div>}
        </div>
    );
}

function KanbanColumn({ id, items }) {
    const { setNodeRef } = useSortable({ id, data: { type: "Column" } });

    return (
        <div ref={setNodeRef} className={`kanban-column ${COLUMN_CLASSES[id] || ""}`}>
            <div className="kanban-column-header">
                {id}
                <span className="kanban-col-count">{items.length}</span>
            </div>

            <div className="kanban-column-body">
                <SortableContext items={items.map(i => i.id)} strategy={verticalListSortingStrategy}>
                    {items.map((item) => (
                        <SortableItem key={item.id} id={item.id} item={item} />
                    ))}
                </SortableContext>
                {items.length === 0 && (
                    <div className="kanban-empty-placeholder">
                        Trascina qui
                    </div>
                )}
            </div>
        </div>
    );
}

// --- MAIN PAGE ---

export default function KanbanPage() {
    const { user } = useAuth();
    const [items, setItems] = useState([]);
    const [loading, setLoading] = useState(true);
    const [activeId, setActiveId] = useState(null);

    // Sensors
    const sensors = useSensors(
        useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
        useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
    );

    // Fetch Data
    useEffect(() => {
        if (!user?.uid) return;
        setLoading(true);
        const q = query(collection(db, "users", user.uid, "listaNomi"), orderBy("updatedAt", "desc"));
        const unsub = onSnapshot(q, (snap) => {
            const list = snap.docs.map(d => ({ id: d.id, ...d.data() }));
            setItems(list);
            setLoading(false);
        });
        return () => unsub();
    }, [user?.uid]);

    // Group items by status
    const columns = useMemo(() => {
        const cols = {};
        KANBAN_COLS.forEach(c => cols[c] = []);
        items.forEach(item => {
            let st = item.stato || "Nuovo";
            // Normalizza se lo stato non esiste nella lista standard
            if (!KANBAN_COLS.includes(st)) st = "Nuovo"; // Fallback
            cols[st].push(item);
        });
        return cols;
    }, [items]);

    // Drag Handlers
    const handleDragStart = (event) => setActiveId(event.active.id);

    const handleDragEnd = async (event) => {
        const { active, over } = event;
        setActiveId(null);

        if (!over) return;

        const activeItem = items.find(i => i.id === active.id);
        if (!activeItem) return;

        let newStatus = null;
        if (KANBAN_COLS.includes(over.id)) {
            newStatus = over.id;
        } else {
            // Dropped over another item
            const overItem = items.find(i => i.id === over.id);
            if (overItem) newStatus = overItem.stato;
        }

        if (newStatus && newStatus !== activeItem.stato) {
            try {
                // Optimistic Local Update
                const newItem = { ...activeItem, stato: newStatus };
                setItems(prev => prev.map(i => i.id === activeItem.id ? newItem : i));

                const ref = doc(db, "users", user.uid, "listaNomi", activeItem.id);
                await updateDoc(ref, {
                    stato: newStatus,
                    updatedAt: serverTimestamp()
                });
            } catch (e) {
                console.error("Drop failed", e);
            }
        }
    };

    if (loading) return <div className="kanban-page" style={{ justifyContent: 'center', alignItems: 'center' }}>Caricamento Kanban...</div>;

    return (
        <div className="kanban-page">
            <div className="kanban-header">
                <div className="kanban-header-left">
                    <button onClick={() => window.location.href = "/lista-nomi"} className="btn-back">
                        ← Lista
                    </button>
                    <div>
                        <h1 className="kanban-title">Pipeline Contatti</h1>
                        <p className="kanban-subtitle">Trascina i contatti per cambiare stato</p>
                    </div>
                </div>
                <div className="kanban-badge">
                    {items.length} Contatti Totali
                </div>
            </div>

            <DndContext
                sensors={sensors}
                collisionDetection={closestCorners}
                onDragStart={handleDragStart}
                onDragEnd={handleDragEnd}
            >
                <div className="kanban-board">
                    {KANBAN_COLS.map(colId => (
                        <KanbanColumn key={colId} id={colId} items={columns[colId]} />
                    ))}
                </div>

                <DragOverlay>
                    {activeId ? (
                        <div className="drag-overlay-card">
                            <div className="card-title" style={{ color: '#fff' }}>
                                {items.find(i => i.id === activeId)?.nome}
                            </div>
                        </div>
                    ) : null}
                </DragOverlay>
            </DndContext>
        </div>
    );
}
