import React, { useState, useMemo } from "react";
import "./dashboard.css";
import { Layers, Calendar, Clock, Target, Eye, StickyNote } from "lucide-react";
import CustomSelect from "../components/CustomSelect";

/* =========================================================
   MOCK DATA
   ========================================================= */
const MOCK_PERSONAL_STATS = {
    total: 124,
    totalCA: 80,
    totalCVA: 44,
    month: 12,
    monthCA: 8,
    monthCVA: 4,
    week: 3,
    weekCA: 2,
    weekCVA: 1,
    list: [], // Populated below if needed for detail views
    listWeek: [],
    listMonth: []
};

const MOCK_STRUCTURE_STATS = {
    total: 1540,
    totalCA: 900,
    totalCVA: 640,
    month: 145,
    monthCA: 85,
    monthCVA: 60,
    week: 32,
    weekCA: 20,
    weekCVA: 12,
    peopleCount: 15,
    list: [] // Populated below
};

const MOCK_KPI = {
    posRate: 45,
    negRate: 15,
    freq: 4.2,
    last4wCompletion: 88,
    coverage: 75,
    activeDownlineCount: 12,
    downlinePeopleCount: 16,
    totalFixed: 450,
    closed: 270,
    positive: 202,
    negative: 68,
    scheduled: 180,
    last4wTotal: 40,
    last4wClosed: 35
};

// Generate some mock appointments for the list
const generateMockAppts = (count) => {
    const statuses = ["programmato", "esito_positivo", "esito_negativo", "annullato"];
    const types = ["CA", "CVA"];
    const names = ["Mario Rossi", "Luca Bianchi", "Giulia Verdi", "Elena Neri"];

    return Array.from({ length: count }).map((_, i) => ({
        id: `mock-appt-${i}`,
        tipo: types[i % 2],
        nome: names[i % 4].split(" ")[0],
        cognome: names[i % 4].split(" ")[1],
        stato: statuses[i % 4],
        dataOra: Date.now() - (i * 86400000), // Previous days
        uid: "mock-user-123"
    }));
};

MOCK_PERSONAL_STATS.list = generateMockAppts(10);
MOCK_STRUCTURE_STATS.list = generateMockAppts(20);

/* =========================================================
   COMPONENTS (Copied/Adapted from dashboard.jsx)
   ========================================================= */



