"use client";

interface CatalogFooterProps {
  tableCount: number;
  columnCount: number;
  columnsWithDesc: number;
  totalRows: number;
}

export function CatalogFooter({
  tableCount,
  columnCount,
  columnsWithDesc,
  totalRows,
}: CatalogFooterProps) {
  return (
    <div className="px-4 py-2 border-t border-border/30 bg-sidebar flex items-center gap-6 text-xs text-muted-foreground">
      <div className="flex items-center gap-2">
        <span className="font-medium text-foreground">{tableCount}</span>
        <span>tables</span>
      </div>
      <div className="flex items-center gap-2">
        <span className="font-medium text-foreground">{columnCount}</span>
        <span>colonnes</span>
      </div>
      <div className="flex items-center gap-2">
        <span className="font-medium text-foreground">
          {columnsWithDesc}/{columnCount}
        </span>
        <span>avec description</span>
      </div>
      <div className="flex items-center gap-2">
        <span className="font-medium text-foreground">
          {totalRows.toLocaleString()}
        </span>
        <span>lignes totales</span>
      </div>
    </div>
  );
}
