"use client";

import { Button } from "@/components/ui/button";
import { TrashIcon } from "@/components/icons";
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
  isGenerating: boolean;
  isDeleting: boolean;
  onGenerate: () => void;
  onDelete: () => void;
}

export function CatalogActions({
  hasContent,
  isGenerating,
  isDeleting,
  onGenerate,
  onDelete,
}: CatalogActionsProps) {
  return (
    <div className="flex items-center gap-2">
      {hasContent && (
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button
              disabled={isDeleting || isGenerating}
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
      <Button
        onClick={onGenerate}
        disabled={isGenerating || isDeleting}
        variant={hasContent ? "outline" : "default"}
        size="sm"
      >
        {isGenerating ? (
          <span className="flex items-center gap-2">
            <span className="w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin" />
            Génération...
          </span>
        ) : hasContent ? (
          "Régénérer"
        ) : (
          "Générer le catalogue"
        )}
      </Button>
    </div>
  );
}