export default function DashboardMock() {
    // UI state
    const [activeTab, setActiveTab] = useState("personal");
    const [selectedRootUid, setSelectedRootUid] = useState("");

    // Goal state (mock)
    const [goal, setGoal] = useState({ ca: 20, cva: 10 });

    const personalStats = MOCK_PERSONAL_STATS;
    const structureStats = MOCK_STRUCTURE_STATS;
    const kpi = MOCK_KPI;

    // Computed percentages for Goal
    const personalGoalPctCA = Math.round((personalStats.monthCA / goal.ca) * 100);
    const personalGoalPctCVA = Math.round((personalStats.monthCVA / goal.cva) * 100);

    const displayName = "Preview User";
    const displayPhone = "333 1234567";
    const displayEmail = "preview@local.com";

    return (
        <main className="main dashboard-page">
            <header className="main-header">
                <div>
                    <h1 className="main-title">Dashboard (Preview)</h1>

                    <p className="main-subtitle" style={{ marginBottom: 6 }}>
                        Ciao <b>{displayName}</b>
                    </p>

                    <p className="main-subtitle" style={{ opacity: 0.85 }}>
                        {displayPhone ? `Tel: ${displayPhone}` : ""}
                        {displayPhone && displayEmail ? " • " : ""}
                        {displayEmail ? `Email: ${displayEmail}` : ""}
                    </p>
                </div>

                <span className="badge-status">MOCK MODE</span>
            </header>

            {/* Tabs */}
            <div className="tabs dashboard-tabs-mobile">
                <button type="button" className={"tab-btn" + (activeTab === "personal" ? " active" : "")} onClick={() => setActiveTab("personal")}>
                    Personale
                </button>
                <button type="button" className={"tab-btn" + (activeTab === "structure" ? " active" : "")} onClick={() => setActiveTab("structure")}>
                    Struttura
                </button>
                <button type="button" className={"tab-btn" + (activeTab === "kpi" ? " active" : "")} onClick={() => setActiveTab("kpi")}>
                    KPI
                </button>
                <button type="button" className={"tab-btn" + (activeTab === "history" ? " active" : "")} onClick={() => setActiveTab("history")}>
                    Agenda
                </button>
            </div>

            {/* 1) PERSONALE */}
            <section className={"cards-wrapper" + (activeTab !== "personal" ? " tab-hidden-mobile" : "")}>
                <h2 className="cards-section-title">Appuntamenti personali</h2>
                <div className="cards-grid cards-grid-personal">
                    {/* TOTAL */}
                    <div className="card card-highlight">
                        <div className="card-header">
                            <div className="card-title"><Layers size={14} className="card-icon" /> Totale</div>
                        </div>
                        <div className="card-value">{personalStats.total}</div>
                        <div className="card-subvalue">
                            <div className="stat-item"><div className="stat-dot ca"></div> CA: {personalStats.totalCA}</div>
                            <div className="stat-item"><div className="stat-dot cva"></div> CVA: {personalStats.totalCVA}</div>
                        </div>
                    </div>

                    {/* MONTH */}
                    <div className="card card-secondary">
                        <div className="card-header">
                            <div className="card-title"><Calendar size={14} className="card-icon" /> Mese</div>
                        </div>
                        <div className="card-value">{personalStats.month}</div>
                        <div className="card-subvalue">
                            <div className="stat-item"><div className="stat-dot ca"></div> {personalStats.monthCA}</div>
                            <div className="stat-item"><div className="stat-dot cva"></div> {personalStats.monthCVA}</div>
                        </div>
                    </div>

                    {/* WEEK */}
                    <div className="card card-secondary">
                        <div className="card-header">
                            <div className="card-title"><Clock size={14} className="card-icon" /> Settimana</div>
                        </div>
                        <div className="card-value">{personalStats.week}</div>
                        <div className="card-subvalue">
                            <div className="stat-item"><div className="stat-dot ca"></div> {personalStats.weekCA}</div>
                            <div className="stat-item"><div className="stat-dot cva"></div> {personalStats.weekCVA}</div>
                        </div>
                    </div>

                    {/* GOAL */}
                    <div className="card card-success">
                        <div className="card-header">
                            <div className="card-title"><Target size={14} className="card-icon" /> Obiettivo (Mock)</div>
                        </div>
                        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 16 }}>
                            <div style={{ textAlign: "left" }}>
                                <div style={{ fontSize: 10, fontWeight: 700, opacity: 0.6, marginBottom: 2 }}>TARGET CA</div>
                                <div className="card-value" style={{ fontSize: 24 }}>{personalGoalPctCA}%</div>
                            </div>
                            <div style={{ textAlign: "right" }}>
                                <div style={{ fontSize: 10, fontWeight: 700, opacity: 0.6, marginBottom: 2 }}>TARGET CVA</div>
                                <div className="card-value" style={{ fontSize: 24 }}>{personalGoalPctCVA}%</div>
                            </div>
                        </div>
                        <div className="progress-wrapper" style={{ marginTop: 12 }}>
                            <div style={{ marginBottom: 8 }}>
                                <div className="progress-bar" style={{ height: 4, background: 'rgba(255,255,255,0.05)' }}>
                                    <div className="progress-inner" style={{ width: `${personalGoalPctCA}%`, background: "rgb(56, 189, 248)" }} />
                                </div>
                            </div>
                            <div>
                                <div className="progress-bar" style={{ height: 4, background: 'rgba(255,255,255,0.05)' }}>
                                    <div className="progress-inner" style={{ width: `${personalGoalPctCVA}%`, background: "rgb(167, 139, 250)" }} />
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </section>

            {/* 2) STRUTTURA */}
            <section className={"cards-wrapper" + (activeTab !== "structure" ? " tab-hidden-mobile" : "")}>
                <h2 className="cards-section-title">Appuntamenti di struttura</h2>
                <div style={{ marginBottom: 10 }}>
                    <CustomSelect
                        value={selectedRootUid}
                        onChange={setSelectedRootUid}
                        options={[{ value: '', label: 'Tutta la struttura (Mock)' }, { value: 'me', label: 'Solo io' }]}
                    />
                </div>
                <div className="cards-grid cards-grid-structure">
                    <div className="card card-structure">
                        <div className="card-header"><div className="card-title">Totale struttura</div></div>
                        <div className="card-value">{structureStats.total}</div>
                        <div className="card-subvalue">CA: {structureStats.totalCA} • CVA: {structureStats.totalCVA}</div>
                    </div>
                    <div className="card card-structure">
                        <div className="card-header"><div className="card-title">Mese struttura</div></div>
                        <div className="card-value">{structureStats.month}</div>
                        <div className="card-subvalue">CA: {structureStats.monthCA} • CVA: {structureStats.monthCVA}</div>
                    </div>
                    <div className="card card-structure">
                        <div className="card-header"><div className="card-title">Settimana struttura</div></div>
                        <div className="card-value">{structureStats.week}</div>
                        <div className="card-subvalue">CA: {structureStats.weekCA} • CVA: {structureStats.weekCVA}</div>
                    </div>
                </div>
            </section>

            {/* 3) KPI */}
            <section className={"cards-wrapper" + (activeTab !== "kpi" ? " tab-hidden-mobile" : "")}>
                <h2 className="cards-section-title">KPI Performance</h2>
                <div className="cards-grid">
                    <div className="card">
                        <div className="card-header"><div className="card-title">Esito appuntamenti</div></div>
                        <div className="card-value" style={{ fontSize: 20 }}>Pos: {kpi.posRate}% / Neg: {kpi.negRate}%</div>
                        <div className="kpi-progress-wrapper">
                            <div className="kpi-progress-bar">
                                <div className="kpi-progress-inner" style={{ width: `${Math.min(100, kpi.posRate)}%` }} />
                            </div>
                        </div>
                    </div>
                    <div className="card">
                        <div className="card-header"><div className="card-title">Frequenza</div></div>
                        <div className="card-value">{kpi.freq}</div>
                        <div className="card-footer">Media appuntamenti/settimana</div>
                    </div>
                </div>
            </section>

            {/* 4) STORICO / AGENDA */}
            <section className={"cards-wrapper" + (activeTab !== "history" ? " tab-hidden-mobile" : "")}>
                <h2 className="cards-section-title">Agenda (Mock)</h2>
                <div className="cards-grid" style={{ marginTop: 20 }}>
                    {structureStats.list.length === 0 ? (
                        <div className="card" style={{ textAlign: "center", padding: 30 }}>Nessun dato.</div>
                    ) : (
                        structureStats.list.map(a => (
                            <div key={a.id} className="card" style={{ padding: 10, display: 'flex', justifyContent: 'space-between' }}>
                                <div>
                                    <div style={{ fontWeight: 'bold' }}>{a.nome} {a.cognome}</div>
                                    <div style={{ fontSize: 12, opacity: 0.7 }}>{a.tipo} - {a.stato}</div>
                                </div>
                                <div>
                                    <button className="btn-icon-soft"><Eye size={16} /></button>
                                </div>
                            </div>
                        ))
                    )}
                </div>
            </section>

        </main>
    );
}
