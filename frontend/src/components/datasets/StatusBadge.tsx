"use client";

import type { Dataset } from "@/lib/api";
import { useTranslation } from "@/hooks/useTranslation";

interface StatusBadgeProps {
  status: Dataset["status"];
}

const statusConfig = {
  empty: { labelKey: "datasets.status_empty", className: "bg-muted text-muted-foreground" },
  syncing: { labelKey: "datasets.status_syncing", className: "bg-status-info/20 text-status-info" },
  ready: { labelKey: "datasets.status_ready", className: "bg-status-success/20 text-status-success" },
  error: { labelKey: "datasets.status_error", className: "bg-status-error/20 text-status-error" },
} as const;

export function StatusBadge({ status }: StatusBadgeProps) {
  const { t } = useTranslation();
  const { labelKey, className } = statusConfig[status];
  return (
    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${className}`}>
      {t(labelKey)}
    </span>
  );
}
