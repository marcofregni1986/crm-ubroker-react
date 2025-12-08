// Sidebar.jsx
// Usa questo componente nella tua app React per avere la sidebar con le icone corrette.
// Assicurati di installare prima le icone:
//   npm install lucide-react
//
// Poi importa la sidebar in App.jsx con:
//   import Sidebar from "./Sidebar";
//   ...
import React from "react";
import {
  LayoutDashboard,
  CalendarDays,
  Clock4,
  History,
  Users,
  Share2,
  Network,
  MessageCircle,
  Database,
  ShieldCheck,
  Trophy,
  BarChart3,
  Settings,
} from "lucide-react";

const menuSections = [
  {
    label: "Operativo",
    items: [
      { id: "dashboard", label: "Dashboard", icon: LayoutDashboard },
      { id: "appuntamenti", label: "Appuntamenti", icon: CalendarDays },
      { id: "agenda", label: "Agenda", icon: Clock4 },
      { id: "storico", label: "Storico appuntamenti", icon: History },
    ],
  },
  {
    label: "Team & StepOne",
    items: [
      { id: "stepone", label: "StepOne", icon: Users },
      { id: "viral", label: "Viralizzazione", icon: Share2 },
      { id: "struttura", label: "Struttura", icon: Network },
      { id: "forum", label: "Forum", icon: MessageCircle },
      { id: "database", label: "Database", icon: Database },
    ],
  },
  {
    label: "Gestione",
    items: [
      { id: "admin", label: "Admin", icon: ShieldCheck },
      { id: "classifica", label: "Classifica", icon: Trophy },
      { id: "kpi", label: "KPI", icon: BarChart3 },
      { id: "gamification", label: "Gamification", icon: Settings },
    ],
  },
];

function Sidebar({ activeId, onSelect }) {
  return (
    <aside
      className="h-screen w-64 bg-slate-900 text-slate-100 flex flex-col border-r border-slate-800"
    >
      {/* HEADER */}
      <div className="px-4 py-5 border-b border-slate-800 flex items-center gap-3">
        <div className="h-9 w-9 rounded-xl bg-violet-600 flex items-center justify-center text-sm font-bold">
          CRM
        </div>
        <div className="flex flex-col">
          <span className="text-sm font-semibold leading-tight">
            CRM uBroker
          </span>
          <span className="text-xs text-slate-400 leading-tight">
            People Machine
          </span>
        </div>
      </div>

      {/* MENU */}
      <nav className="flex-1 overflow-y-auto py-3">
        {menuSections.map((section) => (
          <div key={section.label} className="mt-2">
            <div className="px-4 mb-1">
              <p className="text-[10px] uppercase tracking-[0.12em] text-slate-500 font-medium">
                {section.label}
              </p>
            </div>

            <ul className="space-y-1 px-2">
              {section.items.map((item) => {
                const Icon = item.icon;
                const isActive = activeId === item.id;

                return (
                  <li key={item.id}>
                    <button
                      type="button"
                      onClick={() => onSelect && onSelect(item.id)}
                      className={[
                        "w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm transition-colors",
                        isActive
                          ? "bg-violet-600/90 text-white"
                          : "text-slate-200 hover:bg-slate-800 hover:text-white",
                      ].join(" ")}
                    >
                      <span className="inline-flex items-center justify-center h-5 w-5">
                        <Icon
                          size={18}
                          strokeWidth={2.2}
                          className={isActive ? "text-white" : "text-slate-300"}
                        />
                      </span>
                      <span className="truncate">{item.label}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>

      {/* FOOTER UTENTE LOGGATO */}
      <div className="border-t border-slate-800 px-4 py-3 flex items-center gap-3">
        <div className="h-8 w-8 rounded-full bg-slate-700 flex items-center justify-center text-xs font-semibold">
          MF
        </div>
        <div className="flex flex-col flex-1 min-w-0">
          <span className="text-xs font-medium truncate">Marco Fregni</span>
          <span className="text-[10px] text-slate-400 truncate">
            Livello: Coach
          </span>
        </div>
      </div>
    </aside>
  );
}

export default Sidebar;
