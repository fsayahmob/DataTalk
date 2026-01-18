"use client";

import { useState, useEffect, useCallback } from "react";
import { toast } from "sonner";
import {
  DatabaseIcon,
  PlusIcon,
  TrashIcon,
  RefreshIcon,
  CheckIcon,
  CloseIcon,
} from "@/components/icons";
import * as api from "@/lib/api";
import type { Dataset } from "@/lib/api";
import { t } from "@/hooks/useTranslation";

// Format bytes to human readable
function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

// Format date
function formatDate(dateStr: string | null): string {
  if (!dateStr) return "-";
  return new Date(dateStr).toLocaleDateString("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// Status badge component
function StatusBadge({ status }: { status: Dataset["status"] }) {
  const config = {
    empty: { label: t("datasets.status_empty"), className: "bg-muted text-muted-foreground" },
    syncing: { label: t("datasets.status_syncing"), className: "bg-status-info/20 text-status-info" },
    ready: { label: t("datasets.status_ready"), className: "bg-status-success/20 text-status-success" },
    error: { label: t("datasets.status_error"), className: "bg-status-error/20 text-status-error" },
  };
  const { label, className } = config[status];
  return (
    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${className}`}>
      {label}
    </span>
  );
}

// Create dataset modal
function CreateDatasetModal({
  isOpen,
  onClose,
  onCreated,
}: {
  isOpen: boolean;
  onClose: () => void;
  onCreated: (dataset: Dataset) => void;
}) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [isCreating, setIsCreating] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    setIsCreating(true);
    try {
      const dataset = await api.createDataset({ name: name.trim(), description: description.trim() || undefined });
      toast.success(t("datasets.created"));
      onCreated(dataset);
      setName("");
      setDescription("");
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("common.error"));
    } finally {
      setIsCreating(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-background/80 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-card border border-border rounded-xl shadow-xl w-full max-w-md p-6">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-lg font-semibold text-foreground">{t("datasets.create_title")}</h2>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-muted-foreground hover:bg-secondary/50 hover:text-foreground transition-colors"
          >
            <CloseIcon size={16} />
          </button>
        </div>

        <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-foreground mb-1.5">
              {t("datasets.name")} *
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t("datasets.name_placeholder")}
              className="w-full px-3 py-2 bg-secondary/50 border border-border rounded-lg text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
              autoFocus
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-foreground mb-1.5">
              {t("datasets.description")}
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={t("datasets.description_placeholder")}
              rows={3}
              className="w-full px-3 py-2 bg-secondary/50 border border-border rounded-lg text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 resize-none"
            />
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
            >
              {t("common.cancel")}
            </button>
            <button
              type="submit"
              disabled={!name.trim() || isCreating}
              className="px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
            >
              {isCreating ? (
                <>
                  <span className="w-4 h-4 border-2 border-primary-foreground border-t-transparent rounded-full animate-spin" />
                  {t("common.loading")}
                </>
              ) : (
                <>
                  <PlusIcon size={14} />
                  {t("datasets.create")}
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// Delete confirmation modal
function DeleteConfirmModal({
  isOpen,
  datasetName,
  onClose,
  onConfirm,
  isDeleting,
}: {
  isOpen: boolean;
  datasetName: string;
  onClose: () => void;
  onConfirm: () => void;
  isDeleting: boolean;
}) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-background/80 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-card border border-border rounded-xl shadow-xl w-full max-w-sm p-6">
        <h2 className="text-lg font-semibold text-foreground mb-2">
          {t("datasets.delete_confirm_title")}
        </h2>
        <p className="text-sm text-muted-foreground mb-1">
          <strong>{datasetName}</strong>
        </p>
        <p className="text-sm text-muted-foreground mb-6">
          {t("datasets.delete_confirm_desc")}
        </p>

        <div className="flex justify-end gap-3">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
          >
            {t("common.cancel")}
          </button>
          <button
            onClick={onConfirm}
            disabled={isDeleting}
            className="px-4 py-2 bg-status-error text-white rounded-lg text-sm font-medium hover:bg-status-error/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
          >
            {isDeleting ? (
              <>
                <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                {t("common.deleting")}
              </>
            ) : (
              <>
                <TrashIcon size={14} />
                {t("common.delete")}
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

// Dataset card component
function DatasetCard({
  dataset,
  onActivate,
  onDelete,
  onRefresh,
}: {
  dataset: Dataset;
  onActivate: () => void;
  onDelete: () => void;
  onRefresh: () => void;
}) {
  return (
    <div
      className={`bg-card border rounded-xl p-5 hover:border-primary/50 transition-colors ${
        dataset.is_active ? "border-primary ring-1 ring-primary/30" : "border-border"
      }`}
    >
      {/* Header */}
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-3">
          <div className={`p-2 rounded-lg ${dataset.is_active ? "bg-primary/20" : "bg-secondary"}`}>
            <DatabaseIcon size={20} className={dataset.is_active ? "text-primary" : "text-muted-foreground"} />
          </div>
          <div>
            <h3 className="font-semibold text-foreground flex items-center gap-2">
              {dataset.name}
              {dataset.is_active && (
                <span className="px-2 py-0.5 bg-primary/20 text-primary text-xs font-medium rounded-full">
                  {t("datasets.active")}
                </span>
              )}
            </h3>
            {dataset.description && (
              <p className="text-sm text-muted-foreground mt-0.5 line-clamp-1">
                {dataset.description}
              </p>
            )}
          </div>
        </div>
        <StatusBadge status={dataset.status} />
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4 py-3 border-y border-border/50 my-3">
        <div>
          <p className="text-2xl font-semibold text-foreground">{dataset.table_count}</p>
          <p className="text-xs text-muted-foreground">{t("datasets.tables")}</p>
        </div>
        <div>
          <p className="text-2xl font-semibold text-foreground">
            {dataset.row_count.toLocaleString("fr-FR")}
          </p>
          <p className="text-xs text-muted-foreground">{t("datasets.rows")}</p>
        </div>
        <div>
          <p className="text-2xl font-semibold text-foreground">{formatBytes(dataset.size_bytes)}</p>
          <p className="text-xs text-muted-foreground">{t("datasets.size")}</p>
        </div>
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground">
          {t("datasets.created_at")}: {formatDate(dataset.created_at)}
        </p>

        <div className="flex items-center gap-1">
          <button
            onClick={onRefresh}
            className="p-2 rounded-lg text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors"
            title={t("datasets.refresh_stats")}
          >
            <RefreshIcon size={14} />
          </button>
          {!dataset.is_active && (
            <button
              onClick={onActivate}
              className="p-2 rounded-lg text-muted-foreground hover:bg-primary/20 hover:text-primary transition-colors"
              title={t("datasets.activate")}
            >
              <CheckIcon size={14} />
            </button>
          )}
          <button
            onClick={onDelete}
            className="p-2 rounded-lg text-muted-foreground hover:bg-status-error/20 hover:text-status-error transition-colors"
            title={t("common.delete")}
          >
            <TrashIcon size={14} />
          </button>
        </div>
      </div>
    </div>
  );
}

// Empty state
function EmptyState({ onCreate }: { onCreate: () => void }) {
  return (
    <div className="flex-1 flex items-center justify-center">
      <div className="text-center max-w-sm">
        <div className="w-16 h-16 bg-secondary rounded-2xl flex items-center justify-center mx-auto mb-4">
          <DatabaseIcon size={32} className="text-muted-foreground" />
        </div>
        <h3 className="text-lg font-semibold text-foreground mb-2">{t("datasets.empty")}</h3>
        <p className="text-sm text-muted-foreground mb-6">{t("datasets.empty_hint")}</p>
        <button
          onClick={onCreate}
          className="px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors inline-flex items-center gap-2"
        >
          <PlusIcon size={14} />
          {t("datasets.create")}
        </button>
      </div>
    </div>
  );
}

export default function DatasetsPage() {
  const [datasets, setDatasets] = useState<Dataset[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Dataset | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Load datasets
  const loadDatasets = useCallback(async () => {
    try {
      const response = await api.fetchDatasets();
      setDatasets(response.datasets);
    } catch (err) {
      toast.error(t("common.error"));
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadDatasets();
  }, [loadDatasets]);

  // Handle create
  const handleCreated = (dataset: Dataset) => {
    setDatasets((prev) => [dataset, ...prev]);
  };

  // Handle activate
  const handleActivate = async (datasetId: string) => {
    try {
      await api.activateDataset(datasetId);
      toast.success(t("datasets.activated"));
      // Update local state
      setDatasets((prev) =>
        prev.map((d) => ({
          ...d,
          is_active: d.id === datasetId,
        }))
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("common.error"));
    }
  };

  // Handle delete
  const handleDelete = async () => {
    if (!deleteTarget) return;

    setIsDeleting(true);
    try {
      await api.deleteDataset(deleteTarget.id);
      toast.success(t("datasets.deleted"));
      setDatasets((prev) => prev.filter((d) => d.id !== deleteTarget.id));
      setDeleteTarget(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("common.error"));
    } finally {
      setIsDeleting(false);
    }
  };

  // Handle refresh stats
  const handleRefresh = async (datasetId: string) => {
    try {
      const updated = await api.refreshDatasetStats(datasetId);
      setDatasets((prev) => prev.map((d) => (d.id === datasetId ? updated : d)));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("common.error"));
    }
  };

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center bg-background">
        <div className="text-center">
          <span className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin inline-block mb-4" />
          <p className="text-muted-foreground">{t("common.loading")}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col bg-background overflow-hidden">
      {/* Header */}
      <div className="px-6 py-5 border-b border-border/50">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold text-foreground">{t("datasets.title")}</h1>
            <p className="text-sm text-muted-foreground mt-0.5">{t("datasets.subtitle")}</p>
          </div>
          <button
            onClick={() => setShowCreateModal(true)}
            className="px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors inline-flex items-center gap-2"
          >
            <PlusIcon size={14} />
            {t("datasets.create")}
          </button>
        </div>
      </div>

      {/* Content */}
      {datasets.length === 0 ? (
        <EmptyState onCreate={() => setShowCreateModal(true)} />
      ) : (
        <div className="flex-1 overflow-auto p-6">
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {datasets.map((dataset) => (
              <DatasetCard
                key={dataset.id}
                dataset={dataset}
                onActivate={() => void handleActivate(dataset.id)}
                onDelete={() => setDeleteTarget(dataset)}
                onRefresh={() => void handleRefresh(dataset.id)}
              />
            ))}
          </div>
        </div>
      )}

      {/* Create Modal */}
      <CreateDatasetModal
        isOpen={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        onCreated={handleCreated}
      />

      {/* Delete Confirmation Modal */}
      <DeleteConfirmModal
        isOpen={!!deleteTarget}
        datasetName={deleteTarget?.name || ""}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => void handleDelete()}
        isDeleting={isDeleting}
      />
    </div>
  );
}
