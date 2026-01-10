import { useState, useCallback } from "react";
import * as api from "@/lib/api";
import { Message, Conversation } from "@/types";

interface Filters {
  dateStart: string;
  dateEnd: string;
  noteMin: string;
  noteMax: string;
}

interface UseConversationReturn {
  // États
  question: string;
  loading: boolean;
  messages: Message[];
  selectedMessage: Message | null;
  conversations: Conversation[];
  currentConversationId: number | null;
  showHistory: boolean;

  // Setters
  setQuestion: (q: string) => void;
  setSelectedMessage: (msg: Message | null) => void;
  setShowHistory: (show: boolean) => void;

  // Actions
  loadConversations: () => Promise<void>;
  handleSubmit: (e: React.FormEvent, filters: Filters) => Promise<void>;
  handleLoadConversation: (conv: Conversation) => Promise<void>;
  handleNewConversation: () => void;
  handleReplayMessage: (msg: Message) => void;
}

export function useConversation(): UseConversationReturn {
  const [question, setQuestion] = useState("");
  const [loading, setLoading] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [selectedMessage, setSelectedMessage] = useState<Message | null>(null);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [currentConversationId, setCurrentConversationId] = useState<number | null>(null);
  const [showHistory, setShowHistory] = useState(false);

  const loadConversations = useCallback(async () => {
    const convs = await api.fetchConversations();
    setConversations(convs);
  }, []);

  const createNewConversation = useCallback(async () => {
    try {
      const id = await api.createConversation();
      if (id) {
        setCurrentConversationId(id);
        setMessages([]);
        setSelectedMessage(null);
        await loadConversations();
      }
      return id;
    } catch (e) {
      console.error("Erreur création conversation:", e);
      return null;
    }
  }, [loadConversations]);

  const buildFilterContext = useCallback((filters: Filters) => {
    const parts: string[] = [];
    if (filters.dateStart) parts.push(`à partir du ${filters.dateStart}`);
    if (filters.dateEnd) parts.push(`jusqu'au ${filters.dateEnd}`);
    if (filters.noteMin) parts.push(`note minimum ${filters.noteMin}`);
    if (filters.noteMax) parts.push(`note maximum ${filters.noteMax}`);
    return parts.length > 0 ? ` (Filtres: ${parts.join(", ")})` : "";
  }, []);

  const handleSubmit = useCallback(async (e: React.FormEvent, filters: Filters) => {
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
    const questionWithFilters = question + buildFilterContext(filters);

    // Ajouter le message user localement
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
        sql_error: data.sql_error,
        chart: data.chart,
        data: data.data,
        model_name: data.model_name,
        tokens_input: data.tokens_input,
        tokens_output: data.tokens_output,
        response_time_ms: data.response_time_ms,
      };

      setMessages((prev) => [...prev, assistantMessage]);
      setSelectedMessage(assistantMessage);
      await loadConversations();
    } catch (e) {
      const errorMessage: Message = {
        id: Date.now(),
        role: "assistant",
        content: `Erreur: ${e instanceof Error ? e.message : "Erreur inconnue"}`,
      };
      setMessages((prev) => [...prev, errorMessage]);
      setSelectedMessage(errorMessage);
    } finally {
      setLoading(false);
    }
  }, [question, loading, currentConversationId, createNewConversation, buildFilterContext, loadConversations]);

  const handleLoadConversation = useCallback(async (conv: Conversation) => {
    setCurrentConversationId(conv.id);
    try {
      const msgs = await api.fetchConversationMessages(conv.id);
      setMessages(msgs);
      setSelectedMessage(null);
      setShowHistory(false);
    } catch (e) {
      console.error("Erreur chargement messages:", e);
    }
  }, []);

  const handleNewConversation = useCallback(() => {
    setCurrentConversationId(null);
    setMessages([]);
    setSelectedMessage(null);
  }, []);

  const handleReplayMessage = useCallback((msg: Message) => {
    if (msg.role === "user") {
      setQuestion(msg.content);
    }
  }, []);

  return {
    question,
    loading,
    messages,
    selectedMessage,
    conversations,
    currentConversationId,
    showHistory,
    setQuestion,
    setSelectedMessage,
    setShowHistory,
    loadConversations,
    handleSubmit,
    handleLoadConversation,
    handleNewConversation,
    handleReplayMessage,
  };
}
