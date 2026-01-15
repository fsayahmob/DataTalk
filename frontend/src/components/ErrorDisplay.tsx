"use client";

import { AlertTriangleIcon, CopyIcon } from "@/components/icons";

interface ErrorDisplayProps {
  error: string;
  sql?: string;
}

export function ErrorDisplay({ error, sql }: ErrorDisplayProps) {
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
                Erreur d&apos;exécution SQL
              </h3>
              <p className="text-sm text-muted-foreground mb-4">
                La requête générée n&apos;a pas pu être exécutée sur la base de données.
              </p>
              <div className="bg-background/50 rounded-lg p-3 font-mono text-xs text-destructive/90 break-words">
                {error}
              </div>
            </div>
          </div>

          {sql && (
            <div className="mt-4 pt-4 border-t border-destructive/20">
              <p className="text-xs text-muted-foreground mb-2">Requête SQL tentée :</p>
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
              Copier les détails
            </button>
          </div>
        </div>

        <p className="text-xs text-muted-foreground text-center mt-4">
          Reformulez votre question ou essayez une question prédéfinie
        </p>
      </div>
    </div>
  );
}
