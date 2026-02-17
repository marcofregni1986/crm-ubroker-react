import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../auth/AuthProvider';
import { db, storage } from '../firebase';
import {
    collection, query, where, orderBy, onSnapshot,
    addDoc, serverTimestamp, getDocs, doc, setDoc, updateDoc
} from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { MessageSquare, X, Send, ChevronLeft, MoreVertical, Users, Smile, Paperclip, Loader2, Search, GripVertical } from 'lucide-react';
import EmojiPicker from 'emoji-picker-react';
import './chat-widget.css';

export default function ChatWidget() {
    const { user, profile } = useAuth();

    // Memoize currentUser to prevent effect loops, but dependent on profile updates
    const currentUser = React.useMemo(() => {
        return user ? { uid: user.uid, email: user.email, ...profile } : null;
    }, [user, profile]);

    // --- DRAGGABLE FAB LOGIC ---
    const [fabPos, setFabPos] = useState(() => {
        try {
            const saved = localStorage.getItem('chat_fab_pos');
            if (saved) return JSON.parse(saved);
        } catch (e) { }
        // Default: Bottom Right
        return { x: window.innerWidth - 90, y: window.innerHeight - 90 };
    });
    const [isDragging, setIsDragging] = useState(false);
    const dragStart = useRef({ x: 0, y: 0 });
    const dragPosRef = useRef(fabPos);

    const handleDragStart = (e) => {
        if (isOpen) return; // Prevent drag if open? Or just allow it? Let's say drag only if closed to keep it simple
        setIsDragging(true);
        // Universal clientX/Y
        const clientX = e.type === 'touchstart' ? e.touches[0].clientX : e.clientX;
        const clientY = e.type === 'touchstart' ? e.touches[0].clientY : e.clientY;
        dragStart.current = { x: clientX - fabPos.x, y: clientY - fabPos.y };
        e.stopPropagation();
    };

    useEffect(() => {
        const handleDrag = (e) => {
            if (!isDragging) return;
            const clientX = e.type === 'touchmove' ? e.touches[0].clientX : e.clientX;
            const clientY = e.type === 'touchmove' ? e.touches[0].clientY : e.clientY;

            const newX = Math.max(20, Math.min(window.innerWidth - 80, clientX - dragStart.current.x));
            const newY = Math.max(20, Math.min(window.innerHeight - 80, clientY - dragStart.current.y));

            const newPos = { x: newX, y: newY };
            setFabPos(newPos);
            dragPosRef.current = newPos;
        };

        const handleDragEnd = () => {
            if (isDragging) {
                setIsDragging(false);
                localStorage.setItem('chat_fab_pos', JSON.stringify(dragPosRef.current));
            }
        };

        if (isDragging) {
            window.addEventListener('mousemove', handleDrag);
            window.addEventListener('mouseup', handleDragEnd);
            window.addEventListener('touchmove', handleDrag, { passive: false });
            window.addEventListener('touchend', handleDragEnd);
        }
        return () => {
            window.removeEventListener('mousemove', handleDrag);
            window.removeEventListener('mouseup', handleDragEnd);
            window.removeEventListener('touchmove', handleDrag);
            window.removeEventListener('touchend', handleDragEnd);
        };
    }, [isDragging]);

    // --- STATE ---
    const [isOpen, setIsOpen] = useState(false);
    const [view, setView] = useState('list'); // 'list' | 'chat'
    const [activeChatId, setActiveChatId] = useState(null);
    const [targetUser, setTargetUser] = useState(null);

    const [allUsers, setAllUsers] = useState([]);
    const [loadingUsers, setLoadingUsers] = useState(true);
    const [searchTerm, setSearchTerm] = useState("");

    const [messages, setMessages] = useState([]);
    const [inputText, setInputText] = useState("");
    const [showEmoji, setShowEmoji] = useState(false);
    const [unreadMap, setUnreadMap] = useState({});

    const messagesEndRef = useRef(null);

    // --- 1. USER FETCHING (The "Stable" Logic) ---
    useEffect(() => {
        if (!currentUser) return;
        setLoadingUsers(true);

        const q = query(collection(db, "users"));
        const unsub = onSnapshot(q, (snapshot) => {
            const u = [];
            snapshot.forEach((doc) => {
                if (doc.id === currentUser.uid) return;
                u.push({ id: doc.id, ...doc.data() });
            });
            setAllUsers(u);
            setLoadingUsers(false);
        });

        return () => unsub();
    }, [currentUser?.uid]);

    // --- 2. MESSAGE FETCHING ---
    useEffect(() => {
        if (!activeChatId) {
            setMessages([]);
            return;
        }

        markAsRead(activeChatId);

        const q = query(
            collection(db, "chats", activeChatId, "messages"),
            orderBy("createdAt", "asc")
        );

        const unsub = onSnapshot(q, (snapshot) => {
            const msgs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            setMessages(msgs);
            setTimeout(scrollToBottom, 100);
        });

        return () => unsub();
    }, [activeChatId]);

    // --- 3. UNREAD TRACKING ---
    useEffect(() => {
        if (!currentUser) return;

        const checkUnread = (chatId, data) => {
            if (!data) return;
            const lastMsgTime = data.updatedAt?.toMillis ? data.updatedAt.toMillis() : 0;
            const myReadTime = data[`lastRead_${currentUser.uid}`]?.toMillis ? data[`lastRead_${currentUser.uid}`].toMillis() : 0;
            const isUnread = lastMsgTime > myReadTime && data.lastSenderId !== currentUser.uid;

            setUnreadMap(prev => {
                if (prev[chatId] === isUnread) return prev;
                return { ...prev, [chatId]: isUnread };
            });
        };

        const unsubGeneric = onSnapshot(doc(db, "chats", "generic_team_chat"), (snap) => {
            if (snap.exists()) checkUnread(snap.id, snap.data());
        });

        const q = query(collection(db, "chats"), where("participants", "array-contains", currentUser.uid));
        const unsubChats = onSnapshot(q, (snapshot) => {
            snapshot.forEach(docSnap => checkUnread(docSnap.id, docSnap.data()));
        });

        return () => { unsubGeneric(); unsubChats(); };
    }, [currentUser]);

    // --- HELPERS ---
    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    };

    const markAsRead = async (chatId) => {
        if (!chatId || !currentUser) return;
        setUnreadMap(prev => ({ ...prev, [chatId]: false }));
        try {
            await updateDoc(doc(db, "chats", chatId), { [`lastRead_${currentUser.uid}`]: serverTimestamp() });
        } catch (e) { }
    };

    const formatTime = (timestamp) => {
        if (!timestamp) return "";
        const d = timestamp.toDate();
        return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    };

    // --- HANDLERS ---
    const handleGenericChat = () => {
        setTargetUser({ nome: "Team", cognome: "Generale", isGroup: true });
        setActiveChatId("generic_team_chat");
        setView('chat');
        setShowEmoji(false);
    };

    const handleUserSelect = async (u) => {
        setTargetUser(u);
        const chatId = [currentUser.uid, u.id].sort().join("_");
        setActiveChatId(chatId);
        setView('chat');
        setShowEmoji(false);

        const chatRef = doc(db, "chats", chatId);
        try {
            const snap = await getDocs(query(collection(db, "chats"), where("__name__", "==", chatId)));
            if (snap.empty) {
                await setDoc(chatRef, {
                    participants: [currentUser.uid, u.id],
                    createdAt: serverTimestamp(),
                    updatedAt: serverTimestamp(),
                    lastMessage: "",
                    [`lastRead_${currentUser.uid}`]: serverTimestamp(),
                    [`lastRead_${u.id}`]: serverTimestamp()
                });
            }
        } catch (e) { console.error(e); }
    };

    const handleBack = () => {
        setView('list');
        setActiveChatId(null);
        setTargetUser(null);
        setSearchTerm("");
    };

    const sendMessage = async (e) => {
        e.preventDefault();
        if (!inputText.trim() || !activeChatId) return;

        const text = inputText.trim();
        setInputText("");
        setShowEmoji(false);

        try {
            await addDoc(collection(db, "chats", activeChatId, "messages"), {
                text, senderId: currentUser.uid, createdAt: serverTimestamp(), type: 'text'
            });
            await updateDoc(doc(db, "chats", activeChatId), {
                lastMessage: text, updatedAt: serverTimestamp(), lastSenderId: currentUser.uid
            });
            scrollToBottom();
        } catch (e) { console.error(e); }
    };

    const onEmojiClick = (emojiObject) => {
        setInputText(prev => prev + emojiObject.emoji);
    };

    // --- HIERARCHICAL FILTERING LOGIC ---
    const hierarchicalUsers = React.useMemo(() => {
        if (!currentUser) return [];
        const myUid = currentUser.uid;
        const isAdmin = currentUser.role === 'admin'
            || currentUser.isAdmin === true
            || currentUser.permissions?.isAdmin === true;

        if (isAdmin) return allUsers;

        const myChain = currentUser.driverChain || [];

        return allUsers.filter(u => {
            const otherChain = u.driverChain || [];
            const isDownline = otherChain.includes(myUid);
            const isUpline = myChain.includes(u.id);
            const isDirectDriver = String(currentUser.driverUid) === String(u.id);
            const amIDirectDriver = String(u.driverUid) === String(myUid);

            return isDownline || isUpline || isDirectDriver || amIDirectDriver;
        });
    }, [allUsers, currentUser]);

    const filteredUsers = hierarchicalUsers.filter(u => {
        if (!searchTerm) return true;
        const full = `${u.nome || ''} ${u.cognome || ''}`.toLowerCase();
        return full.includes(searchTerm.toLowerCase());
    });

    const totalUnread = Object.values(unreadMap).filter(Boolean).length;

    if (!currentUser) return null;

    // Adjust panel position relative to FAB if open
    // We'll keep the panel above the FAB
    const fabStyle = {
        left: fabPos.x,
        top: fabPos.y,
        position: 'fixed',
        zIndex: 10000,
        cursor: isDragging ? 'grabbing' : 'pointer',
        touchAction: 'none'
    };

    const panelStyle = {
        position: 'fixed',
        right: window.innerWidth - fabPos.x - 60 < 380 ? '20px' : 'auto',
        left: window.innerWidth - fabPos.x - 60 < 380 ? 'auto' : fabPos.x - 320,
        bottom: window.innerHeight - fabPos.y + 10,
        zIndex: 10001
    };

    // For better UX, let's just use fixed right/bottom for the panel if it's too complicated,
    // but the user wants to avoid covering things.
    // simpler: panel always stays in the same place (bottom right) OR follows FAB.
    // Let's make it follow FAB but clamped.

    return (
        <div className="chat-widget-container-draggable">
            {isOpen && (
                <div className="chat-panel" style={panelStyle}>
                    <div className="chat-header">
                        {view === 'chat' ? (
                            <div className="header-user-info">
                                <button onClick={handleBack} style={{ background: 'none', border: 'none', color: 'white', cursor: 'pointer', padding: 0 }}>
                                    <ChevronLeft size={24} />
                                </button>
                                <div className="header-avatar" style={targetUser?.isGroup ? { background: '#00a884' } : {}}>
                                    {targetUser?.isGroup ? <Users size={20} /> : targetUser?.nome?.charAt(0).toUpperCase()}
                                </div>
                                <div className="chat-title">{targetUser?.nome} {targetUser?.cognome}</div>
                            </div>
                        ) : (
                            <div className="chat-title">WhatsApp CRM</div>
                        )}
                        <div className="header-actions">
                            <button onClick={() => setIsOpen(false)} style={{ background: 'none', border: 'none', color: '#aebac1', cursor: 'pointer' }}>
                                <X size={20} />
                            </button>
                        </div>
                    </div>

                    {view === 'list' && (
                        <div className="chat-user-list">
                            <div className="chat-search-container">
                                <div className="chat-search-bar">
                                    <Search size={16} color="#8696a0" style={{ marginRight: 8 }} />
                                    <input
                                        type="text"
                                        placeholder="Cerca nella tua rete"
                                        value={searchTerm}
                                        onChange={e => setSearchTerm(e.target.value)}
                                    />
                                </div>
                            </div>

                            <button className="chat-user-item group-item" onClick={handleGenericChat}>
                                <div className="list-avatar group"><Users size={24} /></div>
                                <div className="list-info">
                                    <div className="list-name">Team Generale</div>
                                    <div className="list-sub">Gruppo CRM (Tutti)</div>
                                </div>
                                {unreadMap["generic_team_chat"] && <span className="unread-badge group-badge">NEW</span>}
                            </button>

                            <div className="list-section-title">LA MIA RETE</div>

                            <div className="users-scroll-area">
                                {loadingUsers ? (
                                    <div className="chat-loading">
                                        <Loader2 className="animate-spin" size={20} />
                                        <span>Caricamento contatti...</span>
                                    </div>
                                ) : filteredUsers.length === 0 ? (
                                    <div className="chat-empty">Nessun contatto trovato.</div>
                                ) : (
                                    filteredUsers.map(u => {
                                        const chatId = [currentUser.uid, u.id].sort().join("_");
                                        return (
                                            <button key={u.id} className="chat-user-item" onClick={() => handleUserSelect(u)}>
                                                <div className="list-avatar">{u.nome?.charAt(0).toUpperCase() || "?"}</div>
                                                <div className="list-info">
                                                    <div className="list-name">{u.nome} {u.cognome}</div>
                                                </div>
                                                {unreadMap[chatId] && <span className="unread-badge personal-badge">1</span>}
                                            </button>
                                        );
                                    })
                                )}
                            </div>
                        </div>
                    )}

                    {view === 'chat' && (
                        <div className="chat-view">
                            <div className="messages-area">
                                {messages.map(msg => {
                                    const isMe = msg.senderId === currentUser.uid;
                                    return (
                                        <div key={msg.id} className={`msg-bubble ${isMe ? 'sent' : 'received'}`}>
                                            {msg.text}
                                            <span className="msg-time">{formatTime(msg.createdAt)}</span>
                                        </div>
                                    );
                                })}
                                <div ref={messagesEndRef} />
                            </div>

                            {showEmoji && (
                                <div className="emoji-picker-container">
                                    <EmojiPicker
                                        theme="dark"
                                        width="100%"
                                        height="300px"
                                        onEmojiClick={onEmojiClick}
                                        searchDisabled
                                        previewConfig={{ showPreview: false }}
                                    />
                                </div>
                            )}

                            <form className="chat-input-area" onSubmit={sendMessage}>
                                <button type="button" className="icon-btn" onClick={() => setShowEmoji(!showEmoji)}>
                                    <Smile size={24} color={showEmoji ? "#00a884" : "#8696a0"} />
                                </button>
                                <input
                                    className="chat-input"
                                    placeholder="Scrivi messaggio"
                                    value={inputText}
                                    onChange={e => setInputText(e.target.value)}
                                    onFocus={() => setShowEmoji(false)}
                                />
                                <button type="submit" className={`send-btn ${inputText.trim() ? 'active' : ''}`}>
                                    <Send size={20} />
                                </button>
                            </form>
                        </div>
                    )}
                </div>
            )}

            <button
                className={`chat-fab ${isDragging ? 'dragging' : ''} ${isOpen ? 'active' : ''}`}
                style={fabStyle}
                onMouseDown={handleDragStart}
                onTouchStart={handleDragStart}
                onClick={() => {
                    if (!isDragging) setIsOpen(!isOpen);
                }}
            >
                {isOpen ? <X size={28} /> : (
                    <>
                        <MessageSquare size={28} />
                        {totalUnread > 0 && <span className="fab-badge">{totalUnread}</span>}
                    </>
                )}
            </button>
        </div>
    );
}
