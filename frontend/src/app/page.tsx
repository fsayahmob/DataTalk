"use client";

import { useState, useEffect, useCallback } from "react";
import { toast } from "sonner";
import { ChatZone } from "@/components/ChatZone";
import { VisualizationZone } from "@/components/VisualizationZone";
import { AnalyticsZone } from "@/components/AnalyticsZone";
import * as api from "@/lib/api";
import { useLayout } from "@/hooks/useLayout";
import { useConversation } from "@/hooks/useConversation";
import {
  Message,
  PredefinedQuestion,
  SavedReport,
} from "@/types";

export default function Home() {
  // Layout (zones rétractables, redimensionnement)
  const {
    zone1Collapsed,
    zone3Collapsed,
    zone1Width,
    zone3Width,
    isResizing,
    containerRef,
    setZone1Collapsed,
    setZone3Collapsed,
    setIsResizing,
  } = useLayout();

  // Conversation (messages, historique, submit)
  const {
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
    handleSubmit: submitConversation,
    handleLoadConversation,
    handleNewConversation,
    handleReplayMessage,
  } = useConversation();

  // Données globales
  const [predefinedQuestions, setPredefinedQuestions] = useState<PredefinedQuestion[]>([]);
  const [savedReports, setSavedReports] = useState<SavedReport[]>([]);

  // Filtres (objet pour VisualizationZone)
  const [filters, setFilters] = useState({
    dateStart: "",
    dateEnd: "",
    noteMin: "",
    noteMax: "",
  });

  const loadReports = useCallback(() => api.fetchSavedReports().then(setSavedReports), []);

  // Charger les questions suggérées (générées par LLM lors de la création du catalogue)
  const loadQuestions = useCallback(() => {
    void api.fetchSuggestedQuestions().then(suggested => {
      const converted: PredefinedQuestion[] = suggested.map(q => ({
        id: q.id,
        question: q.question,
        category: q.category || "Exploration",
        icon: q.icon || "💬",
      }));
      setPredefinedQuestions(converted);
    });
  }, []);

  // Charger les données au démarrage et restaurer la session
  useEffect(() => {
    loadQuestions();
    void loadReports();
    void loadConversations();
    void restoreSession();
  }, [loadQuestions, loadReports, loadConversations, restoreSession]);

  // Recharger les questions quand la fenêtre reprend le focus
  // (utile après suppression/génération du catalogue sur une autre page)
  useEffect(() => {
    const handleFocus = () => loadQuestions();
    window.addEventListener("focus", handleFocus);
    return () => window.removeEventListener("focus", handleFocus);
  }, [loadQuestions]);

  // Écouter les changements de catalogue (suppression/enrichissement depuis /catalog)
  useEffect(() => {
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === "catalog-updated") {
        loadQuestions();
      }
    };
    window.addEventListener("storage", handleStorageChange);
    return () => window.removeEventListener("storage", handleStorageChange);
  }, [loadQuestions]);

  // Wrapper pour handleSubmit avec les filtres
  const handleSubmit = useCallback((e: React.FormEvent) => {
    void submitConversation(e, filters);
  }, [submitConversation, filters]);

  const handleQuestionClick = useCallback((q: string) => {
    setQuestion(q);
  }, [setQuestion]);

  const handleSaveReport = async () => {
    if (!selectedMessage || !selectedMessage.sql) return;

    // Trouver la question user associée pour le titre
    const selectedIndex = messages.findIndex((m) => m.id === selectedMessage.id);
    let title = selectedMessage.content.slice(0, 100);

    // Utiliser la question user comme titre si disponible
    if (selectedIndex > 0) {
      for (let i = selectedIndex - 1; i >= 0; i--) {
        if (messages[i].role === "user") {
          title = messages[i].content.slice(0, 100);
          break;
        }
      }
    }

    try {
      await api.saveReport(
        title,
        title, // La question est utilisée comme titre
        selectedMessage.sql,
        JSON.stringify(selectedMessage.chart),
        selectedMessage.id
      );
      void loadReports();
      toast.success("Rapport sauvegardé", { description: title });
    } catch (e) {
      console.error("Erreur sauvegarde:", e);
      toast.error("Erreur lors de la sauvegarde");
    }
  };

  const handleDeleteReport = async (id: number) => {
    try {
      await api.deleteReport(id);
      void loadReports();
      toast.success("Rapport supprimé");
    } catch (e) {
      console.error("Erreur suppression:", e);
      toast.error("Erreur lors de la suppression");
    }
  };

  const [reportLoading, setReportLoading] = useState(false);

  const handleReportClick = async (report: SavedReport) => {
    setReportLoading(true);
    try {
      const result = await api.executeReport(report.id);

      // Créer un message "virtuel" pour afficher le résultat
      const reportMessage: Message = {
        id: Date.now(),
        role: "assistant",
        content: result.title,
        sql: result.sql,
        chart: result.chart,
        data: result.data,
      };

      setSelectedMessage(reportMessage);
    } catch (e) {
      console.error("Erreur exécution rapport:", e);
      toast.error("Erreur d'exécution", {
        description: e instanceof Error ? e.message : "Erreur inconnue"
      });
    } finally {
      setReportLoading(false);
    }
  };

  const handleDeleteAllConversations = async () => {
    const count = await api.deleteAllConversations();
    if (count > 0) {
      toast.success(`${count} conversation(s) supprimée(s)`);
      handleNewConversation();
      void loadConversations();
    }
  };

  // Combiner les états de loading
  const isLoading = loading || reportLoading;

  return (
    <div ref={containerRef} className="flex-1 flex flex-col overflow-hidden relative">
      <div className="flex-1 flex overflow-hidden">
        {/* Zone 1: Chat */}
        <ChatZone
          collapsed={zone1Collapsed}
          onCollapse={setZone1Collapsed}
          width={zone1Width}
          isResizing={isResizing !== null}
          messages={messages}
          loading={isLoading}
          question={question}
          onQuestionChange={setQuestion}
          onSubmit={handleSubmit}
          selectedMessage={selectedMessage}
          onSelectMessage={setSelectedMessage}
          conversations={conversations}
          currentConversationId={currentConversationId}
          showHistory={showHistory}
          onShowHistoryChange={setShowHistory}
          onLoadConversation={(conv) => void handleLoadConversation(conv)}
          onNewConversation={handleNewConversation}
          predefinedQuestions={predefinedQuestions}
          onQuestionClick={handleQuestionClick}
          onReplayMessage={(msg) => void handleReplayMessage(msg)}
          useContext={useContext}
          onUseContextChange={setUseContext}
          onDeleteAllConversations={() => void handleDeleteAllConversations()}
        />

        {/* Resize Handle Zone 1 */}
        {!zone1Collapsed && (
          <div
            className="w-1 hover:w-1.5 bg-border/30 hover:bg-border/60 cursor-col-resize transition-all flex-shrink-0 group"
            onMouseDown={() => setIsResizing("zone1")}
          >
            <div className="h-full w-full flex items-center justify-center">
              <div className="w-0.5 h-8 bg-border/50 group-hover:bg-border rounded-full" />
            </div>
          </div>
        )}

        {/* Zone 2: Visualisation */}
        <VisualizationZone
          selectedMessage={selectedMessage}
          onSaveReport={() => void handleSaveReport()}
          filters={filters}
          onFiltersChange={setFilters}
        />

        {/* Resize Handle Zone 3 */}
        {!zone3Collapsed && (
          <div
            className="w-1 hover:w-1.5 bg-border/30 hover:bg-border/60 cursor-col-resize transition-all flex-shrink-0 group"
            onMouseDown={() => setIsResizing("zone3")}
          >
            <div className="h-full w-full flex items-center justify-center">
              <div className="w-0.5 h-8 bg-border/50 group-hover:bg-border rounded-full" />
            </div>
          </div>
        )}

        {/* Zone 3: Analytics */}
        <AnalyticsZone
          collapsed={zone3Collapsed}
          onCollapse={setZone3Collapsed}
          width={zone3Width}
          isResizing={isResizing !== null}
          savedReports={savedReports}
          onReportClick={(report) => void handleReportClick(report)}
          onReportDelete={(id) => void handleDeleteReport(id)}
        />
      </div>

      {/* Footer d'erreur */}
      {error && (
        <div className="bg-destructive/10 border-t border-destructive/30 px-4 py-2 flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm text-destructive">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            <span>{error}</span>
          </div>
          <button
            onClick={clearError}
            className="text-destructive hover:text-destructive/80 p-1"
            title="Fermer"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      )}
    </div>
  );
}
