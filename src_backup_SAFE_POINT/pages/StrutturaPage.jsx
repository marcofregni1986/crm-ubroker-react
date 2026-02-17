import React, { useState, useEffect, useMemo } from "react";
import "./struttura.css";
import { User, X, Plus, Save, Trash2 } from "lucide-react";
import { useAuth } from "../auth/AuthProvider";
import { db } from "../firebase";
import { collection, query, where, getDocs, doc, getDoc, addDoc, serverTimestamp, deleteDoc } from "firebase/firestore";

// ==========================================
// UTILS
// ==========================================
function getInitials(name = "") {
    const parts = String(name).trim().split(/\s+/).filter(Boolean);
    const a = parts[0]?.[0] || "";
    const b = parts.length > 1 ? parts[parts.length - 1]?.[0] || "" : "";
    return (a + b).toUpperCase();
}

// Build Tree from flat list of users
// Root is the current user. Children are found by checking driverUid.
function buildUserTree(rootUser, allUsers, isRootNode = true) {
    if (!rootUser) return null;

    const children = allUsers
        .filter(u => u.driverUid === (rootUser.uid || rootUser.id)) // Find direct recruits
        .map(child => buildUserTree(child, allUsers, false)); // Recurse

    // Recursive total count
    const totalCount = children.reduce((acc, child) => acc + 1 + child.totalCount, 0);

    return {
        id: rootUser.uid || rootUser.id,
        uid: rootUser.uid || rootUser.id,
        name: rootUser.displayName || [(rootUser.nome || ""), (rootUser.cognome || "")].join(" ").trim() || rootUser.email || "Utente",
        email: rootUser.email || "",
        phone: rootUser.telefono || rootUser.phone || "",
        photoURL: rootUser.photoURL || "",
        role: rootUser.role || "Collaboratore",
        careerPosition: rootUser.careerLevel || rootUser.qualifica || "",
        children: children,
        totalCount: totalCount,
        isRoot: isRootNode,
        isVirtual: !!rootUser.isVirtual
    };
}

