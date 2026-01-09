"use client";

import { useState, useEffect } from "react";
import { Header } from "@/components/Header";
import { ChatZone } from "@/components/ChatZone";
import { VisualizationZone } from "@/components/VisualizationZone";
import { AnalyticsZone } from "@/components/AnalyticsZone";
import * as api from "@/lib/api";
import { useLayout } from "@/hooks/useLayout";
import {
  Message,
  PredefinedQuestion,
  SavedReport,
  Conversation,
  SemanticStats,
  GlobalStats,
} from "@/types";

export default function Home() {
  // Layout (zones rétractables, redimensionnement)
  const {
    zone1Collapsed,
    zone3Collapsed,
    zone1Width,
    zone3Width,
    isResizing,
    containerRef,
    setZone1Collapsed,
    setZone3Collapsed,
    setIsResizing,
  } = useLayout();

  // État conversation
  const [question, setQuestion] = useState("");
  const [loading, setLoading] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [selectedMessage, setSelectedMessage] = useState<Message | null>(null);
  const [predefinedQuestions, setPredefinedQuestions] = useState<PredefinedQuestion[]>([]);
  const [savedReports, setSavedReports] = useState<SavedReport[]>([]);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [currentConversationId, setCurrentConversationId] = useState<number | null>(null);
  const [showHistory, setShowHistory] = useState(false);

  // UI
  const [showSettings, setShowSettings] = useState(false);
  const [apiKey, setApiKey] = useState("");
  const [apiStatus, setApiStatus] = useState<"ok" | "error" | "unknown">("unknown");
  const [semanticStats, setSemanticStats] = useState<SemanticStats | null>(null);
  const [globalStats, setGlobalStats] = useState<GlobalStats | null>(null);

  // Filtres (objet pour VisualizationZone)
  const [filters, setFilters] = useState({
    dateStart: "",
    dateEnd: "",
    noteMin: "",
    noteMax: "",
  });

  // Charger les données au démarrage
  useEffect(() => {
    api.fetchPredefinedQuestions().then(setPredefinedQuestions);
    loadReports();
    loadConversations();
    api.checkApiStatus().then(setApiStatus);
    api.fetchSemanticStats().then(setSemanticStats);
    api.fetchGlobalStats().then(setGlobalStats);
  }, []);

  // Fonctions de chargement utilisant api.ts
  const loadReports = () => api.fetchSavedReports().then(setSavedReports);
  const loadConversations = () => api.fetchConversations().then(setConversations);

  const createNewConversation = async () => {
    try {
      const id = await api.createConversation();
      if (id) {
        setCurrentConversationId(id);
        setMessages([]);
        setSelectedMessage(null);
        loadConversations();
      }
      return id;
    } catch (e) {
      console.error("Erreur création conversation:", e);
      return null;
    }
  };

  // Construire le contexte de filtres pour la question
  const buildFilterContext = () => {
    const parts: string[] = [];
    if (filters.dateStart) parts.push(`à partir du ${filters.dateStart}`);
    if (filters.dateEnd) parts.push(`jusqu'au ${filters.dateEnd}`);
    if (filters.noteMin) parts.push(`note minimum ${filters.noteMin}`);
    if (filters.noteMax) parts.push(`note maximum ${filters.noteMax}`);
    return parts.length > 0 ? ` (Filtres: ${parts.join(", ")})` : "";
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!question.trim() || loading) return;

    setLoading(true);

    // Créer une conversation si nécessaire
    let convId = currentConversationId;
    if (!convId) {
      convId = await createNewConversation();
      if (!convId) {
        setLoading(false);
        return;
      }
    }

    // Ajouter le contexte des filtres à la question
    const questionWithFilters = question + buildFilterContext();

    // Ajouter le message user localement (sans les filtres pour l'affichage)
    const userMessage: Message = {
      id: Date.now(),
      role: "user",
      content: question,
    };
    setMessages((prev) => [...prev, userMessage]);
    setQuestion("");

    try {
      const data = await api.analyzeInConversation(convId, questionWithFilters);

      const assistantMessage: Message = {
        id: data.message_id,
        role: "assistant",
        content: data.message,
        sql: data.sql,
        chart: data.chart,
        data: data.data,
        model_name: data.model_name,
        tokens_input: data.tokens_input,
        tokens_output: data.tokens_output,
        response_time_ms: data.response_time_ms,
      };

      setMessages((prev) => [...prev, assistantMessage]);
      setSelectedMessage(assistantMessage);
      loadConversations();
    } catch (e) {
      const errorMessage: Message = {
        id: Date.now(),
        role: "assistant",
        content: `Erreur: ${e instanceof Error ? e.message : "Erreur inconnue"}`,
      };
      setMessages((prev) => [...prev, errorMessage]);
    } finally {
      setLoading(false);
    }
  };

  const handleQuestionClick = (q: string) => {
    setQuestion(q);
  };

  const handleReplayMessage = async (msg: Message) => {
    if (msg.role === "user") {
      setQuestion(msg.content);
    }
  };

  const handleSaveReport = async () => {
    if (!selectedMessage || !selectedMessage.sql) return;

    const title = prompt("Nom du rapport:", selectedMessage.content.slice(0, 50));
    if (!title) return;

    // Trouver la question user associée (le message user juste avant le message assistant sélectionné)
    const selectedIndex = messages.findIndex((m) => m.id === selectedMessage.id);
    let userQuestion = "";
    if (selectedIndex > 0) {
      // Chercher le dernier message user avant ce message assistant
      for (let i = selectedIndex - 1; i >= 0; i--) {
        if (messages[i].role === "user") {
          userQuestion = messages[i].content;
          break;
        }
      }
    }

    try {
      await api.saveReport(
        title,
        userQuestion,
        selectedMessage.sql,
        JSON.stringify(selectedMessage.chart),
        selectedMessage.id
      );
      loadReports();
    } catch (e) {
      console.error("Erreur sauvegarde:", e);
    }
  };

  const handleDeleteReport = async (id: number) => {
    if (!confirm("Supprimer ce rapport ?")) return;

    try {
      await api.deleteReport(id);
      loadReports();
    } catch (e) {
      console.error("Erreur suppression:", e);
    }
  };

  const handleReportClick = async (report: SavedReport) => {
    setLoading(true);
    try {
      const result = await api.executeReport(report.id);

      // Créer un message "virtuel" pour afficher le résultat
      const reportMessage: Message = {
        id: Date.now(),
        role: "assistant",
        content: `📊 Rapport: ${result.title}`,
        sql: result.sql,
        chart: result.chart,
        data: result.data,
      };

      setSelectedMessage(reportMessage);
    } catch (e) {
      console.error("Erreur exécution rapport:", e);
      alert(`Erreur: ${e instanceof Error ? e.message : "Erreur inconnue"}`);
    } finally {
      setLoading(false);
    }
  };

  const handleSaveApiKey = async () => {
    try {
      await api.saveApiKey(apiKey);
      setApiKey("");
      setShowSettings(false);
      api.checkApiStatus().then(setApiStatus);
    } catch (e) {
      console.error("Erreur sauvegarde clé:", e);
    }
  };

  // Handlers pour ChatZone
  const handleLoadConversation = async (conv: Conversation) => {
    setCurrentConversationId(conv.id);
    try {
      const msgs = await api.fetchConversationMessages(conv.id);
      setMessages(msgs);
      setSelectedMessage(null);
      setShowHistory(false);
    } catch (e) {
      console.error("Erreur chargement messages:", e);
    }
  };

  const handleNewConversation = () => {
    setCurrentConversationId(null);
    setMessages([]);
    setSelectedMessage(null);
  };

  return (
    <>
      {/* Header */}
      <Header
        apiStatus={apiStatus}
        showSettings={showSettings}
        onShowSettingsChange={setShowSettings}
        apiKey={apiKey}
        onApiKeyChange={setApiKey}
        onSaveApiKey={handleSaveApiKey}
      />

      {/* Main Content - 3 Panneaux */}
      <div ref={containerRef} className="flex-1 flex overflow-hidden relative">
        {/* Zone 1: Chat */}
        <ChatZone
          collapsed={zone1Collapsed}
          onCollapse={setZone1Collapsed}
          width={zone1Width}
          isResizing={isResizing !== null}
          messages={messages}
          loading={loading}
          question={question}
          onQuestionChange={setQuestion}
          onSubmit={handleSubmit}
          selectedMessage={selectedMessage}
          onSelectMessage={setSelectedMessage}
          conversations={conversations}
          currentConversationId={currentConversationId}
          showHistory={showHistory}
          onShowHistoryChange={setShowHistory}
          onLoadConversation={handleLoadConversation}
          onNewConversation={handleNewConversation}
          predefinedQuestions={predefinedQuestions}
          onQuestionClick={handleQuestionClick}
          onReplayMessage={handleReplayMessage}
        />

        {/* Resize Handle Zone 1 */}
        {!zone1Collapsed && (
          <div
            className="w-1 hover:w-1.5 bg-primary/20 hover:bg-primary/50 cursor-col-resize transition-all flex-shrink-0 group"
            onMouseDown={() => setIsResizing("zone1")}
          >
            <div className="h-full w-full flex items-center justify-center">
              <div className="w-0.5 h-8 bg-primary/30 group-hover:bg-primary/60 rounded-full" />
            </div>
          </div>
        )}

        {/* Zone 2: Visualisation */}
        <VisualizationZone
          selectedMessage={selectedMessage}
          onSaveReport={handleSaveReport}
          filters={filters}
          onFiltersChange={setFilters}
          globalStats={globalStats}
        />

        {/* Resize Handle Zone 3 */}
        {!zone3Collapsed && (
          <div
            className="w-1 hover:w-1.5 bg-amber-500/20 hover:bg-amber-500/50 cursor-col-resize transition-all flex-shrink-0 group"
            onMouseDown={() => setIsResizing("zone3")}
          >
            <div className="h-full w-full flex items-center justify-center">
              <div className="w-0.5 h-8 bg-amber-500/30 group-hover:bg-amber-500/60 rounded-full" />
            </div>
          </div>
        )}

        {/* Zone 3: Analytics */}
        <AnalyticsZone
          collapsed={zone3Collapsed}
          onCollapse={setZone3Collapsed}
          width={zone3Width}
          isResizing={isResizing !== null}
          semanticStats={semanticStats}
          savedReports={savedReports}
          onReportClick={handleReportClick}
          onReportDelete={handleDeleteReport}
        />
      </div>
    </>
  );
}
