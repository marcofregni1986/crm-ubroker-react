import React, { useState } from "react";
import "./dashboard2.css";
import {
    Target,
    Users,
    Zap,
    TrendingUp,
    Calendar,
    MoreHorizontal,
    ArrowUpRight,
    Shield,
    Activity
} from "lucide-react";

/* 
  DASHBOARD 2.0 - "MODERN BENTO"
  Premium, Professional, Coherent.
*/

const MOCK = {
    kpi: { freq: 4.2, execRate: 88, posRate: 48 },
    personal: {
        week: { exec: 5, target: 8, ca: 3, cva: 2 },
        month: { exec: 28, target: 40, ca: 15, cva: 10 }
    },
    structure: {
        week: { vol: 24, new: 2 },
        month: { vol: 1450, new: 12 }
    },
    agenda: [
        { id: 1, time: "10:00", name: "Mario Rossi", type: "CA", status: "Confirm" },
        { id: 2, time: "14:30", name: "Luigi Verdi", type: "CVA", status: "Pending" },
        { id: 3, time: "16:00", name: "Anna Bianchi", type: "S1", status: "Confirm" },
        { id: 4, time: "17:45", name: "Giulia Neri", type: "CA", status: "Waiting" },
    ]
};

export default function Dashboard2() {
    const [view, setView] = useState("month");
    const pData = view === 'week' ? MOCK.personal.week : MOCK.personal.month;
    const sData = view === 'week' ? MOCK.structure.week : MOCK.structure.month;

    return (
        <div className="d2-page">

            {/* HEADER */}
            <div className="b-header">
                <div>
                    <div className="b-title">Dashboard</div>
                    <div className="b-date">{new Date().toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'long' })}</div>
                </div>
                <div style={{ display: 'flex', gap: 10 }}>
                    <button className="b-btn glass">Richiamare (7)</button>
                    <button className="b-btn" onClick={() => window.location.href = '/dashboard'}>Torna Classica</button>
                </div>
            </div>

            {/* BENTO GRID */}
            <div className="b-grid">

                {/* ITEM 1: PERSONAL (Hero) */}
                <div className="b-card span-2">
                    <div className="b-card-head">
                        <div className="b-card-title">
                            <div className="b-icon-box"><Target size={16} /></div>
                            Attività Personale
                        </div>
                        <div className="b-toggle">
                            <div className={`b-toggle-opt ${view === 'week' ? 'active' : ''}`} onClick={() => setView('week')}>Week</div>
                            <div className={`b-toggle-opt ${view === 'month' ? 'active' : ''}`} onClick={() => setView('month')}>Month</div>
                        </div>
                    </div>

                    <div style={{ display: 'flex', gap: 30, alignItems: 'flex-end', marginBottom: 20 }}>
                        <div>
                            <div className="b-big-stat">{pData.exec}</div>
                            <div className="b-stat-sub">Eseguiti Totali</div>
                        </div>
                        <div className="b-trend-pill">
                            <ArrowUpRight size={12} /> +12% vs {view === 'week' ? 'last week' : 'last month'}
                        </div>
                    </div>

                    <div className="b-progress-container">
                        <div className="b-progress-labels">
                            <span>Progresso Obiettivo</span>
                            <span>{Math.round((pData.exec / pData.target) * 100)}% ({pData.exec}/{pData.target})</span>
                        </div>
                        <div className="b-track">
                            <div className="b-fill" style={{ width: `${(pData.exec / pData.target) * 100}%` }}></div>
                        </div>
                    </div>

                    <div style={{ marginTop: 15, display: 'flex', gap: 10 }}>
                        <div style={{ flex: 1, background: 'rgba(255,255,255,0.03)', padding: 10, borderRadius: 12 }}>
                            <div className="b-stat-sub">CA (Consulenza)</div>
                            <div style={{ fontSize: 18, fontWeight: 700, marginTop: 4 }}>{pData.ca}</div>
                        </div>
                        <div style={{ flex: 1, background: 'rgba(255,255,255,0.03)', padding: 10, borderRadius: 12 }}>
                            <div className="b-stat-sub">CVA (Valutazione)</div>
                            <div style={{ fontSize: 18, fontWeight: 700, marginTop: 4 }}>{pData.cva}</div>
                        </div>
                    </div>
                </div>

                {/* ITEM 2: KPI TRIAD */}
                <div className="b-card span-1">
                    <div className="b-card-head">
                        <div className="b-card-title">
                            <div className="b-icon-box"><Activity size={16} /></div>
                            Performance KPI
                        </div>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, height: '100%' }}>
                        <div className="b-kpi-chip" style={{ flex: 1, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <div style={{ textAlign: 'left' }}>
                                <div className="b-kpi-lbl">RITMO</div>
                                <div className="b-kpi-val">{MOCK.kpi.freq}</div>
                            </div>
                            <Zap size={16} color="var(--b-section-icon)" />
                        </div>
                        <div className="b-kpi-chip" style={{ flex: 1, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <div style={{ textAlign: 'left' }}>
                                <div className="b-kpi-lbl">EFFICIENZA</div>
                                <div className="b-kpi-val">{MOCK.kpi.execRate}%</div>
                            </div>
                            <Shield size={16} color="var(--b-success)" />
                        </div>
                        <div className="b-kpi-chip" style={{ flex: 1, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <div style={{ textAlign: 'left' }}>
                                <div className="b-kpi-lbl">CONVERSIONE</div>
                                <div className="b-kpi-val">{MOCK.kpi.posRate}%</div>
                            </div>
                            <TrendingUp size={16} color="var(--b-success)" />
                        </div>
                    </div>
                </div>

                {/* ITEM 3: STRUCTURE */}
                <div className="b-card span-1">
                    <div className="b-card-head">
                        <div className="b-card-title">
                            <div className="b-icon-box"><Users size={16} /></div>
                            Struttura
                        </div>
                    </div>
                    <div>
                        <div className="b-stat-sub">Volume Totale</div>
                        <div className="b-big-stat" style={{ fontSize: 36 }}>{sData.vol}</div>
                    </div>
                    <div style={{ marginTop: 20 }}>
                        <div className="b-stat-sub">Nuovi inserimenti</div>
                        <div style={{ fontSize: 24, fontWeight: 700, color: 'var(--b-success)' }}>+{sData.new}</div>
                    </div>
                    <div className="b-progress-container" style={{ marginTop: 20 }}>
                        <div className="b-track">
                            <div className="b-fill success" style={{ width: '70%' }}></div>
                        </div>
                    </div>
                </div>

                {/* ITEM 4: AGENDA */}
                <div className="b-card span-2">
                    <div className="b-card-head">
                        <div className="b-card-title">
                            <div className="b-icon-box"><Calendar size={16} /></div>
                            Agenda ({view})
                        </div>
                        <button className="b-btn glass" style={{ padding: '4px 10px', fontSize: 11 }}>Vedi tutto</button>
                    </div>

                    <div>
                        {MOCK.agenda.map(item => (
                            <div key={item.id} className="b-list-item">
                                <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                                    <div className="b-avatar">{item.name.charAt(0)}</div>
                                    <div>
                                        <div style={{ fontWeight: 600 }}>{item.name}</div>
                                        <div style={{ fontSize: 12, color: 'var(--b-text-muted)' }}>{item.type} • {item.time}</div>
                                    </div>
                                </div>
                                <div style={{ fontSize: 12, fontWeight: 500, padding: '4px 10px', background: 'rgba(255,255,255,0.05)', borderRadius: 6, color: item.status === 'Confirm' ? '#fff' : 'var(--b-text-muted)' }}>
                                    {item.status}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

                {/* ITEM 5: QUICK ACTIONS / NOTIFICATIONS */}
                <div className="b-card span-2">
                    <div className="b-card-head">
                        <div className="b-card-title">Promemoria</div>
                        <MoreHorizontal size={16} color="#666" />
                    </div>
                    <div style={{ display: 'flex', gap: 12 }}>
                        <div style={{ flex: 1, background: 'rgba(251, 191, 36, 0.1)', border: '1px solid rgba(251, 191, 36, 0.2)', padding: 12, borderRadius: 12, color: 'var(--b-warn)' }}>
                            <div style={{ fontWeight: 700 }}>Da Richiamare</div>
                            <div style={{ fontSize: 24, fontWeight: 800 }}>7</div>
                        </div>
                        <div style={{ flex: 1, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.05)', padding: 12, borderRadius: 12 }}>
                            <div style={{ fontWeight: 700, color: '#fff' }}>Valutazioni in sospeso</div>
                            <div style={{ fontSize: 24, fontWeight: 800 }}>3</div>
                        </div>
                    </div>
                </div>

            </div>

        </div>
    );
}
