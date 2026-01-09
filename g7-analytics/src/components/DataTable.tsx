"use client";

import { useState, useMemo } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

interface DataTableProps {
  data: Record<string, unknown>[];
}

type SortDirection = "asc" | "desc" | null;

export function DataTable({ data }: DataTableProps) {
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [sortColumn, setSortColumn] = useState<string | null>(null);
  const [sortDirection, setSortDirection] = useState<SortDirection>(null);
  const [columnFilters, setColumnFilters] = useState<Record<string, string>>({});
  const [showFilters, setShowFilters] = useState(false);

  if (!data || data.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        Aucune donnée à afficher
      </div>
    );
  }

  const columns = Object.keys(data[0]);

  // Filtrage
  const filteredData = useMemo(() => {
    return data.filter((row) => {
      return Object.entries(columnFilters).every(([col, filterValue]) => {
        if (!filterValue) return true;
        const cellValue = String(row[col] ?? "").toLowerCase();
        return cellValue.includes(filterValue.toLowerCase());
      });
    });
  }, [data, columnFilters]);

  // Tri
  const sortedData = useMemo(() => {
    if (!sortColumn || !sortDirection) return filteredData;

    return [...filteredData].sort((a, b) => {
      const aVal = a[sortColumn];
      const bVal = b[sortColumn];

      // Gestion des nulls
      if (aVal === null || aVal === undefined) return sortDirection === "asc" ? 1 : -1;
      if (bVal === null || bVal === undefined) return sortDirection === "asc" ? -1 : 1;

      // Comparaison numérique
      if (typeof aVal === "number" && typeof bVal === "number") {
        return sortDirection === "asc" ? aVal - bVal : bVal - aVal;
      }

      // Comparaison string
      const aStr = String(aVal).toLowerCase();
      const bStr = String(bVal).toLowerCase();
      if (sortDirection === "asc") {
        return aStr.localeCompare(bStr);
      }
      return bStr.localeCompare(aStr);
    });
  }, [filteredData, sortColumn, sortDirection]);

  // Pagination
  const totalPages = Math.ceil(sortedData.length / pageSize);
  const paginatedData = sortedData.slice(
    (currentPage - 1) * pageSize,
    currentPage * pageSize
  );

  // Handlers
  const handleSort = (column: string) => {
    if (sortColumn === column) {
      if (sortDirection === "asc") {
        setSortDirection("desc");
      } else if (sortDirection === "desc") {
        setSortColumn(null);
        setSortDirection(null);
      }
    } else {
      setSortColumn(column);
      setSortDirection("asc");
    }
    setCurrentPage(1);
  };

  const handleFilterChange = (column: string, value: string) => {
    setColumnFilters((prev) => ({ ...prev, [column]: value }));
    setCurrentPage(1);
  };

  const clearFilters = () => {
    setColumnFilters({});
    setCurrentPage(1);
  };

  const getSortIcon = (column: string) => {
    if (sortColumn !== column) {
      return (
        <svg className="w-4 h-4 opacity-30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M7 15l5 5 5-5M7 9l5-5 5 5" />
        </svg>
      );
    }
    if (sortDirection === "asc") {
      return (
        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M7 9l5-5 5 5" />
        </svg>
      );
    }
    return (
      <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M7 15l5 5 5-5" />
      </svg>
    );
  };

  const hasActiveFilters = Object.values(columnFilters).some(Boolean);

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="flex items-center justify-between gap-2 mb-3 flex-shrink-0">
        <div className="flex items-center gap-2">
          <Button
            variant={showFilters ? "secondary" : "outline"}
            size="sm"
            onClick={() => setShowFilters(!showFilters)}
            className="h-8"
          >
            <svg className="w-4 h-4 mr-1" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
            </svg>
            Filtres
            {hasActiveFilters && (
              <span className="ml-1 bg-primary text-primary-foreground text-xs px-1.5 rounded-full">
                {Object.values(columnFilters).filter(Boolean).length}
              </span>
            )}
          </Button>
          {hasActiveFilters && (
            <Button variant="ghost" size="sm" onClick={clearFilters} className="h-8 text-xs">
              Effacer
            </Button>
          )}
        </div>

        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <span>{sortedData.length} résultats</span>
          <select
            value={pageSize}
            onChange={(e) => {
              setPageSize(Number(e.target.value));
              setCurrentPage(1);
            }}
            className="h-8 text-xs rounded border border-input bg-background px-2"
          >
            <option value={10}>10 / page</option>
            <option value={25}>25 / page</option>
            <option value={50}>50 / page</option>
            <option value={100}>100 / page</option>
          </select>
        </div>
      </div>

      {/* Table Container - Responsive */}
      <div className="flex-1 overflow-auto border rounded-lg">
        <table className="w-full text-sm table-fixed">
          <thead className="bg-secondary/50 sticky top-0">
            {/* Headers */}
            <tr>
              {columns.map((col) => (
                <th
                  key={col}
                  onClick={() => handleSort(col)}
                  className="px-3 py-2 text-left font-medium text-muted-foreground cursor-pointer hover:bg-secondary/80 transition-colors select-none"
                >
                  <div className="flex items-center gap-1">
                    <span className="truncate" title={col}>
                      {col}
                    </span>
                    {getSortIcon(col)}
                  </div>
                </th>
              ))}
            </tr>
            {/* Filter row */}
            {showFilters && (
              <tr className="bg-secondary/30">
                {columns.map((col) => (
                  <th key={`filter-${col}`} className="px-2 py-1">
                    <Input
                      type="text"
                      placeholder="Filtrer..."
                      value={columnFilters[col] || ""}
                      onChange={(e) => handleFilterChange(col, e.target.value)}
                      className="h-7 text-xs"
                    />
                  </th>
                ))}
              </tr>
            )}
          </thead>
          <tbody className="divide-y divide-border">
            {paginatedData.map((row, i) => (
              <tr key={i} className="hover:bg-secondary/30 transition-colors">
                {columns.map((col) => (
                  <td
                    key={col}
                    className="px-3 py-2"
                    title={String(row[col] ?? "")}
                  >
                    <span className="block truncate">
                      {formatValue(row[col])}
                    </span>
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between mt-3 flex-shrink-0">
          <div className="text-sm text-muted-foreground">
            Page {currentPage} sur {totalPages}
          </div>
          <div className="flex items-center gap-1">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCurrentPage(1)}
              disabled={currentPage === 1}
              className="h-8 w-8 p-0"
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M11 17l-5-5 5-5M18 17l-5-5 5-5" />
              </svg>
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              disabled={currentPage === 1}
              className="h-8 w-8 p-0"
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M15 18l-6-6 6-6" />
              </svg>
            </Button>

            {/* Page numbers */}
            <div className="flex items-center gap-1 mx-2">
              {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                let pageNum: number;
                if (totalPages <= 5) {
                  pageNum = i + 1;
                } else if (currentPage <= 3) {
                  pageNum = i + 1;
                } else if (currentPage >= totalPages - 2) {
                  pageNum = totalPages - 4 + i;
                } else {
                  pageNum = currentPage - 2 + i;
                }
                return (
                  <Button
                    key={pageNum}
                    variant={currentPage === pageNum ? "default" : "outline"}
                    size="sm"
                    onClick={() => setCurrentPage(pageNum)}
                    className="h-8 w-8 p-0 text-xs"
                  >
                    {pageNum}
                  </Button>
                );
              })}
            </div>

            <Button
              variant="outline"
              size="sm"
              onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
              disabled={currentPage === totalPages}
              className="h-8 w-8 p-0"
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M9 18l6-6-6-6" />
              </svg>
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCurrentPage(totalPages)}
              disabled={currentPage === totalPages}
              className="h-8 w-8 p-0"
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M13 17l5-5-5-5M6 17l5-5-5-5" />
              </svg>
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function formatValue(value: unknown): string {
  if (value === null || value === undefined) return "-";
  if (typeof value === "number") {
    return Number.isInteger(value) ? value.toLocaleString("fr-FR") : value.toFixed(2);
  }
  if (typeof value === "boolean") return value ? "Oui" : "Non";
  // Truncate long strings
  const str = String(value);
  return str.length > 100 ? str.slice(0, 100) + "..." : str;
}
