"use client";

import { useState, useEffect, useRef } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ChatZone } from "@/components/ChatZone";
import { VisualizationZone } from "@/components/VisualizationZone";
import { AnalyticsZone } from "@/components/AnalyticsZone";
import * as api from "@/lib/api";
import {
  Message,
  PredefinedQuestion,
  SavedReport,
  Conversation,
  SemanticStats,
} from "@/types";

export default function Home() {
  // État
  const [question, setQuestion] = useState("");
  const [loading, setLoading] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [selectedMessage, setSelectedMessage] = useState<Message | null>(null);
  const [predefinedQuestions, setPredefinedQuestions] = useState<PredefinedQuestion[]>([]);
  const [savedReports, setSavedReports] = useState<SavedReport[]>([]);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [currentConversationId, setCurrentConversationId] = useState<number | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [apiKey, setApiKey] = useState("");
  const [apiStatus, setApiStatus] = useState<"ok" | "error" | "unknown">("unknown");
  const [semanticStats, setSemanticStats] = useState<SemanticStats | null>(null);

  // Zones rétractables
  const [zone1Collapsed, setZone1Collapsed] = useState(false);
  const [zone3Collapsed, setZone3Collapsed] = useState(false);
  const [showHistory, setShowHistory] = useState(false);

  // Largeurs des zones (en pourcentage)
  const [zone1Width, setZone1Width] = useState(25);
  const [zone3Width, setZone3Width] = useState(20);
  const [isResizing, setIsResizing] = useState<"zone1" | "zone3" | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

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
  }, []);

  // Gestion du redimensionnement des zones
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isResizing || !containerRef.current) return;

      const containerRect = containerRef.current.getBoundingClientRect();
      const containerWidth = containerRect.width;

      if (isResizing === "zone1") {
        const newWidth = ((e.clientX - containerRect.left) / containerWidth) * 100;
        // Limiter entre 15% et 50%
        setZone1Width(Math.min(50, Math.max(15, newWidth)));
      } else if (isResizing === "zone3") {
        const newWidth = ((containerRect.right - e.clientX) / containerWidth) * 100;
        // Limiter entre 10% et 35%
        setZone3Width(Math.min(35, Math.max(10, newWidth)));
      }
    };

    const handleMouseUp = () => {
      setIsResizing(null);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };

    if (isResizing) {
      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none";
      document.addEventListener("mousemove", handleMouseMove);
      document.addEventListener("mouseup", handleMouseUp);
    }

    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };
  }, [isResizing]);

  // Fonctions de chargement utilisant api.ts
  const loadReports = () => api.fetchSavedReports().then(setSavedReports);
  const loadConversations = () => api.fetchConversations().then(setConversations);

  const createNewConversation = async () => {
    try {
      const res = await fetch("http://localhost:8000/conversations", { method: "POST" });
      const data = await res.json();
      setCurrentConversationId(data.id);
      setMessages([]);
      setSelectedMessage(null);
      loadConversations();
      return data.id;
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
      const res = await fetch(`http://localhost:8000/conversations/${convId}/analyze`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: questionWithFilters }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.detail || "Erreur serveur");
      }

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
      await fetch("http://localhost:8000/reports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          question: userQuestion,
          sql_query: selectedMessage.sql,
          chart_config: JSON.stringify(selectedMessage.chart),
          message_id: selectedMessage.id,
        }),
      });
      loadReports();
    } catch (e) {
      console.error("Erreur sauvegarde:", e);
    }
  };

  const handleDeleteReport = async (id: number) => {
    if (!confirm("Supprimer ce rapport ?")) return;

    try {
      await fetch(`http://localhost:8000/reports/${id}`, { method: "DELETE" });
      loadReports();
    } catch (e) {
      console.error("Erreur suppression:", e);
    }
  };

  const handleReportClick = (report: SavedReport) => {
    setQuestion(report.question);
  };

  const handleSaveApiKey = async () => {
    try {
      await fetch("http://localhost:8000/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ gemini_api_key: apiKey }),
      });
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
      const res = await fetch(`http://localhost:8000/conversations/${conv.id}/messages`);
      const data = await res.json();
      setMessages(data.messages || []);
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
    <div className="h-screen flex flex-col bg-background">
      {/* Header */}
      <header className="border-b border-border/50 px-4 py-3 flex items-center justify-between bg-[hsl(260_10%_10%)]">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-gradient-to-br from-primary to-primary/60 rounded-xl flex items-center justify-center shadow-lg shadow-primary/20">
            <span className="text-primary-foreground font-bold text-lg">G7</span>
          </div>
          <div>
            <h1 className="font-semibold text-foreground">G7 Analytics</h1>
            <p className="text-xs text-muted-foreground">Text-to-SQL Dashboard</p>
          </div>
        </div>

        <div className="flex items-center gap-4">
          {/* Statut API */}
          <div className="flex items-center gap-2 text-sm px-3 py-1.5 rounded-full bg-secondary/50">
            <span
              className={`w-2 h-2 rounded-full ${
                apiStatus === "ok" ? "bg-emerald-500 shadow-sm shadow-emerald-500/50" : apiStatus === "error" ? "bg-red-500 shadow-sm shadow-red-500/50" : "bg-amber-500 shadow-sm shadow-amber-500/50"
              }`}
            />
            <span className="text-muted-foreground text-xs">gemini-2.0-flash</span>
          </div>

          {/* Bouton settings */}
          <Button variant="outline" size="sm" onClick={() => setShowSettings(!showSettings)} className="h-9 w-9 p-0">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
            </svg>
          </Button>
        </div>
      </header>

      {/* Panel Settings */}
      {showSettings && (
        <div className="border-b p-4 bg-secondary/50">
          <div className="max-w-md">
            <h3 className="font-medium mb-2">Configuration API Gemini</h3>
            <div className="flex gap-2">
              <Input
                type="password"
                placeholder="Clé API Gemini"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
              />
              <Button onClick={handleSaveApiKey} disabled={!apiKey}>
                Sauvegarder
              </Button>
            </div>
          </div>
        </div>
      )}

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
    </div>
  );
}
