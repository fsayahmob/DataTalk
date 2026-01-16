"use client";

import { Button } from "@/components/ui/button";
import { DatabaseIcon } from "@/components/icons";
import { t } from "@/hooks/useTranslation";

interface CatalogEmptyStateProps {
  isExtracting: boolean;
  onExtract: () => void;
}

export function CatalogEmptyState({ isExtracting, onExtract }: CatalogEmptyStateProps) {
  return (
    <div className="flex-1 flex items-center justify-center">
      <div className="text-center max-w-md">
        <div className="w-20 h-20 mx-auto mb-6 rounded-lg bg-secondary/30 flex items-center justify-center">
          <DatabaseIcon size={40} className="text-primary/60" />
        </div>
        <h3 className="text-xl font-semibold mb-2">{t("catalog.no_catalog")}</h3>
        <p className="text-sm text-muted-foreground mb-6">
          {t("catalog.extract_schema")}
        </p>
        <Button onClick={onExtract} disabled={isExtracting} size="lg">
          {isExtracting ? (
            <span className="flex items-center gap-2">
              <span className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
              {t("common.extracting")}
            </span>
          ) : (
            <>
              <DatabaseIcon size={16} className="mr-2" />
              {t("catalog.extract_schema")}
            </>
          )}
        </Button>
      </div>
    </div>
  );
}
