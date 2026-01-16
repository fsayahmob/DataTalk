"use client";

import { useState, useEffect, useCallback, startTransition } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableRow,
} from "@/components/ui/table";
import * as api from "@/lib/api";
import type { DatabaseStatus } from "@/lib/api";
import { useTranslation } from "@/hooks/useTranslation";

export function DatabaseTab() {
  const { t } = useTranslation();
  const [status, setStatus] = useState<DatabaseStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [newPath, setNewPath] = useState("");
  const [saving, setSaving] = useState(false);
  const [maxBatch, setMaxBatch] = useState(15);
  const [editingBatch, setEditingBatch] = useState(false);
  const [newBatch, setNewBatch] = useState("15");
  const [savingBatch, setSavingBatch] = useState(false);
  const [maxChartRows, setMaxChartRows] = useState(5000);
  const [editingChartRows, setEditingChartRows] = useState(false);
  const [newChartRows, setNewChartRows] = useState("5000");
  const [savingChartRows, setSavingChartRows] = useState(false);

  const loadStatus = useCallback(async () => {
    setLoading(true);
    const [data, batchValue, chartRowsValue] = await Promise.all([
      api.fetchDatabaseStatus(),
      api.fetchMaxTablesPerBatch(),
      api.fetchMaxChartRows(),
    ]);
    setStatus(data);
    if (data) {
      setNewPath(data.configured_path);
    }
    setMaxBatch(batchValue);
    setNewBatch(String(batchValue));
    setMaxChartRows(chartRowsValue);
    setNewChartRows(String(chartRowsValue));
    setLoading(false);
  }, []);

  useEffect(() => {
    startTransition(() => {
      void loadStatus();
    });
  }, [loadStatus]);

  const handleSave = async () => {
    if (!newPath.trim()) {
      toast.error(t("settings.path_required"));
      return;
    }
    setSaving(true);
    const result = await api.setDuckdbPath(newPath.trim());
    if (result.success) {
      toast.success(t("settings.db_connected", { path: result.resolved_path }));
      setEditing(false);
      await loadStatus();
    } else {
      toast.error(result.error || t("common.error"));
    }
    setSaving(false);
  };

  const handleCancel = () => {
    setEditing(false);
    if (status) {
      setNewPath(status.configured_path);
    }
  };

  const handleSaveBatch = async () => {
    const val = parseInt(newBatch, 10);
    if (isNaN(val) || val < 1 || val > 50) {
      toast.error(t("validation.range_error", { min: 1, max: 50 }));
      return;
    }
    setSavingBatch(true);
    const success = await api.setMaxTablesPerBatch(val);
    if (success) {
      setMaxBatch(val);
      setEditingBatch(false);
      toast.success(t("settings.batch_size_updated", { value: val }));
    } else {
      toast.error(t("settings.save_error"));
    }
    setSavingBatch(false);
  };

  const handleCancelBatch = () => {
    setEditingBatch(false);
    setNewBatch(String(maxBatch));
  };

  const handleSaveChartRows = async () => {
    const val = parseInt(newChartRows, 10);
    if (isNaN(val) || val < 100 || val > 100000) {
      toast.error(t("validation.range_error", { min: 100, max: "100 000" }));
      return;
    }
    setSavingChartRows(true);
    const success = await api.setMaxChartRows(val);
    if (success) {
      setMaxChartRows(val);
      setEditingChartRows(false);
      toast.success(t("settings.chart_rows_updated", { value: val.toLocaleString() }));
    } else {
      toast.error(t("settings.save_error"));
    }
    setSavingChartRows(false);
  };

  const handleCancelChartRows = () => {
    setEditingChartRows(false);
    setNewChartRows(String(maxChartRows));
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-32">
        <div className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="border border-border/30 rounded-md">
      <Table>
        <TableBody>
          <TableRow>
            <TableCell className="text-xs text-muted-foreground w-32">Engine</TableCell>
            <TableCell className="text-xs font-mono text-foreground">
              {status?.engine || "DuckDB"}
            </TableCell>
          </TableRow>
          <TableRow>
            <TableCell className="text-xs text-muted-foreground">File</TableCell>
            <TableCell>
              {editing ? (
                <div className="flex items-center gap-2">
                  <Input
                    value={newPath}
                    onChange={(e) => setNewPath(e.target.value)}
                    placeholder="data/g7_analytics.duckdb"
                    className="h-7 text-xs font-mono flex-1"
                    disabled={saving}
                  />
                  <Button
                    size="sm"
                    className="h-7 text-xs"
                    onClick={() => void handleSave()}
                    disabled={saving}
                  >
                    {saving ? "..." : "OK"}
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 text-xs"
                    onClick={handleCancel}
                    disabled={saving}
                  >
                    {t("common.cancel")}
                  </Button>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <span className="text-xs font-mono text-foreground">
                    {status?.configured_path || "data/g7_analytics.duckdb"}
                  </span>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-6 px-2 text-xs text-muted-foreground hover:text-foreground"
                    onClick={() => setEditing(true)}
                  >
                    {t("common.edit")}
                  </Button>
                </div>
              )}
            </TableCell>
          </TableRow>
          <TableRow>
            <TableCell className="text-xs text-muted-foreground">Status</TableCell>
            <TableCell>
              <Badge
                variant="outline"
                className={`text-[10px] h-5 ${
                  status?.status === "connected"
                    ? "text-emerald-400 border-emerald-400/30"
                    : "text-red-400 border-red-400/30"
                }`}
              >
                {status?.status || "unknown"}
              </Badge>
            </TableCell>
          </TableRow>
          <TableRow>
            <TableCell className="text-xs text-muted-foreground">Catalog</TableCell>
            <TableCell>
              <a href="/catalog" className="text-xs text-primary hover:underline">
                View semantic catalog →
              </a>
            </TableCell>
          </TableRow>
          <TableRow>
            <TableCell className="text-xs text-muted-foreground">Batch Size</TableCell>
            <TableCell>
              {editingBatch ? (
                <div className="flex items-center gap-2">
                  <Input
                    type="number"
                    min={1}
                    max={50}
                    value={newBatch}
                    onChange={(e) => setNewBatch(e.target.value)}
                    className="h-7 text-xs font-mono w-20"
                    disabled={savingBatch}
                  />
                  <span className="text-[10px] text-muted-foreground">{t("common.tables_per_batch")}</span>
                  <Button
                    size="sm"
                    className="h-7 text-xs"
                    onClick={() => void handleSaveBatch()}
                    disabled={savingBatch}
                  >
                    {savingBatch ? "..." : "OK"}
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 text-xs"
                    onClick={handleCancelBatch}
                    disabled={savingBatch}
                  >
                    {t("common.cancel")}
                  </Button>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <span className="text-xs font-mono text-foreground">
                    {maxBatch} tables/batch
                  </span>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-6 px-2 text-xs text-muted-foreground hover:text-foreground"
                    onClick={() => setEditingBatch(true)}
                  >
                    {t("common.edit")}
                  </Button>
                </div>
              )}
            </TableCell>
          </TableRow>
          <TableRow>
            <TableCell className="text-xs text-muted-foreground">Max Chart Rows</TableCell>
            <TableCell>
              {editingChartRows ? (
                <div className="flex items-center gap-2">
                  <Input
                    type="number"
                    min={100}
                    max={100000}
                    value={newChartRows}
                    onChange={(e) => setNewChartRows(e.target.value)}
                    className="h-7 text-xs font-mono w-24"
                    disabled={savingChartRows}
                  />
                  <span className="text-[10px] text-muted-foreground">{t("common.rows")}</span>
                  <Button
                    size="sm"
                    className="h-7 text-xs"
                    onClick={() => void handleSaveChartRows()}
                    disabled={savingChartRows}
                  >
                    {savingChartRows ? "..." : "OK"}
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 text-xs"
                    onClick={handleCancelChartRows}
                    disabled={savingChartRows}
                  >
                    {t("common.cancel")}
                  </Button>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <span className="text-xs font-mono text-foreground">
                    {maxChartRows.toLocaleString()} {t("common.rows")}
                  </span>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-6 px-2 text-xs text-muted-foreground hover:text-foreground"
                    onClick={() => setEditingChartRows(true)}
                  >
                    {t("common.edit")}
                  </Button>
                </div>
              )}
            </TableCell>
          </TableRow>
        </TableBody>
      </Table>
      <div className="px-3 py-2 border-t border-border/20 space-y-1">
        <p className="text-[10px] text-muted-foreground">
          <strong>Batch Size:</strong> {t("settings.batch_size_help")}
        </p>
        <p className="text-[10px] text-muted-foreground">
          <strong>Max Chart Rows:</strong> {t("settings.max_chart_rows_help")}
        </p>
      </div>
    </div>
  );
}
