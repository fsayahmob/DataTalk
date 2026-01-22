/**
 * useConversation - Wrapper de compatibilité
 *
 * MIGRATION: Ce hook redirige maintenant vers useConversationStore (Zustand)
 * Les anciens imports continuent de fonctionner pour backward compatibility.
 */
import { useCallback } from "react";
import { useConversationStore, type Filters } from "@/stores/useConversationStore";
import { Message, Conversation } from "@/types";

// Re-export Filters type for backward compatibility
export type { Filters } from "@/stores/useConversationStore";

interface UseConversationReturn {
  // États
  question: string;
  loading: boolean;
  messages: Message[];
  selectedMessage: Message | null;
  conversations: Conversation[];
  currentConversationId: number | null;
  showHistory: boolean;
  useContext: boolean;
  error: string | null;

  // Setters
  setQuestion: (q: string) => void;
  setSelectedMessage: (msg: Message | null) => void;
  setShowHistory: (show: boolean) => void;
  setUseContext: (use: boolean) => void;
  clearError: () => void;

  // Actions
  loadConversations: () => Promise<void>;
  restoreSession: () => Promise<void>;
  handleSubmit: (e: React.FormEvent, filters: Filters) => Promise<void>;
  handleStop: () => void;
  handleLoadConversation: (conv: Conversation) => Promise<void>;
  handleNewConversation: () => void;
  handleReplayMessage: (msg: Message) => void;
}

/**
 * Hook legacy - redirige vers Zustand store
 */
export function useConversation(): UseConversationReturn {
  // Get state from store
  const question = useConversationStore((state) => state.question);
  const loading = useConversationStore((state) => state.loading);
  const messages = useConversationStore((state) => state.messages);
  const selectedMessage = useConversationStore((state) => state.selectedMessage);
  const conversations = useConversationStore((state) => state.conversations);
  const currentConversationId = useConversationStore((state) => state.currentConversationId);
  const showHistory = useConversationStore((state) => state.showHistory);
  const useContext = useConversationStore((state) => state.useContext);
  const error = useConversationStore((state) => state.error);

  // Get actions from store
  const setQuestion = useConversationStore((state) => state.setQuestion);
  const setSelectedMessage = useConversationStore((state) => state.setSelectedMessage);
  const setShowHistory = useConversationStore((state) => state.setShowHistory);
  const setUseContext = useConversationStore((state) => state.setUseContext);
  const clearError = useConversationStore((state) => state.clearError);
  const loadConversations = useConversationStore((state) => state.loadConversations);
  const restoreSession = useConversationStore((state) => state.restoreSession);
  const storeHandleSubmit = useConversationStore((state) => state.handleSubmit);
  const handleStop = useConversationStore((state) => state.handleStop);
  const handleLoadConversation = useConversationStore((state) => state.handleLoadConversation);
  const handleNewConversation = useConversationStore((state) => state.handleNewConversation);
  const handleReplayMessage = useConversationStore((state) => state.handleReplayMessage);

  // Wrapper for handleSubmit to match original signature (with e.preventDefault())
  const handleSubmit = useCallback(
    async (e: React.FormEvent, filters: Filters) => {
      e.preventDefault();
      await storeHandleSubmit(filters);
    },
    [storeHandleSubmit]
  );

  return {
    question,
    loading,
    messages,
    selectedMessage,
    conversations,
    currentConversationId,
    showHistory,
    useContext,
    error,
    setQuestion,
    setSelectedMessage,
    setShowHistory,
    setUseContext,
    clearError,
    loadConversations,
    restoreSession,
    handleSubmit,
    handleStop,
    handleLoadConversation,
    handleNewConversation,
    handleReplayMessage,
  };
}
