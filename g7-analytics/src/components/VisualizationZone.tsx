"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Chart } from "@/components/Chart";
import { DataTable } from "@/components/DataTable";
import { Message } from "@/types";

interface VisualizationZoneProps {
  selectedMessage: Message | null;
  onSaveReport: () => void;
  // Filtres - exposés pour que page.tsx puisse les utiliser dans la question
  filters: {
    dateStart: string;
    dateEnd: string;
    noteMin: string;
    noteMax: string;
  };
  onFiltersChange: (filters: {
    dateStart: string;
    dateEnd: string;
    noteMin: string;
    noteMax: string;
  }) => void;
}

export function VisualizationZone({
  selectedMessage,
  onSaveReport,
  filters,
  onFiltersChange,
}: VisualizationZoneProps) {
  const [showFilters, setShowFilters] = useState(false);

  const { dateStart, dateEnd, noteMin, noteMax } = filters;

  const setDateStart = (v: string) => onFiltersChange({ ...filters, dateStart: v });
  const setDateEnd = (v: string) => onFiltersChange({ ...filters, dateEnd: v });
  const setNoteMin = (v: string) => onFiltersChange({ ...filters, noteMin: v });
  const setNoteMax = (v: string) => onFiltersChange({ ...filters, noteMax: v });

  const resetFilters = () => {
    onFiltersChange({ dateStart: "", dateEnd: "", noteMin: "", noteMax: "" });
  };

  const activeFiltersCount = [dateStart, dateEnd, noteMin, noteMax].filter(Boolean).length;

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-[hsl(260_10%_10%)]">
      {/* Zone 2.1: Header + KPIs (fixe) */}
      <div className="border-b-2 border-red-500/30">
        {/* Header Zone 2 - Rouge G7 */}
        <div className="h-12 px-3 flex items-center justify-between bg-gradient-to-r from-red-500/10 to-transparent border-b border-red-500/20">
          <h3 className="text-xs font-semibold text-red-400 uppercase tracking-wider flex items-center gap-2">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M3 3v18h18" />
              <path d="M18 9l-5 5-4-4-3 3" />
            </svg>
            Visualisation
          </h3>
          <div className="flex items-center gap-3">
            {selectedMessage && (
              <p className="text-xs text-muted-foreground">
                <span className="text-red-400">{selectedMessage.model_name}</span> • {selectedMessage.response_time_ms}ms
                {selectedMessage.tokens_input && selectedMessage.tokens_output && (
                  <> • {selectedMessage.tokens_input + selectedMessage.tokens_output} tokens</>
                )}
              </p>
            )}
            {selectedMessage?.sql && (
              <Button variant="outline" size="sm" onClick={onSaveReport} className="border-red-500/30 hover:bg-red-500/10 hover:text-red-400 hover:border-red-500/50">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="mr-1.5">
                  <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" />
                  <polyline points="17 21 17 13 7 13 7 21" />
                  <polyline points="7 3 7 8 15 8" />
                </svg>
                Sauvegarder
              </Button>
            )}
          </div>
        </div>

        {/* KPIs */}
        <div className="p-3 grid grid-cols-4 gap-3">
          <div className="bg-gradient-to-br from-card to-card/50 border border-border/50 rounded-xl p-3 text-center hover:border-primary/30 transition-colors">
            <p className="text-xs text-muted-foreground mb-1">Évaluations</p>
            <p className="text-xl font-bold text-foreground">64 385</p>
          </div>
          <div className="bg-gradient-to-br from-card to-card/50 border border-border/50 rounded-xl p-3 text-center hover:border-primary/30 transition-colors">
            <p className="text-xs text-muted-foreground mb-1">Note moyenne</p>
            <p className="text-xl font-bold text-primary">4.84</p>
          </div>
          <div className="bg-gradient-to-br from-card to-card/50 border border-border/50 rounded-xl p-3 text-center hover:border-primary/30 transition-colors">
            <p className="text-xs text-muted-foreground mb-1">Commentaires</p>
            <p className="text-xl font-bold text-foreground">7 256</p>
          </div>
          <div className="bg-gradient-to-br from-card to-card/50 border border-border/50 rounded-xl p-3 text-center hover:border-primary/30 transition-colors">
            <p className="text-xs text-muted-foreground mb-1">Chauffeurs</p>
            <p className="text-xl font-bold text-foreground">9 492</p>
          </div>
        </div>

        {/* Barre de filtres */}
        <div className="px-3 pb-3">
          <button
            onClick={() => setShowFilters(!showFilters)}
            className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className={`transition-transform ${showFilters ? "rotate-180" : ""}`}
            >
              <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
            </svg>
            Filtres
            {activeFiltersCount > 0 && (
              <span className="bg-primary text-primary-foreground text-xs px-1.5 py-0.5 rounded-full">
                {activeFiltersCount}
              </span>
            )}
          </button>

          {showFilters && (
            <div className="mt-3 p-3 bg-secondary/30 rounded-lg space-y-3">
              <div className="grid grid-cols-2 gap-3">
                {/* Date début */}
                <div>
                  <label className="text-xs text-muted-foreground block mb-1">Date début</label>
                  <Input
                    type="date"
                    value={dateStart}
                    onChange={(e) => setDateStart(e.target.value)}
                    className="h-8 text-sm"
                  />
                </div>
                {/* Date fin */}
                <div>
                  <label className="text-xs text-muted-foreground block mb-1">Date fin</label>
                  <Input
                    type="date"
                    value={dateEnd}
                    onChange={(e) => setDateEnd(e.target.value)}
                    className="h-8 text-sm"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                {/* Note min */}
                <div>
                  <label className="text-xs text-muted-foreground block mb-1">Note min</label>
                  <select
                    value={noteMin}
                    onChange={(e) => setNoteMin(e.target.value)}
                    className="w-full h-8 text-sm rounded-md border border-input bg-background px-3"
                  >
                    <option value="">Toutes</option>
                    <option value="1">1 ★</option>
                    <option value="2">2 ★</option>
                    <option value="3">3 ★</option>
                    <option value="4">4 ★</option>
                    <option value="5">5 ★</option>
                  </select>
                </div>
                {/* Note max */}
                <div>
                  <label className="text-xs text-muted-foreground block mb-1">Note max</label>
                  <select
                    value={noteMax}
                    onChange={(e) => setNoteMax(e.target.value)}
                    className="w-full h-8 text-sm rounded-md border border-input bg-background px-3"
                  >
                    <option value="">Toutes</option>
                    <option value="1">1 ★</option>
                    <option value="2">2 ★</option>
                    <option value="3">3 ★</option>
                    <option value="4">4 ★</option>
                    <option value="5">5 ★</option>
                  </select>
                </div>
              </div>

              {/* Actions filtres */}
              <div className="flex items-center justify-between pt-2">
                <button
                  onClick={resetFilters}
                  className="text-xs text-muted-foreground hover:text-foreground"
                >
                  Réinitialiser
                </button>
                <div className="text-xs text-muted-foreground">
                  Les filtres s'appliquent à la prochaine question
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {selectedMessage ? (
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Zone 2.2: Graphique (flexible) */}
          {selectedMessage.chart && selectedMessage.chart.type !== "none" && selectedMessage.data && (
            <div className="flex-1 min-h-0 border-b border-border/50 p-4 overflow-hidden bg-gradient-to-b from-transparent to-secondary/10">
              <div className="h-full">
                <Chart config={selectedMessage.chart} data={selectedMessage.data} />
              </div>
            </div>
          )}

          {/* Zone 2.3: Tableau de données (scrollable) */}
          <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
            <div className="p-3 border-b border-border/50 flex items-center justify-between bg-gradient-to-r from-secondary/20 to-transparent">
              <span className="text-sm font-medium flex items-center gap-2">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-primary">
                  <rect x="3" y="3" width="18" height="18" rx="2" />
                  <path d="M3 9h18M9 21V9" />
                </svg>
                Données ({selectedMessage.data?.length || 0} lignes)
              </span>
              {selectedMessage.sql && (
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(selectedMessage.sql || "");
                  }}
                  className="text-xs text-muted-foreground hover:text-primary flex items-center gap-1.5 transition-colors"
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                  </svg>
                  Copier SQL
                </button>
              )}
            </div>
            <div className="flex-1 overflow-auto p-3">
              {selectedMessage.data && selectedMessage.data.length > 0 ? (
                <DataTable data={selectedMessage.data} />
              ) : (
                <p className="text-sm text-muted-foreground text-center py-4">
                  Aucune donnée
                </p>
              )}
            </div>
          </div>
        </div>
      ) : (
        <div className="flex-1 flex items-center justify-center text-muted-foreground">
          <div className="text-center">
            <div className="w-20 h-20 mx-auto mb-4 bg-gradient-to-br from-primary/10 to-transparent rounded-2xl flex items-center justify-center">
              <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" className="text-primary/50">
                <path d="M3 3v18h18" />
                <path d="M18 9l-5 5-4-4-3 3" />
              </svg>
            </div>
            <p className="text-foreground/80 font-medium">G7 Analytics</p>
            <p className="text-sm mt-1">Posez une question pour visualiser les données</p>
          </div>
        </div>
      )}
    </div>
  );
}
