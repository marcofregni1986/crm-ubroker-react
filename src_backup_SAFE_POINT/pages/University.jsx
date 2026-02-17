// src/pages/University.jsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  BookOpen,
  Lock,
  Plus,
  Pencil,
  Trash2,
  ExternalLink,
  Download,
  Video,
  FileText,
  Image as ImageIcon,
  Search,
  ShieldCheck,
  ChevronDown,
  ChevronRight,
  Folder, // [NEW]
} from "lucide-react";
import Markdown from "react-markdown";
import remarkBreaks from "remark-breaks";
import remarkGfm from "remark-gfm";

import "./University.css";

import { useAuth } from "../auth/useAuth";
import { auth, db, storage } from "../firebase";

import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
  where,
  setDoc, // [NEW]
} from "firebase/firestore";



import { ref as storageRef, uploadBytesResumable, getDownloadURL } from "firebase/storage";
// NOTE IMPORTANTI
// - Collection: university_modules
// - Subcollection: university_modules/{moduleId}/lessons
// - Per evitare index Firestore, quando usiamo where(isPublic==true) NON usiamo orderBy.
//   Facciamo sorting client-side.

function safeStr(v) {
  return String(v ?? "").trim();
}

function isValidUrl(u) {
  try {
    const url = new URL(u);
    return ["http:", "https:"].includes(url.protocol);
  } catch {
    return false;
  }
}

function clampArr(arr) {
  return Array.isArray(arr) ? arr.filter(Boolean) : [];
}

function sortByOrderThenCreated(a, b) {
  const ao = Number.isFinite(a.order) ? a.order : 999999;
  const bo = Number.isFinite(b.order) ? b.order : 999999;
  if (ao !== bo) return ao - bo;
  const at = a.createdAt?.seconds ? a.createdAt.seconds : 0;
  const bt = b.createdAt?.seconds ? b.createdAt.seconds : 0;
  return bt - at;
}

function PremiumToggle({ checked, onChange, disabled }) {
  return (
    <label className="toggle-switch" style={{ opacity: disabled ? 0.55 : 1 }}>
      <input type="checkbox" checked={!!checked} onChange={(e) => onChange(e.target.checked)} disabled={disabled} />
      <span className="toggle-slider" />
    </label>
  );
}

function Modal({ open, title, children, onClose, footer }) {
  if (!open) return null;
  return (
    <div className="modal-overlay open" role="dialog" aria-modal="true">
      <div className="modal" style={{ maxWidth: 760 }}>
        <div className="modal-header">
          <div className="modal-title" style={{ display: "flex", alignItems: "center", gap: 10 }}>
            {title}
          </div>
          <button className="sidebar-close" onClick={onClose} aria-label="Chiudi">
            ✕
          </button>
        </div>
        <div className="modal-body">{children}</div>
        {footer ? <div className="modal-footer">{footer}</div> : null}
      </div>
    </div>
  );
}

