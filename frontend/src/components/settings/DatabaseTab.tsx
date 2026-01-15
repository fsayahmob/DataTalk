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

export function DatabaseTab() {
  const [status, setStatus] = useState<DatabaseStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [newPath, setNewPath] = useState("");
  const [saving, setSaving] = useState(false);
  const [maxBatch, setMaxBatch] = useState(15);
  const [editingBatch, setEditingBatch] = useState(false);
  const [newBatch, setNewBatch] = useState("15");
  const [savingBatch, setSavingBatch] = useState(false);

  const loadStatus = useCallback(async () => {
    setLoading(true);
    const [data, batchValue] = await Promise.all([
      api.fetchDatabaseStatus(),
      api.fetchMaxTablesPerBatch(),
    ]);
    setStatus(data);
    if (data) {
      setNewPath(data.configured_path);
    }
    setMaxBatch(batchValue);
    setNewBatch(String(batchValue));
    setLoading(false);
  }, []);

  useEffect(() => {
    startTransition(() => {
      void loadStatus();
    });
  }, [loadStatus]);

  const handleSave = async () => {
    if (!newPath.trim()) {
      toast.error("Chemin requis");
      return;
    }
    setSaving(true);
    const result = await api.setDuckdbPath(newPath.trim());
    if (result.success) {
      toast.success(`Connecté à: ${result.resolved_path}`);
      setEditing(false);
      await loadStatus();
    } else {
      toast.error(result.error || "Erreur");
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
      toast.error("Valeur entre 1 et 50");
      return;
    }
    setSavingBatch(true);
    const success = await api.setMaxTablesPerBatch(val);
    if (success) {
      setMaxBatch(val);
      setEditingBatch(false);
      toast.success(`Batch size: ${val} tables`);
    } else {
      toast.error("Erreur de sauvegarde");
    }
    setSavingBatch(false);
  };

  const handleCancelBatch = () => {
    setEditingBatch(false);
    setNewBatch(String(maxBatch));
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
                    Annuler
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
                    Modifier
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
                  <span className="text-[10px] text-muted-foreground">tables/batch</span>
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
                    Annuler
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
                    Modifier
                  </Button>
                </div>
              )}
            </TableCell>
          </TableRow>
        </TableBody>
      </Table>
      <div className="px-3 py-2 border-t border-border/20">
        <p className="text-[10px] text-muted-foreground">
          Batch Size: nombre de tables envoyées au LLM par requête lors de l&apos;enrichissement.
          Réduire si erreur &quot;too many states&quot; avec Vertex AI.
        </p>
      </div>
    </div>
  );
}
