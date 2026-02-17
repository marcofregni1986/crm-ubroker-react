// src/ModulisticaPdfSandbox.jsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import "./modulisticaPdfSandbox.css";
import { PDFDocument, rgb, StandardFonts } from "pdf-lib";
import {
  Plus,
  Trash2,
  ExternalLink,
  Download,
  Sparkles,
  Copy,
  FileText,
  Link as LinkIcon,
  AlertTriangle,
  X,
  Eye,
  Save,
  FolderArchive,
} from "lucide-react";

/**
 * MODULISTICA PDF — SANDBOX OFFLINE (NO Firebase, NO CRM)
 *
 * ✅ Cosa puoi testare SUBITO:
 * - Gestione moduli (titolo, categoria, link PDF) salvati in localStorage
 * - Preview PDF (iframe) con fallback
 * - Compilazione prototipo: scrivi testo e lo "stampi" sul PDF con coordinate X/Y (pdf-lib)
 * - Archivio locale dei PDF generati (lista in localStorage + download del file)
 *
 * ⚠️ Nota tecnica:
 * - Alcuni link PDF esterni bloccano iframe o fetch (CORS). In quel caso userai la soluzione proxy nel CRM.
 */

const LS_MODULES = "sandbox_pdf_modules_v1";
const LS_ARCHIVES = "sandbox_pdf_archives_v1";

const CATEGORIES = ["Assunzione", "Clienti", "Azienda", "Altro"];

function safeFileName(str) {
  const s = (str || "modulo")
    .toString()
    .trim()
    .replace(/[^\w\s\-]+/g, "")
    .replace(/\s+/g, "_")
    .slice(0, 60);
  return s || "modulo";
}

