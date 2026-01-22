"use client";

import { Badge } from "@/components/ui/badge";
import { CheckIcon, ClockIcon, AlertIcon } from "@/components/icons";
import { useTranslation } from "@/hooks/useTranslation";
import type { DatasourceSyncStatus } from "@/lib/api";

interface DatasourceSyncBadgeProps {
  status: DatasourceSyncStatus | null;
}

export function DatasourceSyncBadge({ status }: DatasourceSyncBadgeProps) {
  const { t } = useTranslation();

  switch (status) {
    case "running":
      return (
        <Badge className="bg-status-info/20 text-status-info border-status-info/30">
          <span className="w-2 h-2 bg-status-info rounded-full animate-pulse mr-1.5" />
          {t("datasource.status_running")}
        </Badge>
      );
    case "success":
      return (
        <Badge className="bg-status-success/20 text-status-success border-status-success/30">
          <CheckIcon size={10} className="mr-1" />
          {t("datasource.status_success")}
        </Badge>
      );
    case "partial_success":
      return (
        <Badge className="bg-status-warning/20 text-status-warning border-status-warning/30">
          <AlertIcon size={10} className="mr-1" />
          {t("datasource.status_partial_success")}
        </Badge>
      );
    case "error":
      return (
        <Badge className="bg-status-error/20 text-status-error border-status-error/30">
          <AlertIcon size={10} className="mr-1" />
          {t("datasource.status_error")}
        </Badge>
      );
    default:
      return (
        <Badge variant="secondary" className="text-muted-foreground">
          <ClockIcon size={10} className="mr-1" />
          {t("datasource.status_idle")}
        </Badge>
      );
  }
}
