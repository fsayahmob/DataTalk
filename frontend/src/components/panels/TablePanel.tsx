"use client";

import { useState } from "react";
import { DataTable } from "@/components/DataTable";
import { TableIcon, ExpandIcon, CollapseIcon } from "@/components/icons";
import { t } from "@/hooks/useTranslation";

interface TablePanelProps {
  data: Record<string, unknown>[];
}

export function TablePanel({ data }: TablePanelProps) {
  const [isFullscreen, setIsFullscreen] = useState(false);

  const content = (
    <div className="h-full overflow-auto">
      {data && data.length > 0 ? (
        <DataTable data={data} />
      ) : (
        <p className="text-sm text-muted-foreground text-center py-4">
          {t("visualization.no_data")}
        </p>
      )}
    </div>
  );

  if (isFullscreen) {
    return (
      <div className="fixed inset-0 z-50 bg-background flex flex-col">
        <div className="h-12 px-4 flex items-center justify-between border-b border-border">
          <span className="font-medium flex items-center gap-2">
            <TableIcon size={16} className="text-primary" />
            {t("visualization.data_rows", { count: data?.length || 0 })}
          </span>
          <button
            onClick={() => setIsFullscreen(false)}
            className="text-sm text-muted-foreground hover:text-foreground flex items-center gap-1.5 transition-colors"
          >
            <CollapseIcon size={14} />
            {t("common.exit_fullscreen")}
          </button>
        </div>
        <div className="flex-1 p-4 overflow-auto">
          {content}
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
      <div className="p-3 border-b border-border/50 flex items-center justify-between bg-secondary/20">
        <span className="text-sm font-medium flex items-center gap-2">
          <TableIcon size={14} className="text-primary" />
          {t("visualization.data_rows", { count: data?.length || 0 })}
        </span>
        <button
          onClick={() => setIsFullscreen(true)}
          className="text-xs text-muted-foreground hover:text-primary flex items-center gap-1.5 transition-colors"
        >
          <ExpandIcon size={12} />
          {t("common.fullscreen")}
        </button>
      </div>
      <div className="flex-1 overflow-auto p-3">
        {content}
      </div>
    </div>
  );
}
