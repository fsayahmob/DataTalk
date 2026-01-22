"use client";

import * as React from "react";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Search, Link2, Table2 } from "lucide-react";
import { useTranslation } from "@/hooks/useTranslation";
import { DiscoveredTable } from "@/lib/api/types";
import { cn } from "@/lib/utils";

interface TableSelectorProps {
  tables: DiscoveredTable[];
  selectedTables: Set<string>;
  onSelectionChange: (selected: Set<string>) => void;
}

export function TableSelector({
  tables,
  selectedTables,
  onSelectionChange,
}: TableSelectorProps) {
  const { t } = useTranslation();
  const [searchQuery, setSearchQuery] = React.useState("");

  // Group tables by schema
  const tablesBySchema = React.useMemo(() => {
    const groups: Record<string, DiscoveredTable[]> = {};
    for (const table of tables) {
      const schema = table.schema || "default";
      if (!groups[schema]) {
        groups[schema] = [];
      }
      groups[schema].push(table);
    }
    return groups;
  }, [tables]);

  // Filter tables by search
  const filteredTablesBySchema = React.useMemo(() => {
    if (!searchQuery.trim()) return tablesBySchema;

    const query = searchQuery.toLowerCase();
    const filtered: Record<string, DiscoveredTable[]> = {};

    for (const [schema, schemaTables] of Object.entries(tablesBySchema)) {
      const matchingTables = schemaTables.filter((table) =>
        table.name.toLowerCase().includes(query)
      );
      if (matchingTables.length > 0) {
        filtered[schema] = matchingTables;
      }
    }
    return filtered;
  }, [tablesBySchema, searchQuery]);

  // Get full table name (schema.name or just name)
  const getTableKey = (table: DiscoveredTable) => {
    return table.schema && table.schema !== "public"
      ? `${table.schema}.${table.name}`
      : table.name;
  };

  // Toggle single table
  const toggleTable = (table: DiscoveredTable) => {
    const key = getTableKey(table);
    const newSelection = new Set(selectedTables);
    if (newSelection.has(key)) {
      newSelection.delete(key);
    } else {
      newSelection.add(key);
    }
    onSelectionChange(newSelection);
  };

  // Toggle all tables in a schema
  const toggleSchema = (schema: string, tables: DiscoveredTable[]) => {
    const tableKeys = tables.map(getTableKey);
    const allSelected = tableKeys.every((key) => selectedTables.has(key));

    const newSelection = new Set(selectedTables);
    if (allSelected) {
      // Deselect all
      tableKeys.forEach((key) => newSelection.delete(key));
    } else {
      // Select all
      tableKeys.forEach((key) => newSelection.add(key));
    }
    onSelectionChange(newSelection);
  };

  // Select all tables
  const selectAll = () => {
    const allKeys = tables.map(getTableKey);
    onSelectionChange(new Set(allKeys));
  };

  // Deselect all tables
  const deselectAll = () => {
    onSelectionChange(new Set());
  };

  // Exclude tables by prefix
  const excludeByPrefix = (prefix: string) => {
    const newSelection = new Set(selectedTables);
    for (const table of tables) {
      if (table.name.startsWith(prefix)) {
        newSelection.delete(getTableKey(table));
      }
    }
    onSelectionChange(newSelection);
  };

  // Get schema selection state
  const getSchemaCheckState = (
    schemaTables: DiscoveredTable[]
  ): boolean | "indeterminate" => {
    const tableKeys = schemaTables.map(getTableKey);
    const selectedCount = tableKeys.filter((key) =>
      selectedTables.has(key)
    ).length;

    if (selectedCount === 0) return false;
    if (selectedCount === tableKeys.length) return true;
    return "indeterminate";
  };

  // Calculate totals
  const totalSelected = selectedTables.size;
  const totalRows = tables
    .filter((t) => selectedTables.has(getTableKey(t)))
    .reduce((sum, t) => sum + (t.row_count || 0), 0);

  // Default open first schema
  const defaultOpenSchemas = Object.keys(filteredTablesBySchema).slice(0, 1);

  return (
    <div className="flex flex-col gap-4">
      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder={t("datasourceWizard.searchPlaceholder")}
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="pl-9"
        />
      </div>

      {/* Quick actions */}
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" size="sm" onClick={selectAll}>
          {t("datasourceWizard.selectAll")}
        </Button>
        <Button variant="outline" size="sm" onClick={deselectAll}>
          {t("datasourceWizard.deselectAll")}
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => excludeByPrefix("_")}
        >
          {t("datasourceWizard.excludePrefix", { prefix: "_" })}
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => excludeByPrefix("raw")}
        >
          {t("datasourceWizard.excludePrefix", { prefix: "raw" })}
        </Button>
      </div>

      {/* Tables accordion */}
      <Accordion
        type="multiple"
        defaultValue={defaultOpenSchemas}
        className="w-full"
      >
        {Object.entries(filteredTablesBySchema).map(
          ([schema, schemaTables]) => {
            const checkState = getSchemaCheckState(schemaTables);
            const selectedInSchema = schemaTables.filter((t) =>
              selectedTables.has(getTableKey(t))
            ).length;

            return (
              <AccordionItem key={schema} value={schema}>
                <AccordionTrigger className="hover:no-underline">
                  <div className="flex items-center gap-3 flex-1">
                    <Checkbox
                      checked={checkState}
                      onCheckedChange={() => toggleSchema(schema, schemaTables)}
                      onClick={(e) => e.stopPropagation()}
                    />
                    <span className="font-medium">{schema}</span>
                    <Badge variant="secondary" className="ml-auto mr-2">
                      {selectedInSchema}/{schemaTables.length}{" "}
                      {t("datasourceWizard.tables")}
                    </Badge>
                  </div>
                </AccordionTrigger>
                <AccordionContent>
                  <div className="flex flex-col gap-2 pl-7">
                    {schemaTables.map((table) => {
                      const key = getTableKey(table);
                      const isSelected = selectedTables.has(key);
                      const fkCount = table.foreign_keys?.length || 0;

                      return (
                        <div
                          key={key}
                          className={cn(
                            "flex items-center gap-3 p-3 rounded-md border transition-colors cursor-pointer",
                            isSelected
                              ? "border-primary bg-primary/5"
                              : "border-border hover:border-primary/50"
                          )}
                          onClick={() => toggleTable(table)}
                        >
                          <Checkbox
                            checked={isSelected}
                            onCheckedChange={() => toggleTable(table)}
                            onClick={(e) => e.stopPropagation()}
                          />
                          <Table2 className="h-4 w-4 text-muted-foreground" />
                          <div className="flex-1 min-w-0">
                            <div className="font-medium truncate">
                              {table.name}
                            </div>
                            <div className="text-xs text-muted-foreground">
                              {table.row_count?.toLocaleString() || "?"}{" "}
                              {t("datasourceWizard.rows")} &bull;{" "}
                              {table.columns.length}{" "}
                              {t("datasourceWizard.columns")}
                            </div>
                          </div>
                          {fkCount > 0 && (
                            <Badge
                              variant="outline"
                              className="flex items-center gap-1"
                            >
                              <Link2 className="h-3 w-3" />
                              {fkCount} FK
                            </Badge>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </AccordionContent>
              </AccordionItem>
            );
          }
        )}
      </Accordion>

      {/* Summary footer */}
      <div className="flex items-center gap-2 text-sm text-muted-foreground border-t pt-3">
        <Table2 className="h-4 w-4" />
        <span>
          {t("datasourceWizard.tablesSelected", { count: totalSelected })} &bull;{" "}
          ~{totalRows.toLocaleString()} {t("datasourceWizard.rowsEstimated")}
        </span>
      </div>
    </div>
  );
}