function nowStamp() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}_${pad(d.getHours())}${pad(
    d.getMinutes()
  )}`;
}

const DEFAULT_FIELD = () => ({
  id: crypto.randomUUID ? crypto.randomUUID() : String(Math.random()),
  label: "Campo",
  value: "",
  page: 1,
  x: 50,
  y: 700,
  size: 12,
});

function readLS(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}
function writeLS(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

// ✅ Dropdown premium standard (NO <select>)
function PremiumDropdown({ label, value, options, onChange, placeholder = "Seleziona..." }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    const onDoc = (e) => {
      if (!ref.current) return;
      if (!ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  return (
    <div className="dd" ref={ref}>
      {label ? <div className="ddLabel">{label}</div> : null}
      <button type="button" className={`ddBtn ${open ? "open" : ""}`} onClick={() => setOpen((s) => !s)}>
        <span className={`ddVal ${value ? "" : "muted"}`}>{value || placeholder}</span>
        <span className="ddChevron" />
      </button>

      {open && (
        <div className="ddMenu" role="listbox">
          {options.map((opt) => (
            <button
              key={opt}
              type="button"
              className={`ddItem ${opt === value ? "active" : ""}`}
              onClick={() => {
                onChange(opt);
                setOpen(false);
              }}
            >
              {opt}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function Badge({ children, icon: Icon }) {
  return (
    <span className="badge">
      {Icon ? <Icon size={14} /> : null}
      {children}
    </span>
  );
}

function Modal({ title, onClose, children, wide = false }) {
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "Escape") onClose?.();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="mBackdrop" role="dialog" aria-modal="true">
      <div className={`mCard ${wide ? "wide" : ""}`}>
        <div className="mTop">
          <div className="mTitle">{title}</div>
          <button className="iconBtn" onClick={onClose} aria-label="Chiudi">
            <X size={18} />
          </button>
        </div>
        <div className="mBody">{children}</div>
      </div>
    </div>
  );
}

export default function ModulisticaPdfSandbox() {
  const [modules, setModules] = useState(() =>
    readLS(LS_MODULES, [
      {
        id: "demo-1",
        title: "DEMO — Inserisci un PDF pubblico",
        category: "Altro",
        url: "https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf",
        createdAt: Date.now(),
      },
    ])
  );
  const [archives, setArchives] = useState(() => readLS(LS_ARCHIVES, []));

  // UI
  const [qText, setQText] = useState("");
  const [catFilter, setCatFilter] = useState("Tutte");
  const [selectedId, setSelectedId] = useState(() => (modules[0]?.id ? modules[0].id : null));

  // Add/Edit module
  const [showEditor, setShowEditor] = useState(false);
  const [editId, setEditId] = useState(null);
  const [mTitle, setMTitle] = useState("");
  const [mCategory, setMCategory] = useState("Assunzione");
  const [mUrl, setMUrl] = useState("");

  // Preview/Compile
  const [showPreview, setShowPreview] = useState(false);
  const [showCompile, setShowCompile] = useState(false);

  // Compile state
  const [fields, setFields] = useState([DEFAULT_FIELD()]);
  const [textColor, setTextColor] = useState("#0a0a0a");
  const [flatten, setFlatten] = useState(true);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  useEffect(() => writeLS(LS_MODULES, modules), [modules]);
  useEffect(() => writeLS(LS_ARCHIVES, archives), [archives]);

  const selected = useMemo(() => modules.find((m) => m.id === selectedId) || null, [modules, selectedId]);

  const filtered = useMemo(() => {
    const t = qText.trim().toLowerCase();
    return modules.filter((m) => {
      const okCat = catFilter === "Tutte" ? true : (m.category || "") === catFilter;
      if (!okCat) return false;
      if (!t) return true;
      const hay = `${m.title || ""} ${m.category || ""} ${m.url || ""}`.toLowerCase();
      return hay.includes(t);
    });
  }, [modules, qText, catFilter]);

  const archiveForSelected = useMemo(() => {
    if (!selected) return [];
    return archives.filter((a) => a.moduleId === selected.id);
  }, [archives, selected]);

  const openAdd = () => {
    setEditId(null);
    setMTitle("");
    setMCategory("Assunzione");
    setMUrl("");
    setShowEditor(true);
    setErr("");
  };

  const openEdit = (mod) => {
    setEditId(mod.id);
    setMTitle(mod.title || "");
    setMCategory(mod.category || "Assunzione");
    setMUrl(mod.url || "");
    setShowEditor(true);
    setErr("");
  };

  const saveModule = () => {
    setErr("");
    const title = mTitle.trim();
    const url = mUrl.trim();
    if (!title) return setErr("Inserisci un titolo modulo.");
    if (!url || !/^https?:\/\//i.test(url)) return setErr("Inserisci un link PDF valido (https://...).");

    if (editId) {
      setModules((arr) =>
        arr.map((m) => (m.id === editId ? { ...m, title, category: mCategory, url, updatedAt: Date.now() } : m))
      );
    } else {
      const id = crypto.randomUUID ? crypto.randomUUID() : String(Math.random());
      const obj = { id, title, category: mCategory, url, createdAt: Date.now() };
      setModules((arr) => [obj, ...arr]);
      setSelectedId(id);
    }
    setShowEditor(false);
  };

  const removeModule = (mod) => {
    const ok = window.confirm(`Eliminare il modulo "${mod.title}"?`);
    if (!ok) return;
    setModules((arr) => arr.filter((m) => m.id !== mod.id));
    if (selectedId === mod.id) setSelectedId(null);
  };

  const copyLink = async (url) => {
    try {
      await navigator.clipboard.writeText(url);
    } catch (_) {}
  };

  const resetCompile = () => {
    setFields([DEFAULT_FIELD()]);
    setTextColor("#0a0a0a");
    setFlatten(true);
    setErr("");
  };

  const hexToRgb = (hex) => {
    const h = (hex || "").replace("#", "");
    if (h.length !== 6) return { r: 0, g: 0, b: 0 };
    const n = parseInt(h, 16);
    return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
  };

  const generateAndArchive = async () => {
    setErr("");
    if (!selected) return;

    const url = (selected.url || "").trim();
    if (!url) return setErr("Modulo senza link PDF.");

    const cleaned = fields
      .map((f) => ({
        ...f,
        label: (f.label || "Campo").trim(),
        value: (f.value || "").toString(),
        page: Number(f.page || 1),
        x: Number(f.x || 0),
        y: Number(f.y || 0),
        size: Number(f.size || 12),
      }))
      .filter((f) => f.value.trim().length > 0);

    if (!cleaned.length) return setErr("Inserisci almeno un campo con valore.");

    try {
      setBusy(true);

      const res = await fetch(url);
      if (!res.ok) throw new Error(`Download PDF fallito (${res.status}). Possibile blocco CORS.`);
      const bytes = await res.arrayBuffer();

      const pdfDoc = await PDFDocument.load(bytes);
      const pages = pdfDoc.getPages();

      const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
      const { r, g, b } = hexToRgb(textColor);
      const color = rgb(r / 255, g / 255, b / 255);

      for (const f of cleaned) {
        const idx = Math.max(0, Math.min(pages.length - 1, f.page - 1));
        const page = pages[idx];
        page.drawText(f.value, { x: f.x, y: f.y, size: f.size, font, color });
      }

      const outBytes = await pdfDoc.save({ useObjectStreams: true });
      const blob = new Blob([outBytes], { type: "application/pdf" });

      const fileName = `${safeFileName(selected.title)}_${nowStamp()}.pdf`;

      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 5000);

      setArchives((arr) => [
        {
          id: crypto.randomUUID ? crypto.randomUUID() : String(Math.random()),
          moduleId: selected.id,
          moduleTitle: selected.title,
          moduleCategory: selected.category,
          sourceUrl: selected.url,
          fileName,
          fields: cleaned.map(({ id, ...rest }) => rest),
          flatten: !!flatten,
          createdAt: Date.now(),
        },
        ...arr,
      ]);

      setShowCompile(false);
      resetCompile();
    } catch (e) {
      setErr(e?.message || "Errore generazione PDF (probabile CORS sul sito esterno).");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="page modulistica-page">
      <div className="modTop">
        <div className="modTitleRow">
          <div className="modH1">
            <Sparkles size={18} />
            Modulistica PDF (Sandbox)
          </div>
          <div className="modSub">Offline • localStorage • test rapido senza CRM.</div>
        </div>

        <div className="modActions">
          <button className="btn primary" onClick={openAdd}>
            <Plus size={16} />
            Aggiungi modulo
          </button>
        </div>
      </div>

      {err ? (
        <div className="alert">
          <AlertTriangle size={16} />
          <div className="alertTxt">{err}</div>
        </div>
      ) : null}

      <div className="grid2">
        <div className="card">
          <div className="cardTop">
            <div className="cardTitle">
              <FileText size={16} /> Moduli
              <Badge icon={LinkIcon}>{filtered.length}</Badge>
            </div>
            <div className="filters">
              <input className="input" value={qText} onChange={(e) => setQText(e.target.value)} placeholder="Cerca modulo..." />
              <PremiumDropdown value={catFilter} options={["Tutte", ...CATEGORIES]} onChange={setCatFilter} />
            </div>
          </div>

          <div className="list">
            {filtered.map((m) => {
              const active = m.id === selectedId;
              return (
                <button key={m.id} className={`row ${active ? "active" : ""}`} onClick={() => setSelectedId(m.id)}>
                  <div className="rowMain">
                    <div className="rowTitle">{m.title || "Senza titolo"}</div>
                    <div className="rowMeta">
                      <span className="pill">{m.category || "—"}</span>
                      <span className="rowUrl">{(m.url || "").replace(/^https?:\/\//, "")}</span>
                    </div>
                  </div>
                  <div className="rowBtns">
                    <span className="miniIcon" title="Copia link" onClick={(e) => { e.preventDefault(); e.stopPropagation(); copyLink(m.url); }}>
                      <Copy size={16} />
                    </span>
                    <span className="miniIcon" title="Modifica" onClick={(e) => { e.preventDefault(); e.stopPropagation(); openEdit(m); }}>
                      <Save size={16} />
                    </span>
                    <span className="miniIcon danger" title="Elimina" onClick={(e) => { e.preventDefault(); e.stopPropagation(); removeModule(m); }}>
                      <Trash2 size={16} />
                    </span>
                  </div>
                </button>
              );
            })}

            {!filtered.length ? (
              <div className="empty">
                <div className="emptyTitle">Nessun modulo</div>
                <div className="emptySub">Aggiungi il primo modulo con il link PDF.</div>
              </div>
            ) : null}
          </div>
        </div>

        <div className="card">
          <div className="cardTop">
            <div className="cardTitle">
              <Eye size={16} /> Dettaglio
            </div>
          </div>

          {!selected ? (
            <div className="empty">
              <div className="emptyTitle">Seleziona un modulo</div>
              <div className="emptySub">A sinistra scegli un modulo per aprirlo o compilarlo.</div>
            </div>
          ) : (
            <div className="detail">
              <div className="dHead">
                <div className="dTitle">{selected.title}</div>
                <div className="dMeta">
                  <span className="pill">{selected.category || "—"}</span>
                  <button className="btn ghost" onClick={() => copyLink(selected.url)}>
                    <Copy size={16} /> Copia link
                  </button>
                </div>
              </div>

              <div className="dUrl">
                <LinkIcon size={16} />
                <a href={selected.url} target="_blank" rel="noreferrer">{selected.url}</a>
                <span className="spacer" />
                <button className="btn ghost" onClick={() => window.open(selected.url, "_blank")}>
                  <ExternalLink size={16} /> Apri
                </button>
              </div>

              <div className="dActions">
                <button className="btn" onClick={() => setShowPreview(true)}>
                  <Eye size={16} /> Preview
                </button>
                <button className="btn primary" onClick={() => { resetCompile(); setShowCompile(true); }}>
                  <Sparkles size={16} /> Compila & Genera PDF
                </button>
              </div>

              <div className="archBox">
                <div className="archTop">
                  <div className="archTitle">
                    <FolderArchive size={16} /> Archivio (locale)
                    <Badge>{archiveForSelected.length}</Badge>
                  </div>
                  <div className="archSub">Lista dei PDF generati (metadati). Nel CRM avrai archiviazione file vera.</div>
                </div>

                <div className="archList">
                  {archiveForSelected.slice(0, 10).map((a) => (
                    <div key={a.id} className="archRow">
                      <div className="archMain">
                        <div className="archName">{a.fileName || "PDF"}</div>
                        <div className="archMeta">
                          <span className="pill">{a.moduleCategory || "—"}</span>
                          <span className="archSmall">{new Date(a.createdAt).toLocaleString()}</span>
                        </div>
                      </div>
                      <div className="archBtns">
                        <button className="btn ghost" onClick={() => alert("Sandbox: il file lo scarichi quando lo generi. Nel CRM avrai un downloadURL archiviato.")}>
                          <Download size={16} /> Info
                        </button>
                      </div>
                    </div>
                  ))}

                  {!archiveForSelected.length ? <div className="emptySmall">Ancora nessun PDF generato per questo modulo.</div> : null}
                </div>
              </div>

              <div className="note">
                <AlertTriangle size={16} />
                <div>
                  <div className="noteTitle">Nota rapida</div>
                  <div className="noteTxt">Se un PDF esterno blocca preview o download (CORS), nel CRM useremo una Cloud Function proxy.</div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {showEditor && (
        <Modal title={editId ? "Modifica modulo" : "Aggiungi modulo"} onClose={() => setShowEditor(false)}>
          <div className="form">
            <div className="fRow">
              <div className="fLabel">Titolo</div>
              <input className="input" value={mTitle} onChange={(e) => setMTitle(e.target.value)} placeholder="Es. Modulo Assunzione X" />
            </div>

            <div className="fRow">
              <div className="fLabel">Categoria</div>
              <PremiumDropdown value={mCategory} options={CATEGORIES} onChange={setMCategory} />
            </div>

            <div className="fRow">
              <div className="fLabel">Link PDF</div>
              <input className="input" value={mUrl} onChange={(e) => setMUrl(e.target.value)} placeholder="https://..." />
              <div className="fHint">Incolla il link ufficiale: così resta sempre aggiornato.</div>
            </div>

            <div className="fBtns">
              <button className="btn" onClick={() => setShowEditor(false)} disabled={busy}>Annulla</button>
              <button className="btn primary" onClick={saveModule} disabled={busy}><Save size={16} /> Salva</button>
            </div>
          </div>
        </Modal>
      )}

      {showPreview && selected && (
        <Modal title={`Preview — ${selected.title}`} onClose={() => setShowPreview(false)} wide>
          <div className="previewWrap">
            <iframe className="pdfFrame" title="PDF Preview" src={selected.url} />
            <div className="previewHint">Se vedi vuoto/blocco, è il sito che non permette l’embed. Usa “Apri”.</div>
            <div className="previewBtns">
              <button className="btn ghost" onClick={() => window.open(selected.url, "_blank")}>
                <ExternalLink size={16} /> Apri in nuova scheda
              </button>
            </div>
          </div>
        </Modal>
      )}

      {showCompile && selected && (
        <Modal title={`Compila & Genera PDF — ${selected.title}`} onClose={() => setShowCompile(false)} wide>
          <div className="compile">
            <div className="compileLeft">
              <div className="sectionTitle">Campi da “stampare”</div>
              <div className="sectionSub">
                Prototipo: inserisci testo + coordinate (X,Y). Nel CRM faremo auto-detect per PDF compilabili e template per i non compilabili.
              </div>

              <div className="fieldList">
                {fields.map((f, idx) => (
                  <div className="fieldCard" key={f.id}>
                    <div className="fieldTop">
                      <div className="fieldTag">Campo {idx + 1}</div>
                      <button className="iconBtn" onClick={() => setFields((arr) => arr.filter((x) => x.id !== f.id))} aria-label="Rimuovi campo" title="Rimuovi">
                        <Trash2 size={16} />
                      </button>
                    </div>

                    <div className="fieldGrid">
                      <div className="fMini">
                        <div className="fMiniLab">Label</div>
                        <input className="input" value={f.label} onChange={(e) => setFields((arr) => arr.map((x) => (x.id === f.id ? { ...x, label: e.target.value } : x)))} />
                      </div>
                      <div className="fMini span2">
                        <div className="fMiniLab">Valore</div>
                        <input className="input" value={f.value} onChange={(e) => setFields((arr) => arr.map((x) => (x.id === f.id ? { ...x, value: e.target.value } : x)))} placeholder="Scrivi qui..." />
                      </div>

                      <div className="fMini">
                        <div className="fMiniLab">Pagina</div>
                        <input className="input" type="number" value={f.page} onChange={(e) => setFields((arr) => arr.map((x) => (x.id === f.id ? { ...x, page: e.target.value } : x)))} min={1} />
                      </div>
                      <div className="fMini">
                        <div className="fMiniLab">X</div>
                        <input className="input" type="number" value={f.x} onChange={(e) => setFields((arr) => arr.map((x) => (x.id === f.id ? { ...x, x: e.target.value } : x)))} />
                      </div>
                      <div className="fMini">
                        <div className="fMiniLab">Y</div>
                        <input className="input" type="number" value={f.y} onChange={(e) => setFields((arr) => arr.map((x) => (x.id === f.id ? { ...x, y: e.target.value } : x)))} />
                      </div>
                      <div className="fMini">
                        <div className="fMiniLab">Size</div>
                        <input className="input" type="number" value={f.size} onChange={(e) => setFields((arr) => arr.map((x) => (x.id === f.id ? { ...x, size: e.target.value } : x)))} min={6} max={40} />
                      </div>
                    </div>

                    <div className="fieldHint">Tip: coordinate (0,0) = basso a sinistra. Se sbagli posizione, cambia X/Y e rigenera.</div>
                  </div>
                ))}
              </div>

              <div className="addRow">
                <button className="btn" onClick={() => setFields((arr) => [...arr, DEFAULT_FIELD()])}>
                  <Plus size={16} /> Aggiungi campo
                </button>

                <div className="spacer" />

                <div className="colorRow">
                  <div className="colorLab">Colore testo</div>
                  <input className="color" type="color" value={textColor} onChange={(e) => setTextColor(e.target.value)} />
                </div>

                <label className="check">
                  <input type="checkbox" checked={flatten} onChange={(e) => setFlatten(e.target.checked)} />
                  <span>Stampato (flatten)</span>
                </label>
              </div>

              <div className="genRow">
                <button className="btn primary" onClick={generateAndArchive} disabled={busy}>
                  <Sparkles size={16} /> Genera + Archivia + Scarica
                </button>
                <button className="btn" onClick={resetCompile} disabled={busy}>Reset</button>
              </div>

              <div className="miniNote">Sandbox: nessun file viene salvato online. Nel CRM lo archiviamo su Storage con link di download.</div>
            </div>

            <div className="compileRight">
              <div className="sectionTitle">Preview PDF</div>
              <iframe className="pdfFrame tall" title="PDF Preview" src={selected.url} />
              <div className="previewHint">Se la preview non si vede, apri il link esterno. Per il test va bene.</div>
              <div className="previewBtns">
                <button className="btn ghost" onClick={() => window.open(selected.url, "_blank")}>
                  <ExternalLink size={16} /> Apri in nuova scheda
                </button>
              </div>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
