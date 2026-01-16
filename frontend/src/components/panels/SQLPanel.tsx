"use client";

import { useState } from "react";
import { CopyIcon, CodeIcon, ChevronDownIcon, ChevronUpIcon } from "@/components/icons";
import { t } from "@/hooks/useTranslation";

interface SQLPanelProps {
  sql: string;
}

export function SQLPanel({ sql }: SQLPanelProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(sql);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (!sql) return null;

  return (
    <div className="border-b border-border/50 bg-secondary/20">
      {/* Header */}
      <div className="px-3 py-2 flex items-center justify-between">
        <button
          onClick={() => setIsOpen(!isOpen)}
          className="text-xs font-medium flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors"
        >
          <CodeIcon size={12} />
          SQL
          {isOpen ? <ChevronUpIcon size={12} /> : <ChevronDownIcon size={12} />}
        </button>
        <button
          onClick={() => void handleCopy()}
          className="text-xs text-muted-foreground hover:text-primary flex items-center gap-1.5 transition-colors"
        >
          <CopyIcon size={12} />
          {copied ? t("common.copied") : t("common.copy")}
        </button>
      </div>

      {/* Contenu rétractable */}
      {isOpen && (
        <div className="px-3 pb-3 overflow-auto max-h-48">
          <pre className="text-xs font-mono text-foreground/80 whitespace-pre-wrap break-all">
            {sql}
          </pre>
        </div>
      )}
    </div>
  );
}
