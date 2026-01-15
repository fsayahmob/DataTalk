"use client";

import { useState, useMemo } from "react";
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  flexRender,
  type ColumnDef,
  type SortingState,
  type ColumnFiltersState,
} from "@tanstack/react-table";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  FilterIcon,
  SortIcon,
  SortAscIcon,
  SortDescIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  DownloadIcon,
  ChevronDownIcon,
} from "@/components/icons";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import * as XLSX from "xlsx";

interface DataTableProps {
  data: Record<string, unknown>[];
}

// Fonctions d'export extraites pour réduire la complexité du composant
function exportToCSV(data: Record<string, unknown>[], filename: string): void {
  const worksheet = XLSX.utils.json_to_sheet(data);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "Data");
  XLSX.writeFile(workbook, `${filename}.csv`, { bookType: "csv" });
}

function exportToExcel(data: Record<string, unknown>[], filename: string): void {
  const worksheet = XLSX.utils.json_to_sheet(data);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "Data");
  XLSX.writeFile(workbook, `${filename}.xlsx`, { bookType: "xlsx" });
}

function formatValue(value: unknown): string {
  if (value === null || value === undefined) return "-";
  if (typeof value === "number") {
    return Number.isInteger(value) ? value.toLocaleString("fr-FR") : value.toFixed(2);
  }
  if (typeof value === "boolean") return value ? "Oui" : "Non";
  const str = String(value);
  return str.length > 100 ? str.slice(0, 100) + "..." : str;
}

export function DataTable({ data }: DataTableProps) {
  const [sorting, setSorting] = useState<SortingState>([]);
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
  const [showFilters, setShowFilters] = useState(false);

  // Générer les colonnes dynamiquement
  const columns = useMemo<ColumnDef<Record<string, unknown>>[]>(() => {
    if (!data || data.length === 0) return [];

    return Object.keys(data[0]).map((key) => ({
      accessorKey: key,
      header: key,
      cell: ({ getValue }) => {
        const value = getValue();
        return (
          <span className="block truncate" title={String(value ?? "")}>
            {formatValue(value)}
          </span>
        );
      },
    }));
  }, [data]);

  const table = useReactTable({
    data: data || [],
    columns,
    state: {
      sorting,
      columnFilters,
    },
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    initialState: {
      pagination: {
        pageSize: 25,
      },
    },
  });

  if (!data || data.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        Aucune donnée à afficher
      </div>
    );
  }

  const hasActiveFilters = columnFilters.length > 0;

  const getSortIcon = (columnId: string) => {
    const sortedColumn = sorting.find((s) => s.id === columnId);
    if (!sortedColumn) {
      return <SortIcon size={14} className="opacity-30" />;
    }
    return sortedColumn.desc ? (
      <SortDescIcon size={14} />
    ) : (
      <SortAscIcon size={14} />
    );
  };

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
            <FilterIcon size={16} className="mr-1" />
            Filtres
            {hasActiveFilters && (
              <span className="ml-1 bg-primary text-primary-foreground text-xs px-1.5 rounded-full">
                {columnFilters.length}
              </span>
            )}
          </Button>
          {hasActiveFilters && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setColumnFilters([])}
              className="h-8 text-xs"
            >
              Effacer
            </Button>
          )}
        </div>

        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <span>{table.getFilteredRowModel().rows.length} résultats</span>

          {/* Export dropdown */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="h-8">
                <DownloadIcon size={14} className="mr-1" />
                Exporter
                <ChevronDownIcon size={12} className="ml-1" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem
                onClick={() => {
                  const rows = table.getFilteredRowModel().rows.map(r => r.original);
                  exportToCSV(rows, `export_${Date.now()}`);
                }}
              >
                CSV (.csv)
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => {
                  const rows = table.getFilteredRowModel().rows.map(r => r.original);
                  exportToExcel(rows, `export_${Date.now()}`);
                }}
              >
                Excel (.xlsx)
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          <Select
            value={String(table.getState().pagination.pageSize)}
            onValueChange={(value) => table.setPageSize(Number(value))}
          >
            <SelectTrigger className="h-8 w-[100px] text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="10">10 / page</SelectItem>
              <SelectItem value="25">25 / page</SelectItem>
              <SelectItem value="50">50 / page</SelectItem>
              <SelectItem value="100">100 / page</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto border rounded-lg">
        <Table>
          <TableHeader className="bg-secondary/50 sticky top-0">
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id}>
                {headerGroup.headers.map((header) => (
                  <TableHead
                    key={header.id}
                    onClick={header.column.getToggleSortingHandler()}
                    className="cursor-pointer hover:bg-secondary/80 transition-colors select-none whitespace-nowrap"
                  >
                    <div className="flex items-center gap-1">
                      <span className="truncate">
                        {flexRender(
                          header.column.columnDef.header,
                          header.getContext()
                        )}
                      </span>
                      {getSortIcon(header.column.id)}
                    </div>
                  </TableHead>
                ))}
              </TableRow>
            ))}
            {/* Filter row */}
            {showFilters && (
              <TableRow className="bg-secondary/30">
                {table.getAllColumns().map((column) => (
                  <TableHead key={`filter-${column.id}`} className="p-1">
                    <Input
                      type="text"
                      placeholder="Filtrer..."
                      value={(column.getFilterValue() as string) ?? ""}
                      onChange={(e) => column.setFilterValue(e.target.value)}
                      className="h-7 text-xs"
                    />
                  </TableHead>
                ))}
              </TableRow>
            )}
          </TableHeader>
          <TableBody>
            {table.getRowModel().rows.length > 0 ? (
              table.getRowModel().rows.map((row) => (
                <TableRow
                  key={row.id}
                  className="hover:bg-secondary/30 transition-colors"
                >
                  {row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id} className="py-2">
                      {flexRender(
                        cell.column.columnDef.cell,
                        cell.getContext()
                      )}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell
                  colSpan={columns.length}
                  className="h-24 text-center text-muted-foreground"
                >
                  Aucun résultat
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      {/* Pagination */}
      <div className="flex items-center justify-between py-3 flex-shrink-0">
        <div className="text-sm text-muted-foreground">
          Page {table.getState().pagination.pageIndex + 1} sur{" "}
          {table.getPageCount()}
        </div>
        <div className="flex items-center gap-1">
          <Button
            variant="outline"
            size="sm"
            onClick={() => table.previousPage()}
            disabled={!table.getCanPreviousPage()}
            className="h-8 w-8 p-0"
          >
            <ChevronLeftIcon size={16} />
          </Button>
          {/* Page numbers */}
          {Array.from({ length: Math.min(5, table.getPageCount()) }, (_, i) => {
            const pageCount = table.getPageCount();
            const currentPage = table.getState().pagination.pageIndex;
            let pageIndex: number;

            if (pageCount <= 5) {
              pageIndex = i;
            } else if (currentPage < 3) {
              pageIndex = i;
            } else if (currentPage > pageCount - 4) {
              pageIndex = pageCount - 5 + i;
            } else {
              pageIndex = currentPage - 2 + i;
            }

            return (
              <Button
                key={pageIndex}
                variant={currentPage === pageIndex ? "default" : "outline"}
                size="sm"
                onClick={() => table.setPageIndex(pageIndex)}
                className="h-8 w-8 p-0"
              >
                {pageIndex + 1}
              </Button>
            );
          })}
          <Button
            variant="outline"
            size="sm"
            onClick={() => table.nextPage()}
            disabled={!table.getCanNextPage()}
            className="h-8 w-8 p-0"
          >
            <ChevronRightIcon size={16} />
          </Button>
        </div>
      </div>
    </div>
  );
}
