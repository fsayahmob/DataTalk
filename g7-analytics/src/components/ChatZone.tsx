"use client";

import { useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { PredefinedQuestions } from "@/components/PredefinedQuestions";
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
  TrashIcon,
} from "@/components/icons";

// Formatage du timestamp relatif
function formatTimestamp(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return "à l'instant";
  if (diffMins < 60) return `il y a ${diffMins}min`;
  if (diffHours < 24) return `il y a ${diffHours}h`;
  if (diffDays < 7) return `il y a ${diffDays}j`;
  return date.toLocaleDateString("fr-FR", { day: "numeric", month: "short" });
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
  // Mode contexte
  useContext: boolean;
  onUseContextChange: (use: boolean) => void;
  // Suppression historique
  onDeleteAllConversations: () => void;
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
  useContext,
  onUseContextChange,
  onDeleteAllConversations,
}: ChatZoneProps) {
  const chatEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll vers le bas
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

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
                  <>
                    {/* Bouton supprimer tout */}
                    <button
                      onClick={onDeleteAllConversations}
                      className="w-full text-left text-[10px] p-2 rounded-lg bg-destructive/10 hover:bg-destructive/20 text-destructive transition-colors flex items-center gap-2 mb-2"
                    >
                      <TrashIcon size={12} className="flex-shrink-0" />
                      <span>Supprimer tout l'historique</span>
                    </button>
                    {conversations.slice(0, 15).map((conv) => (
                    <button
                      key={conv.id}
                      onClick={() => onLoadConversation(conv)}
                      className={`w-full text-left text-[11px] p-2 rounded-lg hover:bg-secondary/70 transition-colors flex items-center gap-2 ${
                        currentConversationId === conv.id ? "bg-primary/15 text-primary border border-primary/30" : "text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      <ChatIcon size={12} className="flex-shrink-0 opacity-50" />
                      <div className="flex-1 min-w-0">
                        <span className="block truncate">{conv.title || "Conversation sans titre"}</span>
                        <span className="text-[9px] opacity-50">{formatTimestamp(conv.created_at)}</span>
                      </div>
                    </button>
                  ))}
                  </>
                )}
              </div>
            </div>
          )}

          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-3 space-y-3">
            {messages.length === 0 && (
              <div className="space-y-2">
                <div className="text-center py-3">
                  <div className="w-10 h-10 mx-auto mb-2 bg-gradient-to-br from-primary/20 to-primary/5 rounded-xl flex items-center justify-center">
                    <SearchIcon size={20} className="text-primary" />
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Posez une question en langage naturel
                  </p>
                  <p className="text-[10px] text-muted-foreground/70 mt-0.5">
                    ou sélectionnez une suggestion ci-dessous
                  </p>
                </div>

                {/* Questions prédéfinies */}
                <PredefinedQuestions
                  questions={predefinedQuestions}
                  onQuestionClick={onQuestionClick}
                />
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
            {/* Mode toggle + instructions */}
            <div className="mt-2 flex items-center justify-between">
              <button
                type="button"
                onClick={() => onUseContextChange(!useContext)}
                className={`text-[10px] px-2 py-1 rounded-md transition-all flex items-center gap-1.5 ${
                  useContext
                    ? "bg-primary/20 text-primary border border-primary/30"
                    : "bg-secondary/50 text-muted-foreground border border-border/30 hover:bg-secondary"
                }`}
                title={useContext ? "Mode avec contexte (historique inclus)" : "Mode sans contexte (économise les tokens)"}
              >
                <span className={`w-1.5 h-1.5 rounded-full ${useContext ? "bg-primary" : "bg-muted-foreground"}`} />
                {useContext ? "Avec contexte" : "Sans contexte"}
              </button>
              <p className="text-[10px] text-muted-foreground">
                Entrée pour envoyer
              </p>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
