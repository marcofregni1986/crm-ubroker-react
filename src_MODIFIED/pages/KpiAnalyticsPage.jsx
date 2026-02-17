// src/pages/KpiAnalyticsPage.jsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import "./kpi.css";

import { Timestamp, collection, doc, getDoc, getDocs, query, where } from "firebase/firestore";
import { db } from "../firebase";
import { useAuth } from "../auth/AuthProvider";
import CustomSelect from "../components/CustomSelect";

/**
 * KPI Analytics — Firebase (adattato al tuo Firestore reale)
 *
 * ✅ users:
 * - driverChain: array (contiene gli uid dei driver sopra)
 * - (doc id = uid)
 *
 * ✅ appointments:
 * - uid: string
 * - tipo: "CA" | "CVA"
 * - stato: "programmato" | "esito_positivo" | "esito_negativo" | "annullato"
 * - dataOra: timestamp (Firestore)
 *
 * ✅ Privacy/struttura:
 * Dropdown mostra SOLO:
 * - io (uid loggato)
 * - downline: users dove driverChain array-contains uid loggato
 *
 * ✅ Standard CRM: dropdown premium (NO <select> nativo)
 * ✅ Tema: nessuna “traccia scura” in light mode (usa vars + override light).
 */

// -------------------------
// HELPERS
// -------------------------
function getStartOfWeek(date) {
  const d = new Date(date);
  const day = d.getDay() || 7; // lun=1 ... dom=7
  d.setDate(d.getDate() - (day - 1));
  d.setHours(0, 0, 0, 0);
  return d;
}
function getStartOfMonth(date) {
  const d = new Date(date.getFullYear(), date.getMonth(), 1);
  d.setHours(0, 0, 0, 0);
  return d;
}
function getStartOfYear(date) {
  const d = new Date(date.getFullYear(), 0, 1);
  d.setHours(0, 0, 0, 0);
  return d;
}
function normalizeStatus(raw) {
  return (raw || "programmato").toLowerCase().trim().replace(/ /g, "_");
}
function monthKey(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}
function getExecCount(bucket) {
  return bucket.positivo + bucket.negativo;
}
function getConversionPercent(bucket) {
  const exec = getExecCount(bucket);
  if (exec === 0) return 0;
  return Math.round((bucket.positivo * 1000) / exec) / 10;
}
function getBarColor(percent) {
  if (percent <= 0) return "rgba(148,163,184,0.35)";
  if (percent < 5) return "var(--danger, #ef4444)";
  if (percent < 12.5) return "var(--accent-orange, #f97316)";
  if (percent < 20) return "var(--accent-green, #10b981)";
  return "var(--accent-blue, #0ea5e9)";
}
function chunk(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}
function humanName(u) {
  const nome = (u?.nome || "").trim();
  const cognome = (u?.cognome || "").trim();
  const email = (u?.email || "").trim();
  const label = `${nome} ${cognome}`.trim();
  return label || email || "Senza Nome";
}
function toDate(v) {
  if (!v) return null;
  if (v instanceof Date) return v;
  if (typeof v?.toDate === "function") return v.toDate();
  const d = new Date(v);
  if (!Number.isNaN(d.getTime())) return d;
  return null;
}

// -------------------------
// THEME DETECTOR (light/dark)
// -------------------------
function detectLightMode() {
  if (typeof document === "undefined") return false;
  const b = document.body;
  const html = document.documentElement;
  // supporta: body.light, .light, data-theme="light", className "theme-light"
  if (b.classList.contains("light")) return true;
  if (html.classList.contains("light")) return true;
  if (b.dataset?.theme === "light") return true;
  if (html.dataset?.theme === "light") return true;
  if (b.className?.includes("theme-light")) return true;
  return false;
}

// -------------------------
// PREMIUM DROPDOWN (NO <select>)
// -------------------------


