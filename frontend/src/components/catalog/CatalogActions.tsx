"use client";

import { Button } from "@/components/ui/button";
import { TrashIcon, DatabaseIcon, SparklesIcon } from "@/components/icons";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { t } from "@/hooks/useTranslation";

interface CatalogActionsProps {
  hasContent: boolean;
  isExtracting: boolean;
  isEnriching: boolean;
  isDeleting: boolean;
  onExtract: () => void;
  onEnrich: () => void;
  onDelete: () => void;
  enabledTablesCount: number;
}

export function CatalogActions({
  hasContent,
  isExtracting,
  isEnriching,
  isDeleting,
  onExtract,
  onEnrich,
  onDelete,
  enabledTablesCount,
}: CatalogActionsProps) {
  const isLoading = isExtracting || isEnriching || isDeleting;

  return (
    <div className="flex items-center gap-2">
      {hasContent && (
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button
              disabled={isLoading}
              variant="outline"
              size="sm"
              className="text-red-400 hover:text-red-300 hover:bg-red-500/10 border-red-500/30"
            >
              {isDeleting ? (
                <span className="flex items-center gap-2">
                  <span className="w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin" />
                  {t("common.deleting")}
                </span>
              ) : (
                <>
                  <TrashIcon size={16} className="mr-1" />
                  {t("common.delete")}
                </>
              )}
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>{t("catalog.delete_confirm_title")}</AlertDialogTitle>
              <AlertDialogDescription>
                {t("catalog.delete_confirm_desc")}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
              <AlertDialogAction
                onClick={onDelete}
                className="bg-red-600 hover:bg-red-700"
              >
                {t("common.delete")}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}

      {/* Bouton Extraire - Étape 1 */}
      <Button
        onClick={onExtract}
        disabled={isLoading}
        variant="outline"
        size="sm"
      >
        {isExtracting ? (
          <span className="flex items-center gap-2">
            <span className="w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin" />
            {t("common.extracting")}
          </span>
        ) : (
          <>
            <DatabaseIcon size={16} className="mr-1" />
            {hasContent ? t("catalog.re_extract") : t("catalog.extract")}
          </>
        )}
      </Button>

      {/* Bouton Enrichir - Étape 2 (seulement si contenu existe) */}
      {hasContent && (
        <Button
          onClick={onEnrich}
          disabled={isLoading || enabledTablesCount === 0}
          variant="default"
          size="sm"
          title={enabledTablesCount === 0 ? t("catalog.enable_at_least_one") : t("catalog.enrich_tables", { count: enabledTablesCount })}
        >
          {isEnriching ? (
            <span className="flex items-center gap-2">
              <span className="w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin" />
              {t("common.enriching")}
            </span>
          ) : (
            <>
              <SparklesIcon size={16} className="mr-1" />
              {t("catalog.enrich_tables", { count: enabledTablesCount })}
            </>
          )}
        </Button>
      )}
    </div>
  );
}