// ==========================================
// MODAL COMPONENT (Detail + Create Virtual)
// ==========================================
const StructureModal = ({ isOpen, onClose, node, onCreateVirtual, onDeleteVirtual, isMe }) => {
    const [view, setView] = useState("detail"); // "detail" or "add"
    const [vNome, setVNome] = useState("");
    const [vCognome, setVCognome] = useState("");
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        if (isOpen) {
            setView("detail");
            setVNome("");
            setVCognome("");
        }
    }, [isOpen]);

    if (!isOpen || !node) return null;

    const handleCreate = async () => {
        if (!vNome) return alert("Inserisci almeno il nome");
        setLoading(true);
        try {
            await onCreateVirtual(node.uid || node.id, vNome, vCognome);
            onClose();
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="ns-modal-overlay" onClick={onClose}>
            <div className="ns-modal" onClick={e => e.stopPropagation()}>
                <div className="ns-modal-header">
                    <h2>{view === "detail" ? "Dettaglio Collaboratore" : "Aggiungi Collaboratore"}</h2>
                    <button className="ns-close-btn" onClick={onClose}><X size={20} /></button>
                </div>

                <div className="ns-tabs" style={{ padding: "10px 20px 0" }}>
                    <button className={`ns-tab ${view === "detail" ? "active" : ""}`} onClick={() => setView("detail")}>Info</button>
                    <button className={`ns-tab ${view === "add" ? "active" : ""}`} onClick={() => setView("add")}>Aggiungi Sotto</button>
                </div>

                <div className="ns-modal-body">
                    {view === "detail" ? (
                        <>
                            <div className="ns-form-group">
                                <label className="ns-label">Nome</label>
                                <div className="ns-value">{node.name}</div>
                            </div>
                            <div className="ns-form-group">
                                <label className="ns-label">Livello</label>
                                <div className="ns-value">{node.careerPosition || "-"}</div>
                            </div>
                            {node.email && (
                                <div className="ns-form-group">
                                    <label className="ns-label">Email</label>
                                    <div className="ns-value">{node.email}</div>
                                </div>
                            )}
                            <div className="ns-form-group">
                                <label className="ns-label">Totale Struttura</label>
                                <div className="ns-value">{node.totalCount} collaboratori</div>
                            </div>

                            {node.isVirtual && (
                                <button
                                    className="ns-btn ns-btn-danger"
                                    style={{ marginTop: "10px", background: "rgba(239, 68, 68, 0.1)", color: "#ef4444", border: "1px solid rgba(239, 68, 68, 0.2)" }}
                                    onClick={() => onDeleteVirtual(node.uid || node.id, node.name)}
                                    disabled={loading}
                                >
                                    <Trash2 size={16} /> Elimina Dalla Mappa
                                </button>
                            )}
                        </>
                    ) : (
                        <>
                            <p style={{ fontSize: "12px", opacity: 0.7, marginBottom: "10px" }}>
                                Inserisci una persona nella tua mappa mentale sotto **{node.name}**.
                            </p>
                            <div className="ns-form-group">
                                <label className="ns-label">Nome</label>
                                <input className="ns-input" value={vNome} onChange={e => setVNome(e.target.value)} placeholder="Mario" />
                            </div>
                            <div className="ns-form-group">
                                <label className="ns-label">Cognome</label>
                                <input className="ns-input" value={vCognome} onChange={e => setVCognome(e.target.value)} placeholder="Rossi" />
                            </div>
                            <button
                                className="ns-btn ns-btn-primary"
                                style={{ marginTop: "10px" }}
                                onClick={handleCreate}
                                disabled={loading}
                            >
                                <Plus size={16} /> {loading ? "Creazione..." : "Crea Collaboratore"}
                            </button>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
};

// ==========================================
// SUB-COMPONENTS
// ==========================================
const NodeCard = ({ node, isRoot, onClick }) => {
    const initials = getInitials(node.name);
    const badge = node.careerPosition || "";
    const childrenCount = node.children ? node.children.length : 0;

    return (
        <div className={`ns-card ${isRoot ? "is-root" : ""} ${node.isVirtual ? "is-virtual" : ""}`} onClick={() => onClick(node)}>
            <div className="ns-card-header">
                {node.photoURL ? (
                    <img src={node.photoURL} alt="" className="ns-avatar-img" />
                ) : (
                    <div className="ns-avatar">{initials}</div>
                )}
                {badge && <div className="ns-badge">{badge}</div>}
                <div className="ns-add-btn" title="Aggiungi Collaboratore">
                    <Plus size={14} />
                </div>
            </div>
            <div className="ns-name">{node.name}</div>
            <div className="ns-role">{node.role} {node.isVirtual ? "(Virtuale)" : ""}</div>
            <div className="ns-footer">
                <div className="ns-directs">
                    <User size={12} />
                    <span>{childrenCount} diretti</span>
                </div>
                {isRoot && <span>ME</span>}
            </div>
        </div>
    );
};

const OrgTree = ({ node, isRoot, onNodeClick }) => {
    if (!node) return null;
    const children = node.children || [];
    return (
        <li>
            <NodeCard node={node} isRoot={isRoot} onClick={onNodeClick} />
            {children.length > 0 && (
                <ul>
                    {children.map(child => (
                        <OrgTree key={child.id} node={child} isRoot={false} onNodeClick={onNodeClick} />
                    ))}
                </ul>
            )}
        </li>
    );
};

// ==========================================
// MAIN PAGE COMPONENT
// ==========================================
export default function NuovaStrutturaPage() {
    const { user, profile } = useAuth();
    const [treeData, setTreeData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [modalOpen, setModalOpen] = useState(false);
    const [selectedNode, setSelectedNode] = useState(null);

    useEffect(() => {
        if (!user) return;

        async function fetchStructure() {
            setLoading(true);
            try {
                // 1. Fetch my downline (Chain + Direct fallback)
                const qChain = query(
                    collection(db, "users"),
                    where("driverChain", "array-contains", user.uid)
                );
                const qDirect = query(
                    collection(db, "users"),
                    where("driverUid", "==", user.uid)
                );

                // 1b. Support for Virtuals (they might not have indexable chains if offline/orphan)
                const qVirtuals = query(
                    collection(db, "users"),
                    where("isVirtual", "==", true)
                );

                const [snapChain, snapDirect, snapVirtuals] = await Promise.all([
                    getDocs(qChain),
                    getDocs(qDirect),
                    getDocs(qVirtuals)
                ]);

                const chainUsers = snapChain.docs.map(d => ({ uid: d.id, ...d.data() }));
                const directUsers = snapDirect.docs.map(d => ({ uid: d.id, ...d.data() }));
                const virtualUsers = snapVirtuals.docs.map(d => ({ uid: d.id, ...d.data() }));

                // Merge and deduplicate
                const allDownlineRaw = [...chainUsers, ...directUsers, ...virtualUsers];
                const seen = new Set();
                const downline = allDownlineRaw.filter(u => {
                    const id = u.uid || u.id;
                    if (!id || seen.has(id)) return false;
                    seen.add(id);
                    return true;
                });
                console.log("[Struttura] My UID:", user.uid);
                console.log("[Struttura] Descendants found:", downline.length);

                // 2. Prepare Root (Me)
                let rootUser = null;
                // Use profile if mostly complete, else fetch fresh
                if (profile && profile.uid === user.uid) {
                    rootUser = profile;
                } else {
                    const docSnap = await getDoc(doc(db, "users", user.uid));
                    if (docSnap.exists()) {
                        rootUser = { uid: docSnap.id, ...docSnap.data() };
                    }
                }

                console.log("[Struttura] Root user found:", !!rootUser);

                if (rootUser) {
                    // Aggiustatatina al nome del Root se è \"Utente\" o vuoto
                    const nomeT = [(rootUser.nome || ""), (rootUser.cognome || "")].join(" ").trim();
                    if (!nomeT || nomeT.toLowerCase() === "utente") {
                        rootUser.displayName = user.displayName || user.email || "Io";
                    }
                    const rootNode = buildUserTree(rootUser, downline);
                    setTreeData(rootNode);
                } else {
                    // EMERGENCY FALLBACK: If profile is missing or corrupted, use Auth for Root
                    const fallbackRoot = {
                        uid: user.uid,
                        nome: user.displayName?.split(" ")[0] || "Tu",
                        cognome: user.displayName?.split(" ").slice(1).join(" ") || "",
                        email: user.email,
                        role: "Collaboratore",
                        isVirtual: false
                    };
                    const rootNode = buildUserTree(fallbackRoot, downline);
                    setTreeData(rootNode);
                }
            } catch (err) {
                console.error("Structure fetch error:", err);
            } finally {
                setLoading(false);
            }
        }

        fetchStructure();
    }, [user, profile]);

    const handleCreateVirtual = async (parentId, nome, cognome) => {
        try {
            console.log("[Structure] Creating virtual under:", parentId);
            const parentSnap = await getDoc(doc(db, "users", parentId));
            let newChain = [parentId];

            if (parentSnap.exists()) {
                const pData = parentSnap.data();
                const pChain = pData.driverChain || [];
                // La nuova catena è la catena del padre + il padre stesso
                newChain = [...pChain, parentId];
                console.log("[Structure] Parent found. New chain:", newChain);
            }

            await addDoc(collection(db, "users"), {
                nome,
                cognome,
                driverUid: parentId,
                driverChain: newChain,
                isVirtual: true,
                createdAt: serverTimestamp(),
                role: "Collaboratore",
                email: "virtual_" + Math.random().toString(36).substring(2, 9) + "@crm-rise.com"
            });

            // REFRESH
            window.location.reload();
        } catch (e) {
            console.error("[Structure] Create Virtual Error:", e);
            alert("Errore: " + e.message);
        }
    };

    const handleDeleteVirtual = async (targetId, name) => {
        if (!window.confirm(`Vuoi davvero eliminare ${name} dalla tua mappa mentale?`)) return;
        try {
            await deleteDoc(doc(db, "users", targetId));
            window.location.reload();
        } catch (e) {
            alert("Errore nell'eliminazione: " + e.message);
        }
    };

    const handleNodeClick = (node) => {
        setSelectedNode(node);
        setModalOpen(true);
    };

    if (loading) return <div className="ns-page"><div className="ns-content">Caricamento struttura...</div></div>;
    if (!treeData) return <div className="ns-page"><div className="ns-content">Nessuna struttura trovata.</div></div>;

    return (
        <div className="ns-page">
            <div className="ns-header-overlay">
                <h1>Struttura</h1>
                <p>La mia rete commerciale</p>
            </div>

            <div className="ns-viewport">
                <div className="ns-content">
                    <ul className="ns-tree">
                        <OrgTree node={treeData} isRoot={true} onNodeClick={handleNodeClick} />
                    </ul>
                </div>
            </div>

            <StructureModal
                isOpen={modalOpen}
                onClose={() => setModalOpen(false)}
                node={selectedNode}
                onCreateVirtual={handleCreateVirtual}
                onDeleteVirtual={handleDeleteVirtual}
                isMe={selectedNode?.uid === user?.uid}
            />
        </div>
    );
}

