"use client";

import { memo } from "react";
import { Handle, Position } from "@xyflow/react";
import { Badge } from "@/components/ui/badge";
import type { CatalogColumn } from "@/lib/api";

export interface SchemaNodeData {
  label: string;
  description?: string | null;
  rowCount?: number | null;
  columns: CatalogColumn[];
  isPreview?: boolean;
  isEnabled?: boolean;
}

interface SchemaNodeProps {
  data: SchemaNodeData;
}

// Helper pour l'icône du type de données
function getTypeIcon(dataType: string): string {
  const type = dataType.toLowerCase();
  if (type.includes("int") || type.includes("decimal") || type.includes("float") || type.includes("double")) return "#";
  if (type.includes("varchar") || type.includes("text") || type.includes("char")) return "Aa";
  if (type.includes("date") || type.includes("time") || type.includes("timestamp")) return "⏱";
  if (type.includes("bool")) return "✓";
  if (type.includes("json")) return "{}";
  return "?";
}

// Helper pour la couleur du type
function getTypeColor(dataType: string): string {
  const type = dataType.toLowerCase();
  if (type.includes("int") || type.includes("decimal") || type.includes("float") || type.includes("double"))
    return "text-blue-400";
  if (type.includes("varchar") || type.includes("text") || type.includes("char"))
    return "text-emerald-400";
  if (type.includes("date") || type.includes("time") || type.includes("timestamp"))
    return "text-amber-400";
  if (type.includes("bool"))
    return "text-purple-400";
  if (type.includes("json"))
    return "text-pink-400";
  return "text-muted-foreground";
}

function SchemaNodeComponent({ data }: SchemaNodeProps) {
  const { label, description, rowCount, columns, isPreview, isEnabled = true } = data;
  const maxVisibleColumns = 12;
  const hasMoreColumns = columns.length > maxVisibleColumns;
  const visibleColumns = columns.slice(0, maxVisibleColumns);

  // Une table est considérée "enrichie" si elle a une description
  const isEnriched = !!description;

  // Déterminer les classes de style selon l'état
  const getContainerClasses = () => {
    if (isPreview) {
      return "border-amber-500/60 bg-amber-950/30";
    }
    if (!isEnabled) {
      return "border-muted-foreground/30 bg-muted opacity-60";
    }
    if (!isEnriched) {
      // Table activée mais non enrichie (en attente d'enrichissement)
      return "border-amber-500/40 bg-amber-950/30";
    }
    return "border-primary/40 bg-card";
  };

  return (
    <div
      className={`
        min-w-[280px] max-w-[320px] rounded-lg border-2 shadow-2xl overflow-hidden
        ${getContainerClasses()}
      `}
    >
      {/* Handle d'entrée (gauche) */}
      <Handle
        type="target"
        position={Position.Left}
        className="!w-3 !h-3 !bg-primary !border-2 !border-background"
      />

      {/* Header de la table */}
      <div
        className={`
          px-4 py-3 flex items-center justify-between
          ${isPreview
            ? "bg-amber-500/25"
            : !isEnabled
              ? "bg-muted-foreground/15"
              : !isEnriched
                ? "bg-amber-500/15"
                : "bg-primary/20"
          }
        `}
      >
        <div className="flex items-center gap-2">
          <div className={`w-2.5 h-2.5 rounded-full ${
            isPreview ? "bg-amber-500"
            : !isEnabled ? "bg-muted-foreground"
            : !isEnriched ? "bg-amber-500"
            : "bg-primary"
          } shadow-lg`} />
          <span className={`font-mono font-bold text-sm ${!isEnabled ? "text-muted-foreground" : "text-foreground"}`}>{label}</span>
          {!isEnabled && (
            <span className="text-[9px] px-1.5 py-0.5 rounded bg-muted-foreground/20 text-muted-foreground uppercase">
              Exclue
            </span>
          )}
          {isEnabled && !isEnriched && (
            <span className="text-[9px] px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-400 uppercase">
              Non enrichie
            </span>
          )}
        </div>
        {rowCount !== undefined && rowCount !== null && (
          <Badge
            variant="secondary"
            className={`text-[10px] ${isPreview ? "bg-amber-500/20 text-amber-300" : ""}`}
          >
            {rowCount.toLocaleString()} rows
          </Badge>
        )}
      </div>

      {/* Description */}
      {description && (
        <div className="px-4 py-2 text-xs text-muted-foreground border-b border-border/20 bg-background/20">
          {description}
        </div>
      )}

      {/* Colonnes */}
      <div className="divide-y divide-border/10">
        {visibleColumns.map((col, idx) => (
          <div
            key={col.name}
            className={`
              px-3 py-1.5 flex items-center gap-2 text-xs
              ${idx % 2 === 0 ? "bg-background/10" : "bg-background/5"}
              hover:bg-primary/10 transition-colors
            `}
          >
            {/* Icône type */}
            <span className={`w-5 text-center font-mono text-[10px] ${getTypeColor(col.data_type)}`}>
              {getTypeIcon(col.data_type)}
            </span>

            {/* Nom colonne */}
            <span className="font-mono text-foreground flex-1 truncate">
              {col.name}
            </span>

            {/* Type */}
            <span className="text-[9px] text-muted-foreground font-mono uppercase">
              {col.data_type.split('(')[0]}
            </span>

            {/* Indicateur de range ou PK */}
            {col.value_range && (
              <Badge variant="outline" className="text-[8px] py-0 px-1 h-4">
                {col.value_range}
              </Badge>
            )}
          </div>
        ))}

        {/* Indicateur de colonnes supplémentaires */}
        {hasMoreColumns && (
          <div className="px-3 py-2 text-[10px] text-muted-foreground text-center bg-background/20">
            +{columns.length - maxVisibleColumns} colonnes...
          </div>
        )}
      </div>

      {/* Handle de sortie (droite) */}
      <Handle
        type="source"
        position={Position.Right}
        className="!w-3 !h-3 !bg-primary !border-2 !border-background"
      />
    </div>
  );
}

export const SchemaNode = memo(SchemaNodeComponent);
