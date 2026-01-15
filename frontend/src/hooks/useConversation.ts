import { useState, useCallback, useEffect } from "react";
import * as api from "@/lib/api";
import { Message, Conversation } from "@/types";

const STORAGE_KEY = "g7_current_conversation_id";

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
  useContext: boolean;  // Mode stateful/stateless
  error: string | null;  // Erreur technique à afficher dans le footer

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
  const [useContext, setUseContext] = useState(false);  // Stateless par défaut
  const [error, setError] = useState<string | null>(null);

  const clearError = useCallback(() => setError(null), []);

  const loadConversations = useCallback(async () => {
    const convs = await api.fetchConversations();
    setConversations(convs);
  }, []);

  // Persister l'ID de conversation dans localStorage
  useEffect(() => {
    if (currentConversationId !== null) {
      localStorage.setItem(STORAGE_KEY, String(currentConversationId));
    }
  }, [currentConversationId]);

  // Restaurer la session précédente au chargement
  const restoreSession = useCallback(async () => {
    const savedId = localStorage.getItem(STORAGE_KEY);
    if (!savedId) return;

    const convId = parseInt(savedId, 10);
    if (isNaN(convId)) return;

    try {
      // Charger les messages de la conversation
      const msgs = await api.fetchConversationMessages(convId);
      if (msgs.length > 0) {
        setCurrentConversationId(convId);
        setMessages(msgs);

        // Sélectionner le dernier message assistant avec chart pour afficher
        const lastAssistant = [...msgs].reverse().find(m => m.role === "assistant" && m.chart);
        if (lastAssistant) {
          setSelectedMessage(lastAssistant);
        }
      }
    } catch (e) {
      // Si la conversation n'existe plus, supprimer du localStorage
      console.warn("Conversation non trouvée, suppression du localStorage:", e);
      localStorage.removeItem(STORAGE_KEY);
    }
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

  // Convertir les filtres UI en filtres API (ne garde que les valeurs non vides)
  const toApiFilters = useCallback((filters: Filters): api.AnalysisFilters | undefined => {
    const apiFilters: api.AnalysisFilters = {};
    if (filters.dateStart) apiFilters.dateStart = filters.dateStart;
    if (filters.dateEnd) apiFilters.dateEnd = filters.dateEnd;
    if (filters.noteMin) apiFilters.noteMin = filters.noteMin;
    if (filters.noteMax) apiFilters.noteMax = filters.noteMax;
    return Object.keys(apiFilters).length > 0 ? apiFilters : undefined;
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

    // Convertir les filtres pour l'API
    const apiFilters = toApiFilters(filters);

    // Ajouter le message user localement
    const userMessage: Message = {
      id: Date.now(),
      role: "user",
      content: question,
    };
    setMessages((prev) => [...prev, userMessage]);
    setQuestion("");

    try {
      const data = await api.analyzeInConversation(convId, question, apiFilters, useContext);

      const assistantMessage: Message = {
        id: data.message_id,
        role: "assistant",
        content: data.message,
        sql: data.sql,
        sql_error: data.sql_error,
        chart: data.chart,
        data: data.data,
        chart_disabled: data.chart_disabled,
        chart_disabled_reason: data.chart_disabled_reason,
        model_name: data.model_name,
        tokens_input: data.tokens_input,
        tokens_output: data.tokens_output,
        response_time_ms: data.response_time_ms,
      };

      setMessages((prev) => [...prev, assistantMessage]);
      setSelectedMessage(assistantMessage);
      await loadConversations();
    } catch (e) {
      // Erreur technique → affichée dans le footer, pas dans la conversation
      setError(e instanceof Error ? e.message : "Erreur inconnue");
      // Supprimer le message user qui n'a pas abouti
      setMessages((prev) => prev.filter((m) => m.id !== userMessage.id));
    } finally {
      setLoading(false);
    }
  }, [question, loading, currentConversationId, createNewConversation, toApiFilters, loadConversations, useContext]);

  const handleLoadConversation = useCallback(async (conv: Conversation) => {
    setCurrentConversationId(conv.id);
    try {
      const msgs = await api.fetchConversationMessages(conv.id);
      setMessages(msgs);
      // Sélectionner le dernier message assistant avec chart
      const lastAssistant = [...msgs].reverse().find(m => m.role === "assistant" && m.chart);
      setSelectedMessage(lastAssistant || null);
      setShowHistory(false);
    } catch (e) {
      console.error("Erreur chargement messages:", e);
    }
  }, []);

  const handleNewConversation = useCallback(() => {
    setCurrentConversationId(null);
    setMessages([]);
    setSelectedMessage(null);
    localStorage.removeItem(STORAGE_KEY);
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
    handleLoadConversation,
    handleNewConversation,
    handleReplayMessage,
  };
}
