import { create } from "zustand";
import { devtools, persist } from "zustand/middleware";
import * as api from "@/lib/api";
import { Message, Conversation } from "@/types";

const STORAGE_KEY = "g7_current_conversation_id";

export interface Filters {
  dateStart: string;
  dateEnd: string;
  noteMin: string;
  noteMax: string;
}

export interface ConversationStore {
  // State
  question: string;
  loading: boolean;
  messages: Message[];
  selectedMessage: Message | null;
  conversations: Conversation[];
  currentConversationId: number | null;
  showHistory: boolean;
  useContext: boolean;
  error: string | null;

  // Internal ref for abort controller
  _abortController: AbortController | null;

  // Setters
  setQuestion: (q: string) => void;
  setSelectedMessage: (msg: Message | null) => void;
  setShowHistory: (show: boolean) => void;
  setUseContext: (use: boolean) => void;
  clearError: () => void;

  // Actions
  loadConversations: () => Promise<void>;
  restoreSession: () => Promise<void>;
  handleSubmit: (filters: Filters) => Promise<void>;
  handleStop: () => void;
  handleLoadConversation: (conv: Conversation) => Promise<void>;
  handleNewConversation: () => void;
  handleReplayMessage: (msg: Message) => void;
  deleteAllConversations: () => Promise<number>;
}

// Convert UI filters to API filters (only non-empty values)
function toApiFilters(filters: Filters): api.AnalysisFilters | undefined {
  const apiFilters: api.AnalysisFilters = {};
  if (filters.dateStart) apiFilters.dateStart = filters.dateStart;
  if (filters.dateEnd) apiFilters.dateEnd = filters.dateEnd;
  if (filters.noteMin) apiFilters.noteMin = filters.noteMin;
  if (filters.noteMax) apiFilters.noteMax = filters.noteMax;
  return Object.keys(apiFilters).length > 0 ? apiFilters : undefined;
}

