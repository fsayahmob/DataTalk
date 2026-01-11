"use client";

import { Button } from "@/components/ui/button";
import { ErrorDisplay } from "@/components/ErrorDisplay";
import { Message } from "@/types";
import { ChartIcon, SaveIcon } from "@/components/icons";
import {
  FiltersPanel,
  SQLPanel,
  ChartPanel,
  TablePanel,
  type Filters,
} from "@/components/panels";

interface VisualizationZoneProps {
  selectedMessage: Message | null;
  onSaveReport: () => void;
  filters: Filters;
  onFiltersChange: (filters: Filters) => void;
}

export function VisualizationZone({
  selectedMessage,
  onSaveReport,
  filters,
  onFiltersChange,
}: VisualizationZoneProps) {
  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-[hsl(260_10%_10%)]">
      {/* Zone 2.1: Header + Filtres (fixe) */}
      <div className="border-b border-red-500/30">
        {/* Header Zone 2 - Rouge G7 */}
        <div className="h-10 px-3 flex items-center justify-between bg-gradient-to-r from-red-500/10 to-transparent">
          <h3 className="text-xs font-semibold text-red-400 uppercase tracking-wider flex items-center gap-2">
            <ChartIcon size={14} />
            Visualisation
          </h3>
          <div className="flex items-center gap-3">
            {selectedMessage && (
              <p className="text-[10px] text-muted-foreground">
                <span className="text-red-400">{selectedMessage.model_name}</span> • {selectedMessage.response_time_ms}ms
                {selectedMessage.tokens_input && selectedMessage.tokens_output && (
                  <> • <span title="Input tokens">↑{selectedMessage.tokens_input}</span> <span title="Output tokens">↓{selectedMessage.tokens_output}</span></>
                )}
              </p>
            )}
            {selectedMessage?.sql && (
              <Button variant="outline" size="sm" onClick={onSaveReport} className="h-7 text-xs border-red-500/30 hover:bg-red-500/10 hover:text-red-400 hover:border-red-500/50">
                <SaveIcon size={12} className="mr-1" />
                Sauvegarder
              </Button>
            )}
          </div>
        </div>

        {/* Filtres */}
        <FiltersPanel filters={filters} onFiltersChange={onFiltersChange} />
      </div>

      {selectedMessage ? (
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Si erreur SQL, afficher ErrorDisplay */}
          {selectedMessage.sql_error ? (
            <ErrorDisplay error={selectedMessage.sql_error} sql={selectedMessage.sql} />
          ) : (
            <>
              {/* SQL Panel */}
              {selectedMessage.sql && (
                <SQLPanel sql={selectedMessage.sql} />
              )}

              {/* Zone 2.2: Graphique (flexible) */}
              {selectedMessage.chart && selectedMessage.chart.type !== "none" && selectedMessage.data && (
                <ChartPanel config={selectedMessage.chart} data={selectedMessage.data} />
              )}

              {/* Zone 2.3: Tableau de données (scrollable) */}
              <TablePanel data={selectedMessage.data || []} />
            </>
          )}
        </div>
      ) : (
        <div className="flex-1 flex items-center justify-center text-muted-foreground">
          <div className="text-center">
            <div className="w-20 h-20 mx-auto mb-4 bg-gradient-to-br from-primary/10 to-transparent rounded-2xl flex items-center justify-center">
              <ChartIcon size={40} className="text-primary/50" />
            </div>
            <p className="text-foreground/80 font-medium">G7 Analytics</p>
            <p className="text-sm mt-1">Posez une question pour visualiser les données</p>
          </div>
        </div>
      )}
    </div>
  );
}
