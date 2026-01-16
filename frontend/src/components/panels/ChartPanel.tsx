"use client";

import { useState } from "react";
import { Chart } from "@/components/Chart";
import { ChartIcon, ExpandIcon, CollapseIcon } from "@/components/icons";
import type { ChartConfig } from "@/types";
import { t } from "@/hooks/useTranslation";

interface ChartPanelProps {
  config: ChartConfig;
  data: Record<string, unknown>[];
}

export function ChartPanel({ config, data }: ChartPanelProps) {
  const [isFullscreen, setIsFullscreen] = useState(false);

  if (!config || config.type === "none" || !data || data.length === 0) {
    return null;
  }

  const content = (
    <div className="w-full h-full">
      <Chart config={config} data={data} height="100%" />
    </div>
  );

  if (isFullscreen) {
    return (
      <div className="fixed inset-0 z-50 bg-background flex flex-col">
        <div className="h-12 px-4 flex items-center justify-between border-b border-border">
          <span className="font-medium flex items-center gap-2">
            <ChartIcon size={16} className="text-primary" />
            {config.title || t("visualization.chart")}
          </span>
          <button
            onClick={() => setIsFullscreen(false)}
            className="text-sm text-muted-foreground hover:text-foreground flex items-center gap-1.5 transition-colors"
          >
            <CollapseIcon size={14} />
            {t("common.exit_fullscreen")}
          </button>
        </div>
        <div className="flex-1 p-4">
          {content}
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 min-h-[250px] max-h-[50vh] border-b border-border/50 p-4 overflow-hidden bg-secondary/5 flex flex-col">
      <div className="flex items-center justify-between mb-2 flex-shrink-0">
        <span className="text-sm font-medium flex items-center gap-2">
          <ChartIcon size={14} className="text-primary" />
          {config.title || t("visualization.chart")}
        </span>
        <button
          onClick={() => setIsFullscreen(true)}
          className="text-xs text-muted-foreground hover:text-primary flex items-center gap-1.5 transition-colors"
        >
          <ExpandIcon size={12} />
          {t("common.fullscreen")}
        </button>
      </div>
      <div className="flex-1 min-h-0">
        {content}
      </div>
    </div>
  );
}
