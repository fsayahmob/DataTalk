"use client";

import { Button } from "@/components/ui/button";
import { DatabaseIcon } from "@/components/icons";

interface CatalogEmptyStateProps {
  isExtracting: boolean;
  onExtract: () => void;
}

export function CatalogEmptyState({ isExtracting, onExtract }: CatalogEmptyStateProps) {
  return (
    <div className="flex-1 flex items-center justify-center">
      <div className="text-center max-w-md">
        <div className="w-20 h-20 mx-auto mb-6 rounded-full bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center">
          <DatabaseIcon size={40} className="text-primary/60" />
        </div>
        <h3 className="text-xl font-semibold mb-2">Aucun catalogue</h3>
        <p className="text-sm text-muted-foreground mb-6">
          Le catalogue de données n&apos;a pas encore été créé.
          <br />
          <span className="text-primary/80 font-medium">Étape 1:</span> Extraire le schéma depuis DuckDB (rapide, sans LLM)
          <br />
          <span className="text-primary/80 font-medium">Étape 2:</span> Sélectionner les tables puis enrichir avec l&apos;IA
        </p>
        <Button onClick={onExtract} disabled={isExtracting} size="lg">
          {isExtracting ? (
            <span className="flex items-center gap-2">
              <span className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
              Extraction...
            </span>
          ) : (
            <>
              <DatabaseIcon size={16} className="mr-2" />
              Extraire le schéma
            </>
          )}
        </Button>
      </div>
    </div>
  );
}
