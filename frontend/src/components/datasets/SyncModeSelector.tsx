"use client";

import * as React from "react";
import { Badge } from "@/components/ui/badge";
import { Check, RefreshCw, Clock, Lock } from "lucide-react";
import { useTranslation } from "@/hooks/useTranslation";
import { SyncMode } from "@/lib/api/types";
import { cn } from "@/lib/utils";

interface SyncModeSelectorProps {
  value: SyncMode;
  onChange: (mode: SyncMode) => void;
}

export function SyncModeSelector({ value, onChange }: SyncModeSelectorProps) {
  const { t } = useTranslation();

  return (
    <div className="flex flex-col gap-4">
      {/* Full Refresh option */}
      <div
        className={cn(
          "relative flex flex-col p-4 rounded-lg border-2 cursor-pointer transition-colors",
          value === "full_refresh"
            ? "border-primary bg-primary/5"
            : "border-border hover:border-primary/50"
        )}
        onClick={() => onChange("full_refresh")}
      >
        <div className="flex items-start gap-3">
          <div
            className={cn(
              "flex h-5 w-5 items-center justify-center rounded-full border-2",
              value === "full_refresh"
                ? "border-primary bg-primary text-primary-foreground"
                : "border-muted-foreground"
            )}
          >
            {value === "full_refresh" && <Check className="h-3 w-3" />}
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <RefreshCw className="h-4 w-4" />
              <span className="font-medium">
                {t("datasourceWizard.fullRefresh")}
              </span>
            </div>
            <p className="text-sm text-muted-foreground mt-1">
              {t("datasourceWizard.fullRefreshDesc")}
            </p>
            <div className="flex flex-col gap-1 mt-3 text-sm">
              <div className="flex items-center gap-2 text-green-600 dark:text-green-400">
                <Check className="h-3 w-3" />
                {t("datasourceWizard.fullRefreshPro1")}
              </div>
              <div className="flex items-center gap-2 text-green-600 dark:text-green-400">
                <Check className="h-3 w-3" />
                {t("datasourceWizard.fullRefreshPro2")}
              </div>
              <div className="flex items-center gap-2 text-yellow-600 dark:text-yellow-400">
                <Clock className="h-3 w-3" />
                {t("datasourceWizard.fullRefreshCon")}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Incremental option (disabled) */}
      <div
        className={cn(
          "relative flex flex-col p-4 rounded-lg border-2 cursor-not-allowed opacity-60",
          "border-border bg-muted/30"
        )}
      >
        <Badge
          variant="secondary"
          className="absolute top-4 right-4 flex items-center gap-1"
        >
          <Lock className="h-3 w-3" />
          {t("datasourceWizard.comingSoon")}
        </Badge>
        <div className="flex items-start gap-3">
          <div className="flex h-5 w-5 items-center justify-center rounded-full border-2 border-muted-foreground" />
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <Clock className="h-4 w-4" />
              <span className="font-medium">
                {t("datasourceWizard.incremental")}
              </span>
            </div>
            <p className="text-sm text-muted-foreground mt-1">
              {t("datasourceWizard.incrementalDesc")}
            </p>
            <div className="flex flex-col gap-1 mt-3 text-sm text-muted-foreground">
              <div className="flex items-center gap-2">
                <Check className="h-3 w-3" />
                {t("datasourceWizard.incrementalPro1")}
              </div>
              <div className="flex items-center gap-2">
                <Check className="h-3 w-3" />
                {t("datasourceWizard.incrementalPro2")}
              </div>
              <div className="flex items-center gap-2">
                <Clock className="h-3 w-3" />
                {t("datasourceWizard.incrementalCon")}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
