import React, { useState, useEffect } from 'react';

export default function Dashboard() {
  // Stato per i Tab su Mobile (Personale / Struttura / KPI / Storico)
  // Default su 'personal'
  const [activeTab, setActiveTab] = useState('personal');

  // Funzione per cambiare tab
  const switchTab = (tabName) => {
    setActiveTab(tabName);
  };

  // Funzione helper per la visibilità delle sezioni su Mobile
  // Su Desktop (window.innerWidth > 768) vogliamo vedere tutto, ma per ora usiamo la logica CSS
  // Il CSS che abbiamo copiato usa media queries per nascondere/mostrare.
  // Qui gestiamo le classi 'mobile-active-section' e 'mobile-hidden-section' come nel tuo JS originale.
  const getSectionClass = (sectionName) => {
    // Se è il tab attivo, metti la classe active, altrimenti hidden
    return activeTab === sectionName ? 'cards-wrapper mobile-active-section' : 'cards-wrapper mobile-hidden-section';
  };

  const getTabClass = (tabName) => {
    return `mobile-tab-btn ${activeTab === tabName ? 'active' : ''}`;
  };

  return (
    <div className="page-content">
      {/* --- HEADER --- */}
      <div className="main-header">
        <div className="main-header-left">
          <div className="main-title">Dashboard</div>
          <div className="main-subtitle">Panoramica appuntamenti personali e di struttura</div>
        </div>
        <div className="main-header-right">
          <div className="badge-status">CRM attivo</div>
        </div>
      </div>

      {/* --- TABS MOBILE --- */}
      <div className="mobile-dashboard-tabs">
        <button 
          className={getTabClass('personal')} 
          onClick={() => switchTab('personal')}
        >
          Personale
        </button>
        <button 
          className={getTabClass('structure')} 
          onClick={() => switchTab('structure')}
        >
          Struttura
        </button>
        <button 
          className={getTabClass('kpi')} 
          onClick={() => switchTab('kpi')}
        >
          KPI
        </button>
        <button 
          className={getTabClass('history')} 
          onClick={() => switchTab('history')}
        >
          Storico
        </button>
      </div>

      <div id="sectionDashboard">
        
        {/* --- SEZIONE PERSONALE --- */}
        <div id="sectionPersonal" className={getSectionClass('personal')}>
          <div className="cards-section-title">Appuntamenti personali</div>
          <div className="cards-section-subtitle">
            Statistiche basate sugli appuntamenti creati dal tuo utente.
          </div>

          <section className="cards-grid">
            {/* Card Totale */}
            <div className="card card-highlight">
              <div className="card-header">
                <div className="card-title">Totale appuntamenti</div>
                <div className="card-link">Dettaglio</div>
              </div>
              <div className="card-value">0</div>
              <div className="card-subvalue">CA: 0 • CVA: 0</div>
              <div className="card-footer">Somma storica.</div>
            </div>

            {/* Card Mese */}
            <div className="card card-success">
              <div className="card-header">
                <div className="card-title">Questo mese</div>
                <div className="card-link">Dettaglio</div>
              </div>
              <div className="card-value">0</div>
              <div className="card-subvalue">CA: 0 • CVA: 0</div>
              <div className="card-footer">Dal 1° ad oggi.</div>
            </div>

            {/* Card Settimana */}
            <div className="card card-secondary">
              <div className="card-header">
                <div className="card-title">Questa settimana</div>
                <div className="card-link">Dettaglio</div>
              </div>
              <div className="card-value">0</div>
              <div className="card-subvalue">CA: 0 • CVA: 0</div>
              <div className="card-footer">Lun - Dom.</div>
            </div>

            {/* Card Obiettivo */}
            <div className="card">
              <div className="card-header">
                <div className="card-title">Obiettivo</div>
                <div className="card-link">Modifica</div>
              </div>
              <div className="card-value">0</div>
              <div className="card-subvalue">Target: CA 0 • CVA 0</div>
              <div className="card-footer">
                <div className="progress-wrapper">
                  <div className="progress-bar">
                    <div className="progress-inner" style={{ width: '0%' }}></div>
                  </div>
                  <div className="progress-label">0% completato</div>
                </div>
              </div>
            </div>
          </section>
        </div>

        {/* --- SEZIONE STRUTTURA --- */}
        <div id="sectionStructure" className={getSectionClass('structure')}>
          <div className="cards-section-title">Appuntamenti di struttura</div>
          <div className="cards-section-subtitle">
            Monitoraggio produzione team e rete.
          </div>

          <div style={{ marginBottom: '16px' }}>
            <label style={{ color: '#94a3b8', fontWeight: 600, fontSize: '13px', marginBottom: '8px', display: 'block' }}>
              Seleziona collaboratore:
            </label>
            <select className="form-select" style={{ maxWidth: '300px' }}>
              <option value="">Caricamento...</option>
            </select>
          </div>

          <div style={{ fontSize: '12px', color: '#64748b', marginBottom: '16px', fontStyle: 'italic' }}>
            Nessuna struttura selezionata.
          </div>

          <section className="cards-grid">
            <div className="card card-structure">
              <div className="card-header"><div className="card-title">Totale struttura</div></div>
              <div className="card-value">0</div>
              <div className="card-subvalue">Pers. CA 0 • CVA 0 | Strut. CA 0 • CVA 0</div>
              <div className="card-footer">Storico completo rete.</div>
            </div>

            <div className="card card-structure">
              <div className="card-header"><div className="card-title">Mese struttura</div></div>
              <div className="card-value">0</div>
              <div className="card-subvalue">Pers. CA 0 • CVA 0 | Strut. CA 0 • CVA 0</div>
              <div className="card-footer">Produzione mese corrente.</div>
            </div>

            <div className="card card-structure">
              <div className="card-header"><div className="card-title">Settimana struttura</div></div>
              <div className="card-value">0</div>
              <div className="card-subvalue">Pers. CA 0 • CVA 0 | Strut. CA 0 • CVA 0</div>
              <div className="card-footer">Produzione settimanale.</div>
            </div>
          </section>

          {/* Tabella Dettaglio Struttura */}
          <section className="section section-structure-detail" style={{ marginTop: '20px' }}>
            <div className="section-header">
              <div>
                <div className="section-title">Dettaglio Appuntamenti Struttura</div>
                <div className="section-sub">Elenco completo per il collaboratore selezionato.</div>
              </div>
            </div>

            <div className="table-wrapper">
              <table className="table-simple">
                <thead>
                  <tr>
                    <th>Data</th>
                    <th>Ora</th>
                    <th>Tipo</th>
                    <th>Collaboratore</th>
                    <th>Cliente</th>
                    <th>Stato</th>
                    <th>Azioni</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td colSpan="7" style={{ textAlign: 'center', padding: '20px' }}>
                      Seleziona una struttura sopra.
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </section>
        </div>

        {/* --- SEZIONE KPI --- */}
        <div id="sectionKpi" className={getSectionClass('kpi')}>
          <div className="cards-section-title">KPI Performance</div>
          <div className="cards-section-subtitle">
            Tasso di conversione e analisi esiti appuntamenti.
          </div>

          <section className="cards-grid">
            <div className="card card-highlight">
              <div className="card-header"><div className="card-title">CA personali</div></div>
              <div className="card-value">0</div>
              <div className="card-subvalue">Pos 0 • Neg 0 • Ann 0</div>
              <div className="card-footer">
                <div className="kpi-progress-wrapper">
                  <div className="kpi-progress-bar"><div className="kpi-progress-inner" style={{ width: '0%' }}></div></div>
                  <div className="kpi-progress-label">Conv: 0%</div>
                </div>
              </div>
            </div>

            <div className="card card-secondary">
              <div className="card-header"><div className="card-title">CVA personali</div></div>
              <div className="card-value">0</div>
              <div className="card-subvalue">Pos 0 • Neg 0 • Ann 0</div>
              <div className="card-footer">Vendite energia e gas.</div>
            </div>

            <div className="card card-structure">
              <div className="card-header"><div className="card-title">CA struttura</div></div>
              <div className="card-value">0</div>
              <div className="card-subvalue">Pos 0 • Neg 0 • Ann 0</div>
              <div className="card-footer">
                <div className="kpi-progress-wrapper">
                  <div className="kpi-progress-bar"><div className="kpi-progress-inner" style={{ width: '0%' }}></div></div>
                  <div className="kpi-progress-label">Conv: 0%</div>
                </div>
              </div>
            </div>

            <div className="card card-structure">
              <div className="card-header"><div className="card-title">CVA struttura</div></div>
              <div className="card-value">0</div>
              <div className="card-subvalue">Pos 0 • Neg 0 • Ann 0</div>
              <div className="card-footer">Esiti vendita rete.</div>
            </div>
          </section>
        </div>

        {/* --- SEZIONE STORICO --- */}
        <div id="sectionHistory" className={getSectionClass('history')}>
          <div className="cards-section-title">Storico Mensile</div>
          <div className="cards-section-subtitle">
            Riepilogo attività dei mesi precedenti.
          </div>
          <div id="historyContainer">
            <div style={{ padding: '20px', textAlign: 'center', color: '#94a3b8' }}>
              Caricamento storico...
            </div>
          </div>
        </div>

      </div>

      {/* FAB - Pulsante Nuovo Appuntamento */}
      <button className="btn-add">
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4.5v15m7.5-7.5h-15" />
        </svg>
        <span>Nuovo Appuntamento</span>
      </button>

    </div>
  );
}