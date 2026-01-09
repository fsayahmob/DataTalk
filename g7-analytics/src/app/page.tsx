"use client";

import { useState, useEffect, useRef } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Chart } from "@/components/Chart";
import { DataTable } from "@/components/DataTable";
import { ChartConfig } from "@/lib/schema";

// Types
interface Message {
  id: number;
  role: "user" | "assistant";
  content: string;
  sql?: string;
  chart?: ChartConfig;
  data?: Record<string, unknown>[];
  model_name?: string;
  tokens_input?: number;
  tokens_output?: number;
  response_time_ms?: number;
  created_at?: string;
}

interface PredefinedQuestion {
  id: number;
  question: string;
  category: string;
  icon: string;
}

interface SavedReport {
  id: number;
  title: string;
  question: string;
  sql_query: string;
  is_pinned: boolean;
  created_at: string;
}

interface Conversation {
  id: number;
  title: string;
  message_count: number;
  created_at: string;
}

// Animation 3 points
function LoadingDots() {
  return (
    <span className="inline-flex items-center gap-1">
      <span className="w-2 h-2 bg-current rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
      <span className="w-2 h-2 bg-current rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
      <span className="w-2 h-2 bg-current rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
    </span>
  );
}

// Icônes par catégorie
function CategoryIcon({ icon }: { icon: string }) {
  const icons: Record<string, string> = {
    star: "★",
    trophy: "🏆",
    "trending-up": "📈",
    search: "🔍",
  };
  return <span className="mr-2">{icons[icon] || "•"}</span>;
}

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

  // Zones rétractables
  const [zone1Collapsed, setZone1Collapsed] = useState(false);
  const [zone3Collapsed, setZone3Collapsed] = useState(false);

  // Largeurs des zones (en pourcentage)
  const [zone1Width, setZone1Width] = useState(25);
  const [zone3Width, setZone3Width] = useState(15);
  const [isResizing, setIsResizing] = useState<"zone1" | "zone3" | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Filtres
  const [showFilters, setShowFilters] = useState(false);
  const [filterDateStart, setFilterDateStart] = useState("");
  const [filterDateEnd, setFilterDateEnd] = useState("");
  const [filterNoteMin, setFilterNoteMin] = useState("");
  const [filterNoteMax, setFilterNoteMax] = useState("");

  const chatEndRef = useRef<HTMLDivElement>(null);

  // Charger les données au démarrage
  useEffect(() => {
    fetchPredefinedQuestions();
    fetchSavedReports();
    fetchConversations();
    checkApiStatus();
  }, []);

  // Scroll vers le bas quand les messages changent
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

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

  const checkApiStatus = async () => {
    try {
      const res = await fetch("http://localhost:8000/health");
      const data = await res.json();
      setApiStatus(data.gemini === "configured" ? "ok" : "error");
    } catch {
      setApiStatus("error");
    }
  };

  const fetchPredefinedQuestions = async () => {
    try {
      const res = await fetch("http://localhost:8000/questions/predefined");
      const data = await res.json();
      setPredefinedQuestions(data.questions || []);
    } catch (e) {
      console.error("Erreur chargement questions:", e);
    }
  };

  const fetchSavedReports = async () => {
    try {
      const res = await fetch("http://localhost:8000/reports");
      const data = await res.json();
      setSavedReports(data.reports || []);
    } catch (e) {
      console.error("Erreur chargement rapports:", e);
    }
  };

  const fetchConversations = async () => {
    try {
      const res = await fetch("http://localhost:8000/conversations");
      const data = await res.json();
      setConversations(data.conversations || []);
    } catch (e) {
      console.error("Erreur chargement conversations:", e);
    }
  };

  const createNewConversation = async () => {
    try {
      const res = await fetch("http://localhost:8000/conversations", { method: "POST" });
      const data = await res.json();
      setCurrentConversationId(data.id);
      setMessages([]);
      setSelectedMessage(null);
      fetchConversations();
      return data.id;
    } catch (e) {
      console.error("Erreur création conversation:", e);
      return null;
    }
  };

  // Construire le contexte de filtres pour la question
  const buildFilterContext = () => {
    const filters: string[] = [];
    if (filterDateStart) filters.push(`à partir du ${filterDateStart}`);
    if (filterDateEnd) filters.push(`jusqu'au ${filterDateEnd}`);
    if (filterNoteMin) filters.push(`note minimum ${filterNoteMin}`);
    if (filterNoteMax) filters.push(`note maximum ${filterNoteMax}`);
    return filters.length > 0 ? ` (Filtres: ${filters.join(", ")})` : "";
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
      fetchConversations();
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
      fetchSavedReports();
    } catch (e) {
      console.error("Erreur sauvegarde:", e);
    }
  };

  const handleDeleteReport = async (id: number) => {
    if (!confirm("Supprimer ce rapport ?")) return;

    try {
      await fetch(`http://localhost:8000/reports/${id}`, { method: "DELETE" });
      fetchSavedReports();
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
      checkApiStatus();
    } catch (e) {
      console.error("Erreur sauvegarde clé:", e);
    }
  };

  // Grouper les questions par catégorie
  const questionsByCategory = predefinedQuestions.reduce(
    (acc, q) => {
      if (!acc[q.category]) acc[q.category] = [];
      acc[q.category].push(q);
      return acc;
    },
    {} as Record<string, PredefinedQuestion[]>
  );

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
        {/* Zone 1: Chat - Fond plus sombre */}
        <div
          className={`flex flex-col bg-[hsl(260_10%_10%)] ${zone1Collapsed ? "w-14" : ""} ${isResizing ? "" : "transition-all duration-300 ease-in-out"}`}
          style={zone1Collapsed ? undefined : { width: `${zone1Width}%` }}
        >
          {zone1Collapsed ? (
            <div className="flex-1 flex flex-col items-center pt-3 gap-2">
              <button
                onClick={() => setZone1Collapsed(false)}
                className="w-10 h-10 bg-gradient-to-br from-primary to-primary/60 rounded-lg flex items-center justify-center hover:shadow-lg hover:shadow-primary/25 transition-all"
                title="Ouvrir le chat"
              >
                <span className="text-primary-foreground font-bold text-xs">G7</span>
              </button>
              <button
                onClick={() => {
                  setZone1Collapsed(false);
                  setCurrentConversationId(null);
                  setMessages([]);
                  setSelectedMessage(null);
                }}
                className="w-10 h-10 bg-secondary hover:bg-accent rounded-lg flex items-center justify-center transition-colors"
                title="Nouvelle conversation"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M12 5v14M5 12h14" />
                </svg>
              </button>
              <button
                onClick={() => setZone1Collapsed(false)}
                className="w-10 h-10 bg-secondary hover:bg-accent rounded-lg flex items-center justify-center transition-colors"
                title="Messages"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                </svg>
              </button>
            </div>
          ) : (
            <>
              {/* Header Zone 1 */}
              <div className="h-12 px-3 border-b border-primary/20 bg-gradient-to-r from-primary/10 to-transparent flex items-center justify-between">
                <h3 className="text-xs font-semibold text-primary uppercase tracking-wider flex items-center gap-2">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                  </svg>
                  Chat
                </h3>
                <div className="flex items-center gap-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 w-7 p-0 hover:bg-primary/20"
                    onClick={() => {
                      setCurrentConversationId(null);
                      setMessages([]);
                      setSelectedMessage(null);
                    }}
                    title="Nouvelle conversation"
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M12 5v14M5 12h14" />
                    </svg>
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 w-7 p-0 hover:bg-primary/20"
                    onClick={() => setZone1Collapsed(true)}
                    title="Réduire le panneau"
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M11 19l-7-7 7-7M18 19l-7-7 7-7" />
                    </svg>
                  </Button>
                </div>
              </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-3 space-y-3">
            {messages.length === 0 && (
              <div className="space-y-4">
                <div className="text-center py-6">
                  <div className="w-12 h-12 mx-auto mb-3 bg-gradient-to-br from-primary/20 to-primary/5 rounded-xl flex items-center justify-center">
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-primary">
                      <circle cx="11" cy="11" r="8" />
                      <path d="m21 21-4.35-4.35" />
                    </svg>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    Posez une question en langage naturel
                  </p>
                  <p className="text-xs text-muted-foreground/70 mt-1">
                    ou sélectionnez une suggestion ci-dessous
                  </p>
                </div>

                {/* Questions prédéfinies */}
                {Object.entries(questionsByCategory).map(([category, questions]) => (
                  <div key={category}>
                    <h4 className="text-xs font-medium text-primary/80 mb-2 flex items-center gap-2">
                      <span className="w-1 h-1 rounded-full bg-primary" />
                      {category}
                    </h4>
                    <div className="space-y-1">
                      {questions.map((q) => (
                        <button
                          key={q.id}
                          onClick={() => handleQuestionClick(q.question)}
                          className="w-full text-left text-sm p-2.5 rounded-lg hover:bg-secondary/50 hover:border-primary/20 border border-transparent transition-all group"
                        >
                          <span className="opacity-70 group-hover:opacity-100 transition-opacity">
                            <CategoryIcon icon={q.icon} />
                          </span>
                          <span className="text-foreground/80 group-hover:text-foreground transition-colors">
                            {q.question}
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {messages.map((msg) => (
              <div
                key={msg.id}
                className={`p-3 rounded-xl cursor-pointer transition-all ${
                  msg.role === "user"
                    ? "bg-primary/20 border border-primary/30 text-foreground ml-6"
                    : "bg-secondary/30 border border-border/30 mr-4 hover:bg-secondary/50"
                } ${selectedMessage?.id === msg.id ? "ring-1 ring-primary/50" : ""}`}
                onClick={() => msg.role === "assistant" && setSelectedMessage(msg)}
              >
                <p className="text-sm leading-relaxed">{msg.content}</p>

                {msg.role === "assistant" && msg.response_time_ms && (
                  <div className="mt-2 flex items-center gap-3 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <circle cx="12" cy="12" r="10" />
                        <polyline points="12 6 12 12 16 14" />
                      </svg>
                      {(msg.response_time_ms / 1000).toFixed(1)}s
                    </span>
                    {msg.tokens_input && msg.tokens_output && (
                      <span className="flex items-center gap-1">
                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M12 2L2 7l10 5 10-5-10-5z" />
                          <path d="M2 17l10 5 10-5" />
                          <path d="M2 12l10 5 10-5" />
                        </svg>
                        {msg.tokens_input + msg.tokens_output}
                      </span>
                    )}
                  </div>
                )}

                {msg.role === "user" && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleReplayMessage(msg);
                    }}
                    className="mt-2 text-xs opacity-70 hover:opacity-100 flex items-center gap-1"
                  >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M1 4v6h6" />
                      <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10" />
                    </svg>
                    Relancer
                  </button>
                )}
              </div>
            ))}

            {loading && (
              <div className="bg-secondary/50 border border-border/50 p-3 rounded-xl mr-4 flex items-center gap-2">
                <div className="w-6 h-6 bg-primary/20 rounded-full flex items-center justify-center">
                  <div className="w-3 h-3 bg-primary rounded-full animate-pulse" />
                </div>
                <span className="text-sm text-muted-foreground">Analyse en cours</span>
                <LoadingDots />
              </div>
            )}

            <div ref={chatEndRef} />
          </div>

          {/* Input - Style ChatGPT */}
          <div className="p-4 border-t border-border/50 bg-card/30">
            <form onSubmit={handleSubmit} className="relative">
              <textarea
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    if (question.trim() && !loading) {
                      handleSubmit(e);
                    }
                  }
                }}
                placeholder="Posez votre question..."
                disabled={loading}
                rows={3}
                className="w-full resize-none rounded-xl border border-border/50 bg-secondary/30 pl-4 pr-12 py-3 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 disabled:cursor-not-allowed disabled:opacity-50"
              />
              <button
                type="submit"
                disabled={loading || !question.trim()}
                className={`absolute right-3 bottom-3 w-8 h-8 rounded-lg flex items-center justify-center transition-all ${
                  loading
                    ? "bg-destructive text-destructive-foreground"
                    : question.trim()
                      ? "bg-primary text-primary-foreground hover:bg-primary/90 shadow-lg shadow-primary/25"
                      : "bg-muted text-muted-foreground cursor-not-allowed"
                }`}
              >
                {loading ? (
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                    <rect x="4" y="4" width="16" height="16" rx="2" />
                  </svg>
                ) : (
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12 19V5M5 12l7-7 7 7" />
                  </svg>
                )}
              </button>
            </form>
            <p className="text-xs text-muted-foreground mt-2 text-center">
              Entrée pour envoyer, Shift+Entrée pour nouvelle ligne
            </p>
          </div>
            </>
          )}
        </div>

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

        {/* Zone 2: Visualisation - Même fond que zones 1 et 3 */}
        <div className="flex-1 flex flex-col overflow-hidden bg-[hsl(260_10%_10%)]">
          {/* Zone 2.1: Header + KPIs (fixe) */}
          <div className="border-b-2 border-red-500/30">
            {/* Header Zone 2 - Rouge G7 */}
            <div className="h-12 px-3 flex items-center justify-between bg-gradient-to-r from-red-500/10 to-transparent border-b border-red-500/20">
              <h3 className="text-xs font-semibold text-red-400 uppercase tracking-wider flex items-center gap-2">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M3 3v18h18" />
                  <path d="M18 9l-5 5-4-4-3 3" />
                </svg>
                Visualisation
              </h3>
              <div className="flex items-center gap-3">
                {selectedMessage && (
                  <p className="text-xs text-muted-foreground">
                    <span className="text-red-400">{selectedMessage.model_name}</span> • {selectedMessage.response_time_ms}ms
                    {selectedMessage.tokens_input && selectedMessage.tokens_output && (
                      <> • {selectedMessage.tokens_input + selectedMessage.tokens_output} tokens</>
                    )}
                  </p>
                )}
                {selectedMessage?.sql && (
                  <Button variant="outline" size="sm" onClick={handleSaveReport} className="border-red-500/30 hover:bg-red-500/10 hover:text-red-400 hover:border-red-500/50">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="mr-1.5">
                      <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" />
                      <polyline points="17 21 17 13 7 13 7 21" />
                      <polyline points="7 3 7 8 15 8" />
                    </svg>
                    Sauvegarder
                  </Button>
                )}
              </div>
            </div>

            {/* KPIs */}
            <div className="p-3 grid grid-cols-4 gap-3">
              <div className="bg-gradient-to-br from-card to-card/50 border border-border/50 rounded-xl p-3 text-center hover:border-primary/30 transition-colors">
                <p className="text-xs text-muted-foreground mb-1">Évaluations</p>
                <p className="text-xl font-bold text-foreground">64 385</p>
              </div>
              <div className="bg-gradient-to-br from-card to-card/50 border border-border/50 rounded-xl p-3 text-center hover:border-primary/30 transition-colors">
                <p className="text-xs text-muted-foreground mb-1">Note moyenne</p>
                <p className="text-xl font-bold text-primary">4.84</p>
              </div>
              <div className="bg-gradient-to-br from-card to-card/50 border border-border/50 rounded-xl p-3 text-center hover:border-primary/30 transition-colors">
                <p className="text-xs text-muted-foreground mb-1">Commentaires</p>
                <p className="text-xl font-bold text-foreground">7 256</p>
              </div>
              <div className="bg-gradient-to-br from-card to-card/50 border border-border/50 rounded-xl p-3 text-center hover:border-primary/30 transition-colors">
                <p className="text-xs text-muted-foreground mb-1">Chauffeurs</p>
                <p className="text-xl font-bold text-foreground">9 492</p>
              </div>
            </div>

            {/* Barre de filtres */}
            <div className="px-3 pb-3">
              <button
                onClick={() => setShowFilters(!showFilters)}
                className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className={`transition-transform ${showFilters ? "rotate-180" : ""}`}
                >
                  <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
                </svg>
                Filtres
                {(filterDateStart || filterDateEnd || filterNoteMin || filterNoteMax) && (
                  <span className="bg-primary text-primary-foreground text-xs px-1.5 py-0.5 rounded-full">
                    {[filterDateStart, filterDateEnd, filterNoteMin, filterNoteMax].filter(Boolean).length}
                  </span>
                )}
              </button>

              {showFilters && (
                <div className="mt-3 p-3 bg-secondary/30 rounded-lg space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    {/* Date début */}
                    <div>
                      <label className="text-xs text-muted-foreground block mb-1">Date début</label>
                      <Input
                        type="date"
                        value={filterDateStart}
                        onChange={(e) => setFilterDateStart(e.target.value)}
                        className="h-8 text-sm"
                      />
                    </div>
                    {/* Date fin */}
                    <div>
                      <label className="text-xs text-muted-foreground block mb-1">Date fin</label>
                      <Input
                        type="date"
                        value={filterDateEnd}
                        onChange={(e) => setFilterDateEnd(e.target.value)}
                        className="h-8 text-sm"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    {/* Note min */}
                    <div>
                      <label className="text-xs text-muted-foreground block mb-1">Note min</label>
                      <select
                        value={filterNoteMin}
                        onChange={(e) => setFilterNoteMin(e.target.value)}
                        className="w-full h-8 text-sm rounded-md border border-input bg-background px-3"
                      >
                        <option value="">Toutes</option>
                        <option value="1">1 ★</option>
                        <option value="2">2 ★</option>
                        <option value="3">3 ★</option>
                        <option value="4">4 ★</option>
                        <option value="5">5 ★</option>
                      </select>
                    </div>
                    {/* Note max */}
                    <div>
                      <label className="text-xs text-muted-foreground block mb-1">Note max</label>
                      <select
                        value={filterNoteMax}
                        onChange={(e) => setFilterNoteMax(e.target.value)}
                        className="w-full h-8 text-sm rounded-md border border-input bg-background px-3"
                      >
                        <option value="">Toutes</option>
                        <option value="1">1 ★</option>
                        <option value="2">2 ★</option>
                        <option value="3">3 ★</option>
                        <option value="4">4 ★</option>
                        <option value="5">5 ★</option>
                      </select>
                    </div>
                  </div>

                  {/* Actions filtres */}
                  <div className="flex items-center justify-between pt-2">
                    <button
                      onClick={() => {
                        setFilterDateStart("");
                        setFilterDateEnd("");
                        setFilterNoteMin("");
                        setFilterNoteMax("");
                      }}
                      className="text-xs text-muted-foreground hover:text-foreground"
                    >
                      Réinitialiser
                    </button>
                    <div className="text-xs text-muted-foreground">
                      Les filtres s'appliquent à la prochaine question
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>

          {selectedMessage ? (
            <div className="flex-1 flex flex-col overflow-hidden">
              {/* Zone 2.2: Graphique (flexible) */}
              {selectedMessage.chart && selectedMessage.chart.type !== "none" && selectedMessage.data && (
                <div className="flex-1 min-h-0 border-b border-border/50 p-4 overflow-hidden bg-gradient-to-b from-transparent to-secondary/10">
                  <div className="h-full">
                    <Chart config={selectedMessage.chart} data={selectedMessage.data} />
                  </div>
                </div>
              )}

              {/* Zone 2.3: Tableau de données (scrollable) */}
              <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
                <div className="p-3 border-b border-border/50 flex items-center justify-between bg-gradient-to-r from-secondary/20 to-transparent">
                  <span className="text-sm font-medium flex items-center gap-2">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-primary">
                      <rect x="3" y="3" width="18" height="18" rx="2" />
                      <path d="M3 9h18M9 21V9" />
                    </svg>
                    Données ({selectedMessage.data?.length || 0} lignes)
                  </span>
                  {selectedMessage.sql && (
                    <button
                      onClick={() => {
                        navigator.clipboard.writeText(selectedMessage.sql || "");
                      }}
                      className="text-xs text-muted-foreground hover:text-primary flex items-center gap-1.5 transition-colors"
                    >
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                        <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                      </svg>
                      Copier SQL
                    </button>
                  )}
                </div>
                <div className="flex-1 overflow-auto p-3">
                  {selectedMessage.data && selectedMessage.data.length > 0 ? (
                    <DataTable data={selectedMessage.data} />
                  ) : (
                    <p className="text-sm text-muted-foreground text-center py-4">
                      Aucune donnée
                    </p>
                  )}
                </div>
              </div>
            </div>
          ) : (
            <div className="flex-1 flex items-center justify-center text-muted-foreground">
              <div className="text-center">
                <div className="w-20 h-20 mx-auto mb-4 bg-gradient-to-br from-primary/10 to-transparent rounded-2xl flex items-center justify-center">
                  <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" className="text-primary/50">
                    <path d="M3 3v18h18" />
                    <path d="M18 9l-5 5-4-4-3 3" />
                  </svg>
                </div>
                <p className="text-foreground/80 font-medium">G7 Analytics</p>
                <p className="text-sm mt-1">Posez une question pour visualiser les données</p>
              </div>
            </div>
          )}
        </div>

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

        {/* Zone 3: Rapports sauvegardés - Fond plus sombre */}
        <div
          className={`flex flex-col bg-[hsl(260_10%_10%)] ${zone3Collapsed ? "w-14" : ""} ${isResizing ? "" : "transition-all duration-300 ease-in-out"}`}
          style={zone3Collapsed ? undefined : { width: `${zone3Width}%` }}
        >
          {zone3Collapsed ? (
            <div className="flex-1 flex flex-col items-center pt-3 gap-2">
              <button
                onClick={() => setZone3Collapsed(false)}
                className="w-10 h-10 bg-secondary hover:bg-accent rounded-lg flex items-center justify-center transition-colors"
                title="Rapports sauvegardés"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" />
                  <polyline points="17 21 17 13 7 13 7 21" />
                  <polyline points="7 3 7 8 15 8" />
                </svg>
              </button>
              <button
                onClick={() => setZone3Collapsed(false)}
                className="w-10 h-10 bg-secondary hover:bg-accent rounded-lg flex items-center justify-center transition-colors"
                title="Historique"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="10" />
                  <polyline points="12 6 12 12 16 14" />
                </svg>
              </button>
            </div>
          ) : (
            <>
              {/* Header Zone 3 */}
              <div className="h-12 px-3 border-b border-amber-500/20 bg-gradient-to-r from-amber-500/10 to-transparent flex items-center justify-between">
                <h3 className="text-xs font-semibold text-amber-400 uppercase tracking-wider flex items-center gap-2">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" />
                    <polyline points="17 21 17 13 7 13 7 21" />
                    <polyline points="7 3 7 8 15 8" />
                  </svg>
                  Rapports
                </h3>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 w-7 p-0 hover:bg-amber-500/20"
                  onClick={() => setZone3Collapsed(true)}
                  title="Réduire le panneau"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M13 19l7-7-7-7M6 19l7-7-7-7" />
                  </svg>
                </Button>
              </div>

              <div className="flex-1 overflow-y-auto p-3 space-y-2">
                {savedReports.length === 0 ? (
                  <p className="text-xs text-muted-foreground text-center py-4">
                    Aucun rapport sauvegardé
                  </p>
                ) : (
                  savedReports.map((report) => (
                    <div
                      key={report.id}
                      className="p-2.5 rounded-lg border border-border/50 hover:bg-secondary/50 hover:border-primary/30 transition-all group cursor-pointer"
                      onClick={() => handleReportClick(report)}
                    >
                      <p className="text-sm font-medium truncate text-foreground">
                        {report.is_pinned ? <span className="text-primary mr-1">●</span> : null}
                        {report.title}
                      </p>
                      <p className="text-xs text-muted-foreground truncate mt-0.5">
                        {report.question}
                      </p>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeleteReport(report.id);
                        }}
                        className="text-xs text-destructive opacity-0 group-hover:opacity-100 transition-opacity mt-1.5"
                      >
                        Supprimer
                      </button>
                    </div>
                  ))
                )}
              </div>

              {/* Historique conversations */}
              <div className="border-t-2 border-amber-500/20">
                <div className="p-3 border-b border-amber-500/20 bg-gradient-to-r from-amber-500/5 to-transparent">
                  <h3 className="text-xs font-semibold text-amber-400/70 uppercase tracking-wider flex items-center gap-2">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <circle cx="12" cy="12" r="10" />
                      <polyline points="12 6 12 12 16 14" />
                    </svg>
                    Historique
                  </h3>
                </div>
                <div className="overflow-y-auto max-h-48 p-3 space-y-1">
                  {conversations.slice(0, 10).map((conv) => (
                    <button
                      key={conv.id}
                      onClick={async () => {
                        setCurrentConversationId(conv.id);
                        try {
                          const res = await fetch(`http://localhost:8000/conversations/${conv.id}/messages`);
                          const data = await res.json();
                          setMessages(data.messages || []);
                          setSelectedMessage(null);
                        } catch (e) {
                          console.error("Erreur chargement messages:", e);
                        }
                      }}
                      className={`w-full text-left text-xs p-2 rounded-lg hover:bg-secondary/50 transition-colors truncate ${
                        currentConversationId === conv.id ? "bg-primary/10 text-primary border border-primary/20" : "text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      {conv.title || "Conversation sans titre"}
                    </button>
                  ))}
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
