// src/components/EventKpiSection.jsx
import React, { useEffect, useState, useMemo } from "react";
import {
    BarChart3,
    Users,
    UserCheck,
    ChevronDown,
    Calendar
} from "lucide-react";
import {
    collection,
    collectionGroup,
    query,
    where,
    onSnapshot
} from "firebase/firestore";
import { db } from "../firebase";
import {
    Chart as ChartJS,
    CategoryScale,
    LinearScale,
    BarElement,
    Title,
    Tooltip,
    Legend
} from 'chart.js';
import { Bar } from 'react-chartjs-2';
import "./EventKpiSection.css";

// Register ChartJS components
ChartJS.register(
    CategoryScale,
    LinearScale,
    BarElement,
    Title,
    Tooltip,
    Legend
);

export default function EventKpiSection({ events }) {
    const [selectedEventId, setSelectedEventId] = useState("all");
    const [guests, setGuests] = useState([]);
    const [loading, setLoading] = useState(false);

    // Fetch guests based on selection
    useEffect(() => {
        setLoading(true);
        let q;

        if (selectedEventId === "all") {
            // Fetch ALL guests (Collection Group)
            // Note: This might be heavy if thousands of guests.
            // Optimization: Limit or ensure simple index.
            q = query(collectionGroup(db, 'guests'));
        } else {
            // Fetch Specific Event Guests
            q = query(collection(db, "eventGuestLists", selectedEventId, "guests"));
        }

        const unsub = onSnapshot(q, (snap) => {
            const items = snap.docs.map(d => d.data());
            setGuests(items);
            setLoading(false);
        });

        return () => unsub();
    }, [selectedEventId]);

    // Calculate Stats
    const stats = useMemo(() => {
        const total = guests.length;
        const present = guests.filter(g => g.presente).length;
        const confirmed = guests.filter(g => g.conferma === 'Confermato').length;

        // Attendance rate based on CONFIRMED guests (optional, or total?)
        // Let's do % Present vs Confirmed
        const rate = confirmed > 0 ? Math.round((present / confirmed) * 100) : 0;

        return { total, present, confirmed, rate };
    }, [guests]);

    // Chart Data
    const chartData = {
        labels: ['Invitati Totali', 'Confermati', 'Presenti'],
        datasets: [
            {
                label: 'Persone',
                data: [stats.total, stats.confirmed, stats.present],
                backgroundColor: [
                    'rgba(148, 163, 184, 0.5)', // Slate (Invitati)
                    'rgba(139, 92, 246, 0.5)', // Violet (Confermati)
                    'rgba(236, 72, 153, 0.6)', // Pink (Presenti)
                ],
                borderColor: [
                    'rgba(148, 163, 184, 1)',
                    'rgba(139, 92, 246, 1)',
                    'rgba(236, 72, 153, 1)',
                ],
                borderWidth: 1,
            },
        ],
    };

    // ✅ Detect current theme for dynamic colors
    const isDarkTheme = document.body.classList.contains('theme-dark');
    const gridColor = isDarkTheme ? 'rgba(255, 255, 255, 0.1)' : 'rgba(15, 23, 42, 0.1)';
    const ticksColor = isDarkTheme ? '#94a3b8' : '#475569';
    const labelsColor = isDarkTheme ? '#e2e8f0' : '#334155';

    const chartOptions = {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
            legend: {
                display: false,
            },
            title: {
                display: false,
            },
        },
        scales: {
            y: {
                beginAtZero: true,
                grid: {
                    color: gridColor,
                },
                ticks: {
                    color: ticksColor,
                }
            },
            x: {
                grid: {
                    display: false,
                },
                ticks: {
                    color: labelsColor,
                }
            }
        }
    };

    return (
        <div className="kpi-section">
            {/* CONTROLS */}
            <div className="kpi-controls">
                <h2 className="kpi-title">
                    <BarChart3 className="text-violet-400" size={20} />
                    Analisi Presenze
                </h2>

                <div className="kpi-select-wrapper">
                    <label className="kpi-label">Seleziona Evento</label>
                    <PremiumSelect
                        options={[
                            { value: 'all', label: 'Tutti gli Eventi (Totale)' },
                            ...events.map(ev => ({
                                value: ev.id,
                                label: `${ev.title} (${ev.date?.seconds ? new Date(ev.date.seconds * 1000).toLocaleDateString() : ""})`
                            }))
                        ]}
                        value={selectedEventId}
                        onChange={setSelectedEventId}
                    />
                </div>

                <div className="kpi-stats-grid">
                    <div className="kpi-card">
                        <span className="kpi-card-value text-slate-300">{stats.total}</span>
                        <span className="kpi-card-label">Invitati</span>
                    </div>
                    <div className="kpi-card">
                        <span className="kpi-card-value text-violet-400">{stats.confirmed}</span>
                        <span className="kpi-card-label">Confermati</span>
                    </div>
                    <div className="kpi-card">
                        <span className="kpi-card-value text-pink-400">{stats.present}</span>
                        <span className="kpi-card-label">Presenti</span>
                    </div>
                    <div className="kpi-card">
                        <span className="kpi-card-value text-amber-400">{stats.rate}%</span>
                        <span className="kpi-card-label">Conversion</span>
                    </div>
                </div>
            </div>

            {/* CHART */}
            <div className="kpi-chart-wrapper">
                <Bar data={chartData} options={chartOptions} />
            </div>
        </div>
    );
}

function PremiumSelect({ options, value, onChange }) {
    const [isOpen, setIsOpen] = useState(false);
    const selectedOption = options.find(opt => opt.value === value);

    return (
        <div className="custom-select-container">
            <div
                className={`custom-select-trigger ${isOpen ? 'is-open' : ''}`}
                onClick={() => setIsOpen(!isOpen)}
            >
                <span>{selectedOption?.label}</span>
                <ChevronDown className="custom-select-arrow" size={16} />
            </div>

            {isOpen && (
                <>
                    <div className="custom-select-overlay" onClick={() => setIsOpen(false)} />
                    <div className="custom-select-options">
                        {options.map(opt => (
                            <div
                                key={opt.value}
                                className={`custom-option ${opt.value === value ? 'selected' : ''}`}
                                onClick={() => {
                                    onChange(opt.value);
                                    setIsOpen(false);
                                }}
                            >
                                {opt.label}
                            </div>
                        ))}
                    </div>
                </>
            )}
        </div>
    );
}
