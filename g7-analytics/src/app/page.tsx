"use client";

import { useState, useEffect, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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

    // Ajouter le message user localement
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
        body: JSON.stringify({ question: userMessage.content }),
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

    try {
      await fetch("http://localhost:8000/reports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          question: messages.find((m) => m.role === "user" && m.id < selectedMessage.id)?.content || "",
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
      <header className="border-b px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 bg-primary rounded-lg flex items-center justify-center">
            <span className="text-primary-foreground font-bold">G7</span>
          </div>
          <div>
            <h1 className="font-semibold">G7 Analytics</h1>
            <p className="text-xs text-muted-foreground">Analyse des évaluations clients</p>
          </div>
        </div>

        <div className="flex items-center gap-4">
          {/* Statut API */}
          <div className="flex items-center gap-2 text-sm">
            <span
              className={`w-2 h-2 rounded-full ${
                apiStatus === "ok" ? "bg-green-500" : apiStatus === "error" ? "bg-red-500" : "bg-yellow-500"
              }`}
            />
            <span className="text-muted-foreground">gemini-2.0-flash</span>
          </div>

          {/* Bouton settings */}
          <Button variant="outline" size="sm" onClick={() => setShowSettings(!showSettings)}>
            ⚙️
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
      <div className="flex-1 flex overflow-hidden">
        {/* Zone 1: Chat (30%) */}
        <div className="w-[30%] border-r flex flex-col">
          <div className="p-3 border-b">
            <Button
              variant="outline"
              size="sm"
              className="w-full"
              onClick={() => {
                setCurrentConversationId(null);
                setMessages([]);
                setSelectedMessage(null);
              }}
            >
              + Nouvelle conversation
            </Button>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-3 space-y-3">
            {messages.length === 0 && (
              <div className="space-y-4">
                <p className="text-sm text-muted-foreground text-center py-4">
                  Posez une question ou sélectionnez une suggestion
                </p>

                {/* Questions prédéfinies */}
                {Object.entries(questionsByCategory).map(([category, questions]) => (
                  <div key={category}>
                    <h4 className="text-xs font-medium text-muted-foreground mb-2">{category}</h4>
                    <div className="space-y-1">
                      {questions.map((q) => (
                        <button
                          key={q.id}
                          onClick={() => handleQuestionClick(q.question)}
                          className="w-full text-left text-sm p-2 rounded hover:bg-secondary transition-colors"
                        >
                          <CategoryIcon icon={q.icon} />
                          {q.question}
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
                className={`p-3 rounded-lg cursor-pointer transition-colors ${
                  msg.role === "user"
                    ? "bg-primary text-primary-foreground ml-4"
                    : "bg-secondary mr-4"
                } ${selectedMessage?.id === msg.id ? "ring-2 ring-primary" : ""}`}
                onClick={() => msg.role === "assistant" && setSelectedMessage(msg)}
              >
                <p className="text-sm">{msg.content}</p>

                {msg.role === "assistant" && msg.response_time_ms && (
                  <div className="mt-2 flex items-center gap-2 text-xs opacity-70">
                    <span>{(msg.response_time_ms / 1000).toFixed(1)}s</span>
                    {msg.tokens_input && msg.tokens_output && (
                      <span>
                        {msg.tokens_input + msg.tokens_output} tokens
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
                    className="mt-2 text-xs opacity-70 hover:opacity-100"
                  >
                    ↻ Relancer
                  </button>
                )}
              </div>
            ))}

            {loading && (
              <div className="bg-secondary p-3 rounded-lg mr-4">
                <LoadingDots />
              </div>
            )}

            <div ref={chatEndRef} />
          </div>

          {/* Input - Style ChatGPT */}
          <div className="p-4 border-t">
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
                className="w-full resize-none rounded-xl border border-input bg-secondary/50 pl-4 pr-12 py-3 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
              />
              <button
                type="submit"
                disabled={loading || !question.trim()}
                className={`absolute right-3 bottom-3 w-8 h-8 rounded-lg flex items-center justify-center transition-all ${
                  loading
                    ? "bg-destructive text-destructive-foreground"
                    : question.trim()
                      ? "bg-primary text-primary-foreground hover:bg-primary/90"
                      : "bg-muted text-muted-foreground cursor-not-allowed"
                }`}
              >
                {loading ? (
                  // Stop icon (carré)
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                    <rect x="4" y="4" width="16" height="16" rx="2" />
                  </svg>
                ) : (
                  // Arrow up icon (flèche vers le haut)
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
        </div>

        {/* Zone 2: Visualisation (50%) - 3 sous-zones */}
        <div className="w-[50%] flex flex-col overflow-hidden">
          {/* Zone 2.1: KPIs + Header (fixe) */}
          <div className="border-b">
            {/* Header avec métadonnées */}
            <div className="p-3 flex items-center justify-between bg-secondary/30">
              <div>
                <h2 className="font-medium">
                  {selectedMessage?.chart?.title || "G7 Analytics Dashboard"}
                </h2>
                {selectedMessage && (
                  <p className="text-xs text-muted-foreground">
                    {selectedMessage.model_name} • {selectedMessage.response_time_ms}ms
                    {selectedMessage.tokens_input && selectedMessage.tokens_output && (
                      <> • {selectedMessage.tokens_input}↓ {selectedMessage.tokens_output}↑ tokens</>
                    )}
                  </p>
                )}
              </div>
              {selectedMessage?.sql && (
                <Button variant="outline" size="sm" onClick={handleSaveReport}>
                  💾 Sauvegarder
                </Button>
              )}
            </div>

            {/* KPIs */}
            <div className="p-3 grid grid-cols-4 gap-3">
              <div className="bg-background border rounded-lg p-3 text-center">
                <p className="text-xs text-muted-foreground">Évaluations</p>
                <p className="text-xl font-bold">64 385</p>
              </div>
              <div className="bg-background border rounded-lg p-3 text-center">
                <p className="text-xs text-muted-foreground">Note moyenne</p>
                <p className="text-xl font-bold">4.84</p>
              </div>
              <div className="bg-background border rounded-lg p-3 text-center">
                <p className="text-xs text-muted-foreground">Commentaires</p>
                <p className="text-xl font-bold">7 256</p>
              </div>
              <div className="bg-background border rounded-lg p-3 text-center">
                <p className="text-xs text-muted-foreground">Chauffeurs</p>
                <p className="text-xl font-bold">9 492</p>
              </div>
            </div>
          </div>

          {selectedMessage ? (
            <div className="flex-1 flex flex-col overflow-hidden">
              {/* Zone 2.2: Graphique (flexible) */}
              {selectedMessage.chart && selectedMessage.chart.type !== "none" && selectedMessage.data && (
                <div className="flex-1 min-h-0 border-b p-4 overflow-hidden">
                  <div className="h-full">
                    <Chart config={selectedMessage.chart} data={selectedMessage.data} />
                  </div>
                </div>
              )}

              {/* Zone 2.3: Tableau de données (scrollable) */}
              <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
                <div className="p-3 border-b flex items-center justify-between bg-secondary/20">
                  <span className="text-sm font-medium">
                    Données ({selectedMessage.data?.length || 0} lignes)
                  </span>
                  {selectedMessage.sql && (
                    <button
                      onClick={() => {
                        navigator.clipboard.writeText(selectedMessage.sql || "");
                      }}
                      className="text-xs text-muted-foreground hover:text-foreground"
                    >
                      📋 Copier SQL
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
                <p className="text-4xl mb-4">📊</p>
                <p>Posez une question pour voir les résultats</p>
              </div>
            </div>
          )}
        </div>

        {/* Zone 3: Rapports sauvegardés (20%) */}
        <div className="w-[20%] border-l flex flex-col">
          <div className="p-3 border-b">
            <h3 className="font-medium text-sm">Rapports sauvegardés</h3>
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
                  className="p-2 rounded border hover:bg-secondary transition-colors group"
                >
                  <div
                    className="cursor-pointer"
                    onClick={() => handleReportClick(report)}
                  >
                    <p className="text-sm font-medium truncate">
                      {report.is_pinned && "📌 "}
                      {report.title}
                    </p>
                    <p className="text-xs text-muted-foreground truncate">
                      {report.question}
                    </p>
                  </div>
                  <button
                    onClick={() => handleDeleteReport(report.id)}
                    className="text-xs text-destructive opacity-0 group-hover:opacity-100 transition-opacity mt-1"
                  >
                    Supprimer
                  </button>
                </div>
              ))
            )}
          </div>

          {/* Historique conversations */}
          <div className="border-t">
            <div className="p-3 border-b">
              <h3 className="font-medium text-sm">Historique</h3>
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
                  className={`w-full text-left text-xs p-2 rounded hover:bg-secondary transition-colors truncate ${
                    currentConversationId === conv.id ? "bg-secondary" : ""
                  }`}
                >
                  {conv.title || "Conversation sans titre"}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
