"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { SavedReport } from "@/types";
import { ChartIcon, ChevronRightIcon, SaveIcon, ShareIcon } from "@/components/icons";
import { KpiGridCompact } from "@/components/KpiCardCompact";
import { fetchKpis, KpiCompactData } from "@/lib/api";
import { t } from "@/hooks/useTranslation";

interface AnalyticsZoneProps {
  collapsed: boolean;
  onCollapse: (collapsed: boolean) => void;
  width: number;
  isResizing: boolean;
  savedReports: SavedReport[];
  onReportClick: (report: SavedReport) => void;
  onReportDelete: (id: number) => void;
}

// Données fallback si l'API n'est pas disponible
const fallbackKpis: KpiCompactData[] = [
  {
    id: "total-evaluations",
    title: "Total Évaluations",
    value: "—",
    footer: "Chargement...",
  },
  {
    id: "note-moyenne",
    title: "Note Moyenne",
    value: "—",
    footer: "Chargement...",
  },
  {
    id: "commentaires",
    title: "Commentaires",
    value: "—",
    footer: "Chargement...",
  },
  {
    id: "sentiment",
    title: "Sentiment",
    value: "—",
    footer: "Chargement...",
  },
];

export function AnalyticsZone({
  collapsed,
  onCollapse,
  width,
  isResizing,
  savedReports,
  onReportClick,
  onReportDelete,
}: AnalyticsZoneProps) {
  const [kpis, setKpis] = useState<KpiCompactData[]>(fallbackKpis);

  useEffect(() => {
    void fetchKpis().then((data) => {
      if (data.length > 0) {
        setKpis(data);
      }
    });
  }, []);

  return (
    <div
      className={`flex flex-col bg-background ${collapsed ? "w-14" : ""} ${isResizing ? "" : "transition-all duration-300 ease-in-out"}`}
      style={collapsed ? undefined : { width: `${width}%` }}
    >
      {collapsed ? (
        <div className="flex-1 flex flex-col items-center pt-3">
          <button
            onClick={() => onCollapse(false)}
            className="w-10 h-10 bg-secondary hover:bg-accent rounded-lg flex items-center justify-center transition-colors"
            title={t("analytics.open")}
          >
            <ChartIcon size={16} />
          </button>
        </div>
      ) : (
        <>
          {/* Header */}
          <div className="h-12 px-3 border-b border-border/50 bg-secondary/30 flex items-center justify-between flex-shrink-0">
            <h3 className="text-xs font-semibold text-amber-400 uppercase tracking-wider flex items-center gap-2">
              <ChartIcon size={14} />
              {t("analytics.title")}
            </h3>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 w-7 p-0 hover:bg-amber-500/20"
              onClick={() => onCollapse(true)}
              title={t("common.collapse")}
            >
              <ChevronRightIcon size={14} />
            </Button>
          </div>

          {/* Contenu scrollable */}
          <div className="flex-1 overflow-y-auto p-2 space-y-3">
            {/* Rapports sauvegardés */}
            {savedReports.length > 0 && (
              <div className="pb-2 border-b border-amber-500/10">
                <h4 className="text-[9px] text-amber-400/70 uppercase tracking-wider mb-1.5 flex items-center gap-1">
                  <SaveIcon size={9} />
                  {t("analytics.reports")}
                </h4>
                <div className="space-y-1">
                  {savedReports.slice(0, 5).map((report) => (
                    <div
                      key={report.id}
                      className="p-1.5 rounded border border-border/30 hover:bg-secondary/50 hover:border-primary/30 transition-all group cursor-pointer"
                      onClick={() => onReportClick(report)}
                    >
                      <div className="flex items-center justify-between">
                        <p className="text-[10px] truncate text-foreground/80 flex-1">
                          {report.is_pinned ? <span className="text-primary mr-1">●</span> : null}
                          {report.title}
                        </p>
                        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              const shareUrl = `${window.location.origin}/report/${report.share_token}`;
                              void navigator.clipboard.writeText(shareUrl);
                              toast.success(t("analytics.link_copied"), { description: shareUrl });
                            }}
                            className="text-[8px] text-primary hover:text-primary/80"
                            title={t("analytics.copy_share_link")}
                          >
                            <ShareIcon size={10} />
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              onReportDelete(report.id);
                            }}
                            className="text-[8px] text-destructive"
                          >
                            ✕
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* 4 KPIs en vertical */}
            <KpiGridCompact kpis={kpis} />
          </div>
        </>
      )}
    </div>
  );
}
