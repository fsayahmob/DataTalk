"use client";

import Link from "next/link";
import { AlertTriangleIcon, CopyIcon, DatabaseIcon } from "@/components/icons";
import { t } from "@/hooks/useTranslation";

interface ErrorDisplayProps {
  error: string;
  sql?: string;
}

// Détecte si l'erreur est liée à l'absence de dataset
function isNoDatasetError(error: string): boolean {
  const noDatasetPatterns = [
    "aucun dataset actif",
    "no dataset",
    "no_dataset",
    "créez ou activez un dataset",
  ];
  const lowerError = error.toLowerCase();
  return noDatasetPatterns.some((pattern) => lowerError.includes(pattern));
}

// Composant spécifique pour l'erreur "pas de dataset"
function NoDatasetError() {
  return (
    <div className="flex-1 flex items-center justify-center p-6">
      <div className="max-w-md w-full text-center">
        <div className="w-16 h-16 bg-primary/10 rounded-2xl flex items-center justify-center mx-auto mb-6">
          <DatabaseIcon size={32} className="text-primary" />
        </div>
        <h3 className="text-xl font-semibold text-foreground mb-2">
          {t("error.no_dataset")}
        </h3>
        <p className="text-sm text-muted-foreground mb-6">
          {t("error.no_dataset_desc")}
        </p>
        <Link
          href="/datasets"
          className="inline-flex items-center gap-2 px-5 py-2.5 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors"
        >
          <DatabaseIcon size={16} />
          {t("error.no_dataset_action")}
        </Link>
      </div>
    </div>
  );
}

export function ErrorDisplay({ error, sql }: ErrorDisplayProps) {
  // Cas spécial: pas de dataset actif
  if (isNoDatasetError(error)) {
    return <NoDatasetError />;
  }

  const copyError = () => {
    const text = sql ? `SQL:\n${sql}\n\nErreur:\n${error}` : error;
    void navigator.clipboard.writeText(text);
  };

  return (
    <div className="flex-1 flex items-center justify-center p-6">
      <div className="max-w-lg w-full">
        <div className="bg-destructive/10 border border-destructive/30 rounded-xl p-6">
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 bg-destructive/20 rounded-xl flex items-center justify-center flex-shrink-0">
              <AlertTriangleIcon size={24} className="text-destructive" />
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="text-lg font-semibold text-destructive mb-2">
                {t("error.sql_execution")}
              </h3>
              <p className="text-sm text-muted-foreground mb-4">
                {t("error.sql_execution_desc")}
              </p>
              <div className="bg-background/50 rounded-lg p-3 font-mono text-xs text-destructive/90 break-words">
                {error}
              </div>
            </div>
          </div>

          {sql && (
            <div className="mt-4 pt-4 border-t border-destructive/20">
              <p className="text-xs text-muted-foreground mb-2">{t("error.sql_attempted")}</p>
              <pre className="bg-background/50 rounded-lg p-3 font-mono text-xs text-foreground/70 overflow-x-auto">
                {sql}
              </pre>
            </div>
          )}

          <div className="mt-4 flex justify-end">
            <button
              onClick={copyError}
              className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1.5 transition-colors"
            >
              <CopyIcon size={12} />
              {t("error.copy_details")}
            </button>
          </div>
        </div>

        <p className="text-xs text-muted-foreground text-center mt-4">
          {t("error.try_suggestion")}
        </p>
      </div>
    </div>
  );
}
