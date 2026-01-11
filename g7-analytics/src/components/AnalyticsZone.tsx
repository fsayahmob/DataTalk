"use client";

import { Button } from "@/components/ui/button";
import { SemanticStats, SavedReport, GlobalStats } from "@/types";
import { ChartIcon, ChevronRightIcon, SaveIcon } from "@/components/icons";

interface AnalyticsZoneProps {
  collapsed: boolean;
  onCollapse: (collapsed: boolean) => void;
  width: number;
  isResizing: boolean;
  semanticStats: SemanticStats | null;
  globalStats: GlobalStats | null;
  savedReports: SavedReport[];
  onReportClick: (report: SavedReport) => void;
  onReportDelete: (id: number) => void;
}

export function AnalyticsZone({
  collapsed,
  onCollapse,
  width,
  isResizing,
  semanticStats,
  globalStats,
  savedReports,
  onReportClick,
  onReportDelete,
}: AnalyticsZoneProps) {
  return (
    <div
      className={`flex flex-col bg-[hsl(260_10%_10%)] ${collapsed ? "w-14" : ""} ${isResizing ? "" : "transition-all duration-300 ease-in-out"}`}
      style={collapsed ? undefined : { width: `${width}%` }}
    >
      {collapsed ? (
        <div className="flex-1 flex flex-col items-center pt-3">
          <button
            onClick={() => onCollapse(false)}
            className="w-10 h-10 bg-secondary hover:bg-accent rounded-lg flex items-center justify-center transition-colors"
            title="Ouvrir Analyse IA"
          >
            <ChartIcon size={16} />
          </button>
        </div>
      ) : (
        <>
          {/* Header Zone 3 */}
          <div className="h-12 px-3 border-b border-amber-500/20 bg-gradient-to-r from-amber-500/10 to-transparent flex items-center justify-between">
            <h3 className="text-xs font-semibold text-amber-400 uppercase tracking-wider flex items-center gap-2">
              <ChartIcon size={14} />
              Analyse IA
            </h3>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 w-7 p-0 hover:bg-amber-500/20"
              onClick={() => onCollapse(true)}
              title="Réduire le panneau"
            >
              <ChevronRightIcon size={14} />
            </Button>
          </div>

          {/* Contenu scrollable */}
          <div className="flex-1 overflow-y-auto">
            {/* KPIs Globaux - Compact */}
            {globalStats && (
              <div className="p-2 border-b border-amber-500/10">
                <div className="grid grid-cols-4 gap-1">
                  <div className="text-center p-1.5 rounded bg-secondary/30">
                    <p className="text-[8px] text-muted-foreground uppercase">Éval.</p>
                    <p className="text-xs font-bold text-foreground">{globalStats.total_evaluations?.toLocaleString("fr-FR") ?? "—"}</p>
                  </div>
                  <div className="text-center p-1.5 rounded bg-secondary/30">
                    <p className="text-[8px] text-muted-foreground uppercase">Note</p>
                    <p className="text-xs font-bold text-primary">{globalStats.note_moyenne?.toFixed(1) ?? "—"}</p>
                  </div>
                  <div className="text-center p-1.5 rounded bg-secondary/30">
                    <p className="text-[8px] text-muted-foreground uppercase">Com.</p>
                    <p className="text-xs font-bold text-foreground">{globalStats.total_commentaires?.toLocaleString("fr-FR") ?? "—"}</p>
                  </div>
                  <div className="text-center p-1.5 rounded bg-secondary/30">
                    <p className="text-[8px] text-muted-foreground uppercase">Chauff.</p>
                    <p className="text-xs font-bold text-foreground">{globalStats.total_chauffeurs?.toLocaleString("fr-FR") ?? "—"}</p>
                  </div>
                </div>
              </div>
            )}

            {/* Rapports sauvegardés - En premier, hauteur limitée */}
            <div className="p-2 max-h-[140px] overflow-y-auto border-b border-amber-500/10">
              <h4 className="text-[10px] text-amber-400/70 uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
                <SaveIcon size={10} />
                Rapports
              </h4>
              <div className="space-y-1">
                {savedReports.length === 0 ? (
                  <p className="text-[10px] text-muted-foreground text-center py-1">
                    Aucun rapport
                  </p>
                ) : (
                  savedReports.slice(0, 5).map((report) => (
                    <div
                      key={report.id}
                      className="p-1.5 rounded border border-border/50 hover:bg-secondary/50 hover:border-primary/30 transition-all group cursor-pointer"
                      onClick={() => onReportClick(report)}
                    >
                      <div className="flex items-center justify-between">
                        <p className="text-[10px] font-medium truncate text-foreground flex-1">
                          {report.is_pinned ? <span className="text-primary mr-1">●</span> : null}
                          {report.title}
                        </p>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            onReportDelete(report.id);
                          }}
                          className="text-[8px] text-destructive opacity-0 group-hover:opacity-100 transition-opacity ml-1"
                        >
                          ✕
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* KPIs Sémantiques */}
            {semanticStats && (
              <div className="p-3 space-y-3">
                {/* KPI Cards */}
                <div className="grid grid-cols-2 gap-2">
                  <div className="bg-gradient-to-br from-emerald-500/10 to-transparent border border-emerald-500/20 rounded-lg p-2.5 text-center relative group">
                    <div className="absolute top-1 right-1 w-4 h-4 rounded-full bg-emerald-500/20 flex items-center justify-center cursor-help hover:bg-emerald-500/40 transition-colors peer">
                      <span className="text-[9px] font-medium text-emerald-400">i</span>
                    </div>
                    <div className="absolute top-6 right-0 opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity duration-200 z-[100]">
                      <div className="bg-zinc-900 border border-zinc-700 rounded-lg p-2.5 text-[10px] text-zinc-300 w-44 shadow-2xl">
                        Score moyen de sentiment des commentaires analysés. Échelle de -1 (très négatif) à +1 (très positif).
                      </div>
                    </div>
                    <p className="text-[10px] text-emerald-400/70 uppercase tracking-wider">Sentiment</p>
                    <p className={`text-lg font-bold ${semanticStats.global.sentiment_moyen >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                      {semanticStats.global.sentiment_moyen >= 0 ? '+' : ''}{semanticStats.global.sentiment_moyen.toFixed(2)}
                    </p>
                  </div>
                  <div className="bg-gradient-to-br from-blue-500/10 to-transparent border border-blue-500/20 rounded-lg p-2.5 text-center relative group">
                    <div className="absolute top-1 right-1 w-4 h-4 rounded-full bg-blue-500/20 flex items-center justify-center cursor-help hover:bg-blue-500/40 transition-colors">
                      <span className="text-[9px] font-medium text-blue-400">i</span>
                    </div>
                    <div className="absolute top-6 right-0 opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity duration-200 z-[100]">
                      <div className="bg-zinc-900 border border-zinc-700 rounded-lg p-2.5 text-[10px] text-zinc-300 w-44 shadow-2xl">
                        Pourcentage de commentaires analysés par l&apos;IA ({semanticStats.global.commentaires_enrichis.toLocaleString('fr-FR')} / {semanticStats.global.total_commentaires.toLocaleString('fr-FR')}).
                      </div>
                    </div>
                    <p className="text-[10px] text-blue-400/70 uppercase tracking-wider">Enrichis</p>
                    <p className="text-lg font-bold text-blue-400">
                      {semanticStats.global.taux_enrichissement}%
                    </p>
                  </div>
                </div>

                {/* Sentiment Distribution - Mini Bar Chart */}
                <div className="bg-secondary/30 rounded-lg p-2.5 relative group">
                  <div className="absolute top-2 right-2 w-4 h-4 rounded-full bg-muted hover:bg-muted/80 flex items-center justify-center cursor-help transition-colors">
                    <span className="text-[9px] font-medium text-muted-foreground">i</span>
                  </div>
                  <div className="absolute top-7 right-0 opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity duration-200 z-[100]">
                    <div className="bg-zinc-900 border border-zinc-700 rounded-lg p-2.5 text-[10px] text-zinc-300 w-48 shadow-2xl">
                      Répartition des commentaires par niveau de sentiment. Le % indique la proportion sur le total analysé.
                    </div>
                  </div>
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-2">Distribution Sentiments</p>
                  <div className="space-y-1.5">
                    {semanticStats.sentiment_distribution.map((item, idx) => {
                      const total = semanticStats.sentiment_distribution.reduce((a, b) => a + b.count, 0);
                      const pct = (item.count / total * 100).toFixed(0);
                      const colors: Record<string, string> = {
                        'Très positif': 'bg-emerald-500',
                        'Positif': 'bg-emerald-400',
                        'Neutre': 'bg-gray-400',
                        'Négatif': 'bg-orange-400',
                        'Très négatif': 'bg-red-500'
                      };
                      return (
                        <div key={idx} className="flex items-center gap-2">
                          <span className="text-[10px] text-muted-foreground min-w-[4.5rem] shrink-0">{item.label}</span>
                          <div className="flex-1 h-2 bg-secondary rounded-full overflow-hidden min-w-[2rem]">
                            <div
                              className={`h-full ${colors[item.label] || 'bg-primary'} transition-all`}
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                          <span className="text-[10px] text-muted-foreground whitespace-nowrap">{pct}%</span>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* ALERTES - Catégories avec sentiment négatif */}
                {semanticStats.alerts && semanticStats.alerts.length > 0 && (
                  <div className="bg-gradient-to-br from-red-500/10 to-transparent border border-red-500/20 rounded-lg p-2.5 relative group">
                    <div className="absolute top-2 right-2 w-4 h-4 rounded-full bg-red-500/20 hover:bg-red-500/40 flex items-center justify-center cursor-help transition-colors">
                      <span className="text-[9px] font-medium text-red-400">i</span>
                    </div>
                    <div className="absolute top-7 right-0 opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity duration-200 z-[100]">
                      <div className="bg-zinc-900 border border-zinc-700 rounded-lg p-2.5 text-[10px] text-zinc-300 w-52 shadow-2xl">
                        <p className="font-medium text-red-400 mb-1">Points d&apos;attention</p>
                        <p>Catégories avec le plus de commentaires négatifs. Ce sont les axes d&apos;amélioration prioritaires.</p>
                      </div>
                    </div>
                    <p className="text-[10px] text-red-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                      <span>⚠</span> Alertes
                    </p>
                    <div className="space-y-1.5">
                      {semanticStats.alerts.map((item, idx) => {
                        const displayName = item.category.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, l => l.toUpperCase());
                        return (
                          <div key={idx} className="flex items-center gap-2 p-1.5 bg-red-500/5 rounded border border-red-500/10">
                            <span className="text-[10px] text-foreground/80 truncate min-w-0 flex-1" title={displayName}>
                              {displayName}
                            </span>
                            <span className="text-[9px] text-muted-foreground whitespace-nowrap">{item.count.toLocaleString('fr-FR')}</span>
                            <span className="text-[10px] font-medium text-red-400 whitespace-nowrap">
                              {item.sentiment.toFixed(2)}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* POINTS FORTS - Catégories avec sentiment positif */}
                {semanticStats.strengths && semanticStats.strengths.length > 0 && (
                  <div className="bg-gradient-to-br from-emerald-500/10 to-transparent border border-emerald-500/20 rounded-lg p-2.5 relative group">
                    <div className="absolute top-2 right-2 w-4 h-4 rounded-full bg-emerald-500/20 hover:bg-emerald-500/40 flex items-center justify-center cursor-help transition-colors">
                      <span className="text-[9px] font-medium text-emerald-400">i</span>
                    </div>
                    <div className="absolute top-7 right-0 opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity duration-200 z-[100]">
                      <div className="bg-zinc-900 border border-zinc-700 rounded-lg p-2.5 text-[10px] text-zinc-300 w-52 shadow-2xl">
                        <p className="font-medium text-emerald-400 mb-1">Points forts</p>
                        <p>Catégories avec le plus de commentaires positifs. Ce sont vos atouts à capitaliser.</p>
                      </div>
                    </div>
                    <p className="text-[10px] text-emerald-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                      <span>✓</span> Points Forts
                    </p>
                    <div className="space-y-1.5">
                      {semanticStats.strengths.map((item, idx) => {
                        const displayName = item.category.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, l => l.toUpperCase());
                        return (
                          <div key={idx} className="flex items-center gap-2 p-1.5 bg-emerald-500/5 rounded border border-emerald-500/10">
                            <span className="text-[10px] text-foreground/80 truncate min-w-0 flex-1" title={displayName}>
                              {displayName}
                            </span>
                            <span className="text-[9px] text-muted-foreground whitespace-nowrap">{item.count.toLocaleString('fr-FR')}</span>
                            <span className="text-[10px] font-medium text-emerald-400 whitespace-nowrap">
                              +{item.sentiment.toFixed(2)}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

              </div>
            )}

          </div>
        </>
      )}
    </div>
  );
}
