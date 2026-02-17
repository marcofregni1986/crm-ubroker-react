// src/pages/ForumPage.jsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Plus,
  Search,
  Image as ImageIcon,
  Send,
  ArrowLeft,
  Pin,
  PinOff,
  Lock,
  Unlock,
  Trash2,
  Shield,
  X,
  Menu,
  Eye,
} from "lucide-react";
import "./forum.css";
import { useAuth } from "../auth/AuthProvider";
import CustomSelect from "../components/CustomSelect";

// ✅ Firestore
import { db } from "../firebase";
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  increment,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from "firebase/firestore";

// ✅ Firebase Storage (immagini forum)
import { getStorage, ref as storageRef, uploadBytes, getDownloadURL } from "firebase/storage";

/**
 * FORUM — Firebase (Firestore + Storage)
 *
 * Collections:
 * - forumDiscussions/{discussionId}
 *   {
 *     title, category,
 *     pinned:boolean, locked:boolean,
 *     ownerUid, ownerName,
 *     createdAt, updatedAt,
 *     lastMessageAt,
 *     lastMessageText,
 *     messageCount:number
 *   }
 *
 * - forumDiscussions/{discussionId}/messages/{messageId}
 *   { createdByUid, createdByName, text, imageUrl, createdAt }
 *
 * - forumThreadReads/{uid_discussionId}
 *   { userUid, discussionId, lastReadAt }
 */

const CATEGORIES = [
  "Tutte le categorie",
  "Generale",
  "Appuntamenti",
  "StepOne",
  "Change Your Life",
  "Struttura",
  "Domande tecniche",
  "Script & Messaggi",
  "KPI & Performance",
  "Eventi",
  "Altro",
];

function safeLower(s) {
  return (s || "").toString().toLowerCase();
}

function avatarLetter(name) {
  const s = (name || "U").trim();
  return (s[0] || "U").toUpperCase();
}

function formatTs(ts) {
  if (!ts) return "";
  try {
    const d = ts?.toDate ? ts.toDate() : new Date(ts);
    const dd = String(d.getDate()).padStart(2, "0");
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const hh = String(d.getHours()).padStart(2, "0");
    const mi = String(d.getMinutes()).padStart(2, "0");
    return `${dd}/${mm} ${hh}:${mi}`;
  } catch {
    return "";
  }
}

function isDarkTheme() {
  try {
    return document?.body?.classList?.contains("theme-dark");
  } catch {
    return true;
  }
}

function menuStyles() {
  const dark = isDarkTheme();
  return {
    panel: {
      background: dark ? "rgba(18, 18, 24, 0.92)" : "rgba(255,255,255,0.95)",
      color: dark ? "rgba(255,255,255,0.92)" : "rgba(20,20,24,0.92)",
      border: dark ? "1px solid rgba(255,255,255,0.10)" : "1px solid rgba(10,10,12,0.12)",
      boxShadow: "0 18px 60px rgba(0,0,0,0.35)",
      backdropFilter: "blur(10px)",
      borderRadius: 14,
    },
    item: {
      background: "transparent",
      color: "inherit",
      border: "1px solid transparent",
    },
    itemHover: {
      background: dark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.06)",
      border: dark ? "1px solid rgba(255,255,255,0.12)" : "1px solid rgba(0,0,0,0.10)",
    },
  };
}



async function uploadForumImage({ file, discussionId, uid }) {
  const storage = getStorage();
  const safeName = (file?.name || "image").replace(/[^\w.\-]+/g, "_").slice(0, 80);
  const path = `forumUploads/${discussionId}/${Date.now()}_${uid}_${safeName}`;
  const ref = storageRef(storage, path);
  await uploadBytes(ref, file);
  return await getDownloadURL(ref);
}