// -------------------------
// PAGE
// -------------------------
export default function KpiAnalyticsPage() {
  const { uid, loading: authLoading } = useAuth();

  const [scope, setScope] = useState("structure"); // structure | personal | <uid>
  const [period, setPeriod] = useState("month"); // week|month|year|all

  const [teamUsers, setTeamUsers] = useState([]);
  const [teamLoading, setTeamLoading] = useState(true);

  const [apps, setApps] = useState([]);
  const [appsLoading, setAppsLoading] = useState(true);

  const [isLight, setIsLight] = useState(() => detectLightMode());

  // aggiorna tema se cambia classe (best-effort)
  useEffect(() => {
    const obs = new MutationObserver(() => setIsLight(detectLightMode()));
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ["class", "data-theme"] });
    obs.observe(document.body, { attributes: true, attributeFilter: ["class", "data-theme"] });
    return () => obs.disconnect();
  }, []);

  // chart refs
  const caPieRef = useRef(null);
  const cvaPieRef = useRef(null);
  const funnelRef = useRef(null);
  const lineRef = useRef(null);
  const chartsRef = useRef({ caPie: null, cvaPie: null, funnel: null, line: null });
  const [chartReady, setChartReady] = useState(true);

  const startDate = useMemo(() => {
    const now = new Date();
    if (period === "week") return getStartOfWeek(now);
    if (period === "month") return getStartOfMonth(now);
    if (period === "year") return getStartOfYear(now);
    return new Date(0);
  }, [period]);

  const endDate = useMemo(() => {
    const now = new Date();
    // range chiuso: startDate -> endDate inclusivo (fine periodo)
    if (period === "week") {
      const s = getStartOfWeek(now);
      const e = new Date(s);
      e.setDate(e.getDate() + 6);
      e.setHours(23, 59, 59, 999);
      return e;
    }
    if (period === "month") {
      const e = new Date(now.getFullYear(), now.getMonth() + 1, 0);
      e.setHours(23, 59, 59, 999);
      return e;
    }
    if (period === "year") {
      const e = new Date(now.getFullYear(), 11, 31);
      e.setHours(23, 59, 59, 999);
      return e;
    }
    // tutto lo storico: nessun limite superiore
    const e = new Date(8640000000000000); // max Date
    return e;
  }, [period]);

  // 1) LOAD TEAM: me + downline (driverChain contains my uid)
  useEffect(() => {
    let cancelled = false;

    async function run() {
      if (!uid) {
        setTeamUsers([]);
        setTeamLoading(false);
        return;
      }

      setTeamLoading(true);
      try {
        const usersRef = collection(db, "users");

        // me
        const meSnap = await getDoc(doc(db, "users", uid));
        const me = meSnap.exists() ? [{ id: meSnap.id, ...meSnap.data() }] : [{ id: uid }];

        // downline
        const qDown = query(usersRef, where("driverChain", "array-contains", uid));
        const snapDown = await getDocs(qDown);
        const down = snapDown.docs.map((d) => ({ id: d.id, ...d.data() }));

        const map = new Map();
        [...me, ...down].forEach((u) => map.set(u.id, u));

        const ordered = Array.from(map.values()).sort((a, b) => {
          if (a.id === uid) return -1;
          if (b.id === uid) return 1;
          return humanName(a).toLowerCase().localeCompare(humanName(b).toLowerCase());
        });

        if (!cancelled) setTeamUsers(ordered);
      } catch (e) {
        console.error("[KPI] load team error:", e);
        if (!cancelled) setTeamUsers([]);
      } finally {
        if (!cancelled) setTeamLoading(false);
      }
    }

    run();
    return () => {
      cancelled = true;
    };
  }, [uid]);

  // 2) LOAD APPOINTMENTS: by scope + period using dataOra
  useEffect(() => {
    let cancelled = false;

    async function run() {
      if (!uid) {
        setApps([]);
        setAppsLoading(false);
        return;
      }

      setAppsLoading(true);
      try {
        let allowedUids = [];
        if (scope === "personal") allowedUids = [uid];
        else if (scope === "structure") allowedUids = [uid, ...teamUsers.filter((u) => u.id !== uid).map((u) => u.id)];
        else allowedUids = [scope];

        const startTs = Timestamp.fromDate(startDate);
        const apRef = collection(db, "appointments");

        const chunks = chunk(allowedUids, 10);
        const all = [];

        for (const c of chunks) {
          const qApps = query(apRef, where("uid", "in", c), where("dataOra", ">=", startTs));
          const snap = await getDocs(qApps);
          snap.docs.forEach((d) => all.push({ id: d.id, ...d.data() }));
        }

        const normalized = all
          .map((a) => ({ ...a, __dateObj: toDate(a.dataOra) }))
          .filter((a) => a.__dateObj && a.__dateObj >= startDate)
          .sort((a, b) => b.__dateObj - a.__dateObj);

        if (!cancelled) setApps(normalized);
      } catch (e) {
        console.error("[KPI] load appointments error:", e);
        if (!cancelled) setApps([]);
      } finally {
        if (!cancelled) setAppsLoading(false);
      }
    }

    // se scope=structure aspetta che la downline sia caricata
    if (scope === "structure" && teamLoading) return;

    run();
    return () => {
      cancelled = true;
    };
  }, [uid, scope, startDate, teamUsers, teamLoading]);

  // 3) KPI CALC (LOGICA CORRETTA)
  // - "Totale Appuntamenti" = appuntamenti VALIDI (tutti tranne annullato) nel RANGE chiuso del periodo selezionato
  // - gli "annullati" restano visibili, ma NON gonfiano i totali e NON falsano funnel/conversioni
  const kpi = useMemo(() => {
    const totals = {
      totalValid: 0,       // totale valido (no annullati) nel periodo
      totalAll: 0,         // totale lordo (include annullati) nel periodo
      ca: { total: 0, valido: 0, positivo: 0, negativo: 0, annullato: 0, programmato: 0 },
      cva: { total: 0, valido: 0, positivo: 0, negativo: 0, annullato: 0, programmato: 0 },
    };

    // serie trend (bucket dinamico):
    // - week  -> giornaliero (YYYY-MM-DD)
    // - month -> giornaliero (YYYY-MM-DD)
    // - year  -> mensile (YYYY-MM)
    // - all   -> mensile (YYYY-MM)
    const series = {}; // key -> {ca,cva, _date}

    function dayKey(date) {
      const y = date.getFullYear();
      const m = String(date.getMonth() + 1).padStart(2, "0");
      const d = String(date.getDate()).padStart(2, "0");
      return `${y}-${m}-${d}`;
    }

    function bucketKey(date) {
      if (period === "week" || period === "month") return dayKey(date);
      return monthKey(date);
    }

    function pushSeries(tipo, date) {
      const key = bucketKey(date);
      if (!series[key]) series[key] = { ca: 0, cva: 0, _date: date };
      if (tipo === "CA") series[key].ca += 1;
      if (tipo === "CVA") series[key].cva += 1;
    }

    // *NEW LOGIC*: Group by Person (Name + Surname) normalized.
    // 1 Person = 1 count in Total Valid.
    // Status = best/latest status. (If any Positive -> Positive. Else if any Negative -> Negative. Else Scheduled).
    // Annullato: If ALL appointments are Annullato -> Count as Annullato (no valid).
    // If mixed (Annullato + Scheduled) -> Count as Scheduled (Active).

    const inRange = (d) => d && d >= startDate && d <= endDate;

    const peopleMap = new Map();

    apps.forEach((a) => {
      // Filter out bad data
      const tipo = (a?.tipo || "").toUpperCase().trim();
      const dateObj = a.__dateObj || toDate(a.dataOra);
      if (!tipo || !dateObj || !inRange(dateObj)) return;

      const rawName = (a.nome || "") + " " + (a.cognome || "");
      const key = rawName.trim().toLowerCase();
      if (!key) return; // skip nameless

      if (!peopleMap.has(key)) {
        peopleMap.set(key, {
          pos: 0,
          neg: 0,
          sched: 0,
          annul: 0,
          caCount: 0,
          cvaCount: 0,
          latestDate: dateObj,
          types: []
        });
      }
      const p = peopleMap.get(key);

      // Update latest date for series plotting? Actually series is usually volume over time.
      // If we count UNIQUE PEOPLE, we should plot them on the date of their *first* or *latest* valid interaction in range.
      // Let's use Latest Date in range for plotting.
      if (dateObj > p.latestDate) p.latestDate = dateObj;

      const stato = normalizeStatus(a?.stato);

      if (tipo === "CA") p.caCount++;
      if (tipo === "CVA") p.cvaCount++;

      if (stato === "esito_positivo" || stato === "eseguito_positivo") p.pos++;
      else if (stato === "esito_negativo" || stato === "eseguito_negativo") p.neg++;
      else if (stato === "annullato") p.annul++;
      else p.sched++;

      // Track type for series assignment (CA vs CVA). If mixed, we might favor the "highest" type or just both?
      // Let's say if they have ANY CVA, they are CVA potential? Or just count them in the bucket of their *main* appointment?
      // Simple approach: If they have CA, add to CA series. If CVA, add to CVA series. (Double counting in series is okay for volume, but Total must be unique).
      // Actually, user wants "Unique Person" global count.
      // Let's assign primary type: CVA > CA.
      p.types.push(tipo);
    });

    // Iterate unique people and aggregate
    peopleMap.forEach((p) => {
      // Determine "Person Status"
      let finalStatus = "annullato";
      if (p.pos > 0) finalStatus = "positivo";
      else if (p.neg > 0) finalStatus = "negativo";
      else if (p.sched > 0) finalStatus = "programmato";

      // Bucket assignment (CA vs CVA)
      // If they have >=1 CVA, we treat them as CVA lead? Or CA?
      // Let's count them in the bucket corresponding to their *Status* appointment if possible. 
      // Fallback: If has CVA -> CVA bucket. Else CA.
      const headerType = (p.cvaCount > 0) ? "CVA" : "CA";
      const bucket = headerType === "CVA" ? totals.cva : totals.ca;

      // TOTALS
      totals.totalAll++; // This is effectively "Unique People Contacted" (including all cancelled)

      if (finalStatus === "annullato") {
        bucket.annullato++;
        return; // Not valid
      }

      // VALID
      totals.totalValid++;
      bucket.total++; // Valid People
      bucket.valido++;

      if (finalStatus === "positivo") bucket.positivo++;
      else if (finalStatus === "negativo") bucket.negativo++;
      else bucket.programmato++;

      // SERIES (Volume over time)
      // Plot this person on their latest date
      pushSeries(headerType, p.latestDate);
    });

    // per compatibilità UI esistente: ca.total e cva.total diventano i VALIDI
    totals.ca.total = totals.ca.valido;
    totals.cva.total = totals.cva.valido;

    return { totals, series };
  }, [apps, startDate, endDate, period]);


  const ca = kpi.totals.ca;
  const cva = kpi.totals.cva;

  const caExec = getExecCount(ca);
  const cvaExec = getExecCount(cva);

  const caExecPerc = ca.total > 0 ? Math.round((caExec * 1000) / ca.total) / 10 : 0;
  const cvaExecPerc = cva.total > 0 ? Math.round((cvaExec * 1000) / cva.total) / 10 : 0;

  const convPerc = getConversionPercent(ca);
  const convExec = getExecCount(ca);

  const convRatioText = useMemo(() => {
    if (convExec === 0) return "1 : 0";
    if (ca.positivo === 0) return "1 : ∞";
    const ratio = convExec / ca.positivo;
    return `1 : ${ratio.toFixed(1)}`;
  }, [convExec, ca.positivo]);

  const convDetailHtml = useMemo(() => {
    if (convExec === 0) return "Nessun CA eseguito";
    if (ca.positivo === 0) return `Conversione: <span class="text-danger">0%</span> • 0 positivi su ${convExec} CA`;
    const ratio = convExec / ca.positivo;
    return `Conversione: <span class="text-success">${convPerc.toFixed(1)}%</span> • 1 positivo ogni ${ratio.toFixed(
      1
    )} CA`;
  }, [convExec, ca.positivo, convPerc]);

  const convTargetPerc = 12.5;
  const convProgress = convTargetPerc > 0 ? Math.min((convPerc * 100) / convTargetPerc, 200) : 0;

  // 4) CHARTS (Chart.js dinamico) — colori/labels che cambiano in base al tema
  useEffect(() => {
    let cancelled = false;

    async function buildCharts() {
      if (!caPieRef.current || !cvaPieRef.current || !funnelRef.current || !lineRef.current) return;

      // destroy prev
      const prev = chartsRef.current;
      Object.values(prev).forEach((c) => {
        try {
          if (c && typeof c.destroy === "function") c.destroy();
        } catch { }
      });
      chartsRef.current = { caPie: null, cvaPie: null, funnel: null, line: null };

      let ChartMod;
      try {
        ChartMod = await import("chart.js/auto");
      } catch {
        if (!cancelled) setChartReady(false);
        return;
      }
      if (cancelled) return;
      setChartReady(true);

      const Chart = ChartMod.default;

      const legendText = isLight ? "rgba(15,23,42,.80)" : "rgba(203,213,225,.95)";
      const grid = isLight ? "rgba(2,6,23,0.08)" : "rgba(255,255,255,0.06)";
      const borderCol = isLight ? "rgba(15,23,42,0.12)" : "rgba(30,41,59,1)";

      const pieLabels = ["Positivi", "Negativi", "Annullati", "Programm."];
      const pieColors = ["#22c55e", "#ef4444", "#f97316", "#64748b"];

      const caData = [ca.positivo, ca.negativo, ca.annullato, ca.programmato];
      const cvaData = [cva.positivo, cva.negativo, cva.annullato, cva.programmato];

      const mkPie = (ctx, data) =>
        new Chart(ctx, {
          type: "pie",
          data: { labels: pieLabels, datasets: [{ data, backgroundColor: pieColors, borderColor: borderCol, borderWidth: 2 }] },
          options: {
            maintainAspectRatio: false,
            plugins: { legend: { position: "right", labels: { color: legendText, font: { size: 11 } } } },
          },
        });

      const caCtx = caPieRef.current.getContext("2d");
      const cvaCtx = cvaPieRef.current.getContext("2d");
      const funnelCtx = funnelRef.current.getContext("2d");
      const lineCtx = lineRef.current.getContext("2d");

      const caPie = mkPie(caCtx, caData);
      const cvaPie = mkPie(cvaCtx, cvaData);

      const funnelLabels = ["CA validi", "CA eseguiti", "CA positivi"];
      const funnelData = [ca.total, caExec, ca.positivo];

      const funnel = new Chart(funnelCtx, {
        type: "bar",
        data: { labels: funnelLabels, datasets: [{ data: funnelData, backgroundColor: ["#6366f1", "#0ea5e9", "#22c55e"], borderRadius: 6 }] },
        options: {
          indexAxis: "y",
          maintainAspectRatio: false,
          plugins: { legend: { display: false } },
          scales: {
            x: { ticks: { color: legendText, font: { size: 11 } }, grid: { color: grid } },
            y: { ticks: { color: legendText, font: { size: 11 } }, grid: { display: false } },
          },
        },
      });

      const keys = Object.keys(kpi.series).sort((a, b) => {
        const da = kpi.series[a]?._date ? new Date(kpi.series[a]._date) : new Date(a);
        const db = kpi.series[b]?._date ? new Date(kpi.series[b]._date) : new Date(b);
        return da - db;
      });

      const labels = keys.map((k) => {
        if (period === "week" || period === "month") {
          const d = kpi.series[k]?._date ? new Date(kpi.series[k]._date) : new Date(k);
          const dd = String(d.getDate()).padStart(2, "0");
          const mm = String(d.getMonth() + 1).padStart(2, "0");
          return `${dd}/${mm}`;
        }
        return k; // YYYY-MM
      });

      const caSerie = keys.map((k) => kpi.series[k]?.ca || 0);
      const cvaSerie = keys.map((k) => kpi.series[k]?.cva || 0);


      const line = new Chart(lineCtx, {
        type: "line",
        data: {
          labels: labels,
          datasets: [
            {
              label: "CA",
              data: caSerie,
              borderColor: "#8b5cf6",
              backgroundColor: "rgba(139,92,246,0.18)",
              tension: 0.4,
              fill: true,
              pointRadius: 3,
            },
            {
              label: "CVA",
              data: cvaSerie,
              borderColor: "#f97316",
              backgroundColor: "rgba(249,115,22,0.10)",
              tension: 0.4,
              fill: true,
              pointRadius: 3,
            },
          ],
        },
        options: {
          maintainAspectRatio: false,
          plugins: { legend: { labels: { color: legendText, font: { size: 11 } } } },
          scales: {
            x: { ticks: { color: legendText, font: { size: 10 } }, grid: { color: grid } },
            y: { ticks: { color: legendText, font: { size: 10 } }, grid: { color: grid } },
          },
        },
      });

      chartsRef.current = { caPie, cvaPie, funnel, line };
    }

    buildCharts();

    return () => {
      cancelled = true;
      const prev = chartsRef.current;
      Object.values(prev).forEach((c) => {
        try {
          if (c && typeof c.destroy === "function") c.destroy();
        } catch { }
      });
      chartsRef.current = { caPie: null, cvaPie: null, funnel: null, line: null };
    };
  }, [
    isLight,
    scope,
    period,
    ca.total,
    ca.positivo,
    ca.negativo,
    ca.annullato,
    ca.programmato,
    cva.total,
    cva.positivo,
    cva.negativo,
    cva.annullato,
    cva.programmato,
    caExec,
    kpi.series,
  ]);

  const periodLabel = useMemo(() => {
    if (period === "week") return "Questa Settimana";
    if (period === "month") return "Questo Mese";
    if (period === "year") return "Questo Anno";
    return "Tutto lo Storico";
  }, [period]);

  const scopeOptions = useMemo(() => {
    const me = teamUsers.find((u) => u.id === uid);
    const base = [
      { value: "structure", label: "Tutta la mia Struttura (da me in giù)" },
      { value: "personal", label: me ? `Solo Personali (${humanName(me)})` : "Solo Personali" },
    ];
    const people = teamUsers.filter((u) => u.id !== uid).map((u) => ({ value: u.id, label: humanName(u) }));
    return [...base, ...people];
  }, [teamUsers, uid]);

  const periodOptions = useMemo(
    () => [
      { value: "month", label: "Questo Mese" },
      { value: "week", label: "Questa Settimana" },
      { value: "year", label: "Questo Anno" },
      { value: "all", label: "Tutto lo Storico" },
    ],
    []
  );

  const pageLoading = authLoading || teamLoading || appsLoading;

  return (
    <div className="main kpi-page">
      {/* CSS “theme-safe”: in light niente background scuri.
         Se il CRM ha già vars, le usa; altrimenti fallback ok. */}
      <style>{`
        .kpi-page{
          --kpi-text: var(--text, ${isLight ? "rgba(15,23,42,.92)" : "rgba(226,232,240,.96)"});
          --kpi-muted: var(--text-muted, ${isLight ? "rgba(15,23,42,.55)" : "rgba(148,163,184,.95)"});
          --kpi-border: ${isLight ? "rgba(2,6,23,.10)" : "rgba(255,255,255,.10)"};
          --kpi-panel: ${isLight ? "rgba(255,255,255,.92)" : "rgba(255,255,255,.03)"};
          --kpi-panel2: ${isLight ? "rgba(255,255,255,.98)" : "rgba(2,6,23,.72)"};
          --kpi-shadow: ${isLight ? "0 18px 40px rgba(2,6,23,.08)" : "0 20px 50px rgba(0,0,0,.35)"};
          color: var(--kpi-text);
        }
        .filter-bar{
          display:flex;flex-wrap:wrap;gap:16px;margin-bottom:24px;
          background: var(--kpi-panel);
          padding:16px;border-radius:12px;
          border:1px solid var(--kpi-border);
        }
        .kpi-dd{display:flex;flex-direction:column;gap:6px;flex:1;min-width:220px;position:relative}
        .kpi-dd-label{color:var(--kpi-muted);font-size:12px;font-weight:800;text-transform:uppercase;letter-spacing:.06em}
        .kpi-dd-btn{
          height:42px;display:flex;align-items:center;justify-content:space-between;gap:12px;
          padding:0 14px;border-radius:12px;border:1px solid var(--kpi-border);
          background: var(--kpi-panel2);
          color: var(--kpi-text);
          cursor:pointer;outline:none;width:100%;
          transition:transform .08s ease, border-color .18s ease, background .18s ease;
        }
        .kpi-dd-btn:hover{border-color:${isLight ? "rgba(2,6,23,.18)" : "rgba(255,255,255,.22)"}}
        .kpi-dd-btn:active{transform:translateY(1px)}
        .kpi-dd-btn-caret{opacity:.8;font-size:12px}
        .kpi-dd-panel{
          position:absolute;top:calc(100% + 8px);left:0;right:0;z-index:50;
          border-radius:14px;border:1px solid var(--kpi-border);
          background: ${isLight ? "rgba(255,255,255,.98)" : "rgba(2,6,23,.88)"};
          box-shadow: var(--kpi-shadow);
          overflow:hidden;
          backdrop-filter: blur(12px);
        }
        .kpi-dd-item{
          width:100%;text-align:left;padding:10px 12px;background:transparent;border:0;
          color: var(--kpi-text);
          cursor:pointer;font-size:13px;
        }
        .kpi-dd-item:hover{background:${isLight ? "rgba(2,6,23,.06)" : "rgba(255,255,255,.06)"}}
        .kpi-dd-item.is-active{background:${isLight ? "rgba(139,92,246,.14)" : "rgba(139,92,246,.18)"}}
        .chart-canvas-wrap{position:relative;height:220px}
        .hint{font-size:11px;color:var(--kpi-muted);margin-top:12px;font-style:italic}
        .kpi-progress-wrapper{width:100%}
        .kpi-progress-bar{width:100%;height:6px;border-radius:999px;background:${isLight ? "rgba(2,6,23,.08)" : "rgba(255,255,255,.06)"};overflow:hidden;margin-top:6px}
        .kpi-progress-inner{height:100%;width:0%;border-radius:999px;transition:width .35s ease-out}
        .kpi-progress-label{font-size:11px;color:var(--kpi-muted);margin-top:8px;display:flex;justify-content:space-between}
        .text-success{color:var(--accent-green,#10b981)!important;font-weight:800}
        .text-danger{color:var(--danger,#ef4444)!important;font-weight:800}
        .text-muted{color:var(--kpi-muted)!important}
        .charts-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(300px,1fr));gap:20px}
        .chart-box{
          background: ${isLight ? "rgba(255,255,255,.92)" : "rgba(0,0,0,.20)"};
          border-radius:12px;padding:16px;border:1px solid var(--kpi-border);
        }
        .chart-title{font-size:13px;font-weight:800;color:var(--kpi-text);margin-bottom:4px}
        .chart-sub{font-size:11px;color:var(--kpi-muted);margin-bottom:12px}
        .fallback{
          font-size:12px;color:var(--kpi-muted);
          background:${isLight ? "rgba(2,6,23,.04)" : "rgba(255,255,255,.03)"};
          border:1px dashed var(--kpi-border);
          padding:12px;border-radius:10px
        }
        .kpi-loading{
          padding:10px 12px;border-radius:12px;border:1px solid var(--kpi-border);
          background:${isLight ? "rgba(255,255,255,.88)" : "rgba(255,255,255,.02)"};
          color:var(--kpi-muted);font-size:12px
        }
        @media (max-width:768px){ .filter-bar{flex-direction:column;gap:12px} }
      `}</style>

      <div className="main-header">
        <div>
          <div className="main-title">KPI Analytics</div>
          <div className="main-subtitle">Analisi completa degli appuntamenti personali e di struttura.</div>
        </div>
      </div>

      <div className="filter-bar">
        <div className="kpi-dd">
          <div className="kpi-dd-label">Visualizza Dati Di:</div>
          <CustomSelect value={scope} options={scopeOptions} onChange={setScope} />
        </div>
        <div className="kpi-dd">
          <div className="kpi-dd-label">Periodo:</div>
          <CustomSelect value={period} options={periodOptions} onChange={setPeriod} />
        </div>
      </div>

      {pageLoading && <div className="kpi-loading">Caricamento KPI in corso… (utenti/struttura + appuntamenti)</div>}

      <div className="cards-grid">
        <div className="card card-kpi-structure">
          <div className="card-header">
            <div className="card-title">Totale Appuntamenti</div>
            <div className="card-chip">{periodLabel}</div>
          </div>
          <div className="card-value">{kpi.totals.totalValid}</div>
          <div className="card-subvalue">CA {ca.total} • CVA {cva.total} • Annullati {ca.annullato + cva.annullato}</div>
          <div className="card-footer"><span>Volume totale in base ai filtri applicati.</span></div>
        </div>

        <div className="card card-kpi-ca">
          <div className="card-header">
            <div className="card-title">CA (Assunzione)</div>
            <div className="card-chip">Pipeline</div>
          </div>
          <div className="card-value">{ca.total}</div>
          <div className="card-subvalue">
            Pos <span className="text-success">{ca.positivo}</span> • Neg <span className="text-danger">{ca.negativo}</span> • Ann{" "}
            <span className="text-muted">{ca.annullato}</span> • Prog <span className="text-muted">{ca.programmato}</span>
          </div>
          <div className="card-footer">
            <div className="kpi-progress-wrapper">
              <div className="kpi-progress-bar">
                <div className="kpi-progress-inner" style={{ width: `${Math.min(caExecPerc, 100)}%`, background: getBarColor(caExecPerc) }} />
              </div>
              <div className="kpi-progress-label">
                <span>Eseguiti: {caExec} su {ca.total}</span>
                <span>{caExecPerc.toFixed(1)}%</span>
              </div>
            </div>
          </div>
        </div>

        <div className="card card-kpi-cva">
          <div className="card-header">
            <div className="card-title">CVA (Vendita)</div>
            <div className="card-chip">Produzione</div>
          </div>
          <div className="card-value">{cva.total}</div>
          <div className="card-subvalue">
            Pos <span className="text-success">{cva.positivo}</span> • Neg <span className="text-danger">{cva.negativo}</span> • Ann{" "}
            <span className="text-muted">{cva.annullato}</span> • Prog <span className="text-muted">{cva.programmato}</span>
          </div>
          <div className="card-footer">
            <div className="kpi-progress-wrapper">
              <div className="kpi-progress-bar">
                <div className="kpi-progress-inner" style={{ width: `${Math.min(cvaExecPerc, 100)}%`, background: getBarColor(cvaExecPerc) }} />
              </div>
              <div className="kpi-progress-label">
                <span>Eseguiti: {cvaExec} su {cva.total}</span>
                <span>{cvaExecPerc.toFixed(1)}%</span>
              </div>
            </div>
          </div>
        </div>

        <div className="card card-kpi-conv">
          <div className="card-header">
            <div className="card-title">Tasso Conversione CA</div>
            <div className="card-chip">Target 1:8</div>
          </div>
          <div className="card-value">{convRatioText}</div>
          <div className="card-subvalue" dangerouslySetInnerHTML={{ __html: convDetailHtml }} />
          <div className="card-footer">
            <div className="kpi-progress-wrapper">
              <div className="kpi-progress-bar">
                <div className="kpi-progress-inner" style={{ width: `${Math.min(convProgress, 100)}%`, background: getBarColor(convPerc) }} />
              </div>
              <div className="kpi-progress-label">
                <span>Obiettivo 12.5%</span>
                <span>{convPerc === 0 ? "In attesa di dati" : `${convPerc.toFixed(1)}%`}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* PIE CHARTS */}
      <section className="section">
        <div className="section-header">
          <div>
            <div className="section-title">Distribuzione Esiti</div>
            <div className="section-sub">Analisi visiva degli esiti per CA e CVA.</div>
          </div>
          <div className="section-tag">Pie Charts</div>
        </div>

        <div className="charts-grid">
          <div className="chart-box">
            <div className="chart-title">CA — Dettaglio Esiti</div>
            <div className="chart-sub">Ripartizione assunzioni.</div>
            {chartReady ? (
              <div className="chart-canvas-wrap"><canvas ref={caPieRef} /></div>
            ) : (
              <div className="fallback">Grafico non disponibile: Chart.js non risulta installato. <br />Se vuoi i grafici attivi: <b>npm i chart.js</b></div>
            )}
          </div>

          <div className="chart-box">
            <div className="chart-title">CVA — Dettaglio Esiti</div>
            <div className="chart-sub">Ripartizione vendite.</div>
            {chartReady ? (
              <div className="chart-canvas-wrap"><canvas ref={cvaPieRef} /></div>
            ) : (
              <div className="fallback">Grafico non disponibile: Chart.js non risulta installato. <br />Se vuoi i grafici attivi: <b>npm i chart.js</b></div>
            )}
          </div>
        </div>
      </section>

      {/* FUNNEL */}
      <section className="section">
        <div className="section-header">
          <div>
            <div className="section-title">Funnel di Conversione</div>
            <div className="section-sub">Dal programmato al positivo.</div>
          </div>
          <div className="section-tag">Funnel</div>
        </div>

        <div className="chart-box">
          <div className="chart-title">Step del Funnel</div>
          <div className="chart-sub">Programmato → Eseguito → Positivo</div>
          {chartReady ? (
            <div className="chart-canvas-wrap" style={{ height: 260 }}><canvas ref={funnelRef} /></div>
          ) : (
            <div className="fallback">Grafico non disponibile: Chart.js non risulta installato. <br />Se vuoi i grafici attivi: <b>npm i chart.js</b></div>
          )}
          <div className="hint">Target operativo: 1 positivo ogni 8 colloqui eseguiti.</div>
        </div>
      </section>

      {/* LINE TREND */}
      <section className="section">
        <div className="section-header">
          <div>
            <div className="section-title">Andamento Storico</div>
            <div className="section-sub">Trend storico CA e CVA (basato sul periodo selezionato).</div>
          </div>
          <div className="section-tag">Trend</div>
        </div>

        <div className="chart-box">
          <div className="chart-title">Volume Appuntamenti</div>
          <div className="chart-sub">Analisi temporale della produzione.</div>
          {chartReady ? (
            <div className="chart-canvas-wrap" style={{ height: 260 }}><canvas ref={lineRef} /></div>
          ) : (
            <div className="fallback">Grafico non disponibile: Chart.js non risulta installato. <br />Se vuoi i grafici attivi: <b>npm i chart.js</b></div>
          )}
        </div>
      </section>
    </div>
  );
}
