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
                  Suppression...
                </span>
              ) : (
                <>
                  <TrashIcon size={16} className="mr-1" />
                  Supprimer
                </>
              )}
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Supprimer le catalogue ?</AlertDialogTitle>
              <AlertDialogDescription>
                Cette action est irréversible. Toutes les descriptions et métadonnées seront supprimées.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Annuler</AlertDialogCancel>
              <AlertDialogAction
                onClick={onDelete}
                className="bg-red-600 hover:bg-red-700"
              >
                Supprimer
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
            Extraction...
          </span>
        ) : (
          <>
            <DatabaseIcon size={16} className="mr-1" />
            {hasContent ? "Ré-extraire" : "Extraire"}
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
          title={enabledTablesCount === 0 ? "Activez au moins une table" : `Enrichir ${enabledTablesCount} table(s)`}
        >
          {isEnriching ? (
            <span className="flex items-center gap-2">
              <span className="w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin" />
              Enrichissement...
            </span>
          ) : (
            <>
              <SparklesIcon size={16} className="mr-1" />
              Enrichir ({enabledTablesCount})
            </>
          )}
        </Button>
      )}
    </div>
  );
}