export const useConversationStore = create<ConversationStore>()(
  devtools(
    persist(
      (set, get) => ({
        // Initial state
        question: "",
        loading: false,
        messages: [],
        selectedMessage: null,
        conversations: [],
        currentConversationId: null,
        showHistory: false,
        useContext: false,
        error: null,
        _abortController: null,

        // Setters
        setQuestion: (q) => set({ question: q }),
        setSelectedMessage: (msg) => set({ selectedMessage: msg }),
        setShowHistory: (show) => set({ showHistory: show }),
        setUseContext: (use) => set({ useContext: use }),
        clearError: () => set({ error: null }),

        // Actions
        loadConversations: async () => {
          try {
            const convs = await api.fetchConversations();
            set({ conversations: convs });
          } catch (e) {
            console.error("Error loading conversations:", e);
          }
        },

        restoreSession: async () => {
          const savedId = localStorage.getItem(STORAGE_KEY);
          if (!savedId) return;

          const convId = parseInt(savedId, 10);
          if (isNaN(convId)) return;

          try {
            const msgs = await api.fetchConversationMessages(convId);
            if (msgs.length > 0) {
              // Find last assistant message with chart
              const lastAssistant = [...msgs].reverse().find((m) => m.role === "assistant" && m.chart);

              set({
                currentConversationId: convId,
                messages: msgs,
                selectedMessage: lastAssistant || null,
              });
            }
          } catch (e) {
            console.warn("Conversation not found, removing from localStorage:", e);
            localStorage.removeItem(STORAGE_KEY);
          }
        },

        handleSubmit: async (filters) => {
          const state = get();
          if (!state.question.trim() || state.loading) return;

          // Create AbortController
          const abortController = new AbortController();
          set({ loading: true, _abortController: abortController });

          // Create conversation if needed
          let convId = state.currentConversationId;
          if (!convId) {
            try {
              convId = await api.createConversation();
              if (convId) {
                set({ currentConversationId: convId, messages: [], selectedMessage: null });
                await get().loadConversations();
              }
            } catch (e) {
              console.error("Error creating conversation:", e);
              set({ loading: false, _abortController: null });
              return;
            }
          }

          if (!convId) {
            set({ loading: false, _abortController: null });
            return;
          }

          // Persist conversation ID
          localStorage.setItem(STORAGE_KEY, String(convId));

          // Convert filters for API
          const apiFilters = toApiFilters(filters);

          // Add user message locally
          const userMessage: Message = {
            id: Date.now(),
            role: "user",
            content: state.question,
          };

          set((s) => ({
            messages: [...s.messages, userMessage],
            question: "",
          }));

          try {
            const data = await api.analyzeInConversation(
              convId,
              state.question,
              apiFilters,
              state.useContext,
              abortController.signal
            );

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

            set((s) => ({
              messages: [...s.messages, assistantMessage],
              selectedMessage: assistantMessage,
            }));

            await get().loadConversations();
          } catch (e) {
            if (e instanceof Error && e.name === "AbortError") {
              // User cancelled - remove user message
              set((s) => ({
                messages: s.messages.filter((m) => m.id !== userMessage.id),
              }));
            } else {
              const errorMessage = e instanceof Error ? e.message : "Unknown error";

              // Detect "no dataset" error
              const noDatasetPatterns = ["aucun dataset actif", "no dataset", "no_dataset"];
              const isNoDatasetError = noDatasetPatterns.some((p) =>
                errorMessage.toLowerCase().includes(p)
              );

              if (isNoDatasetError) {
                const errorAssistantMessage: Message = {
                  id: Date.now() + 1,
                  role: "assistant",
                  content: errorMessage,
                  sql_error: errorMessage,
                };
                set((s) => ({
                  messages: [...s.messages, errorAssistantMessage],
                  selectedMessage: errorAssistantMessage,
                }));
              } else {
                // Technical error - show in footer, remove failed user message
                set((s) => ({
                  error: errorMessage,
                  messages: s.messages.filter((m) => m.id !== userMessage.id),
                }));
              }
            }
          } finally {
            set({ loading: false, _abortController: null });
          }
        },

        handleStop: () => {
          const state = get();
          if (state._abortController) {
            state._abortController.abort();
          }
        },

        handleLoadConversation: async (conv) => {
          set({ currentConversationId: conv.id });
          localStorage.setItem(STORAGE_KEY, String(conv.id));

          try {
            const msgs = await api.fetchConversationMessages(conv.id);
            const lastAssistant = [...msgs].reverse().find((m) => m.role === "assistant" && m.chart);

            set({
              messages: msgs,
              selectedMessage: lastAssistant || null,
              showHistory: false,
            });
          } catch (e) {
            console.error("Error loading messages:", e);
          }
        },

        handleNewConversation: () => {
          set({
            currentConversationId: null,
            messages: [],
            selectedMessage: null,
          });
          localStorage.removeItem(STORAGE_KEY);
        },

        handleReplayMessage: (msg) => {
          if (msg.role === "user") {
            set({ question: msg.content });
          }
        },

        deleteAllConversations: async () => {
          try {
            const count = await api.deleteAllConversations();
            if (count > 0) {
              get().handleNewConversation();
              await get().loadConversations();
            }
            return count;
          } catch (e) {
            console.error("Error deleting conversations:", e);
            return 0;
          }
        },
      }),
      {
        name: "conversation-storage",
        // Only persist minimal UI state, not messages (they're in DB)
        partialize: (state) => ({
          useContext: state.useContext,
        }),
      }
    ),
    { name: "ConversationStore" }
  )
);

/**
 * For usage outside React (utilities, other stores)
 */
export const conversationStoreActions = {
  getSelectedMessage: () => useConversationStore.getState().selectedMessage,
  getMessages: () => useConversationStore.getState().messages,
  getCurrentConversationId: () => useConversationStore.getState().currentConversationId,
};
