"use client";

import * as React from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, Link2 } from "lucide-react";
import { useTranslation } from "@/hooks/useTranslation";
import { DiscoveredTable, ForeignKey } from "@/lib/api/types";

interface MissingFKTable {
  table: DiscoveredTable;
  referencedBy: Array<{
    sourceTable: string;
    fk: ForeignKey;
  }>;
}

interface FKWarningDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  missingTables: MissingFKTable[];
  onContinueWithout: () => void;
  onAddTables: (tableNames: string[]) => void;
}

export function FKWarningDialog({
  open,
  onOpenChange,
  missingTables,
  onContinueWithout,
  onAddTables,
}: FKWarningDialogProps) {
  const { t } = useTranslation();

  // Track which tables user wants to add (all checked by default)
  const [checkedTables, setCheckedTables] = React.useState<Set<string>>(
    new Set(missingTables.map((mt) => mt.table.name))
  );

  // Reset checked state when dialog opens with new tables
  React.useEffect(() => {
    if (open) {
      setCheckedTables(new Set(missingTables.map((mt) => mt.table.name)));
    }
  }, [open, missingTables]);

  const toggleTable = (tableName: string) => {
    const newChecked = new Set(checkedTables);
    if (newChecked.has(tableName)) {
      newChecked.delete(tableName);
    } else {
      newChecked.add(tableName);
    }
    setCheckedTables(newChecked);
  };

  const handleAddSelection = () => {
    onAddTables(Array.from(checkedTables));
    onOpenChange(false);
  };

  const handleContinueWithout = () => {
    onContinueWithout();
    onOpenChange(false);
  };

  const getTableKey = (table: DiscoveredTable) => {
    return table.schema && table.schema !== "public"
      ? `${table.schema}.${table.name}`
      : table.name;
  };

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="max-w-lg">
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-yellow-500" />
            {t("datasourceWizard.fkWarningTitle")}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {t("datasourceWizard.fkWarningMessage")}
          </AlertDialogDescription>
        </AlertDialogHeader>

        <div className="flex flex-col gap-2 py-4 max-h-64 overflow-y-auto">
          {missingTables.map((missing) => {
            const tableKey = getTableKey(missing.table);
            const isChecked = checkedTables.has(missing.table.name);

            return (
              <div
                key={tableKey}
                className="flex items-start gap-3 p-3 rounded-md border bg-muted/50 cursor-pointer hover:bg-muted/80"
                onClick={() => toggleTable(missing.table.name)}
              >
                <Checkbox
                  checked={isChecked}
                  onCheckedChange={() => toggleTable(missing.table.name)}
                  onClick={(e) => e.stopPropagation()}
                  className="mt-0.5"
                />
                <div className="flex-1 min-w-0">
                  <div className="font-medium">{missing.table.name}</div>
                  <div className="text-xs text-muted-foreground mt-1">
                    {missing.referencedBy.map((ref, idx) => (
                      <div key={idx} className="flex items-center gap-1">
                        <Link2 className="h-3 w-3" />
                        <span>
                          {t("datasourceWizard.linkedTo", {
                            source: `${ref.sourceTable}.${ref.fk.column}`,
                            target: `${missing.table.name}.${ref.fk.references_column}`,
                          })}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
                {missing.table.row_count && (
                  <Badge variant="secondary" className="text-xs">
                    {missing.table.row_count.toLocaleString()} rows
                  </Badge>
                )}
              </div>
            );
          })}
        </div>

        <p className="text-sm text-muted-foreground">
          {t("datasourceWizard.fkWarningHelp")}
        </p>

        <AlertDialogFooter>
          <AlertDialogCancel onClick={handleContinueWithout}>
            {t("datasourceWizard.continueWithout")}
          </AlertDialogCancel>
          <AlertDialogAction
            onClick={handleAddSelection}
            disabled={checkedTables.size === 0}
          >
            {t("datasourceWizard.addSelection")} ({checkedTables.size})
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

// Helper function to find missing FK tables
export function findMissingFKTables(
  allTables: DiscoveredTable[],
  selectedTableNames: Set<string>
): MissingFKTable[] {
  const missing: MissingFKTable[] = [];
  const tableMap = new Map<string, DiscoveredTable>();

  // Build lookup map
  for (const table of allTables) {
    const key =
      table.schema && table.schema !== "public"
        ? `${table.schema}.${table.name}`
        : table.name;
    tableMap.set(key, table);
    tableMap.set(table.name, table); // Also index by just name
  }

  // Track tables we've already identified as missing
  const missingSet = new Set<string>();

  // Check each selected table's foreign keys
  for (const selectedName of selectedTableNames) {
    const selectedTable = tableMap.get(selectedName);
    if (!selectedTable?.foreign_keys) continue;

    for (const fk of selectedTable.foreign_keys) {
      const refTableName = fk.references_table;

      // Skip if already selected or already in missing list
      if (selectedTableNames.has(refTableName)) continue;
      if (missingSet.has(refTableName)) {
        // Add to existing missing entry
        const existing = missing.find(
          (m) =>
            m.table.name === refTableName ||
            `${m.table.schema}.${m.table.name}` === refTableName
        );
        if (existing) {
          existing.referencedBy.push({
            sourceTable: selectedName,
            fk,
          });
        }
        continue;
      }

      // Find the referenced table
      const refTable = tableMap.get(refTableName);
      if (refTable) {
        missingSet.add(refTableName);
        missing.push({
          table: refTable,
          referencedBy: [
            {
              sourceTable: selectedName,
              fk,
            },
          ],
        });
      }
    }
  }

  return missing;
}
