"use client";

import { Loader2, Trash2 } from "lucide-react";
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
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export interface ConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  /** Item name to highlight (optional) */
  itemName?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm: () => void;
  isLoading?: boolean;
  /** Variant for confirm button styling */
  variant?: "default" | "destructive";
}

export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  itemName,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  onConfirm,
  isLoading = false,
  variant = "destructive",
}: ConfirmDialogProps) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          {(itemName || description) && (
            <AlertDialogDescription asChild>
              <div>
                {itemName && (
                  <span className="block font-medium text-foreground mb-1">
                    {itemName}
                  </span>
                )}
                {description && <span>{description}</span>}
              </div>
            </AlertDialogDescription>
          )}
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isLoading}>
            {cancelLabel}
          </AlertDialogCancel>
          <Button
            variant={variant}
            onClick={onConfirm}
            disabled={isLoading}
            className={cn(variant === "destructive" && "gap-2")}
          >
            {isLoading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                {confirmLabel}...
              </>
            ) : (
              <>
                {variant === "destructive" && <Trash2 className="h-4 w-4" />}
                {confirmLabel}
              </>
            )}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
