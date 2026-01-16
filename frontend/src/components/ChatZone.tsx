"use client";

import { Button } from "@/components/ui/button";
import { Message, PredefinedQuestion, Conversation } from "@/types";
import { ChatIcon } from "@/components/icons";
import {
  ChatHeader,
  ChatHistory,
  ChatMessages,
  ChatInput,
} from "@/components/chat";
import { t } from "@/hooks/useTranslation";

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
  // Stop requête
  onStop: () => void;
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
  onStop,
  useContext,
  onUseContextChange,
  onDeleteAllConversations,
}: ChatZoneProps) {
  return (
    <div
      className={`flex flex-col bg-background ${collapsed ? "w-14" : ""} ${isResizing ? "" : "transition-all duration-300 ease-in-out"}`}
      style={collapsed ? undefined : { width: `${width}%` }}
    >
      {collapsed ? (
        <div className="flex-1 flex flex-col items-center pt-3">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onCollapse(false)}
            className="w-10 h-10 bg-secondary hover:bg-accent rounded-lg"
            title={t("chat.open")}
          >
            <ChatIcon size={16} />
          </Button>
        </div>
      ) : (
        <>
          <ChatHeader
            showHistory={showHistory}
            onShowHistoryChange={onShowHistoryChange}
            onNewConversation={onNewConversation}
            onCollapse={() => onCollapse(true)}
          />

          {showHistory && (
            <ChatHistory
              conversations={conversations}
              currentConversationId={currentConversationId}
              onLoadConversation={onLoadConversation}
              onDeleteAllConversations={onDeleteAllConversations}
            />
          )}

          <ChatMessages
            messages={messages}
            loading={loading}
            selectedMessage={selectedMessage}
            onSelectMessage={onSelectMessage}
            predefinedQuestions={predefinedQuestions}
            onQuestionClick={onQuestionClick}
            onReplayMessage={onReplayMessage}
          />

          <ChatInput
            question={question}
            loading={loading}
            useContext={useContext}
            onQuestionChange={onQuestionChange}
            onSubmit={onSubmit}
            onStop={onStop}
            onUseContextChange={onUseContextChange}
          />
        </>
      )}
    </div>
  );
}
