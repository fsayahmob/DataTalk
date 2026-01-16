"use client";

import { Button } from "@/components/ui/button";
import { ErrorDisplay } from "@/components/ErrorDisplay";
import { Message } from "@/types";
import { ChartIcon, SaveIcon, AlertIcon } from "@/components/icons";
import {
  FiltersPanel,
  SQLPanel,
  ChartPanel,
  TablePanel,
  type Filters,
} from "@/components/panels";
import { t } from "@/hooks/useTranslation";

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
    <div className="flex-1 flex flex-col overflow-hidden bg-background">
      {/* Header Zone 2 - avec border-b aligné avec les autres zones */}
      <div className="h-12 px-3 flex items-center justify-between bg-secondary/30 border-b border-red-500/30">
        <h3 className="text-xs font-semibold text-red-400 uppercase tracking-wider flex items-center gap-2">
          <ChartIcon size={14} />
          {t("visualization.title")}
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
              {t("visualization.save")}
            </Button>
          )}
        </div>
      </div>

      {/* Filtres - sous le header */}
      <FiltersPanel filters={filters} onFiltersChange={onFiltersChange} />

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

              {/* Zone 2.2: Graphique (flexible) ou warning si désactivé */}
              {selectedMessage.chart_disabled && selectedMessage.chart_disabled_reason ? (
                <div className="px-4 py-3 bg-yellow-500/10 border-b border-yellow-500/30">
                  <div className="flex items-start gap-2">
                    <AlertIcon size={16} className="text-yellow-500 mt-0.5 flex-shrink-0" />
                    <p className="text-sm text-yellow-200">{selectedMessage.chart_disabled_reason}</p>
                  </div>
                </div>
              ) : selectedMessage.chart && selectedMessage.chart.type !== "none" && selectedMessage.data && (
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
            <div className="w-20 h-20 mx-auto mb-4 bg-secondary/30 rounded-lg flex items-center justify-center">
              <ChartIcon size={40} className="text-primary/50" />
            </div>
            <p className="text-foreground/80 font-medium">{t("home.welcome")}</p>
            <p className="text-sm mt-1">{t("home.ask_question")}</p>
          </div>
        </div>
      )}
    </div>
  );
}
