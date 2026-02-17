// src/pages/ClassificaPage.jsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import "./classifica.css";
import { useAuth } from "../auth/AuthProvider";

// ✅ Firestore
import { db } from "../firebase";
import {
  collection,
  doc,
  documentId,
  getDoc,
  getDocs,
  query,
  where,
  Timestamp,
} from "firebase/firestore";

/**
 * CLASSIFICA — Firebase (appointments + users)
 *
 * Dati attesi:
 * - appointments:
 *    - uid: string (uid creatore / owner)
 *    - dataOra: Timestamp (data/ora appuntamento)
 *
 * - users/{uid}:
 *    - displayName oppure (nome + cognome) oppure email
 *
 * Logica:
 * - Selezione mese (prev/next)
 * - Query appointments nel range [startMonth, startNextMonth)
 * - Raggruppo per uid -> count
 * - Risolvo i nomi dagli users/{uid}
 *
 * NOTE:
 * - Non scrive niente su Firestore: solo READ.
 * - Funziona sia in dark che in light perché usa solo classi/CSS del CRM.
 */

function toMonthStart(d) {
  const x = new Date(d);
  x.setDate(1);
  x.setHours(0, 0, 0, 0);
  return x;
}

function monthRange(d) {
  const start = new Date(d.getFullYear(), d.getMonth(), 1, 0, 0, 0, 0);
  const end = new Date(d.getFullYear(), d.getMonth() + 1, 1, 0, 0, 0, 0);
  return { start, end };
}

function safeInitials(name) {
  const s = String(name || "").trim();
  if (!s) return "U";
  const parts = s.split(/\s+/).filter(Boolean);
  if (parts.length === 1) return parts[0].slice(0, 1).toUpperCase();
  return (parts[0].slice(0, 1) + parts[1].slice(0, 1)).toUpperCase();
}

function rankBadge(rank) {
  if (rank === 1) return "🥇";
  if (rank === 2) return "🥈";
  if (rank === 3) return "🥉";
  return String(rank);
}

