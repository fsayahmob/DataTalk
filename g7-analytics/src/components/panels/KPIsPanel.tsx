"use client";

import { GlobalStats } from "@/types";

interface KPIsPanelProps {
  globalStats: GlobalStats | null;
}

export function KPIsPanel({ globalStats }: KPIsPanelProps) {
  return (
    <div className="p-3 grid grid-cols-4 gap-3">
      <div className="bg-gradient-to-br from-card to-card/50 border border-border/50 rounded-xl p-3 text-center hover:border-primary/30 transition-colors">
        <p className="text-xs text-muted-foreground mb-1">Évaluations</p>
        <p className="text-xl font-bold text-foreground">
          {globalStats?.total_evaluations?.toLocaleString("fr-FR") ?? "—"}
        </p>
      </div>
      <div className="bg-gradient-to-br from-card to-card/50 border border-border/50 rounded-xl p-3 text-center hover:border-primary/30 transition-colors">
        <p className="text-xs text-muted-foreground mb-1">Note moyenne</p>
        <p className="text-xl font-bold text-primary">
          {globalStats?.note_moyenne?.toFixed(2) ?? "—"}
        </p>
      </div>
      <div className="bg-gradient-to-br from-card to-card/50 border border-border/50 rounded-xl p-3 text-center hover:border-primary/30 transition-colors">
        <p className="text-xs text-muted-foreground mb-1">Commentaires</p>
        <p className="text-xl font-bold text-foreground">
          {globalStats?.total_commentaires?.toLocaleString("fr-FR") ?? "—"}
        </p>
      </div>
      <div className="bg-gradient-to-br from-card to-card/50 border border-border/50 rounded-xl p-3 text-center hover:border-primary/30 transition-colors">
        <p className="text-xs text-muted-foreground mb-1">Chauffeurs</p>
        <p className="text-xl font-bold text-foreground">
          {globalStats?.total_chauffeurs?.toLocaleString("fr-FR") ?? "—"}
        </p>
      </div>
    </div>
  );
}
