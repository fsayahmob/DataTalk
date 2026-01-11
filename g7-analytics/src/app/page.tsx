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
  SemanticStats,
  GlobalStats,
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
    handleSubmit: submitConversation,
    handleLoadConversation,
    handleNewConversation,
    handleReplayMessage,
  } = useConversation();

  // Données globales
  const [predefinedQuestions, setPredefinedQuestions] = useState<PredefinedQuestion[]>([]);
  const [savedReports, setSavedReports] = useState<SavedReport[]>([]);
  const [semanticStats, setSemanticStats] = useState<SemanticStats | null>(null);
  const [globalStats, setGlobalStats] = useState<GlobalStats | null>(null);

  // Filtres (objet pour VisualizationZone)
  const [filters, setFilters] = useState({
    dateStart: "",
    dateEnd: "",
    noteMin: "",
    noteMax: "",
  });

  const loadReports = useCallback(() => api.fetchSavedReports().then(setSavedReports), []);

  // Charger les données au démarrage
  useEffect(() => {
    api.fetchPredefinedQuestions().then(setPredefinedQuestions);
    loadReports();
    loadConversations();
    api.fetchSemanticStats().then(setSemanticStats);
    api.fetchGlobalStats().then(setGlobalStats);
  }, [loadReports, loadConversations]);

  // Wrapper pour handleSubmit avec les filtres
  const handleSubmit = useCallback((e: React.FormEvent) => {
    submitConversation(e, filters);
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
      loadReports();
      toast.success("Rapport sauvegardé", { description: title });
    } catch (e) {
      console.error("Erreur sauvegarde:", e);
      toast.error("Erreur lors de la sauvegarde");
    }
  };

  const handleDeleteReport = async (id: number) => {
    try {
      await api.deleteReport(id);
      loadReports();
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
          onLoadConversation={handleLoadConversation}
          onNewConversation={handleNewConversation}
          predefinedQuestions={predefinedQuestions}
          onQuestionClick={handleQuestionClick}
          onReplayMessage={handleReplayMessage}
          useContext={useContext}
          onUseContextChange={setUseContext}
        />

        {/* Resize Handle Zone 1 */}
        {!zone1Collapsed && (
          <div
            className="w-1 hover:w-1.5 bg-primary/20 hover:bg-primary/50 cursor-col-resize transition-all flex-shrink-0 group"
            onMouseDown={() => setIsResizing("zone1")}
          >
            <div className="h-full w-full flex items-center justify-center">
              <div className="w-0.5 h-8 bg-primary/30 group-hover:bg-primary/60 rounded-full" />
            </div>
          </div>
        )}

        {/* Zone 2: Visualisation */}
        <VisualizationZone
          selectedMessage={selectedMessage}
          onSaveReport={handleSaveReport}
          filters={filters}
          onFiltersChange={setFilters}
        />

        {/* Resize Handle Zone 3 */}
        {!zone3Collapsed && (
          <div
            className="w-1 hover:w-1.5 bg-amber-500/20 hover:bg-amber-500/50 cursor-col-resize transition-all flex-shrink-0 group"
            onMouseDown={() => setIsResizing("zone3")}
          >
            <div className="h-full w-full flex items-center justify-center">
              <div className="w-0.5 h-8 bg-amber-500/30 group-hover:bg-amber-500/60 rounded-full" />
            </div>
          </div>
        )}

        {/* Zone 3: Analytics */}
        <AnalyticsZone
          collapsed={zone3Collapsed}
          onCollapse={setZone3Collapsed}
          width={zone3Width}
          isResizing={isResizing !== null}
          semanticStats={semanticStats}
          globalStats={globalStats}
          savedReports={savedReports}
          onReportClick={handleReportClick}
          onReportDelete={handleDeleteReport}
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
