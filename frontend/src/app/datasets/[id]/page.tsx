"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  DatabaseIcon,
  ArrowLeftIcon,
  TrashIcon,
  CheckIcon,
  PlusIcon,
  CloseIcon,
} from "@/components/icons";
import {
  StatusBadge,
  SyncableDatasourceCard,
  DatasourceCardSkeletonGrid,
  CreateDatasourceWizard,
  DatasourceDetailsPanel,
} from "@/components/datasets";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import type { Datasource } from "@/lib/api";
import { formatBytes, formatDateFR } from "@/lib/utils";
import { useTranslation } from "@/hooks/useTranslation";
import { useDatasetStore } from "@/stores/useDatasetStore";
import { useDatasourceStore } from "@/stores/useDatasourceStore";

export default function DatasetDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { t } = useTranslation();
  const datasetId = params.id as string;

  // Dataset store - single source of truth
  const dataset = useDatasetStore((state) => state.getDatasetById(datasetId));
  const loadingDataset = useDatasetStore((state) => state.loading);
  const datasetError = useDatasetStore((state) => state.error);
  const loadDatasetById = useDatasetStore((state) => state.loadDatasetById);
  const activateDataset = useDatasetStore((state) => state.activateDataset);
  const deleteDatasetAction = useDatasetStore((state) => state.deleteDataset);

  // Datasource store
  const datasources = useDatasourceStore((state) => state.datasources);
  const loadingDatasources = useDatasourceStore((state) => state.loading);
  const loadDatasources = useDatasourceStore((state) => state.loadDatasources);
  const deleteDatasourceAction = useDatasourceStore((state) => state.deleteDatasource);

  // Modal states only - no data duplication
  const [showDeleteDatasetDialog, setShowDeleteDatasetModal] = useState(false);
  const [isDeletingDataset, setIsDeletingDataset] = useState(false);
  const [showDeleteDatasourceDialog, setShowDeleteDatasourceDialog] = useState(false);
  const [datasourceToDelete, setDatasourceToDelete] = useState<Datasource | null>(null);
  const [isDeletingDatasource, setIsDeletingDatasource] = useState(false);
  const [showCreateDatasourceWizard, setShowCreateDatasourceWizard] = useState(false);
  const [selectedDatasource, setSelectedDatasource] = useState<Datasource | null>(null);

  // Load data on mount
  useEffect(() => {
    if (!datasetId) return;
    void loadDatasetById(datasetId);
    void loadDatasources(datasetId);
  }, [datasetId, loadDatasetById, loadDatasources]);

  // Handle dataset activation
  const handleActivate = async () => {
    if (!dataset) return;
    await activateDataset(dataset.id);
  };

  // Handle dataset deletion
  const handleDeleteDataset = async () => {
    if (!dataset) return;
    setIsDeletingDataset(true);
    try {
      const success = await deleteDatasetAction(dataset.id);
      if (success) {
        setShowDeleteDatasetModal(false);
        router.push("/datasets");
      }
    } finally {
      setIsDeletingDataset(false);
    }
  };

  // Handle datasource deletion
  const handleDeleteDatasource = (datasourceId: number) => {
    const ds = datasources.find((d) => d.id === datasourceId);
    if (ds) {
      setDatasourceToDelete(ds);
      setShowDeleteDatasourceDialog(true);
    }
  };

  const confirmDeleteDatasource = async () => {
    if (!datasourceToDelete) return;
    setIsDeletingDatasource(true);
    try {
      const success = await deleteDatasourceAction(datasourceToDelete.id);
      if (success) {
        setShowDeleteDatasourceDialog(false);
        setDatasourceToDelete(null);
      }
    } finally {
      setIsDeletingDatasource(false);
    }
  };

  // Loading state
  if (loadingDataset && !dataset) {
    return (
      <div className="flex-1 flex items-center justify-center bg-background">
        <div className="text-center">
          <span className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin inline-block mb-4" />
          <p className="text-muted-foreground">{t("common.loading")}</p>
        </div>
      </div>
    );
  }

  // Error state
  if (datasetError || !dataset) {
    return (
      <div className="flex-1 flex items-center justify-center bg-background">
        <div className="text-center">
          <div className="w-16 h-16 mx-auto mb-4 bg-destructive/10 rounded-full flex items-center justify-center">
            <CloseIcon size={32} className="text-destructive" />
          </div>
          <h1 className="text-xl font-semibold text-foreground mb-2">
            {t("datasets.not_found")}
          </h1>
          <p className="text-muted-foreground mb-6">
            {datasetError || t("datasets.not_found_desc")}
          </p>
          <Button onClick={() => router.push("/datasets")} className="gap-2">
            <ArrowLeftIcon size={14} />
            {t("datasets.back")}
          </Button>
        </div>
      </div>
    );
  }

  // Success state
  return (
    <div className="flex-1 flex flex-col bg-background overflow-hidden">
      {/* Header */}
      <div className="px-6 py-5 border-b border-border/50">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => router.push("/datasets")}
              title={t("datasets.back")}
            >
              <ArrowLeftIcon size={20} />
            </Button>
            <div className="flex items-center gap-3">
              <div className={`p-2 rounded-lg ${dataset.is_active ? "bg-primary/20" : "bg-secondary"}`}>
                <DatabaseIcon size={24} className={dataset.is_active ? "text-primary" : "text-muted-foreground"} />
              </div>
              <div>
                <h1 className="text-xl font-semibold text-foreground flex items-center gap-2">
                  {dataset.name}
                  {dataset.is_active && (
                    <span className="px-2 py-0.5 bg-primary/20 text-primary text-xs font-medium rounded-full">
                      {t("datasets.active")}
                    </span>
                  )}
                </h1>
                {dataset.description && (
                  <p className="text-sm text-muted-foreground mt-0.5">{dataset.description}</p>
                )}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <StatusBadge status={dataset.status} />
            {!dataset.is_active && (
              <Button
                size="sm"
                onClick={() => void handleActivate()}
                className="gap-1.5"
              >
                <CheckIcon size={14} />
                {t("datasets.activate")}
              </Button>
            )}
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setShowDeleteDatasetModal(true)}
              className="text-muted-foreground hover:bg-destructive/20 hover:text-destructive"
              title={t("common.delete")}
            >
              <TrashIcon size={18} />
            </Button>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto p-6">
        {/* Stats Cards */}
        <div className="grid grid-cols-3 gap-4 mb-6">
          <div className="bg-card border border-border rounded-xl p-4">
            <p className="text-3xl font-semibold text-foreground">{dataset.table_count}</p>
            <p className="text-sm text-muted-foreground">{t("datasets.tables")}</p>
          </div>
          <div className="bg-card border border-border rounded-xl p-4">
            <p className="text-3xl font-semibold text-foreground">
              {dataset.row_count.toLocaleString("fr-FR")}
            </p>
            <p className="text-sm text-muted-foreground">{t("datasets.rows")}</p>
          </div>
          <div className="bg-card border border-border rounded-xl p-4">
            <p className="text-3xl font-semibold text-foreground">{formatBytes(dataset.size_bytes)}</p>
            <p className="text-sm text-muted-foreground">{t("datasets.size")}</p>
          </div>
        </div>

        {/* Datasources Section */}
        <div className="bg-card border border-border rounded-xl p-5 mb-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-foreground">
              {t("datasets.datasources_title")}
            </h2>
            <Button
              size="sm"
              onClick={() => setShowCreateDatasourceWizard(true)}
              className="gap-1.5"
            >
              <PlusIcon size={14} />
              {t("datasets.add_datasource")}
            </Button>
          </div>

          {loadingDatasources ? (
            <DatasourceCardSkeletonGrid />
          ) : datasources.length === 0 ? (
            <div className="text-center py-8">
              <div className="w-12 h-12 bg-secondary rounded-xl flex items-center justify-center mx-auto mb-3">
                <DatabaseIcon size={24} className="text-muted-foreground" />
              </div>
              <p className="text-sm text-muted-foreground">{t("datasets.datasources_empty")}</p>
              <p className="text-xs text-muted-foreground mt-1">{t("datasets.datasources_empty_hint")}</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {datasources.map((ds) => (
                <SyncableDatasourceCard
                  key={ds.id}
                  datasource={ds}
                  onDelete={handleDeleteDatasource}
                  onClick={setSelectedDatasource}
                />
              ))}
            </div>
          )}
        </div>

        {/* Metadata Section */}
        <div className="bg-card border border-border rounded-xl p-5">
          <h2 className="text-lg font-semibold text-foreground mb-4">
            {t("datasets.metadata_title")}
          </h2>
          <div className="space-y-3 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">{t("datasets.created_at")}</span>
              <span className="text-foreground">{formatDateFR(dataset.created_at)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">{t("datasets.updated_at")}</span>
              <span className="text-foreground">{formatDateFR(dataset.updated_at)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">{t("datasets.duckdb_path")}</span>
              <span className="text-foreground font-mono text-xs">{dataset.duckdb_path}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Delete Dataset Modal */}
      <ConfirmDialog
        open={showDeleteDatasetDialog}
        onOpenChange={(open) => !open && setShowDeleteDatasetModal(false)}
        title={t("datasets.delete_confirm_title")}
        itemName={dataset.name}
        description={t("datasets.delete_confirm_desc")}
        confirmLabel={t("common.delete")}
        cancelLabel={t("common.cancel")}
        onConfirm={() => void handleDeleteDataset()}
        isLoading={isDeletingDataset}
        variant="destructive"
      />

      {/* Delete Datasource Modal */}
      <ConfirmDialog
        open={showDeleteDatasourceDialog}
        onOpenChange={(open) => {
          if (!open) {
            setShowDeleteDatasourceDialog(false);
            setDatasourceToDelete(null);
          }
        }}
        title={t("datasource.delete_confirm_title")}
        itemName={datasourceToDelete?.name || ""}
        description={t("datasource.delete_confirm_desc")}
        confirmLabel={t("common.delete")}
        cancelLabel={t("common.cancel")}
        onConfirm={() => void confirmDeleteDatasource()}
        isLoading={isDeletingDatasource}
        variant="destructive"
      />

      {/* Create Datasource Wizard */}
      <CreateDatasourceWizard
        isOpen={showCreateDatasourceWizard}
        datasetId={datasetId}
        onClose={() => setShowCreateDatasourceWizard(false)}
        onCreated={() => {
          setShowCreateDatasourceWizard(false);
          // Le wizard appelle déjà loadDatasources + triggerSync
          // Pas besoin de recharger ici (cela écraserait le statut optimiste "running")
        }}
      />

      {/* Datasource Details Panel */}
      {selectedDatasource && (
        <DatasourceDetailsPanel
          datasource={selectedDatasource}
          onClose={() => setSelectedDatasource(null)}
        />
      )}
    </div>
  );
}