// Firestore "in" supporta max 10 elementi
function chunk(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

export default function ClassificaPage() {
  const { uid: myUid } = useAuth();

  // mese selezionato
  const [monthDate, setMonthDate] = useState(() => toMonthStart(new Date()));

  // dati classifica
  const [rows, setRows] = useState([]); // [{ uid, name, count }]
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState("");

  // coriandoli canvas
  const canvasRef = useRef(null);
  const rafRef = useRef(null);
  const resizeHandlerRef = useRef(null);

  const monthLabel = useMemo(
    () => monthDate.toLocaleDateString("it-IT", { month: "long", year: "numeric" }),
    [monthDate]
  );

  // ------------------------------
  // Confetti (solo UI)
  // ------------------------------
  function stopCelebration() {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;

    if (resizeHandlerRef.current) {
      window.removeEventListener("resize", resizeHandlerRef.current);
      resizeHandlerRef.current = null;
    }

    const c = canvasRef.current;
    if (c) {
      const ctx = c.getContext("2d");
      if (ctx) ctx.clearRect(0, 0, c.width, c.height);
    }
  }

  function startCelebration() {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let width = window.innerWidth;
    let height = window.innerHeight;

    canvas.width = width;
    canvas.height = height;

    const particles = [];
    const particleCount = 150;

    // IMPORTANT: niente palette hardcoded "a caso" in light/dark.
    // Uso una palette "neutra" che resta leggibile con overlay.
    const colors = ["#ffffff", "#e5e7eb", "#cbd5e1", "#fbbf24", "#60a5fa"];

    function createParticle() {
      return {
        x: Math.random() * width,
        y: Math.random() * height - height,
        size: Math.random() * 8 + 2,
        color: colors[Math.floor(Math.random() * colors.length)],
        speedY: Math.random() * 3 + 2,
        speedX: Math.random() * 2 - 1,
        rotation: Math.random() * 360,
        rotationSpeed: Math.random() * 5 - 2,
      };
    }

    for (let i = 0; i < particleCount; i++) particles.push(createParticle());

    const animate = () => {
      ctx.clearRect(0, 0, width, height);

      for (let i = 0; i < particles.length; i++) {
        const p = particles[i];
        p.y += p.speedY;
        p.x += Math.sin(p.y * 0.01) + p.speedX;
        p.rotation += p.rotationSpeed;

        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate((p.rotation * Math.PI) / 180);
        ctx.fillStyle = p.color;
        ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size);
        ctx.restore();

        if (p.y > height) {
          p.y = -20;
          p.x = Math.random() * width;
        }
      }

      rafRef.current = requestAnimationFrame(animate);
    };

    animate();

    const onResize = () => {
      width = window.innerWidth;
      height = window.innerHeight;
      canvas.width = width;
      canvas.height = height;
    };

    resizeHandlerRef.current = onResize;
    window.addEventListener("resize", onResize);
  }

  // ------------------------------
  // Load leaderboard da Firestore
  // ------------------------------
  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setErrorMsg("");

      try {
        const { start, end } = monthRange(monthDate);
        const startTs = Timestamp.fromDate(start);
        const endTs = Timestamp.fromDate(end);

        // appointments nel mese
        const q = query(
          collection(db, "appointments"),
          where("dataOra", ">=", startTs),
          where("dataOra", "<", endTs)
        );

        const snap = await getDocs(q);

        // count per uid
        const countsByUid = {};
        snap.forEach((d) => {
          const data = d.data() || {};
          const ownerUid = data.uid;
          if (!ownerUid) return;
          countsByUid[ownerUid] = (countsByUid[ownerUid] || 0) + 1;
        });

        const uids = Object.keys(countsByUid);

        if (!uids.length) {
          if (!cancelled) {
            setRows([]);
            setLoading(false);
          }
          return;
        }

        // Risolvo nomi dal profilo users/{uid}
        const usersMap = {};

        // batch "in" da 10
        const batches = chunk(uids, 10);

        await Promise.all(
          batches.map(async (group) => {
            // se group=1 puoi fare getDoc, ma il batch mantiene stesso codice per tutti
            const uq = query(collection(db, "users"), where(documentId(), "in", group));
            const us = await getDocs(uq);
            us.forEach((u) => {
              const ud = u.data() || {};
              const nome = (ud.nome || "").trim();
              const cognome = (ud.cognome || "").trim();
              const displayName = (ud.displayName || "").trim();

              const email = (ud.email || "").trim();
              const fromEmail = email ? email.split("@")[0] : "";

              usersMap[u.id] = (displayName || `${nome} ${cognome}`.trim() || fromEmail || "Utente").trim();
            });

            // eventuali uid mancanti in questa query (profilo non esiste)
            group.forEach((id) => {
              if (!usersMap[id]) usersMap[id] = "Utente";
            });
          })
        );

        const computed = uids
          .map((id) => ({ uid: id, name: usersMap[id] || "Utente", count: countsByUid[id] || 0 }))
          .sort((a, b) => b.count - a.count);

        if (!cancelled) {
          setRows(computed);
          setLoading(false);
        }
      } catch (e) {
        console.error("[Classifica] errore lettura Firestore:", e);
        if (!cancelled) {
          setRows([]);
          setLoading(false);
          setErrorMsg("Errore nel caricamento della classifica. Riprova tra poco.");
        }
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [monthDate]);

  // coriandoli quando arrivano dati
  useEffect(() => {
    stopCelebration();
    if (rows && rows.length > 0) startCelebration();
    return () => stopCelebration();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows]);

  // podio
  const top3 = useMemo(() => rows.slice(0, 3), [rows]);
  const podiumOrder = useMemo(() => [1, 0, 2], []);

  function goPrevMonth() {
    const d = new Date(monthDate);
    d.setMonth(d.getMonth() - 1);
    setMonthDate(toMonthStart(d));
  }

  function goNextMonth() {
    const d = new Date(monthDate);
    d.setMonth(d.getMonth() + 1);
    setMonthDate(toMonthStart(d));
  }

  return (
    <div className="classifica-page">
      {/* Disco lights (fixed dietro) */}
      <div className="classifica-disco">
        <div className="classifica-haze" />
        <div className="classifica-spot-beam classifica-spot-left" />
        <div className="classifica-spot-beam classifica-spot-right" />
        <div className="classifica-laser l1" />
        <div className="classifica-laser l2" />
        <div className="classifica-laser l3" />
        <div className="classifica-laser l4" />
      </div>

      {/* coriandoli */}
      <canvas id="celebrationCanvas" ref={canvasRef} />

      <div className="classifica-content">
        <div className="classifica-header">
          <div>
            <div className="classifica-title">Classifica Campioni</div>
            <div className="classifica-subtitle">Celebriamo i migliori performer del mese</div>
          </div>

          <div className="classifica-month-switcher">
            <button
              type="button"
              className="classifica-btn-ghost"
              onClick={goPrevMonth}
              aria-label="Mese precedente"
              title="Mese precedente"
            >
              &lt;
            </button>
            <div className="classifica-month-label">{monthLabel}</div>
            <button
              type="button"
              className="classifica-btn-ghost"
              onClick={goNextMonth}
              aria-label="Mese successivo"
              title="Mese successivo"
            >
              &gt;
            </button>
          </div>
        </div>

        {/* Podio */}
        <section className="classifica-cards-wrapper">
          {loading ? (
            <div className="classifica-empty">Caricamento classifica...</div>
          ) : top3.length === 0 ? (
            <p className="classifica-empty">Nessun appuntamento fissato nel mese selezionato.</p>
          ) : (
            <div className="classifica-podium-stage">
              <div className="classifica-spotlight-container">
                <div className="classifica-spotlight-beam" />
              </div>

              {podiumOrder.map((idx, posIndex) => {
                const row = top3[idx];
                if (!row) return null;

                const position = idx + 1; // 1..3
                const typeClass = position === 1 ? "gold" : position === 2 ? "silver" : "bronze";
                const delayClass = posIndex === 0 ? "delay-1" : posIndex === 1 ? "delay-2" : "delay-3";

                return (
                  <div key={row.uid} className={`classifica-podium-column ${typeClass} ${delayClass}`}>
                    <div className="classifica-avatar-wrap">
                      {position === 1 && <div className="classifica-crown">👑</div>}
                      <div className="classifica-avatar">{safeInitials(row.name)}</div>
                    </div>

                    <div className="classifica-base">
                      <div className="classifica-rank">{position}</div>
                      <div className="classifica-name">{row.name}</div>
                      <div className="classifica-score-pill">{row.count}</div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* Lista completa */}
        <section className="classifica-section">
          <div className="classifica-section-header">
            <div className="classifica-section-title">Ranking Completo</div>
          </div>

          {errorMsg ? <div className="classifica-error">{errorMsg}</div> : null}

          <div className="classifica-list">
            <div className="classifica-list-header">
              <div>#</div>
              <div>Collaboratore</div>
              <div style={{ textAlign: "right" }}>Appuntamenti</div>
            </div>

            {loading ? (
              <div className="classifica-empty">Caricamento classifica...</div>
            ) : rows.length === 0 ? (
              <div className="classifica-empty">Nessun dato disponibile.</div>
            ) : (
              rows.map((r, index) => {
                const rank = index + 1;
                const isMe = myUid && r.uid === myUid;

                let rankClass = "classifica-rank-cell";
                if (rank <= 3) rankClass += " top";

                return (
                  <div
                    key={r.uid}
                    className={`classifica-row ${isMe ? "is-me" : ""}`}
                    style={{ animationDelay: `${index * 0.05 + 0.5}s` }}
                  >
                    <div className={rankClass}>{rank <= 3 ? rankBadge(rank) : rank}</div>

                    <div className="classifica-user">
                      <div className="classifica-list-avatar">{safeInitials(r.name)}</div>
                      <div className="classifica-list-name">{r.name}</div>
                      {isMe ? <div className="classifica-me-pill">TU</div> : null}
                    </div>

                    <div className="classifica-score-cell">
                      {r.count}
                      <span className="classifica-score-label">APP</span>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
