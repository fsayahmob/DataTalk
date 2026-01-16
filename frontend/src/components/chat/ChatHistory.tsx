"use client";

import { Conversation } from "@/types";
import { ChatIcon, TrashIcon } from "@/components/icons";
import { t } from "@/hooks/useTranslation";

// Formatage du timestamp relatif
function formatTimestamp(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return "a l'instant";
  if (diffMins < 60) return `il y a ${diffMins}min`;
  if (diffHours < 24) return `il y a ${diffHours}h`;
  if (diffDays < 7) return `il y a ${diffDays}j`;
  return date.toLocaleDateString("fr-FR", { day: "numeric", month: "short" });
}

interface ChatHistoryProps {
  conversations: Conversation[];
  currentConversationId: number | null;
  onLoadConversation: (conv: Conversation) => void;
  onDeleteAllConversations: () => void;
}

export function ChatHistory({
  conversations,
  currentConversationId,
  onLoadConversation,
  onDeleteAllConversations,
}: ChatHistoryProps) {
  return (
    <div className="border-b border-primary/20 bg-secondary/30 max-h-48 overflow-y-auto">
      <div className="p-2 space-y-1">
        {conversations.length === 0 ? (
          <p className="text-[10px] text-muted-foreground text-center py-2">
            {t("chat.no_conversations")}
          </p>
        ) : (
          <>
            {/* Bouton supprimer tout */}
            <button
              onClick={onDeleteAllConversations}
              className="w-full text-left text-[10px] p-2 rounded-lg bg-destructive/10 hover:bg-destructive/20 text-destructive transition-colors flex items-center gap-2 mb-2"
            >
              <TrashIcon size={12} className="flex-shrink-0" />
              <span>{t("chat.delete_all_history")}</span>
            </button>
            {conversations.slice(0, 15).map((conv) => (
              <button
                key={conv.id}
                onClick={() => onLoadConversation(conv)}
                className={`w-full text-left text-[11px] p-2 rounded-lg hover:bg-secondary/70 transition-colors flex items-center gap-2 ${
                  currentConversationId === conv.id
                    ? "bg-primary/15 text-primary border border-primary/30"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <ChatIcon size={12} className="flex-shrink-0 opacity-50" />
                <div className="flex-1 min-w-0">
                  <span className="block truncate">
                    {conv.title || t("chat.untitled_conversation")}
                  </span>
                  <span className="text-[9px] opacity-50">
                    {formatTimestamp(conv.created_at)}
                  </span>
                </div>
              </button>
            ))}
          </>
        )}
      </div>
    </div>
  );
}