export default function University() {
  const { firebaseUser, profile, loading, isAdmin } = useAuth();

  // ✅ UI state
  const [qText, setQText] = useState("");
  const [showArchived, setShowArchived] = useState(false); // [NEW] future-proof

  // ✅ perms
  const perms = profile?.permissions || {};
  const canManageUniversity = isAdmin || !!perms.canManageUniversity;
  const canAccessPrivateUniversity = isAdmin || !!perms.canManageUniversity;


  // Navigation State
  const [activeTopic, setActiveTopic] = useState("");

  // ✅ Topics Metadata (Covers)
  const [topicMetadata, setTopicMetadata] = useState({}); // { "masterclass": { coverUrl: "..." } }

  // ✅ Fetch Topic Metadata
  useEffect(() => {
    // Listen to "university_topics" collection
    const q = collection(db, "university_topics");
    const unsub = onSnapshot(q, (snap) => {
      const map = {};
      snap.forEach(doc => {
        map[doc.id] = doc.data();
      });
      setTopicMetadata(map);
    });
    return () => unsub();
  }, []);

  // ✅ Actions: Topic Cover Upload
  async function uploadTopicCover(file, topicLabel) {
    if (!file || !canManageUniversity) return;

    // Sanitize Key: remove spaces, lowercase, etc. simpler for storage key?
    // Actually store docId = topicLabel (as is, or normalized?)
    // Let's use Normalized Key for Doc ID to be safe: "masterclass", "crm", "i_primi_passi..."
    const docId = topicLabel.toLowerCase().replace(/\s+/g, "_");
    const storagePath = `university_topic_covers/${docId}`;

    try {
      const r = storageRef(storage, storagePath);
      const task = uploadBytesResumable(r, file);
      // We can just wait for completion
      await task;
      const url = await getDownloadURL(r);

      // Save to Firestore
      // Save to Firestore (Upsert)
      // We use docId for storage and firestore key.
      await setDoc(doc(db, "university_topics", docId), {
        coverUrl: url,
        updatedAt: serverTimestamp()
      }, { merge: true });

      alert("Copertina aggiornata!");

      // Alert success or toast?
      alert("Copertina aggiornata!");
    } catch (e) {
      console.error("Upload topic cover details:", e);
      alert("Errore upload copertina: " + e.message);
    }
  }
  const [activeModuleId, setActiveModuleId] = useState("");

  const [modules, setModules] = useState([]);
  const [modulesLoading, setModulesLoading] = useState(true);
  const [modulesError, setModulesError] = useState("");

  const [lessonsByModule, setLessonsByModule] = useState({});
  const [lessonsLoading, setLessonsLoading] = useState(false);
  const [lessonsError, setLessonsError] = useState("");

  // create/edit module modal
  const [moduleModalOpen, setModuleModalOpen] = useState(false);
  const [moduleDraft, setModuleDraft] = useState({
    id: "",
    title: "",
    description: "",
    topic: "", // [NEW]
    coverUrl: "",
    order: 0
  });

  // create/edit lesson modal
  const [lessonModalOpen, setLessonModalOpen] = useState(false);
  const [lessonDraft, setLessonDraft] = useState({
    id: "",
    uploadKey: "",
    title: "",
    description: "",
    videoUrl: "",
    pdfUrlsText: "",
    imageUrlsText: "",
    order: 0,
  });

  // ✅ accordion lessons (apri/chiudi card contenuti)
  const [openLessons, setOpenLessons] = useState({});
  const toggleLessonOpen = (lessonId) => {
    if (!lessonId) return;
    setOpenLessons((prev) => ({ ...prev, [lessonId]: !prev[lessonId] }));
  };

  // ✅ image viewer modal (per foto lezioni)
  const [imageViewer, setImageViewer] = useState({ open: false, urls: [], index: 0 });
  const openImageViewer = (urls, index) => {
    const list = Array.isArray(urls) ? urls.filter(Boolean) : [];
    if (!list.length) return;
    const idx = Math.max(0, Math.min(Number(index || 0), list.length - 1));
    setImageViewer({ open: true, urls: list, index: idx });
  };
  const closeImageViewer = () => setImageViewer({ open: false, urls: [], index: 0 });
  // ✅ Firebase Storage (cover upload)
  const [coverUploading, setCoverUploading] = useState(false);
  const [coverProgress, setCoverProgress] = useState(0);
  const [coverError, setCoverError] = useState("");
  const coverFileRef = useRef(null);
  const [coverFileName, setCoverFileName] = useState("");

  // ✅ Firebase Storage (lesson assets upload: PDF + Foto)
  const [pdfUploading, setPdfUploading] = useState(false);
  const [pdfProgress, setPdfProgress] = useState(0);
  const [pdfError, setPdfError] = useState("");
  const pdfFileRef = useRef(null);

  const [imgUploading, setImgUploading] = useState(false);
  const [imgProgress, setImgProgress] = useState(0);
  const [imgError, setImgError] = useState("");
  const imgFileRef = useRef(null);


  // ✅ Scroll to top when opening a module
  useEffect(() => {
    if (activeModuleId) {
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  }, [activeModuleId]);

  // ---------------------------------------------
  // SNAPSHOT MODULES (realtime)
  // ---------------------------------------------
  useEffect(() => {
    setModulesError("");
    setModulesLoading(true);

    if (loading) return;
    if (!firebaseUser?.uid) {
      setModules([]);
      setModulesLoading(false);
      return;
    }

    const colRef = collection(db, "university_modules");

    // 👇 Sempre leggiamo tutto: il filtro lo facciamo client-side in base ai permessi espliciti
    const unsub = onSnapshot(
      query(colRef),
      (snap) => {
        let items = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        const allowedTopics = perms.allowedTopics || [];

        // vede i moduli che appartengono ai topic assegnati OPPURE i moduli assegnati singolarmente
        if (!canAccessPrivateUniversity) {
          const topicsNorm = (perms.allowedTopics || []).map(t => t.trim().toLowerCase());
          const allowedIds = perms.allowedModuleIds || [];

          items = items.filter(m => {
            // 1. Controllo per ID modulo esplicito
            if (allowedIds.includes(m.id)) return true;

            // 2. Controllo per Argomento (Topic)
            const raw = (m.topic || "").trim().toLowerCase();
            const topic = (!raw || raw === "generale" || raw === "altro")
              ? "(senza sezione)"
              : raw;

            return topicsNorm.includes(topic);
          });
        }

        items.sort(sortByOrderThenCreated);
        setModules(items);
        setModulesLoading(false);
      },
      (err) => {
        console.error("University modules snapshot error:", err);
        setModulesError("Permessi insufficienti. Se il problema persiste, contatta l'amministratore.");
        setModules([]);
        setModulesLoading(false);
      }
    );

    return () => unsub();
  }, [db, firebaseUser?.uid, loading, canAccessPrivateUniversity, JSON.stringify(perms.allowedTopics || []), JSON.stringify(perms.allowedModuleIds || [])]);

  // ---------------------------------------------
  // SNAPSHOT LESSONS for active module
  // ---------------------------------------------
  useEffect(() => {
    setLessonsError("");

    if (loading) return;
    if (!firebaseUser?.uid) return;

    if (!activeModuleId) {
      setLessonsLoading(false);
      return;
    }

    setLessonsLoading(true);

    const colRef = collection(db, "university_modules", activeModuleId, "lessons");

    // Poiché l'utente ha già superato il filtro del modulo, leggiamo tutte le lezioni associate.
    const unsub = onSnapshot(
      query(colRef),
      (snap) => {
        const items = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        items.sort(sortByOrderThenCreated);
        setLessonsByModule((prev) => ({ ...prev, [activeModuleId]: items }));
        setLessonsLoading(false);
      },
      (err) => {
        console.error("University lessons snapshot error:", err);
        setLessonsError("Non puoi visualizzare i contenuti di questo modulo.");
        setLessonsByModule((prev) => ({ ...prev, [activeModuleId]: [] }));
        setLessonsLoading(false);
      }
    );

    return () => unsub();
  }, [db, firebaseUser?.uid, loading, activeModuleId, canAccessPrivateUniversity]);

  // ✅ counts for badges (NO hooks in JSX)
  const counts = useMemo(() => {
    return { total: modules.length };
  }, [modules]);

  // ✅ filtered list
  const filteredModules = useMemo(() => {
    const needle = qText.trim().toLowerCase();

    // 1. Search Mode: filter flattened list
    if (needle) {
      return modules.filter((m) => {
        const t = safeStr(m.title).toLowerCase();
        const d = safeStr(m.description).toLowerCase();
        const top = safeStr(m.topic).toLowerCase();
        return t.includes(needle) || d.includes(needle) || top.includes(needle);
      });
    }

    if (activeTopic) {
      return modules.filter(m => {
        const raw = (m.topic || "").trim().toLowerCase();
        const label = (!raw || raw === "generale" || raw === "altro") ? "(senza sezione)" : raw;
        return label === activeTopic.toLowerCase();
      });
    }

    // 3. Fallback (should not happen in Root View, but keeping safe)
    return modules;
  }, [modules, qText, activeTopic]);

  // ✅ Topics Extraction (Root View)
  const topics = useMemo(() => {
    // Collect all topics
    const map = {};
    const DEFAULT_TOPIC = "I PRIMI PASSI DEL COLLABORATORE";

    modules.forEach(m => {
      // Normalizzazione Coerente con Admin e Filtro
      const raw = safeStr(m.topic).trim().toLowerCase();
      const label = (!raw || raw === "generale" || raw === "altro")
        ? "(senza sezione)"
        : (m.topic || "(senza sezione)").trim();
      const key = label.toLowerCase();

      if (!map[key]) {
        map[key] = { label: label, count: 0, previewImages: [] };
      }
      map[key].count++;
      if (m.coverUrl && map[key].previewImages.length < 3) {
        map[key].previewImages.push(m.coverUrl);
      }
    });

    const result = Object.values(map);

    // [NEW] Configure Static Folders (Always Visible if Authorized)
    const STATIC_FOLDERS = [
      "I PRIMI PASSI DEL COLLABORATORE",
      "MASTERCLASS",
      "CRM",
      "SCRIPT E STRUMENTI",
      "CLUB MANAGER",
      "CLUB LEADER"
    ];
    const allowedTopicsNorm = (perms.allowedTopics || []).map(t => t.trim().toLowerCase());

    STATIC_FOLDERS.forEach(label => {
      const isPresent = result.find(t => t.label.toLowerCase() === label.toLowerCase());
      if (!isPresent) {
        // Se è admin lo mostra sempre, se è utente solo se è tra quelli permessi
        if (canAccessPrivateUniversity) {
          result.push({ label: label, count: 0, previewImages: [] });
        } else if (allowedTopicsNorm.includes(label.toLowerCase())) {
          result.push({ label: label, count: 0, previewImages: [] });
        }
      }
    });

    // [NEW] Merge with Topic Metadata (Covers)
    result.forEach(t => {
      const docId = t.label.toLowerCase().replace(/\s+/g, "_");
      if (topicMetadata[docId]?.coverUrl) {
        t.coverUrl = topicMetadata[docId].coverUrl;
      }
    });

    return result.sort((a, b) => {
      // Order based on STATIC_FOLDERS list
      const idxA = STATIC_FOLDERS.findIndex(f => f.toLowerCase() === a.label.toLowerCase());
      const idxB = STATIC_FOLDERS.findIndex(f => f.toLowerCase() === b.label.toLowerCase());

      if (idxA !== -1 && idxB !== -1) return idxA - idxB;
      if (idxA !== -1) return -1;
      if (idxB !== -1) return 1;
      return a.label.localeCompare(b.label);
    });
  }, [modules, canAccessPrivateUniversity, JSON.stringify(perms.allowedTopics || []), topicMetadata]);

  // ✅ lessons list for active module
  const activeLessons = useMemo(() => clampArr(lessonsByModule[activeModuleId]), [lessonsByModule, activeModuleId]);

  // ✅ lessonsCountById (avoid undefined + no hooks in JSX)
  const lessonsCountById = useMemo(() => {
    const map = {};
    for (const m of modules) {
      map[m.id] = clampArr(lessonsByModule[m.id]).length;
    }
    return map;
  }, [modules, lessonsByModule]);

  // ---------------------------------------------
  // ACTIONS: MODULE
  // ---------------------------------------------
  async function uploadModuleCover(file) {
    if (!file) return;
    if (!firebaseUser?.uid) {
      alert("Devi essere loggato per caricare una cover.");
      return;
    }


    // ✅ Upload consentito SOLO se toggle canManageUniversity è attivo (NO admin implicito)
    if (!canManageUniversity) {
      alert("Non hai i permessi per caricare file in University.");
      return;
    }

    // ✅ Forza refresh token (evita 403 intermittenti dopo HMR / deploy)
    try {
      if (auth?.currentUser) {
        await auth.currentUser.getIdToken(true);
      }
    } catch (e) {
      console.warn("Token refresh warning:", e);
    }

    setCoverError("");
    setCoverUploading(true);
    setCoverProgress(0);

    const safeName = String(file.name || "cover").replace(/[^\w.\-]+/g, "_");
    const path = `university_covers/${firebaseUser.uid}/${Date.now()}_${safeName}`;

    const doUploadOnce = async () => {
      const r = storageRef(storage, path);

      // Metadata: non ci basiamo sulle rules sul contentType, ma aiuta comunque
      const metadata = file?.type ? { contentType: file.type } : undefined;

      const task = uploadBytesResumable(r, file, metadata);

      const url = await new Promise((resolve, reject) => {
        task.on(
          "state_changed",
          (snap) => {
            const p = snap.totalBytes ? Math.round((snap.bytesTransferred / snap.totalBytes) * 100) : 0;
            setCoverProgress(p);
          },
          (err) => reject(err),
          async () => resolve(await getDownloadURL(task.snapshot.ref))
        );
      });

      return url;
    };

    try {
      let url;
      try {
        url = await doUploadOnce();
      } catch (e) {
        // ✅ retry 1 volta se token/rules “ballano” (unauthorized)
        const code = String(e?.code || "");
        if (code.includes("storage/unauthorized") || code.includes("permission")) {
          try {
            if (auth?.currentUser) await auth.currentUser.getIdToken(true);
          } catch { }
          url = await doUploadOnce();
        } else {
          throw e;
        }
      }

      // Scrive direttamente l'URL nella bozza del modulo
      setModuleDraft((p) => ({ ...p, coverUrl: url }));
    } catch (e) {
      console.error("uploadModuleCover error:", e);
      setCoverError("Upload cover fallito (permessi Storage / regole).");
      alert("Upload cover fallito. Controlla regole Firebase Storage.");
    } finally {
      setCoverUploading(false);
      setTimeout(() => setCoverProgress(0), 600);
    }
  }


  async function saveModule() {
    if (!canManageUniversity) return;

    const title = safeStr(moduleDraft.title);
    if (!title) return alert("Titolo obbligatorio.");

    const payload = {
      title,
      description: safeStr(moduleDraft.description),
      topic: safeStr(moduleDraft.topic).trim() || "I PRIMI PASSI DEL COLLABORATORE", // [NEW]
      coverUrl: safeStr(moduleDraft.coverUrl),
      isPublic: !!moduleDraft.isPublic,
      order: Number(moduleDraft.order || 0),
      updatedAt: serverTimestamp(),
    };

    try {
      if (moduleDraft.id) {
        await updateDoc(doc(db, "university_modules", moduleDraft.id), payload);
      } else {
        await addDoc(collection(db, "university_modules"), { ...payload, createdAt: serverTimestamp() });
      }
      setModuleModalOpen(false);
    } catch (e) {
      console.error("saveModule error:", e);
      alert("Errore salvataggio modulo (permessi/rules).");
    }
  }

  async function deleteModule(moduleId) {
    if (!canManageUniversity) return;
    if (!window.confirm("Eliminare questo modulo? (Non elimina automaticamente le lezioni)")) return;
    try {
      await deleteDoc(doc(db, "university_modules", moduleId));
      if (activeModuleId === moduleId) setActiveModuleId("");
    } catch (e) {
      console.error("deleteModule error:", e);
      alert("Errore eliminazione modulo.");
    }
  }


  // ---------------------------------------------
  // UPLOADS: LESSON PDF + FOTO (Firebase Storage)
  // ---------------------------------------------
  function appendLine(text, line) {
    const t = (text || "").trim();
    if (!line) return t;
    if (!t) return line;
    return `${t}\n${line}`;
  }

  function storageSafeName(name) {
    return String(name || "file")
      .replace(/\s+/g, "_")
      .replace(/[^a-zA-Z0-9._-]/g, "")
      .slice(0, 120);
  }

  async function uploadOneFileToStorage(file, pathPrefix, onProgress) {
    return await new Promise((resolve, reject) => {
      const safe = storageSafeName(file?.name);
      const fullPath = `${pathPrefix}/${Date.now()}_${safe}`;
      const r = storageRef(storage, fullPath);
      const task = uploadBytesResumable(r, file);

      task.on(
        "state_changed",
        (snap) => {
          const p = snap.totalBytes ? Math.round((snap.bytesTransferred / snap.totalBytes) * 100) : 0;
          onProgress?.(p);
        },
        (err) => reject(err),
        async () => resolve(await getDownloadURL(task.snapshot.ref))
      );
    });
  }

  async function handleUploadLessonPdfs(fileList) {
    if (!canManageUniversity) return;
    const files = Array.from(fileList || []).filter(Boolean);
    if (files.length === 0) return;

    setPdfError("");
    setPdfUploading(true);
    setPdfProgress(0);

    try {
      const key = lessonDraft.uploadKey || `draft_${Date.now()}`;
      const base = `university/lessons/${activeModuleId || "no_module"}/${key}/pdf`;

      for (let i = 0; i < files.length; i++) {
        const f = files[i];
        if (f.type && f.type !== "application/pdf") continue;

        const url = await uploadOneFileToStorage(f, base, (p) => {
          // progress relativo: 0..100 su file corrente, mappato sul totale
          const total = files.length;
          const done = i;
          const overall = Math.round(((done + p / 100) / total) * 100);
          setPdfProgress(overall);
        });

        setLessonDraft((prev) => ({
          ...prev,
          uploadKey: key,
          pdfUrlsText: appendLine(prev.pdfUrlsText, url),
        }));
      }
    } catch (e) {
      console.error("handleUploadLessonPdfs error:", e);
      setPdfError("Upload PDF fallito (permessi Storage / rules / rete).");
    } finally {
      setPdfUploading(false);
      setTimeout(() => setPdfProgress(0), 600);
      if (pdfFileRef.current) pdfFileRef.current.value = "";
    }
  }

  async function handleUploadLessonImages(fileList) {
    if (!canManageUniversity) return;
    const files = Array.from(fileList || []).filter(Boolean);
    if (files.length === 0) return;

    setImgError("");
    setImgUploading(true);
    setImgProgress(0);

    try {
      const key = lessonDraft.uploadKey || `draft_${Date.now()}`;
      const base = `university/lessons/${activeModuleId || "no_module"}/${key}/images`;

      for (let i = 0; i < files.length; i++) {
        const f = files[i];
        if (f.type && !f.type.startsWith("image/")) continue;

        const url = await uploadOneFileToStorage(f, base, (p) => {
          const total = files.length;
          const done = i;
          const overall = Math.round(((done + p / 100) / total) * 100);
          setImgProgress(overall);
        });

        setLessonDraft((prev) => ({
          ...prev,
          uploadKey: key,
          imageUrlsText: appendLine(prev.imageUrlsText, url),
        }));
      }
    } catch (e) {
      console.error("handleUploadLessonImages error:", e);
      setImgError("Upload foto fallito (permessi Storage / rules / rete).");
    } finally {
      setImgUploading(false);
      setTimeout(() => setImgProgress(0), 600);
      if (imgFileRef.current) imgFileRef.current.value = "";
    }
  }

  function removeUrlLine(text, url) {
    const lines = safeStr(text)
      .split("\n")
      .map((s) => s.trim())
      .filter(Boolean)
      .filter((l) => l !== url);
    return lines.join("\n");
  }

  function prettyFromUrl(url) {
    try {
      const u = new URL(url);
      const p = u.pathname.split("/").pop() || "file";
      return decodeURIComponent(p).replace(/\?.*$/, "");
    } catch {
      return String(url);
    }
  }

  // ---------------------------------------------
  // ACTIONS: LESSON
  // ---------------------------------------------
  function openNewLesson() {
    if (!canManageUniversity) return;
    if (!activeModuleId) return alert("Apri prima un modulo.");
    setLessonDraft({
      id: "",
      uploadKey: `draft_${Date.now()}`,
      title: "",
      description: "",
      videoUrl: "",
      pdfUrlsText: "",
      imageUrlsText: "",
      isPublic: true,
      order: 0,
    });
    setLessonModalOpen(true);
  }

  function openEditLesson(lesson) {
    if (!canManageUniversity) return;
    setLessonDraft({
      id: lesson.id,
      uploadKey: lesson.id,
      title: safeStr(lesson.title),
      description: safeStr(lesson.description),
      videoUrl: safeStr(lesson.videoUrl),
      pdfUrlsText: clampArr(lesson.pdfUrls).join("\n"),
      imageUrlsText: clampArr(lesson.imageUrls).join("\n"),
      isPublic: !!lesson.isPublic,
      order: Number(lesson.order || 0),
    });
    setLessonModalOpen(true);
  }

  async function saveLesson() {
    if (!canManageUniversity) return;
    if (!activeModuleId) return;

    const title = safeStr(lessonDraft.title);
    if (!title) return alert("Titolo lezione obbligatorio.");

    const pdfUrls = clampArr(
      safeStr(lessonDraft.pdfUrlsText)
        .split("\n")
        .map((s) => s.trim())
        .filter((u) => u && isValidUrl(u))
    );

    const imageUrls = clampArr(
      safeStr(lessonDraft.imageUrlsText)
        .split("\n")
        .map((s) => s.trim())
        .filter((u) => u && isValidUrl(u))
    );

    const payload = {
      title,
      description: safeStr(lessonDraft.description),
      videoUrl: safeStr(lessonDraft.videoUrl),
      pdfUrls,
      imageUrls,
      isPublic: !!lessonDraft.isPublic,
      order: Number(lessonDraft.order || 0),
      updatedAt: serverTimestamp(),
    };

    try {
      const base = collection(db, "university_modules", activeModuleId, "lessons");
      if (lessonDraft.id) {
        await updateDoc(doc(db, "university_modules", activeModuleId, "lessons", lessonDraft.id), payload);
      } else {
        await addDoc(base, { ...payload, createdAt: serverTimestamp() });
      }
      setLessonModalOpen(false);
    } catch (e) {
      console.error("saveLesson error:", e);
      alert("Errore salvataggio lezione (permessi/rules).");
    }
  }

  async function deleteLesson(lessonId) {
    if (!canManageUniversity) return;
    if (!activeModuleId) return;
    if (!window.confirm("Eliminare questa lezione?")) return;

    try {
      await deleteDoc(doc(db, "university_modules", activeModuleId, "lessons", lessonId));
    } catch (e) {
      console.error("deleteLesson error:", e);
      alert("Errore eliminazione lezione.");
    }
  }

  // ---------------------------------------------
  // RENDER
  // ---------------------------------------------
  const activeModule = useMemo(() => modules.find((m) => m.id === activeModuleId) || null, [modules, activeModuleId]);

  // ⚠️ Niente early return prima degli hooks: messaggi dentro UI.
  const showNoAccess = !loading && !!firebaseUser?.uid && !canAccessPrivateUniversity && !modulesLoading && modules.length === 0;

  return (
    <div className="main">

      <div className="main-header" style={{ alignItems: "flex-start" }}>
        <div className="main-header-left">
          <div className="main-title" style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <BookOpen size={22} /> University <span style={{ fontSize: 10, opacity: 0.5 }}>v.UNIVERSITY-LIGHT-PRO</span>
          </div>
          <div className="main-subtitle">Moduli formativi video + PDF. Accesso controllato da permessi.</div>

          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 12 }}>
            <div className="pill uni-pill-bg">
              Totale moduli visibili: <b>{counts.total}</b>
            </div>
          </div>
        </div>

        <div className="main-header-right" style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>

          <div
            className="badge-status uni-pill-bg"
            style={{
              display: "inline-flex",
              gap: 8,
              alignItems: "center",
              padding: "8px 10px",
              borderRadius: 999,
              transition: "all 0.2s"
            }}
            title={canAccessPrivateUniversity ? "Puoi gestire l'intera University" : "Stai visualizzando i moduli che ti sono stati assegnati"}
          >
            {canAccessPrivateUniversity ? <ShieldCheck size={16} /> : <Lock size={16} />}
            {canAccessPrivateUniversity ? "Accesso di gestione" : "Accesso controllato"}
          </div>

          {canManageUniversity ? (
            <button
              className="btn-primary"
              type="button"
              onClick={() => {
                // [FIX] Pre-fill active topic if we are inside a folder
                const initialTopic = activeTopic || "";
                setModuleDraft({
                  id: "",
                  title: "",
                  description: "",
                  topic: initialTopic,
                  coverUrl: "",
                  isPublic: true,
                  order: 0
                });
                setModuleModalOpen(true);
              }}
              style={{ display: "inline-flex", alignItems: "center", gap: 10 }}
            >
              <Plus size={18} /> Nuovo modulo
            </button>
          ) : null}
        </div>
      </div>

      {/* filters */}
      <div className="card" style={{ marginBottom: 14 }}>
        <div className="card-body" style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
          <div style={{ flex: "1 1 360px", minWidth: 240 }}>
            <div
              className="uni-search-bg"
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                padding: "0 12px",
                height: 46,
                borderRadius: 14,
              }}
            >
              <Search size={18} style={{ opacity: 0.75 }} />
              <input
                className="form-input"
                type="text"
                value={qText}
                onChange={(e) => setQText(e.target.value)}
                placeholder="Cerca titolo o descrizione..."
                style={{ border: 0, background: "transparent", outline: "none", padding: 0, height: "100%" }}
              />
            </div>
          </div>

          {activeModuleId ? (
            <button className="btn-secondary" type="button" onClick={() => setActiveModuleId("")} style={{ display: "inline-flex", gap: 8, alignItems: "center" }}>
              <ArrowLeft size={18} /> Indietro
            </button>
          ) : null}
        </div>
      </div>

      {modulesError ? (
        <div
          style={{
            padding: 12,
            borderRadius: 12,
            border: "1px solid rgba(239,68,68,0.35)",
            background: "rgba(239,68,68,0.08)",
            color: "#fecaca",
            marginBottom: 14,
          }}
        >
          {modulesError}
        </div>
      ) : null}

      {showNoAccess ? (
        <div className="card" style={{ maxWidth: 860 }}>
          <div className="card-body" style={{ padding: 16 }}>
            <div style={{ fontWeight: 900, marginBottom: 6 }}>Nessun modulo visibile.</div>
            <div style={{ color: "var(--text-muted)", fontSize: 13, lineHeight: 1.5 }}>
              Al momento non ti è stato assegnato l'accesso ad alcun modulo della University.
              Se ritieni sia un errore, contatta un amministratore per abilitare i moduli sul tuo profilo.
            </div>
          </div>
        </div>
      ) : null}

      {/* 3 LEVELS VIEW */}
      {!activeModuleId ? (
        <div className="uni-modulesList">
          {modulesLoading ? (
            <div className="card">
              <div className="card-body" style={{ padding: 16, color: "var(--text-muted)" }}>
                Caricamento University...
              </div>
            </div>
          ) : !qText && !activeTopic ? (
            /* LEVEL 1: TOPICS GRID */
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 16 }}>
              {topics.length === 0 ? (
                <div className="card" style={{ gridColumn: "1 / -1" }}>
                  <div className="card-body" style={{ padding: 24, textAlign: "center", fontStyle: "italic", color: "var(--text-muted)" }}>
                    Nessun contenuto disponibile.
                  </div>
                </div>
              ) : (
                topics.map((t) => (
                  <div
                    key={t.label}
                    className={`card uni-card-themed cursor-pointer transition-colors ${t.coverUrl ? 'uni-card-premium' : ''}`}
                    onClick={() => setActiveTopic(t.label)}
                    style={{
                      cursor: "pointer",
                      padding: 0,
                      border: t.coverUrl ? 'none' : undefined,
                      height: 260,
                    }}
                  >
                    {t.coverUrl ? (
                      // ================== PREMIUM FULL COVER LAYOUT ==================
                      <>
                        <div className="uni-card-bg-layer">
                          <img src={t.coverUrl} alt={t.label} className="uni-card-bg-img" />
                        </div>
                        <div className="uni-card-overlay" />

                        <div className="uni-card-content">
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end" }}>
                            <div>
                              <div style={{ fontSize: 11, fontWeight: 700, opacity: 0.9, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 6, color: "#fff" }}>
                                {t.count} Modul{t.count === 1 ? "o" : "i"}
                              </div>
                              <div style={{ fontSize: 24, fontWeight: 800, lineHeight: 1.1, textShadow: "0 2px 10px rgba(0,0,0,0.8)", color: "#fff" }}>
                                {t.label}
                              </div>
                            </div>
                          </div>
                        </div>
                      </>
                    ) : (
                      // ================== SIMPLE CLEAN LAYOUT (No Cover) ==================
                      <div className="uni-card-simple">
                        <div className="uni-icon-bg" style={{
                          width: 56, height: 56,
                          display: "grid", placeItems: "center",
                          borderRadius: 16,
                          background: "var(--uni-bg-accent-subtle)",
                          color: "var(--primary)"
                        }}>
                          <Folder size={28} fill="currentColor" fillOpacity={0.2} />
                        </div>

                        <div>
                          <div style={{ fontSize: 12, fontWeight: 600, color: "var(--uni-text-muted-2)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 6 }}>
                            {t.count} Modul{t.count === 1 ? "o" : "i"}
                          </div>
                          <div style={{ fontSize: 20, fontWeight: 800, color: "var(--uni-text-main)" }}>
                            {t.label}
                          </div>
                          <div style={{ fontSize: 13, color: "var(--uni-text-muted)", marginTop: 4 }}>
                            Clicca per esplorare
                          </div>
                        </div>

                        {t.previewImages.length > 0 && (
                          <div style={{ display: "flex", marginTop: 12 }}>
                            {t.previewImages.slice(0, 3).map((url, i) => (
                              <div key={i} style={{ width: 28, height: 28, borderRadius: "50%", border: "2px solid var(--uni-bg-card)", marginLeft: i > 0 ? -10 : 0, overflow: "hidden", background: "#000" }}>
                                <img src={url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}

                    {canManageUniversity && (
                      <div
                        className="uni-card-edit-float"
                        onClick={(e) => e.stopPropagation()}
                        title="Modifica copertina"
                      >
                        <label style={{ cursor: "pointer", width: "100%", height: "100%", display: "grid", placeItems: "center" }}>
                          <Pencil size={16} />
                          <input
                            type="file"
                            hidden
                            accept="image/*"
                            onChange={(e) => {
                              if (e.target.files?.[0]) {
                                uploadTopicCover(e.target.files[0], t.label);
                              }
                            }}
                          />
                        </label>
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          ) : (
            /* LEVEL 2: MODULES GRID (Filtered by Topic or Search) */
            <>
              {activeTopic && !qText && (
                <div style={{ marginBottom: 16, display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 10 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <button
                      className="btn-secondary"
                      onClick={() => setActiveTopic("")}
                      style={{ borderRadius: 99, paddingInline: 16 }}
                    >
                      <ArrowLeft size={16} style={{ marginRight: 6 }} /> Torna agli Argomenti
                    </button>
                    <div style={{ fontSize: 18, fontWeight: 800 }}>📂 {activeTopic}</div>
                  </div>

                  {/* Quick Add Button inside Topic */}
                  {canManageUniversity && (
                    <button
                      className="btn-secondary"
                      onClick={() => {
                        setModuleDraft({
                          id: "",
                          title: "",
                          description: "",
                          topic: activeTopic,
                          coverUrl: "",
                          isPublic: true,
                          order: 0
                        });
                        setModuleModalOpen(true);
                      }}
                      style={{ fontSize: 13, gap: 6, paddingInline: 12 }}
                    >
                      <Plus size={16} /> Aggiungi qui
                    </button>
                  )}
                </div>
              )}

              {filteredModules.length === 0 ? (
                <div className="card" style={{ gridColumn: "1 / -1" }}>
                  <div className="card-body" style={{ padding: 18, textAlign: "center" }}>
                    <div style={{ fontWeight: 900, fontSize: 16 }}>Nessun modulo trovato</div>
                    <div style={{ color: "var(--text-muted)", fontSize: 13, marginTop: 6 }}>Prova a cambiare ricerca o argomento.</div>
                  </div>
                </div>
              ) : (
                <div className="uni-list-container">
                  {/* [NEW] Always visible "Create Module" Card */}
                  {canManageUniversity && !qText && (
                    <div
                      className="card uni-horizontalCard uni-card-themed"
                      style={{
                        borderRadius: 18,
                        border: "2px dashed rgba(148,163,184,0.25)",
                        background: "rgba(148,163,184,0.03)",
                        cursor: "pointer",
                        justifyContent: "center",
                        alignItems: "center",
                        minHeight: 180,
                        transition: "all 0.2s ease"
                      }}
                      onClick={() => {
                        const initialTopic = activeTopic || "";
                        setModuleDraft({
                          id: "",
                          title: "",
                          description: "",
                          topic: initialTopic,
                          coverUrl: "",
                          isPublic: true,
                          order: 0
                        });
                        setModuleModalOpen(true);
                      }}
                      /* Hover effect handled by CSS or inline generic approach */
                      onMouseEnter={(e) => e.currentTarget.style.borderColor = "var(--primary)"}
                      onMouseLeave={(e) => e.currentTarget.style.borderColor = "rgba(148,163,184,0.25)"}
                    >
                      <div style={{ textAlign: "center", opacity: 0.6, display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
                        <div style={{ padding: 12, borderRadius: "50%", background: "rgba(148,163,184,0.1)" }}>
                          <Plus size={32} />
                        </div>
                        <div style={{ fontWeight: 700, fontSize: 15 }}>Crea Nuovo Modulo</div>
                        <div style={{ fontSize: 12 }}>in {activeTopic || "University"}</div>
                      </div>
                    </div>
                  )}

                  {filteredModules.map((m) => (
                    <div
                      key={m.id}
                      className="card uni-horizontalCard uni-card-themed"
                      style={{ borderRadius: 18 }}
                    >
                      <div className="uni-img-wrapper">
                        {/* IMAGE */}
                        {m.coverUrl ? (
                          <div className="uni-cover-container" style={{ aspectRatio: "16/9", background: "#000" }}>
                            <img src={m.coverUrl} style={{ width: "100%", height: "100%", objectFit: "cover", opacity: 0.9 }} alt="" />
                          </div>
                        ) : (
                          <div className="uni-cover-container uni-placeholder-bg" style={{ aspectRatio: "16/9", display: "flex", alignItems: "center", justifyContent: "center" }}>
                            <span className="uni-placeholder-text" style={{ fontWeight: 800, fontSize: 32 }}>CRM</span>
                          </div>
                        )}

                        {/* BADGE (Top Right absolute) */}
                        <div
                          style={{
                            position: "absolute",
                            top: 12,
                            right: 12,
                            background: m.isPublic ? "rgba(16,185,129,0.95)" : "rgba(245,158,11,0.95)",
                            color: "#fff",
                            fontSize: 10,
                            fontWeight: 700,
                            padding: "4px 8px",
                            borderRadius: 6,
                            backdropFilter: "blur(4px)",
                            boxShadow: "0 2px 8px rgba(0,0,0,0.25)",
                            zIndex: 10,
                            lineHeight: 1,
                            letterSpacing: 0.5,
                            textTransform: "uppercase"
                          }}
                        >
                          {m.isPublic ? "PUBBLICO" : "PRIVATO"}
                        </div>
                      </div>

                      <div className="card-body">
                        {/* TITLE */}
                        <div style={{ minWidth: 0, paddingRight: 0 }}>
                          <div className="uni-title-themed" style={{ fontWeight: 850, fontSize: 18, lineHeight: 1.25, textTransform: "uppercase" }}>
                            {safeStr(m.title) || "TITOLO MODULO"}
                          </div>
                        </div>

                        {/* DESCRIPTION */}
                        <div className="uni-markdown uni-text-muted-themed" style={{ fontSize: 13.5, marginTop: 12, lineHeight: 1.6, flex: 1 }}>
                          <Markdown remarkPlugins={[remarkBreaks]}>
                            {safeStr(m.description) || "Nessuna descrizione."}
                          </Markdown>
                        </div>

                        {/* STATS + BUTTONS */}
                        <div className="uni-divider-themed" style={{ marginTop: 20, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, paddingTop: 16 }}>
                          {/* Stats */}
                          <div className="uni-text-muted-themed" style={{ fontSize: 12.5 }}>
                            {Number.isFinite(lessonsCountById[m.id]) ? <b>{lessonsCountById[m.id]}</b> : <b>0</b>}{" "}
                            contenuti
                          </div>

                          {/* Buttons */}
                          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                            <button className="btn-secondary" type="button" onClick={() => setActiveModuleId(m.id)} style={{ display: "inline-flex", gap: 8, alignItems: "center" }}>
                              Apri <ExternalLink size={16} />
                            </button>
                            {canManageUniversity ? (
                              <>
                                <button
                                  className="btn-secondary"
                                  type="button"
                                  onClick={() => {
                                    setModuleDraft({
                                      id: m.id,
                                      title: safeStr(m.title),
                                      description: safeStr(m.description),
                                      topic: safeStr(m.topic), // [NEW] 
                                      coverUrl: safeStr(m.coverUrl),
                                      isPublic: !!m.isPublic,
                                      order: Number(m.order || 0),
                                    });
                                    setModuleModalOpen(true);
                                  }}
                                  title="Modifica"
                                  style={{ paddingInline: 12 }}
                                >
                                  <Pencil size={16} />
                                </button>
                                <button
                                  className="btn-secondary"
                                  type="button"
                                  onClick={() => deleteModule(m.id)}
                                  title="Elimina"
                                  style={{ paddingInline: 12 }}
                                >
                                  <Trash2 size={16} />
                                </button>
                              </>
                            ) : null}
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      ) : (
        // DETAIL VIEW
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {/* HEADER ACTIONS (Button only) */}
          {canManageUniversity ? (
            <div style={{ display: "flex", justifyContent: "flex-end" }}>
              <button className="btn-primary" type="button" onClick={openNewLesson} style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 13, padding: "8px 12px", height: "auto" }}>
                <Plus size={15} /> Nuovo contenuto
              </button>
            </div>
          ) : null}

          <div className="card uni-detail-card" style={{ position: "relative", overflow: "hidden" }}>

            {/* Background Image Wrapper (Visible on Desktop via CSS) */}
            {activeModule?.coverUrl && (
              <div className="uni-detail-cover">
                <img src={activeModule.coverUrl} alt="" />
                <div className="uni-cover-gradient"></div>
              </div>
            )}

            <div className="card-body uni-detail-body" style={{ padding: 24, position: "relative", zIndex: 2 }}>
              {/* TITLE */}
              <div className="uni-title-themed" style={{ fontWeight: 950, fontSize: 32, lineHeight: 1.1, marginBottom: 20, maxWidth: "90%" }}>
                {safeStr(activeModule?.title) || "Modulo"}
              </div>

              {/* BODY */}
              <div className="uni-markdown uni-text-muted-themed" style={{ lineHeight: 1.6, fontSize: 15 }}>
                <Markdown
                  remarkPlugins={[remarkBreaks, remarkGfm]}
                  components={{
                    // eslint-disable-next-line no-unused-vars
                    a: ({ node, ...props }) => <a {...props} target="_blank" rel="noopener noreferrer" />
                  }}
                >
                  {safeStr(activeModule?.description) || "Nessuna descrizione."}
                </Markdown>
              </div>

              {/* LESSONS LIST (Merged inside) */}
              <div style={{ marginTop: 32 }}>
                {lessonsError ? (
                  <div
                    style={{
                      padding: 12,
                      borderRadius: 12,
                      border: "1px solid rgba(239,68,68,0.35)",
                      background: "rgba(239,68,68,0.08)",
                      color: "#fecaca",
                      marginBottom: 16
                    }}
                  >
                    {lessonsError}
                  </div>
                ) : null}

                {lessonsLoading ? (
                  <div style={{ padding: 16, color: "var(--text-muted)", textAlign: "center" }}>
                    Caricamento contenuti...
                  </div>
                ) : activeLessons.length === 0 ? (
                  <div style={{ padding: 18, textAlign: "center", borderTop: "1px solid var(--uni-border)", marginTop: 24 }}>
                    <div style={{ fontWeight: 900, fontSize: 16 }}>Nessun contenuto</div>
                    <div style={{ color: "var(--text-muted)", fontSize: 13, marginTop: 6 }}>
                      {canManageUniversity ? "Clicca “Nuovo contenuto” per aggiungere la prima lezione." : "Questo modulo non ha contenuti pubblici."}
                    </div>
                  </div>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: 32 }}>
                    {activeLessons.map((l, idx) => {
                      const imgs = clampArr(l.imageUrls);
                      const pdfs = clampArr(l.pdfUrls);

                      return (
                        <div key={l.id} style={{ borderTop: "1px solid var(--uni-border)", paddingTop: 32 }}>
                          {/* HEADER (static) */}
                          <div
                            className="uni-lessonHeaderBtn"
                            style={{ cursor: "default", marginBottom: 16 }}
                          >
                            <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
                              <div className="uni-lessonTitle" style={{ fontSize: 20, fontWeight: 800 }}>{safeStr(l.title) || "Lezione"}</div>
                            </div>
                          </div>

                          {/* DESCRIPTION */}
                          <div className="uni-lessonDesc uni-markdown" style={{ fontSize: 15, color: "var(--uni-text-muted-2)" }}>
                            <Markdown
                              remarkPlugins={[remarkBreaks, remarkGfm]}
                              components={{
                                // eslint-disable-next-line no-unused-vars
                                a: ({ node, ...props }) => <a {...props} target="_blank" rel="noopener noreferrer" />
                              }}
                            >
                              {safeStr(l.description) || "Nessuna descrizione."}
                            </Markdown>
                          </div>

                          {/* ALWAYS VISIBLE BODY */}
                          <div className="uni-lessonBody">
                            {/* VIDEO PLAYER */}
                            {l.videoUrl ? (
                              <div style={{ marginTop: 24, marginBottom: 24 }}>
                                {(() => {
                                  const u = l.videoUrl;
                                  /* YouTube */
                                  const ytMatch = u.match(/(?:youtu\.be\/|youtube\.com\/watch\?v=|youtube\.com\/embed\/)([^?&]+)/);
                                  if (ytMatch && ytMatch[1]) {
                                    return (
                                      <div style={{ position: "relative", paddingBottom: "56.25%", height: 0, borderRadius: 12, overflow: "hidden", background: "#000" }}>
                                        <iframe
                                          src={`https://www.youtube.com/embed/${ytMatch[1]}`}
                                          title={l.title || "Video"}
                                          style={{ position: "absolute", top: 0, left: 0, width: "100%", height: "100%", border: 0 }}
                                          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen"
                                          allowFullScreen
                                          // @ts-ignore
                                          webkitallowfullscreen="true"
                                          mozallowfullscreen="true"
                                        />
                                      </div>
                                    );
                                  }

                                  /* Vimeo Player (Direct Embed Link checking) */
                                  if (u.includes("player.vimeo.com/video")) {
                                    return (
                                      <div style={{ position: "relative", paddingBottom: "56.25%", height: 0, borderRadius: 12, overflow: "hidden", background: "#000" }}>
                                        <iframe
                                          src={u}
                                          title={l.title || "Video"}
                                          style={{ position: "absolute", top: 0, left: 0, width: "100%", height: "100%", border: 0 }}
                                          allow="autoplay; fullscreen; picture-in-picture; clipboard-write; encrypted-media"
                                          allowFullScreen
                                          // @ts-ignore
                                          playsInline
                                          webkit-playsinline="true"
                                          webkitallowfullscreen="true"
                                          mozallowfullscreen="true"
                                        />
                                      </div>
                                    );
                                  }

                                  /* Vimeo Standard */
                                  const vimeoMatch = u.match(/vimeo\.com\/(\d+)(?:\/([a-zA-Z0-9]+))?/);
                                  if (vimeoMatch && vimeoMatch[1]) {
                                    const vId = vimeoMatch[1];
                                    const vHash = vimeoMatch[2]; // optional hash for unlisted
                                    const src = `https://player.vimeo.com/video/${vId}${vHash ? `?h=${vHash}` : ""}`;
                                    return (
                                      <div style={{ position: "relative", paddingBottom: "56.25%", height: 0, borderRadius: 12, overflow: "hidden", background: "#000" }}>
                                        <iframe
                                          src={src}
                                          title={l.title || "Video"}
                                          style={{ position: "absolute", top: 0, left: 0, width: "100%", height: "100%", border: 0 }}
                                          allow="autoplay; fullscreen; picture-in-picture; clipboard-write; encrypted-media"
                                          allowFullScreen
                                          // @ts-ignore
                                          playsInline
                                          webkit-playsinline="true"
                                          webkitallowfullscreen="true"
                                          mozallowfullscreen="true"
                                        />
                                      </div>
                                    );
                                  }
                                  // Direct File (.mp4, .mov, etc) or Storage URL
                                  if (u.match(/\.(mp4|webm|ogg|mov)$/i) || u.includes("firebasestorage")) {
                                    return (
                                      <div style={{ borderRadius: 12, overflow: "hidden", background: "#000" }}>
                                        <video
                                          src={u}
                                          controls
                                          playsInline
                                          style={{ width: "100%", maxHeight: 500, display: "block" }}
                                        />
                                      </div>
                                    );
                                  }
                                  return (
                                    <div style={{ padding: 12, borderRadius: 8, background: "rgba(255,255,255,0.05)", fontSize: 13 }}>
                                      <Video size={16} style={{ marginRight: 8, verticalAlign: "middle" }} />
                                      <a href={u} target="_blank" rel="noopener noreferrer" style={{ color: "var(--text-main)", textDecoration: "underline" }}>
                                        Apri risorsa video esterna
                                      </a>
                                    </div>
                                  );
                                })()}
                              </div>
                            ) : null}

                            {/* RESOURCES (Images + PDF) */}
                            {(imgs.length > 0 || pdfs.length > 0) && (
                              <div style={{ marginTop: 16, display: "flex", flexDirection: "column", gap: 8 }}>
                                {imgs.map((url, i) => (
                                  <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 13, background: "var(--uni-bg-pill)", padding: "10px 14px", borderRadius: 10 }}>
                                    <ImageIcon size={16} />
                                    <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>Immagine {i + 1}</span>
                                    <a href={url} target="_blank" rel="noopener noreferrer" className="btn-secondary" style={{ fontSize: 11, height: 28, padding: "0 10px" }}>
                                      Vedi <ExternalLink size={12} style={{ marginLeft: 6 }} />
                                    </a>
                                  </div>
                                ))}
                                {pdfs.map((url, i) => (
                                  <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 13, background: "var(--uni-bg-pill)", padding: "10px 14px", borderRadius: 10 }}>
                                    <FileText size={16} />
                                    <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>PDF {i + 1}</span>
                                    <a href={url} target="_blank" rel="noopener noreferrer" className="btn-secondary" style={{ fontSize: 11, height: 28, padding: "0 10px" }}>
                                      <Download size={12} style={{ marginRight: 6 }} /> Scarica
                                    </a>
                                  </div>
                                ))}
                              </div>
                            )}

                            {/* ADMIN LESSON ACTIONS */}
                            {canManageUniversity ? (
                              <>
                                <div style={{ height: 1, background: "var(--uni-border)", margin: "20px 0 16px 0", opacity: 0.5 }}></div>
                                <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
                                  <button
                                    className="btn-secondary"
                                    onClick={() => {
                                      setLessonDraft({
                                        id: l.id,
                                        title: safeStr(l.title),
                                        description: safeStr(l.description),
                                        videoUrl: safeStr(l.videoUrl),
                                        imageUrls: clampArr(l.imageUrls),
                                        pdfUrls: clampArr(l.pdfUrls),
                                        order: Number(l.order || 0)
                                      });
                                      setLessonModalOpen(true);
                                    }}
                                    title="Modifica lezione"
                                    style={{ fontSize: 12, padding: "6px 12px" }}
                                  >
                                    <Pencil size={14} /> Modifica
                                  </button>
                                  <button
                                    className="btn-secondary"
                                    onClick={() => deleteLesson(l.id)}
                                    title="Elimina lezione"
                                    style={{ fontSize: 12, padding: "6px 12px", color: "#ef4444", borderColor: "rgba(239,68,68,0.3)" }}
                                  >
                                    <Trash2 size={14} /> Elimina
                                  </button>
                                </div>
                              </>
                            ) : null}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: MODULE */}
      <Modal
        open={moduleModalOpen}
        title={
          <span style={{ display: "inline-flex", alignItems: "center", gap: 10 }}>
            <BookOpen size={18} /> {moduleDraft.id ? "Modifica modulo" : "Nuovo modulo"}
          </span>
        }
        onClose={() => setModuleModalOpen(false)}
        footer={
          <>
            <button className="btn-secondary" onClick={() => setModuleModalOpen(false)}>
              Annulla
            </button>
            <button className="btn-primary" onClick={saveModule} disabled={!canManageUniversity}>
              Salva
            </button>
          </>
        }
      >
        <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: 12 }}>
          <div className="form-group">
            <label className="form-label">Titolo</label>
            <input
              className="form-input"
              value={moduleDraft.title}
              onChange={(e) =>
                setModuleDraft((p) => ({
                  ...p,
                  title: e.target.value,
                }))
              }
              placeholder="Es. 1 - Start Program"
            />
          </div>

          <div className="form-group">
            <label className="form-label">Argomento / Cartella</label>
            <input
              className="form-input"
              list="topics-list"
              value={moduleDraft.topic}
              onChange={(e) =>
                setModuleDraft((p) => ({
                  ...p,
                  topic: e.target.value,
                }))
              }
              placeholder="Es. Mindset, Vendita, Leadership..."
            />
            {/* Auto-complete suggestions from existing topics */}
            <datalist id="topics-list">
              {topics.map(t => <option key={t.label} value={t.label} />)}
            </datalist>
          </div>

          <div className="form-group">
            <label className="form-label">Descrizione</label>
            <textarea className="form-input" rows={4} value={moduleDraft.description} onChange={(e) => setModuleDraft((p) => ({ ...p, description: e.target.value }))} placeholder="Descrizione breve del modulo..." />
          </div>

          <div className="form-group">
            <label className="form-label">Cover (upload immagine)</label>

            <div className="uni-uploadRow">
              <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                <button
                  className="btn-secondary"
                  type="button"
                  disabled={!canManageUniversity || coverUploading}
                  onClick={() => coverFileRef.current?.click()}
                  style={{ height: 42, borderRadius: 12, paddingInline: 14, display: "inline-flex", alignItems: "center", gap: 10 }}
                  title="Seleziona un'immagine dal dispositivo"
                >
                  Scegli file
                </button>

                <div
                  className="uni-pill-bg"
                  style={{
                    minHeight: 42,
                    display: "inline-flex",
                    alignItems: "center",
                    padding: "0 12px",
                    borderRadius: 12,
                    border: "1px solid rgba(148,163,184,0.18)",
                    fontSize: 13,
                    fontWeight: 800,
                    maxWidth: "100%",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                  aria-live="polite"
                >
                  {coverFileName || "Nessun file selezionato"}
                </div>

                <input
                  ref={coverFileRef}
                  className="uni-file"
                  type="file"
                  accept="image/*"
                  style={{ display: "none" }}
                  disabled={!canManageUniversity || coverUploading}
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) {
                      setCoverFileName(f.name || "");
                      uploadModuleCover(f);
                    }
                    // reset input per ricaricare lo stesso file se serve
                    e.target.value = "";
                  }}
                />
              </div>

              <div className="uni-uploadInfo">
                <div className="uni-uploadHint">
                  Carica direttamente una cover (jpg/png/webp). Verrà salvata su Firebase Storage e l’URL verrà compilato in automatico.
                </div>

                {coverUploading ? (
                  <div className="uni-progressWrap" aria-live="polite">
                    <div className="uni-progressBar" style={{ width: `${coverProgress}%` }} />
                    <div className="uni-progressText">Upload: {coverProgress}%</div>
                  </div>
                ) : null}

                {coverError ? <div className="uni-uploadError">{coverError}</div> : null}
              </div>
            </div>

            <label className="form-label" style={{ marginTop: 12 }}>Oppure incolla URL (opzionale)</label>
            <input
              className="form-input"
              value={moduleDraft.coverUrl}
              onChange={(e) => setModuleDraft((p) => ({ ...p, coverUrl: e.target.value }))}
              placeholder="https://..."
            />

            {moduleDraft.coverUrl ? (
              <div className="uni-coverPreview">
                <img src={moduleDraft.coverUrl} alt="" />
              </div>
            ) : null}

            <div style={{ fontSize: 12.5, color: "var(--text-muted)", marginTop: 6 }}>
              Nota: per far funzionare l’upload, Firebase Storage deve essere abilitato e le regole devono consentire l’upload solo a chi ha il permesso canManageUniversity.
            </div>
          </div>

          <div style={{ display: "flex", gap: 14, alignItems: "center", flexWrap: "wrap" }}>
            <div style={{ display: "inline-flex", alignItems: "center", gap: 10 }}>
              <span className="uni-text-muted-themed" style={{ fontSize: 13 }}>Ordine di visualizzazione</span>
              <input
                className="form-input"
                type="number"
                value={moduleDraft.order}
                onChange={(e) => setModuleDraft((p) => ({ ...p, order: Number(e.target.value || 0) }))}
                style={{ width: 120 }}
              />
            </div>
          </div>

          {!canManageUniversity ? (
            <div style={{ marginTop: 8, padding: 12, borderRadius: 12, border: "1px solid rgba(245,158,11,0.25)", background: "rgba(245,158,11,0.10)", color: "#fde68a" }}>
              Non hai il permesso <b>canManageUniversity</b> per creare o modificare moduli.
            </div>
          ) : null}
        </div>
      </Modal>

      {/* MODAL: LESSON */}
      <Modal
        open={lessonModalOpen}
        title={
          <span style={{ display: "inline-flex", alignItems: "center", gap: 10 }}>
            <FileText size={18} /> {lessonDraft.id ? "Modifica contenuto" : "Nuovo contenuto"}
          </span>
        }
        onClose={() => setLessonModalOpen(false)}
        footer={
          <>
            <button className="btn-secondary" onClick={() => setLessonModalOpen(false)}>
              Annulla
            </button>
            <button className="btn-primary" onClick={saveLesson} disabled={!canManageUniversity}>
              Salva
            </button>
          </>
        }
      >
        <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: 12 }}>
          <div className="form-group">
            <label className="form-label">Titolo lezione</label>
            <input
              className="form-input"
              value={lessonDraft.title}
              onChange={(e) =>
                setLessonDraft((p) => ({
                  ...p,
                  title: e.target.value,
                }))
              }
              placeholder="Es. 1.1 - I primi passi"
            />
          </div>

          <div className="form-group">
            <label className="form-label">Descrizione formazione</label>
            <textarea className="form-input" rows={4} value={lessonDraft.description} onChange={(e) => setLessonDraft((p) => ({ ...p, description: e.target.value }))} placeholder="Spiega cosa deve fare / capire l'utente..." />
          </div>

          <div className="form-group">
            <label className="form-label">Video (YouTube / Vimeo URL)</label>
            <input className="form-input" value={lessonDraft.videoUrl} onChange={(e) => setLessonDraft((p) => ({ ...p, videoUrl: e.target.value }))} placeholder="https://youtube.com/... oppure https://vimeo.com/..." />
          </div>


          <div className="form-group">
            <label className="form-label">PDF</label>

            {canManageUniversity ? (
              <>
                <div className="uni-uploadRow" style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                  <button
                    type="button"
                    className="btn-secondary"
                    onClick={() => pdfFileRef.current?.click()}
                    disabled={pdfUploading}
                    title="Carica uno o più PDF"
                  >
                    {pdfUploading ? "Caricamento..." : "Carica PDF"}
                  </button>

                  <div style={{ fontSize: 12.5, color: "var(--text-muted)" }}>
                    Seleziona uno o più file PDF: li carichiamo su Storage e salviamo l’URL in automatico.
                  </div>
                </div>

                <input
                  ref={pdfFileRef}
                  type="file"
                  accept="application/pdf"
                  multiple
                  style={{ display: "none" }}
                  onChange={(e) => handleUploadLessonPdfs(e.target.files)}
                />

                {pdfUploading && (
                  <div style={{ marginTop: 10 }}>
                    <div style={{ fontSize: 12.5, color: "var(--text-muted)", marginBottom: 6 }}>Upload: {pdfProgress}%</div>
                    <div style={{ height: 8, borderRadius: 999, background: "rgba(255,255,255,0.10)", overflow: "hidden" }}>
                      <div style={{ width: `${pdfProgress}%`, height: "100%", background: "linear-gradient(135deg, #7c5cff, #9f7cff)" }} />
                    </div>
                  </div>
                )}

                {pdfError && (
                  <div style={{ marginTop: 10, padding: 10, borderRadius: 12, background: "rgba(239,68,68,0.12)", border: "1px solid rgba(239,68,68,0.35)", color: "#fecaca" }}>
                    {pdfError}
                  </div>
                )}
              </>
            ) : (
              <div style={{ fontSize: 12.5, color: "var(--text-muted)" }}>
                Non hai i permessi per caricare PDF.
              </div>
            )}

            {safeStr(lessonDraft.pdfUrlsText).trim() && (
              <div style={{ marginTop: 12, display: "grid", gap: 8 }}>
                {safeStr(lessonDraft.pdfUrlsText)
                  .split("\n")
                  .map((s) => s.trim())
                  .filter(Boolean)
                  .map((url) => (
                    <div
                      key={url}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        gap: 10,
                        padding: "10px 12px",
                        borderRadius: 12,
                        border: "1px solid rgba(255,255,255,0.12)",
                        background: "rgba(255,255,255,0.04)",
                      }}
                    >
                      <a href={url} target="_blank" rel="noreferrer" style={{ color: "rgba(255,255,255,0.88)", textDecoration: "none", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: "75%" }}>
                        {prettyFromUrl(url)}
                      </a>

                      {canManageUniversity && (
                        <button
                          type="button"
                          className="btn-secondary"
                          onClick={() => setLessonDraft((p) => ({ ...p, pdfUrlsText: removeUrlLine(p.pdfUrlsText, url) }))}
                          style={{ padding: "8px 10px" }}
                          title="Rimuovi PDF"
                        >
                          Rimuovi
                        </button>
                      )}
                    </div>
                  ))}
              </div>
            )}
          </div>


          <div className="form-group">
            <label className="form-label">Foto</label>

            {canManageUniversity ? (
              <>
                <div className="uni-uploadRow" style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                  <button
                    type="button"
                    className="btn-secondary"
                    onClick={() => imgFileRef.current?.click()}
                    disabled={imgUploading}
                    title="Carica una o più immagini"
                  >
                    {imgUploading ? "Caricamento..." : "Carica foto"}
                  </button>

                  <div style={{ fontSize: 12.5, color: "var(--text-muted)" }}>
                    Seleziona una o più immagini: le carichiamo su Storage e salviamo l’URL in automatico.
                  </div>
                </div>

                <input
                  ref={imgFileRef}
                  type="file"
                  accept="image/*"
                  multiple
                  style={{ display: "none" }}
                  onChange={(e) => handleUploadLessonImages(e.target.files)}
                />

                {imgUploading && (
                  <div style={{ marginTop: 10 }}>
                    <div style={{ fontSize: 12.5, color: "var(--text-muted)", marginBottom: 6 }}>Upload: {imgProgress}%</div>
                    <div style={{ height: 8, borderRadius: 999, background: "rgba(255,255,255,0.10)", overflow: "hidden" }}>
                      <div style={{ width: `${imgProgress}%`, height: "100%", background: "linear-gradient(135deg, #7c5cff, #9f7cff)" }} />
                    </div>
                  </div>
                )}

                {imgError && (
                  <div style={{ marginTop: 10, padding: 10, borderRadius: 12, background: "rgba(239,68,68,0.12)", border: "1px solid rgba(239,68,68,0.35)", color: "#fecaca" }}>
                    {imgError}
                  </div>
                )}
              </>
            ) : (
              <div style={{ fontSize: 12.5, color: "var(--text-muted)" }}>
                Non hai i permessi per caricare foto.
              </div>
            )}

            {safeStr(lessonDraft.imageUrlsText).trim() && (
              <div style={{ marginTop: 12, display: "grid", gap: 10 }}>
                {safeStr(lessonDraft.imageUrlsText)
                  .split("\n")
                  .map((s) => s.trim())
                  .filter(Boolean)
                  .map((url) => (
                    <div
                      key={url}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        gap: 10,
                        padding: "10px 12px",
                        borderRadius: 12,
                        border: "1px solid rgba(255,255,255,0.12)",
                        background: "rgba(255,255,255,0.04)",
                      }}
                    >
                      <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
                        <img
                          src={url}
                          alt=""
                          style={{ width: 42, height: 42, borderRadius: 10, objectFit: "cover", border: "1px solid rgba(255,255,255,0.12)" }}
                        />
                        <a
                          href={url}
                          target="_blank"
                          rel="noreferrer"
                          style={{
                            color: "rgba(255,255,255,0.88)",
                            textDecoration: "none",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                            maxWidth: "65vw",
                          }}
                        >
                          {prettyFromUrl(url)}
                        </a>
                      </div>

                      {canManageUniversity && (
                        <button
                          type="button"
                          className="btn-secondary"
                          onClick={() => setLessonDraft((p) => ({ ...p, imageUrlsText: removeUrlLine(p.imageUrlsText, url) }))}
                          style={{ padding: "8px 10px" }}
                          title="Rimuovi foto"
                        >
                          Rimuovi
                        </button>
                      )}
                    </div>
                  ))}
              </div>
            )}
          </div>

          <div style={{ display: "flex", gap: 14, alignItems: "center", flexWrap: "wrap" }}>
            <div style={{ display: "inline-flex", alignItems: "center", gap: 10 }}>
              <span style={{ fontSize: 13, color: "var(--text-muted)" }}>Ordine di visualizzazione</span>
              <input
                className="form-input"
                type="number"
                value={lessonDraft.order}
                onChange={(e) => setLessonDraft((p) => ({ ...p, order: Number(e.target.value || 0) }))}
                style={{ width: 120 }}
              />
            </div>
          </div>

          {!canManageUniversity ? (
            <div style={{ marginTop: 8, padding: 12, borderRadius: 12, border: "1px solid rgba(245,158,11,0.25)", background: "rgba(245,158,11,0.10)", color: "#fde68a" }}>
              Non hai il permesso <b>canManageUniversity</b> per creare o modificare contenuti.
            </div>
          ) : null}
        </div>
      </Modal>
    </div >
  );
}
