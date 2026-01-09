"use client";

import { useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Message, PredefinedQuestion, Conversation } from "@/types";
import {
  ChatIcon,
  ClockIcon,
  PlusIcon,
  ChevronLeftIcon,
  SearchIcon,
  ReplayIcon,
  TokensIcon,
  SendIcon,
  StopIcon,
} from "@/components/icons";

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
    "⭐": "⭐",
    "🏆": "🏆",
    "📈": "📈",
    "🔍": "🔍",
  };
  return <span className="mr-2">{icons[icon] || "💬"}</span>;
}

interface ChatZoneProps {
  collapsed: boolean;
  onCollapse: (collapsed: boolean) => void;
  width: number;
  isResizing: boolean;
  // Messages
  messages: Message[];
  loading: boolean;
  question: string;
  onQuestionChange: (q: string) => void;
  onSubmit: (e: React.FormEvent) => void;
  selectedMessage: Message | null;
  onSelectMessage: (msg: Message | null) => void;
  // Conversations
  conversations: Conversation[];
  currentConversationId: number | null;
  showHistory: boolean;
  onShowHistoryChange: (show: boolean) => void;
  onLoadConversation: (conv: Conversation) => void;
  onNewConversation: () => void;
  // Questions prédéfinies
  predefinedQuestions: PredefinedQuestion[];
  onQuestionClick: (q: string) => void;
  onReplayMessage: (msg: Message) => void;
}

export function ChatZone({
  collapsed,
  onCollapse,
  width,
  isResizing,
  messages,
  loading,
  question,
  onQuestionChange,
  onSubmit,
  selectedMessage,
  onSelectMessage,
  conversations,
  currentConversationId,
  showHistory,
  onShowHistoryChange,
  onLoadConversation,
  onNewConversation,
  predefinedQuestions,
  onQuestionClick,
  onReplayMessage,
}: ChatZoneProps) {
  const chatEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll vers le bas
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Grouper questions par catégorie
  const questionsByCategory = predefinedQuestions.reduce(
    (acc, q) => {
      if (!acc[q.category]) acc[q.category] = [];
      acc[q.category].push(q);
      return acc;
    },
    {} as Record<string, PredefinedQuestion[]>
  );

  return (
    <div
      className={`flex flex-col bg-[hsl(260_10%_10%)] ${collapsed ? "w-14" : ""} ${isResizing ? "" : "transition-all duration-300 ease-in-out"}`}
      style={collapsed ? undefined : { width: `${width}%` }}
    >
      {collapsed ? (
        <div className="flex-1 flex flex-col items-center pt-3">
          <button
            onClick={() => onCollapse(false)}
            className="w-10 h-10 bg-secondary hover:bg-accent rounded-lg flex items-center justify-center transition-colors"
            title="Ouvrir le chat"
          >
            <ChatIcon size={16} />
          </button>
        </div>
      ) : (
        <>
          {/* Header Zone 1 */}
          <div className="h-12 px-3 border-b border-primary/20 bg-gradient-to-r from-primary/10 to-transparent flex items-center justify-between">
            <h3 className="text-xs font-semibold text-primary uppercase tracking-wider flex items-center gap-2">
              <ChatIcon size={14} />
              Chat
            </h3>
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="sm"
                className={`h-7 w-7 p-0 hover:bg-primary/20 ${showHistory ? 'bg-primary/20' : ''}`}
                onClick={() => onShowHistoryChange(!showHistory)}
                title="Historique des conversations"
              >
                <ClockIcon size={14} />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 w-7 p-0 hover:bg-primary/20"
                onClick={() => {
                  onNewConversation();
                  onShowHistoryChange(false);
                }}
                title="Nouvelle conversation"
              >
                <PlusIcon size={14} />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 w-7 p-0 hover:bg-primary/20"
                onClick={() => onCollapse(true)}
                title="Réduire le panneau"
              >
                <ChevronLeftIcon size={14} />
              </Button>
            </div>
          </div>

          {/* Historique déroulant */}
          {showHistory && (
            <div className="border-b border-primary/20 bg-secondary/30 max-h-48 overflow-y-auto">
              <div className="p-2 space-y-1">
                {conversations.length === 0 ? (
                  <p className="text-[10px] text-muted-foreground text-center py-2">
                    Aucune conversation
                  </p>
                ) : (
                  conversations.slice(0, 15).map((conv) => (
                    <button
                      key={conv.id}
                      onClick={() => onLoadConversation(conv)}
                      className={`w-full text-left text-[11px] p-2 rounded-lg hover:bg-secondary/70 transition-colors truncate flex items-center gap-2 ${
                        currentConversationId === conv.id ? "bg-primary/15 text-primary border border-primary/30" : "text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      <ChatIcon size={12} className="flex-shrink-0 opacity-50" />
                      <span className="truncate">{conv.title || "Conversation sans titre"}</span>
                    </button>
                  ))
                )}
              </div>
            </div>
          )}

          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-3 space-y-3">
            {messages.length === 0 && (
              <div className="space-y-4">
                <div className="text-center py-6">
                  <div className="w-12 h-12 mx-auto mb-3 bg-gradient-to-br from-primary/20 to-primary/5 rounded-xl flex items-center justify-center">
                    <SearchIcon size={24} className="text-primary" />
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
                          onClick={() => onQuestionClick(q.question)}
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
                onClick={() => msg.role === "assistant" && onSelectMessage(msg)}
              >
                <p className="text-sm leading-relaxed">{msg.content}</p>

                {msg.role === "assistant" && msg.response_time_ms && (
                  <div className="mt-2 flex items-center gap-3 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <ClockIcon size={10} />
                      {(msg.response_time_ms / 1000).toFixed(1)}s
                    </span>
                    {msg.tokens_input && msg.tokens_output && (
                      <span className="flex items-center gap-1">
                        <TokensIcon size={10} />
                        {msg.tokens_input + msg.tokens_output}
                      </span>
                    )}
                  </div>
                )}

                {msg.role === "user" && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onReplayMessage(msg);
                    }}
                    className="mt-2 text-xs opacity-70 hover:opacity-100 flex items-center gap-1"
                  >
                    <ReplayIcon size={12} />
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
            <form onSubmit={onSubmit} className="relative">
              <textarea
                value={question}
                onChange={(e) => onQuestionChange(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    if (question.trim() && !loading) {
                      onSubmit(e);
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
                {loading ? <StopIcon size={14} /> : <SendIcon size={16} />}
              </button>
            </form>
            <p className="text-xs text-muted-foreground mt-2 text-center">
              Entrée pour envoyer, Shift+Entrée pour nouvelle ligne
            </p>
          </div>
        </>
      )}
    </div>
  );
}
