"use client";

import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useTranslation } from "@/hooks/useTranslation";

interface DeleteDatasetModalProps {
  isOpen: boolean;
  datasetName: string;
  onClose: () => void;
  onConfirm: () => void;
  isDeleting: boolean;
}

export function DeleteDatasetModal({
  isOpen,
  datasetName,
  onClose,
  onConfirm,
  isDeleting,
}: DeleteDatasetModalProps) {
  const { t } = useTranslation();

  return (
    <ConfirmDialog
      open={isOpen}
      onOpenChange={(open) => !open && onClose()}
      title={t("datasets.delete_confirm_title")}
      itemName={datasetName}
      description={t("datasets.delete_confirm_desc")}
      confirmLabel={t("common.delete")}
      cancelLabel={t("common.cancel")}
      onConfirm={onConfirm}
      isLoading={isDeleting}
      variant="destructive"
    />
  );
}
