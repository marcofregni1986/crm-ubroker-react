import React, { useState, useRef, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import { Send, Sparkles, Bot, User, Trash2, Cpu } from 'lucide-react';
import './dashboard.css'; // Re-use dashboard styles for consistent theme

// --- KNOWLEDGE BASE (Il "Cervello" del Bot) ---
const KNOWLEDGE_BASE = [
    // --- INTRODUZIONE ---
    {
        keywords: ['ciao', 'hello', 'start', 'inizio', 'aiuto', 'assistenza'],
        response: "⚡ **Assistente Operativo Rise**\n\nSono qui per fornirti velocemente tutta la **Modulistica Ufficiale** e le procedure operative.\n\nChiedimi quello che ti serve:\n- *\"Modulo Voltura\"*\n- *\"Modulo Reclamo\"*\n- *\"Aumento Potenza\"*\n- *\"Cambio coordinate bancarie\"*\n\nDimmi, cosa devi scaricare?"
    },

    // ============================================================
    // 📂 SEZIONE OPERATIVO & MODULISTICA (Full Catalog 2025)
    // ============================================================

    {
        keywords: ['modulistica', 'moduli', 'form', 'scaricare', 'tutti i moduli'],
        response: "📂 **HUB MODULISTICA UBROKER**\n\nHo indicizzato **53 moduli ufficiali**. Per darti il link esatto, dimmi cosa ti serve:\n\n*   **Amministrativi:** \"Voltura\", \"Subentro\", \"Recesso\", \"Cambio Mail\"\n*   **Tecnici:** \"Aumento Potenza\", \"Spostamento Contatore\", \"Verifica Contatore\"\n*   **Fiscali/Dati:** \"IVA 10%\", \"Catastali\", \"Accise\", \"Esenzione\"\n*   **Reclami:** \"Reclamo\", \"Importi Anomali\", \"Prescrizione\""
    },

    // --- 📝 CONTRATTUALI & AMMINISTRATIVI ---
    {
        keywords: ['contratto', 'fac simile', 'precontrattuali', 'condizioni'],
        response: "📄 **CONTRATTI & CONDIZIONI**\n\n*   **Contratto di Fornitura (Fac-simile):**\n    👉 [Scarica Contratto Unico](https://ubroker.it/contratto/)\n\n*   **Informazioni Precontrattuali:**\n    👉 [Scarica Informativa](https://ubroker.it/wp-content/uploads/contratti/informazioni_precontrattuali_ubroker.pdf)"
    },
    {
        keywords: ['voltura', 'intestatario', 'cambio nome', 'decesso'],
        response: "🔄 **VOLTURA (Cambio Intestatario senza stacco)**\n\n⚡ **[Luce - Modulo Voltura](https://ubroker.it/wp-content/uploads/luce_richiesta_voltura.pdf)**\n🔥 **[Gas - Modulo Voltura](https://ubroker.it/wp-content/uploads/gas_richiesta_voltura.pdf)**\n\n🛑 **Attenzione:** Se il precedente intestatario ha debiti, serve anche l'**Estraneità**.\n👉 **[Luce - Estraneità Debito](https://ubroker.it/wp-content/uploads/luce_estraneita_debito.pdf)**\n👉 **[Gas - Estraneità Debito](https://ubroker.it/wp-content/uploads/gas_estraneita_debito.pdf)**"
    },
    {
        keywords: ['subentro', 'attivazione', 'posa', 'nuovo impianto', 'riattivazione'],
        response: "🔌 **SUBENTRO & NUOVE ATTIVAZIONI**\n\nPer riattivare un contatore chiuso o posarne uno nuovo:\n\n⚡ **[Luce - Subentro/Attivazione](https://ubroker.it/wp-content/uploads/luce_subentro.pdf)**\n🔥 **[Gas - Subentro/Attivazione](https://ubroker.it/wp-content/uploads/gas_subentro.pdf)**"
    },
    {
        keywords: ['recesso', 'disdetta', 'ripensamento', '14 giorni'],
        response: "❌ **RECESSO (Ripensamento 14gg)**\n\nDa usare solo entro 14 giorni dalla firma per annullare tutto.\n\n📄 **[Modulo Recesso Unico](https://ubroker.it/wp-content/uploads/ubroker_modulo_recesso.pdf)**\n\nSe invece vuoi **chiudere definitivamente** il contatore:\n⚡ **[Luce - Disalimentazione](https://ubroker.it/wp-content/uploads/luce_disalimentazione.pdf)**\n🔥 **[Gas - Cessazione Presa](https://ubroker.it/wp-content/uploads/gas_cessazione_punto_prelievo.pdf)**"
    },
    {
        keywords: ['variazione', 'anagrafica', 'email', 'indirizzo', 'residenza'],
        response: "📝 **VARIAZIONI DATI**\n\n*   **Dati Anagrafici (Nome, Indirizzo):**\n    ⚡ [Luce](https://ubroker.it/wp-content/uploads/luce_variazione_anagrafica.pdf) | 🔥 [Gas](https://ubroker.it/wp-content/uploads/gas_variazione_anagrafica.pdf)\n\n*   **Cambio Email Fatturazione:**\n    ⚡ [Luce](https://ubroker.it/wp-content/uploads/luce_modifica_e-mail.pdf) | 🔥 [Gas](https://ubroker.it/wp-content/uploads/gas_modifica_e-mail.pdf)\n\n*   **Destinazione d'Uso (Domestico/Altri usi):**\n    ⚡ [Luce](https://ubroker.it/wp-content/uploads/luce_variazione_destinazione_uso.pdf) | 🔥 [Gas](https://ubroker.it/wp-content/uploads/gas_variazione_destinazione_uso.pdf)"
    },
    {
        keywords: ['sepa', 'iban', 'banca', 'addebito'],
        response: "💳 **ADDEBITO DIRETTO (SEPA)**\n\n👉 **[Luce - Modulo SEPA](https://ubroker.it/wp-content/uploads/luce_sepa.pdf)**\n👉 **[Gas - Modulo SEPA](https://ubroker.it/wp-content/uploads/gas_sepa.pdf)**"
    },

    // --- 🛠️ TECNICI & CONTATORI ---
    {
        keywords: ['potenza', 'aumento', 'kw', 'riduzione'],
        response: "⚡ **GESTIONE POTENZA (Solo Luce)**\n\n👉 **[Richiesta AUMENTO Potenza](https://ubroker.it/wp-content/uploads/luce_aumento_potenza.pdf)**\n👉 **[Richiesta RIDUZIONE Potenza](https://ubroker.it/wp-content/uploads/luce_rinuncia_potenza.pdf)**"
    },
    {
        keywords: ['spostamento', 'spostare', 'contatore', 'verifica', 'guasto'],
        response: "🛠️ **LAVORI SUL CONTATORE**\n\n*   **Spostamento Contatore:**\n    ⚡ [Luce](https://ubroker.it/wp-content/uploads/luce_spostamento_punto_presa.pdf) | 🔥 [Gas](https://ubroker.it/wp-content/uploads/gas_spostamento_punto_presa.pdf)\n\n*   **Verifica (se pensi misuri male):**\n    ⚡ [Luce](https://ubroker.it/wp-content/uploads/luce_gruppo_misura.pdf) | 🔥 [Gas](https://ubroker.it/wp-content/uploads/gas_gruppo_misura.pdf)\n\n*   **Disalimentabili (Life Support):**\n    ⚡ [Luce - Richiesta POD non disalimentabile](https://ubroker.it/wp-content/uploads/luce_nondisalimentabile.pdf)"
    },

    // --- 💰 FISCALI & AGEVOLAZIONI ---
    {
        keywords: ['iva', 'agevolazione', '10%', 'legge 104', 'esenzione'],
        response: "📉 **IVA & AGEVOLAZIONI**\n\n*   **IVA Ridotta (10%):**\n    ⚡ [Luce](https://ubroker.it/wp-content/uploads/luce_dichiarazione_sost_fiscale.pdf) | 🔥 [Gas](https://ubroker.it/wp-content/uploads/gas_istanza_iva_ridotta.pdf)\n\n*   **Esenzione IVA (Diplomatici/Export):**\n    ⚡ [Luce](https://ubroker.it/wp-content/uploads/luce_esenzione_iva_diplomatici.pdf) | 🔥 [Gas](https://ubroker.it/wp-content/uploads/gas_esenzione_iva.pdf)\n\n*   **Agevolazione Condomini:**\n    ⚡ [Luce](https://ubroker.it/wp-content/uploads/luce_agevolazione_iva_condomini.pdf)"
    },
    {
        keywords: ['accise', 'industriale', 'forze armate'],
        response: "🏭 **ACCISE INDUSTRIALI & SPECIALI**\n\n*   **Usi Industriali (Dichiarazione):**\n    ⚡ [Luce](https://ubroker.it/wp-content/uploads/ubroker_accise_agevolazioni_esenzioni.pdf) | 🔥 [Gas](https://ubroker.it/wp-content/uploads/gas_dichiarazione_usi_industriali.pdf)\n\n*   **Forze Armate:**\n    🔥 [Gas - Istanza Forze Armate](https://ubroker.it/wp-content/uploads/gas_istanza_accise_ridotte_forze_armate.pdf)\n\n*   **Dichiarazione Atto Notorietà:**\n    ⚡ [Luce](https://ubroker.it/wp-content/uploads/luce_dichiarazione_sost_atto_notorieta_applicazione_accise.pdf) | 🔥 [Gas](https://ubroker.it/wp-content/uploads/gas_dichiarazione_sostitutiva_atto_notorieta.pdf)"
    },
    {
        keywords: ['catastal', 'catasto', 'dati immobile'],
        response: "🏠 **DATI CATASTALI**\n\n👉 **[Luce - Dati Catastali](https://ubroker.it/wp-content/uploads/luce_dati_catastali.pdf)**\n👉 **[Gas - Dati Catastali](https://ubroker.it/wp-content/uploads/gas_dati_catastali_immobile.pdf)**"
    },

    // --- ⚖️ RECLAMI & LEGALI ---
    {
        keywords: ['reclamo', 'contestazione', 'lamentela'],
        response: "⚖️ **RECLAMI**\n\n*   **Reclamo Generico:**\n    ⚡ [Luce](https://ubroker.it/wp-content/uploads/luce_reclamo_energia.pdf) | 🔥 [Gas](https://ubroker.it/wp-content/uploads/gas_reclamo_energia.pdf)\n\n*   **Reclamo Importi Anomali:**\n    ⚡ [Luce](https://ubroker.it/wp-content/uploads/luce_reclamo_importi_anomali.pdf) | 🔥 [Gas](https://ubroker.it/wp-content/uploads/gas_reclamo_importi_anomali.pdf)\n\n*   **Prescrizione (Importi > 2 anni):**\n    ⚡ [Luce](https://ubroker.it/wp-content/uploads/luce_prescrizione_importi.pdf) | 🔥 [Gas](https://ubroker.it/wp-content/uploads/gas_prescrizione_importi.pdf)"
    },
    {
        keywords: ['placet', 'tutela', 'prezzo libero'],
        response: "📜 **OFFERTE PLACET**\n\nCondizioni equiparate di tutela:\n👉 **[Vai alla sezione PLACET](https://ubroker.it/clienti/modulistica/placet/)**"
    },
    {
        keywords: ['sisma', 'terremoto'],
        response: "🏚️ **AGEVOLAZIONI SISMA**\n\nPer immobili in zone colpite (2016/2017):\n⚡ **[Luce - Modulo Sisma](https://ubroker.it/wp-content/uploads/luce_agevolazione_sisma.pdf)**\n🔥 **[Gas - Modulo Sisma](https://ubroker.it/wp-content/uploads/gas_agevolazione_sisma.pdf)**"
    },
    {
        keywords: ['delega', 'delegare'],
        response: "🤝 **DELEGA**\n\nPer far gestire la pratica a terzi:\n⚡ **[Luce - Delega](https://ubroker.it/wp-content/uploads/luce_delega.pdf)**\n🔥 **[Gas - Delega](https://ubroker.it/wp-content/uploads/gas_delega.pdf)**"
    },
    {
        keywords: ['autolettura', 'lettura', 'comunicare'],
        response: "🔢 **AUTOLETTURA**\n\nFondamentale per evitare bollette stimate!\n\n👉 **[GUIDA AUTOLETTURA](https://ubroker.it/assistenza/gestione-utenza-ubroker/come-fare-lautolettura/)**\n\n**Periodo Migliore:**\nFalla comunicare sempre negli ultimi 3 giorni del mese. I clienti possono inviarla tramite App uBroker o Area Riservata."
    }
];

const DEFAULT_RESPONSE = "Non ho capito bene la richiesta. 🤷‍♂️\n\nSono specializzato nella **Modulistica**. Provami chiedendo:\n\n- \"Modulo Voltura\"\n- \"Aumento Potenza\"\n- \"Reclamo Luce\"\n- \"Dichiarazione Catastale\"";

export default function RiseAiPage() {
    const [messages, setMessages] = useState([
        { id: 1, text: KNOWLEDGE_BASE[0].response, sender: 'bot', time: new Date() }
    ]);
    const [inputText, setInputText] = useState("");
    const [isTyping, setIsTyping] = useState(false);
    const messagesEndRef = useRef(null);

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    };

    useEffect(() => {
        scrollToBottom();
    }, [messages]);

    const handleSend = () => {
        if (!inputText.trim()) return;

        // 1. User Message
        const userMsg = { id: Date.now(), text: inputText, sender: 'user', time: new Date() };
        setMessages(prev => [...prev, userMsg]);
        setInputText("");
        setIsTyping(true);

        // 2. Bot Logic (Simulated Delay)
        setTimeout(() => {
            const lowerInput = userMsg.text.toLowerCase();
            let botText = DEFAULT_RESPONSE;

            // Find matching intent
            const found = KNOWLEDGE_BASE.find(item =>
                item.keywords.some(k => lowerInput.includes(k))
            );

            if (found) botText = found.response;

            const botMsg = { id: Date.now() + 1, text: botText, sender: 'bot', time: new Date() };
            setMessages(prev => [...prev, botMsg]);
            setIsTyping(false);
        }, 1200); // 1.2s thinking time
    };

    const handleKeyDown = (e) => {
        if (e.key === 'Enter') handleSend();
    };

    const formatTime = (date) => {
        return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    };

    return (
        <div className="main dashboard-page rise-ai-page">
            {/* Header Styled like Dashboard */}
            <h1 className="page-title">
                <Sparkles className="icon-gold" size={28} style={{ marginRight: 10 }} />
                Rise Assistant
            </h1>
            <p className="page-subtitle">Il tuo hub rapido per tutta la modulistica ufficiale Ubroker.</p>

            {/* CHAT CONTAINER */}
            <div className="chat-interface-wrapper">

                {/* Chat Body */}
                <div className={`chat-body ${messages.length <= 1 ? 'welcome-mode' : ''}`}>
                    {messages.map(msg => (
                        <div key={msg.id} style={{
                            display: 'flex',
                            justifyContent: msg.sender === 'user' ? 'flex-end' : 'flex-start',
                            marginBottom: '15px'
                        }}>
                            {/* Bot Icon */}
                            {msg.sender === 'bot' && (
                                <div className="bot-icon-container">
                                    <Bot size={20} color="#000" />
                                </div>
                            )}

                            {/* Bubble */}
                            <div className={`message-bubble ${msg.sender === 'user' ? 'user' : 'bot'} ${msg.sender === 'bot' ? 'bot-content' : ''}`}>
                                <ReactMarkdown
                                    components={{
                                        a: ({ node, ...props }) => (
                                            <a {...props} target="_blank" rel="noopener noreferrer" />
                                        ),
                                        p: ({ node, ...props }) => <p {...props} style={{ margin: '0 0 10px 0' }} />,
                                    }}
                                >
                                    {msg.text}
                                </ReactMarkdown>
                                <div style={{ fontSize: '0.7rem', opacity: 0.6, marginTop: 4, textAlign: 'right' }}>
                                    {formatTime(msg.time)}
                                </div>
                            </div>

                            {/* User Icon */}
                            {msg.sender === 'user' && (
                                <div className="user-icon-container">
                                    <User size={20} color="#aaa" />
                                </div>
                            )}
                        </div>
                    ))}

                    {/* Typing Indicator */}
                    {isTyping && (
                        <div className="typing-indicator">
                            <div className="typing-dot"></div>
                            <div className="typing-dot"></div>
                            <div className="typing-dot"></div>
                        </div>
                    )}
                    <div ref={messagesEndRef} />
                </div>

                {/* Suggestion Chips (Buttons) */}
                <div className="chips-scroll">
                    {[
                        { label: '📂 Modulistica', text: 'Dammi tutti i moduli' },
                        { label: '🔄 Voltura', text: 'Come fare la voltura?' },
                        { label: '⚡ Potenza', text: 'Aumento potenza contatore' },
                        { label: '⚖️ Reclamo', text: 'Modulo Reclamo' },
                        { label: '💳 IBAN/SEPA', text: 'Modulo SEPA' },
                        { label: '📝 Dati Catastali', text: 'Dichiarazione Dati Catastali' },
                        { label: '❌ Recesso', text: 'Modulo Recesso 14gg' },
                        { label: '📉 IVA 10%', text: 'Richiesta IVA Agevolata' },
                        { label: '🔢 Autolettura', text: 'Come fare autolettura?' },
                    ].map((chip, idx) => (
                        <button
                            key={idx}
                            className="suggestion-chip"
                            onClick={() => {
                                // Simulate sending this text
                                const userMsg = { id: Date.now(), text: chip.text, sender: 'user', time: new Date() };
                                setMessages(prev => [...prev, userMsg]);
                                setIsTyping(true);

                                setTimeout(() => {
                                    // Logic duplicated from handleSend
                                    const lowerInput = chip.text.toLowerCase();
                                    let botText = DEFAULT_RESPONSE;
                                    const found = KNOWLEDGE_BASE.find(item => item.keywords.some(k => lowerInput.includes(k)));
                                    if (found) botText = found.response;

                                    setMessages(prev => [...prev, { id: Date.now() + 1, text: botText, sender: 'bot', time: new Date() }]);
                                    setIsTyping(false);
                                }, 800);
                            }}
                        >
                            {chip.label}
                        </button>
                    ))}
                </div>

                {/* Input Area */}
                <div className="chat-input-area">
                    <input
                        type="text"
                        className="rise-input"
                        placeholder="Chiedi qualcosa a Rise AI..."
                        value={inputText}
                        onChange={(e) => setInputText(e.target.value)}
                        onKeyDown={handleKeyDown}
                    />
                    <button
                        onClick={handleSend}
                        className="btn-send"
                    >
                        <Send size={20} />
                    </button>
                </div>
            </div>
        </div>
    );
}
