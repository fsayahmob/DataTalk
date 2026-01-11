"use client";

import { Button } from "@/components/ui/button";
import { CloseIcon } from "@/components/icons";
import type { CatalogTable } from "@/lib/api";

interface TableDetailPanelProps {
  table: CatalogTable;
  onClose: () => void;
}

export function TableDetailPanel({ table, onClose }: TableDetailPanelProps) {
  return (
    <div className="w-[400px] border-l border-border/30 bg-[hsl(260_10%_8%)] flex flex-col overflow-hidden">
      {/* Header */}
      <div className="px-4 py-3 border-b border-border/30 flex items-center justify-between bg-gradient-to-r from-primary/10 to-transparent">
        <div>
          <h3 className="font-mono font-bold text-foreground">{table.name}</h3>
          <p className="text-xs text-muted-foreground">
            {table.row_count?.toLocaleString() || 0} lignes
          </p>
        </div>
        <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={onClose}>
          <CloseIcon size={16} />
        </Button>
      </div>

      {/* Description de la table */}
      {table.description && (
        <div className="px-4 py-3 border-b border-border/20 bg-primary/5">
          <p className="text-sm text-muted-foreground">{table.description}</p>
        </div>
      )}

      {/* Tableau des colonnes */}
      <div className="flex-1 overflow-auto">
        <table className="w-full text-xs">
          <thead className="sticky top-0 bg-[hsl(260_10%_10%)] border-b border-border/30">
            <tr>
              <th className="text-left px-3 py-2 font-medium text-muted-foreground">Colonne</th>
              <th className="text-left px-3 py-2 font-medium text-muted-foreground">Type</th>
              <th className="text-left px-3 py-2 font-medium text-muted-foreground">Description</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/10">
            {table.columns.map((col, idx) => (
              <tr
                key={col.name}
                className={`hover:bg-primary/5 ${idx % 2 === 0 ? "bg-background/5" : ""}`}
              >
                <td className="px-3 py-2">
                  <span className="font-mono text-foreground">{col.name}</span>
                </td>
                <td className="px-3 py-2">
                  <span className="font-mono text-muted-foreground uppercase text-[10px]">
                    {col.data_type.split("(")[0]}
                  </span>
                </td>
                <td className="px-3 py-2">
                  {col.description ? (
                    <span className="text-foreground/80">{col.description}</span>
                  ) : (
                    <span className="text-muted-foreground/50 italic">—</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Exemples de valeurs */}
      <div className="border-t border-border/30 p-3 bg-[hsl(260_10%_6%)]">
        <h4 className="text-[10px] uppercase tracking-wider text-muted-foreground mb-2">
          Exemples de valeurs
        </h4>
        <div className="space-y-1 max-h-32 overflow-auto">
          {table.columns
            .filter((col) => col.sample_values)
            .slice(0, 5)
            .map((col) => (
              <div key={col.name} className="text-xs">
                <span className="font-mono text-primary/80">{col.name}:</span>{" "}
                <span className="text-muted-foreground">{col.sample_values}</span>
              </div>
            ))}
        </div>
      </div>
    </div>
  );
}
