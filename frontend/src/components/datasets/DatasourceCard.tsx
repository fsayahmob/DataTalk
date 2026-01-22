"use client";

import { DatabaseIcon, TrashIcon, RefreshIcon } from "@/components/icons";
import { DatasourceSyncBadge } from "./DatasourceSyncBadge";
import { Button } from "@/components/ui/button";
import { formatDateFR } from "@/lib/utils";
import { getConnectorName } from "@/lib/connectors";
import { useTranslation } from "@/hooks/useTranslation";
import type { Datasource } from "@/lib/api";

interface DatasourceCardProps {
  datasource: Datasource;
  onSync: (id: number) => void;
  onDelete: (id: number) => void;
  onClick?: (datasource: Datasource) => void;
}

export function DatasourceCard({ datasource, onSync, onDelete, onClick }: DatasourceCardProps) {
  const { t } = useTranslation();
  const isRunning = datasource.sync_status === "running";

  const handleCardClick = (e: React.MouseEvent) => {
    // Ne pas ouvrir le panneau si on clique sur un bouton
    if ((e.target as HTMLElement).closest("button")) {
      return;
    }
    onClick?.(datasource);
  };

  return (
    <div
      className="bg-card border border-border rounded-xl p-4 hover:border-primary/30 transition-colors cursor-pointer"
      onClick={handleCardClick}
    >
      {/* Header */}
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-secondary rounded-lg">
            <DatabaseIcon size={20} className="text-muted-foreground" />
          </div>
          <div>
            <h3 className="font-medium text-foreground">{datasource.name}</h3>
            <p className="text-xs text-muted-foreground">
              {getConnectorName(datasource.source_type)}
            </p>
          </div>
        </div>
        <DatasourceSyncBadge status={datasource.sync_status} />
      </div>

      {/* Description */}
      {datasource.description && (
        <p className="text-sm text-muted-foreground mb-3 line-clamp-2">
          {datasource.description}
        </p>
      )}

      {/* Last sync info */}
      <div className="text-xs text-muted-foreground mb-4">
        {datasource.last_sync_at ? (
          <span>
            {t("datasource.last_sync")}: {formatDateFR(datasource.last_sync_at)}
          </span>
        ) : (
          <span className="italic">{t("datasource.never_synced")}</span>
        )}
      </div>

      {/* Error message if any */}
      {datasource.sync_status === "error" && datasource.last_sync_error && (
        <div className="text-xs text-status-error bg-status-error/10 rounded-lg p-2 mb-4 line-clamp-2">
          {datasource.last_sync_error}
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center gap-2">
        <Button
          onClick={() => onSync(datasource.id)}
          disabled={isRunning}
          size="sm"
          className="flex-1 gap-1.5"
        >
          <RefreshIcon size={14} className={isRunning ? "animate-spin" : ""} />
          {t("datasource.sync")}
        </Button>
        <Button
          onClick={() => onDelete(datasource.id)}
          variant="ghost"
          size="icon"
          className="h-8 w-8 text-muted-foreground hover:bg-destructive/20 hover:text-destructive"
          title={t("datasource.delete")}
        >
          <TrashIcon size={16} />
        </Button>
      </div>
    </div>
  );
}