export default function ForumPage() {
  const { uid, profile, permissions, isAdmin: isAdminFromAuth, loading } = useAuth();

  const currentUser = useMemo(() => {
    const displayName = profile?.displayName || profile?.name || profile?.email || "Utente";
    const isAdmin = !!isAdminFromAuth || !!permissions?.isAdmin || profile?.role === "admin";
    return { uid, name: displayName, isAdmin };
  }, [uid, profile, permissions, isAdminFromAuth]);

  const [threads, setThreads] = useState([]);
  const [readsMap, setReadsMap] = useState({});

  const [activeCategory, setActiveCategory] = useState("Tutte le categorie");
  const [search, setSearch] = useState("");
  const [activeThreadId, setActiveThreadId] = useState(null);

  const [view, setView] = useState("list");
  const [menuOpen, setMenuOpen] = useState(false);

  const [replyText, setReplyText] = useState("");
  const [replyImageFile, setReplyImageFile] = useState(null);
  const [sending, setSending] = useState(false);
  const fileInputRef = useRef(null);

  const [isNewOpen, setIsNewOpen] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newCategory, setNewCategory] = useState("Generale");
  const [newText, setNewText] = useState("");

  const [messages, setMessages] = useState([]);
  const [threadLoading, setThreadLoading] = useState(false);

  const activeThread = useMemo(() => threads.find((t) => t.id === activeThreadId) || null, [threads, activeThreadId]);

  // Discussions
  useEffect(() => {
    if (loading) return;
    if (!uid) {
      setThreads([]);
      setActiveThreadId(null);
      return;
    }

    const qy = query(collection(db, "forumDiscussions"), orderBy("updatedAt", "desc"), limit(300));
    const unsub = onSnapshot(
      qy,
      (snap) => {
        const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        list.sort((a, b) => (b.pinned === a.pinned ? 0 : b.pinned ? 1 : -1));
        setThreads(list);
        if (!activeThreadId && list.length) setActiveThreadId(list[0].id);
      },
      (err) => console.error("[Forum] discussions snapshot error:", err)
    );

    return () => unsub();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uid, loading]);

  // Reads map (unread)
  useEffect(() => {
    if (loading) return;
    if (!uid) {
      setReadsMap({});
      return;
    }

    const qy = query(collection(db, "forumThreadReads"), where("userUid", "==", uid), limit(500));
    const unsub = onSnapshot(
      qy,
      (snap) => {
        const next = {};
        snap.docs.forEach((d) => {
          const data = d.data() || {};
          if (data.discussionId) next[data.discussionId] = data.lastReadAt || null;
        });
        setReadsMap(next);
      },
      (err) => console.error("[Forum] reads snapshot error:", err)
    );

    return () => unsub();
  }, [uid, loading]);

  // Messages for active thread
  useEffect(() => {
    if (loading) return;
    if (!uid || !activeThreadId) {
      setMessages([]);
      return;
    }

    setThreadLoading(true);
    const qy = query(collection(db, "forumDiscussions", activeThreadId, "messages"), orderBy("createdAt", "asc"), limit(800));
    const unsub = onSnapshot(
      qy,
      (snap) => {
        setMessages(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
        setThreadLoading(false);
      },
      (err) => {
        console.error("[Forum] messages snapshot error:", err);
        setThreadLoading(false);
      }
    );

    return () => unsub();
  }, [uid, activeThreadId, loading]);

  useEffect(() => {
    const onKeyDown = (e) => {
      if (e.key === "Escape") {
        if (isNewOpen) setIsNewOpen(false);
        if (menuOpen) setMenuOpen(false);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isNewOpen, menuOpen]);

  useEffect(() => {
    if (view !== "list") return;
    document.body.style.overflow = menuOpen ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [menuOpen, view]);

  const filteredThreads = useMemo(() => {
    let list = [...threads];
    if (activeCategory && activeCategory !== "Tutte le categorie") {
      list = list.filter((t) => t.category === activeCategory);
    }
    const q = safeLower(search).trim();
    if (q) {
      list = list.filter((t) => {
        const inTitle = safeLower(t.title).includes(q);
        const inAuthor = safeLower(t.ownerName).includes(q);
        const inLast = safeLower(t.lastMessageText).includes(q);
        return inTitle || inAuthor || inLast;
      });
    }
    return list;
  }, [threads, activeCategory, search]);

  const categoryCounts = useMemo(() => {
    const base = {};
    CATEGORIES.forEach((c) => (base[c] = 0));
    threads.forEach((t) => {
      base["Tutte le categorie"] += 1;
      base[t.category] = (base[t.category] || 0) + 1;
    });
    return base;
  }, [threads]);

  function openThread(id) {
    setActiveThreadId(id);
    setView("thread");
    setMenuOpen(false);
  }

  function goBackToList() {
    setView("list");
  }

  async function markThreadRead(discussionId) {
    if (!uid || !discussionId) return;
    try {
      const readId = `${uid}_${discussionId}`;
      await setDoc(doc(db, "forumThreadReads", readId), { userUid: uid, discussionId, lastReadAt: serverTimestamp() }, { merge: true });
    } catch (e) {
      console.warn("[Forum] mark read failed:", e);
    }
  }

  useEffect(() => {
    if (view !== "thread") return;
    if (!activeThreadId) return;
    markThreadRead(activeThreadId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, activeThreadId]);

  function isUnread(thread) {
    if (!thread?.lastMessageAt) return false;
    const lastRead = readsMap[thread.id] || null;
    if (!lastRead) return true;
    try {
      const a = lastRead?.toDate ? lastRead.toDate().getTime() : new Date(lastRead).getTime();
      const b = thread.lastMessageAt?.toDate ? thread.lastMessageAt.toDate().getTime() : new Date(thread.lastMessageAt).getTime();
      return a < b;
    } catch {
      return false;
    }
  }

  async function togglePin(threadId) {
    if (!currentUser.isAdmin) return;
    try {
      const ref = doc(db, "forumDiscussions", threadId);
      const snap = await getDoc(ref);
      if (!snap.exists()) return;
      const pinned = !!snap.data().pinned;
      await updateDoc(ref, { pinned: !pinned, updatedAt: serverTimestamp() });
    } catch (e) {
      console.error("[Forum] togglePin error:", e);
    }
  }

  async function toggleLock(threadId) {
    if (!currentUser.isAdmin) return;
    try {
      const ref = doc(db, "forumDiscussions", threadId);
      const snap = await getDoc(ref);
      if (!snap.exists()) return;
      const locked = !!snap.data().locked;
      await updateDoc(ref, { locked: !locked, updatedAt: serverTimestamp() });
    } catch (e) {
      console.error("[Forum] toggleLock error:", e);
    }
  }

  async function deleteThread(threadId) {
    if (!currentUser.isAdmin) return;
    try {
      await deleteDoc(doc(db, "forumDiscussions", threadId));
      if (activeThreadId === threadId) {
        setActiveThreadId(null);
        setView("list");
      }
    } catch (e) {
      console.error("[Forum] deleteThread error:", e);
    }
  }

  function onPickImage() {
    fileInputRef.current?.click();
  }

  function onFileChange(e) {
    const f = e.target.files?.[0] || null;
    setReplyImageFile(f);
  }

  async function sendReply() {
    if (!activeThreadId) return;
    if (!uid) return;
    if (activeThread?.locked) return;

    const text = replyText.trim();
    if (!text && !replyImageFile) return;

    if (sending) return;
    setSending(true);

    try {
      let imageUrl = "";

      if (replyImageFile) {
        if (replyImageFile.size > 2.5 * 1024 * 1024) {
          alert("Immagine troppo grande. Usa un file sotto ~2.5MB.");
          setSending(false);
          return;
        }
        imageUrl = await uploadForumImage({ file: replyImageFile, discussionId: activeThreadId, uid });
      }

      await addDoc(collection(db, "forumDiscussions", activeThreadId, "messages"), {
        createdByUid: uid,
        createdByName: currentUser.name,
        text: text || "",
        imageUrl: imageUrl || "",
        createdAt: serverTimestamp(),
      });

      await updateDoc(doc(db, "forumDiscussions", activeThreadId), {
        updatedAt: serverTimestamp(),
        lastMessageAt: serverTimestamp(),
        lastMessageText: (text || "").slice(0, 300),
        messageCount: increment(1),
      });

      setReplyText("");
      setReplyImageFile(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
      markThreadRead(activeThreadId);
    } catch (e) {
      console.error("[Forum] sendReply error:", e);
      alert("Errore invio messaggio (upload/storage o rules).");
    } finally {
      setSending(false);
    }
  }

  function openNewModal() {
    setIsNewOpen(true);
    setNewTitle("");
    setNewCategory("Generale");
    setNewText("");
  }

  function closeNewModal() {
    setIsNewOpen(false);
  }

  async function createThread() {
    const t = newTitle.trim();
    const body = newText.trim();
    if (!t || !body) return;
    if (!uid) return;
    if (sending) return;

    setSending(true);
    try {
      const discRef = await addDoc(collection(db, "forumDiscussions"), {
        title: t,
        category: newCategory,
        pinned: false,
        locked: false,
        ownerUid: uid,
        ownerName: currentUser.name,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        lastMessageAt: serverTimestamp(),
        lastMessageText: body.slice(0, 300),
        messageCount: 1,
      });

      await addDoc(collection(db, "forumDiscussions", discRef.id, "messages"), {
        createdByUid: uid,
        createdByName: currentUser.name,
        text: body,
        imageUrl: "",
        createdAt: serverTimestamp(),
      });

      setIsNewOpen(false);
      setActiveCategory("Tutte le categorie");
      setSearch("");
      setActiveThreadId(discRef.id);
      setView("thread");
      markThreadRead(discRef.id);
    } catch (e) {
      console.error("[Forum] createThread error:", e);
      alert("Errore creazione discussione.");
    } finally {
      setSending(false);
    }
  }

  if (loading) {
    return (
      <div className="forum-page">
        <div className="section">Caricamento…</div>
      </div>
    );
  }

  if (!uid) {
    return (
      <div className="forum-page">
        <div className="section">Devi essere loggato per usare il Forum.</div>
      </div>
    );
  }

  return (
    <div className="main forum-page">
      <div className="main-header">
        <div>
          <div className="main-title">Community</div>
          <div className="main-subtitle">Discuti, condividi e collabora con il team.</div>
        </div>
        <div className="badge-status">Rise Community</div>
      </div>

      <div className="forum-container">
        {/* --- SIDEBAR (Desktop) / DRAWER (Mobile) --- */}
        <aside className={"forum-sidebar" + (menuOpen ? " mobile-open" : "")}>
          <div className="forum-toolbar mobile-only" style={{ marginBottom: 16 }}>
            <h3 style={{ margin: 0, fontSize: 18, color: "white" }}>Categorie</h3>
            <button className="btn-icon" onClick={() => setMenuOpen(false)}><X size={18} /></button>
          </div>

          {CATEGORIES.map((c) => (
            <button
              key={c}
              className={"forum-cat-btn" + (activeCategory === c ? " active" : "")}
              onClick={() => {
                setActiveCategory(c);
                setMenuOpen(false);
              }}
            >
              <span>{c}</span>
              <span className="forum-cat-count">{categoryCounts[c] || 0}</span>
            </button>
          ))}
        </aside>

        {/* --- CONTENT AREA --- */}
        <main className="forum-content">

          {/* TOOLBAR (Only relevant in List view or if we want global search) */}
          {view === "list" && (
            <div className="forum-toolbar">
              <button
                className="btn-secondary mobile-only"
                onClick={() => setMenuOpen(true)}
                style={{ marginRight: 8 }}
              >
                <Menu size={18} />
              </button>

              <div className="forum-search-box">
                <Search size={16} className="forum-search-icon" />
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Cerca discussioni..."
                />
              </div>

              <button className="btn-primary" onClick={openNewModal}>
                <Plus size={18} /> Nuova
              </button>
            </div>
          )}

          {/* LIST VIEW */}
          {view === "list" && (
            <div className="forum-thread-list">
              {filteredThreads.length === 0 ? (
                <div style={{ padding: 40, textAlign: "center", color: "var(--text-muted)" }}>
                  Nessuna discussione trovata.
                </div>
              ) : (
                filteredThreads.map((t) => (
                  <div
                    key={t.id}
                    className="forum-thread-item"
                    role="button"
                    tabIndex={0}
                    onClick={() => openThread(t.id)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        openThread(t.id);
                      }
                    }}
                  >
                    <div className="thread-avatar">
                      {avatarLetter(t.ownerName)}
                    </div>
                    <div className="thread-info">
                      <div className="thread-header">
                        <div className="thread-title">
                          {(t.pinned) && <span className="badge-mini pin">PIN</span>}
                          {isUnread(t) && <span className="badge-mini new">NEW</span>}
                          {t.title}
                        </div>
                        <div className="thread-meta">
                          {formatTs(t.updatedAt)}
                        </div>
                      </div>
                      <div className="thread-preview">
                        <span style={{ color: "var(--text-main)", fontWeight: 500, marginRight: 6 }}>
                          {t.ownerName}:
                        </span>
                        {t.lastMessageText || "Nessun messaggio"}
                      </div>
                      <div className="thread-badges" style={{ marginTop: 6 }}>
                        <span className="badge-mini" style={{ background: "rgba(255,255,255,0.05)", color: "#94a3b8" }}>
                          {t.category}
                        </span>
                        {t.locked && <span className="badge-mini lock">CHIUSA</span>}
                      </div>

                      {/* Admin Quick Actions (Hover) */}
                      {currentUser.isAdmin && (
                        <div className="disc-admin" style={{ marginTop: 8, padding: 0, border: "none", background: "transparent" }} onClick={(e) => e.stopPropagation()}>
                          <button className="btn-icon" onClick={() => togglePin(t.id)} title="Pin/Unpin">
                            {t.pinned ? <PinOff size={14} /> : <Pin size={14} />}
                          </button>
                          <button className="btn-icon" onClick={() => toggleLock(t.id)} title="Lock/Unlock">
                            {t.locked ? <Unlock size={14} /> : <Lock size={14} />}
                          </button>
                          <button className="btn-icon danger" onClick={() => deleteThread(t.id)} title="Elimina">
                            <Trash2 size={14} />
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          )}

          {/* THREAD DETAIL VIEW */}
          {view === "thread" && activeThread && (
            <div className="forum-detail-view">
              {/* Header */}
              <div className="detail-header">
                <button className="btn-icon" onClick={goBackToList}>
                  <ArrowLeft size={18} />
                </button>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 16, fontWeight: 700, color: "white", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                    {activeThread.title}
                  </div>
                  <div style={{ fontSize: 12, color: "var(--text-muted)" }}>
                    {activeThread.category} • {activeThread.ownerName}
                  </div>
                </div>
                {activeThread.locked && <span className="badge-mini lock">LOCKED</span>}
                {activeThread.pinned && <span className="badge-mini pin">PINNED</span>}

                {currentUser.isAdmin && (
                  <div style={{ display: "flex", gap: 4 }}>
                    <button className="btn-icon" onClick={() => togglePin(activeThread.id)}>
                      {activeThread.pinned ? <PinOff size={16} /> : <Pin size={16} />}
                    </button>
                    <button className="btn-icon" onClick={() => toggleLock(activeThread.id)}>
                      {activeThread.locked ? <Unlock size={16} /> : <Lock size={16} />}
                    </button>
                    <button className="btn-icon danger" onClick={() => deleteThread(activeThread.id)}>
                      <Trash2 size={16} />
                    </button>
                  </div>
                )}
              </div>

              {/* Messages Stream */}
              <div className="detail-messages">
                {/* Original Post (First Message usually, but we treat it as stream) */}
                {/* Optimization: The 'messages' array typically includes the first post if created via addDoc logic. 
                     We iterate over all messages. */}
                {messages.map((m) => {
                  const isMe = m.createdByUid === uid;
                  return (
                    <div key={m.id} className={"msg-row" + (isMe ? " me" : "")}>
                      {!isMe && (
                        <div className="thread-avatar" style={{ width: 32, height: 32, fontSize: 12 }}>
                          {avatarLetter(m.createdByName)}
                        </div>
                      )}
                      <div>
                        <div className="msg-sender" style={{ textAlign: isMe ? "right" : "left" }}>
                          {m.createdByName} <span className="msg-time">{formatTs(m.createdAt)}</span>
                        </div>
                        <div className="msg-bubble">
                          {m.text}
                          {m.imageUrl && (
                            <div className="msg-image">
                              <img src={m.imageUrl} alt="attachment" />
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
                <div ref={(el) => el?.scrollIntoView({ behavior: "smooth" })} />
              </div>

              {/* Reply Box */}
              {!activeThread.locked ? (
                <div className="detail-footer">
                  {replyImageFile && (
                    <div style={{ marginBottom: 8, fontSize: 12, display: "flex", alignItems: "center", gap: 6, color: "#94a3b8" }}>
                      <ImageIcon size={14} /> Immagine selezionata: {replyImageFile.name}
                      <button onClick={() => setReplyImageFile(null)} style={{ background: "none", border: "none", color: "#ef4444", cursor: "pointer" }}>
                        <X size={14} />
                      </button>
                    </div>
                  )}
                  <div className="reply-input-wrapper">
                    <button className="btn-icon" onClick={onPickImage} title="Allega immagine">
                      <ImageIcon size={18} />
                    </button>
                    <input
                      type="file"
                      ref={fileInputRef}
                      style={{ display: "none" }}
                      accept="image/*"
                      onChange={onFileChange}
                    />
                    <textarea
                      placeholder="Scrivi un messaggio..."
                      value={replyText}
                      onChange={(e) => setReplyText(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && !e.shiftKey) {
                          e.preventDefault();
                          sendReply();
                        }
                      }}
                    />
                    <button
                      className="btn-primary"
                      style={{ padding: "8px 12px", borderRadius: 8 }}
                      onClick={sendReply}
                      disabled={sending || (!replyText.trim() && !replyImageFile)}
                    >
                      <Send size={16} />
                    </button>
                  </div>
                </div>
              ) : (
                <div className="detail-footer" style={{ textAlign: "center", fontStyle: "italic", color: "var(--text-muted)" }}>
                  Questa discussione è chiusa.
                </div>
              )}
            </div>
          )}
        </main>
      </div>

      {/* NEW DISCUSSION MODAL */}
      {isNewOpen && (
        <div className="modal-overlay open" onClick={closeNewModal}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <div className="modal-title">Nuova Discussione</div>
              <button className="modal-close" onClick={closeNewModal}><X size={20} /></button>
            </div>
            <div className="modal-body">
              <div className="form-group">
                <label>Titolo</label>
                <input
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  placeholder="Argomento della discussione..."
                  autoFocus
                />
              </div>
              <div className="form-group">
                <label>Categoria</label>
                <CustomSelect
                  value={newCategory}
                  options={CATEGORIES.filter(c => c !== "Tutte le categorie").map(c => ({ value: c, label: c }))}
                  onChange={setNewCategory}
                />
              </div>
              <div className="form-group">
                <label>Messaggio</label>
                <textarea
                  className="form-textarea"
                  value={newText}
                  onChange={(e) => setNewText(e.target.value)}
                  placeholder="Scrivi qui..."
                />
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn-secondary" onClick={closeNewModal}>Annulla</button>
              <button
                className="btn-primary"
                onClick={createThread}
                disabled={!newTitle.trim() || !newText.trim() || sending}
              >
                {sending ? "Pubblicazione..." : "Pubblica"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
