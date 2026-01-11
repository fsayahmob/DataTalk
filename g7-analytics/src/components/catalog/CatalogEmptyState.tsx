"use client";

import { Button } from "@/components/ui/button";

interface CatalogEmptyStateProps {
  isGenerating: boolean;
  onGenerate: () => void;
}

export function CatalogEmptyState({ isGenerating, onGenerate }: CatalogEmptyStateProps) {
  return (
    <div className="flex-1 flex items-center justify-center">
      <div className="text-center max-w-md">
        <div className="w-20 h-20 mx-auto mb-6 rounded-full bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center">
          <svg className="w-10 h-10 text-primary/60" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4m0 5c0 2.21-3.582 4-8 4s-8-1.79-8-4" />
          </svg>
        </div>
        <h3 className="text-xl font-semibold mb-2">Aucun catalogue</h3>
        <p className="text-sm text-muted-foreground mb-6">
          Le catalogue de données n&apos;a pas encore été créé.
          <br />
          Cliquez sur le bouton ci-dessous pour extraire la structure de DuckDB
          <br />
          et générer les descriptions avec l&apos;IA.
        </p>
        <Button onClick={onGenerate} disabled={isGenerating} size="lg">
          {isGenerating ? (
            <span className="flex items-center gap-2">
              <span className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
              Génération...
            </span>
          ) : (
            <>
              <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
              Générer le catalogue
            </>
          )}
        </Button>
      </div>
    </div>
  );
}
