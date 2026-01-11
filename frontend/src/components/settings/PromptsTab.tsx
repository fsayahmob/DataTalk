"use client";

import { useState, useEffect, useCallback } from "react";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { CheckIcon } from "@/components/icons";
import * as api from "@/lib/api";
import type { LLMPrompt } from "@/lib/api";

// Group prompts by key
interface PromptGroup {
  key: string;
  category: string;
  versions: LLMPrompt[];
  activeVersion: string | null;
}

function groupPromptsByKey(prompts: LLMPrompt[]): PromptGroup[] {
  const groups: Record<string, PromptGroup> = {};

  for (const prompt of prompts) {
    if (!groups[prompt.key]) {
      groups[prompt.key] = {
        key: prompt.key,
        category: prompt.category,
        versions: [],
        activeVersion: null,
      };
    }
    groups[prompt.key].versions.push(prompt);
    if (prompt.is_active) {
      groups[prompt.key].activeVersion = prompt.version;
    }
  }

  return Object.values(groups).sort((a, b) => a.key.localeCompare(b.key));
}

export function PromptsTab() {
  const [prompts, setPrompts] = useState<LLMPrompt[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [expandedKey, setExpandedKey] = useState<string | null>(null);

  const loadPrompts = useCallback(async () => {
    setLoading(true);
    const data = await api.fetchLLMPrompts();
    setPrompts(data);
    setLoading(false);
  }, []);

  useEffect(() => {
    loadPrompts();
  }, [loadPrompts]);

  const handleVersionChange = useCallback(
    async (key: string, version: string) => {
      setSaving(key);
      const success = await api.setActivePromptVersion(key, version);
      if (success) {
        toast.success(`Prompt "${key}" mis à jour`);
        await loadPrompts();
      } else {
        toast.error("Erreur lors de la mise à jour");
      }
      setSaving(null);
    },
    [loadPrompts]
  );

  const groups = groupPromptsByKey(prompts);

  // Category display names and colors
  const categoryInfo: Record<string, { label: string; color: string }> = {
    analytics: { label: "Analytics", color: "text-blue-400" },
    catalog: { label: "Catalogue", color: "text-purple-400" },
    enrichment: { label: "Enrichissement", color: "text-amber-400" },
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-48">
        <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="text-xs text-muted-foreground mb-4">
        Configurez les prompts utilisés par le LLM. Chaque prompt peut avoir
        plusieurs versions (normal, optimisé).
      </div>

      {groups.map((group) => {
        const info = categoryInfo[group.category] || {
          label: group.category,
          color: "text-gray-400",
        };
        const activePrompt = group.versions.find((v) => v.is_active);
        const isExpanded = expandedKey === group.key;

        return (
          <Card
            key={group.key}
            className="bg-[hsl(260_10%_10%)] border-border/30"
          >
            <CardHeader className="py-3 px-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <CardTitle className="text-sm font-mono">
                    {group.key}
                  </CardTitle>
                  <span className={`text-xs ${info.color}`}>{info.label}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Select
                    value={group.activeVersion || "normal"}
                    onValueChange={(v) => handleVersionChange(group.key, v)}
                    disabled={saving === group.key}
                  >
                    <SelectTrigger className="w-32 h-7 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {group.versions.map((v) => (
                        <SelectItem key={v.version} value={v.version}>
                          <span className="flex items-center gap-2">
                            {v.version}
                            {v.is_active && (
                              <CheckIcon size={12} className="text-emerald-400" />
                            )}
                            {v.tokens_estimate && (
                              <span className="text-muted-foreground">
                                ~{v.tokens_estimate}t
                              </span>
                            )}
                          </span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 px-2 text-xs"
                    onClick={() =>
                      setExpandedKey(isExpanded ? null : group.key)
                    }
                  >
                    {isExpanded ? "Masquer" : "Voir"}
                  </Button>
                </div>
              </div>
              {activePrompt?.description && (
                <p className="text-xs text-muted-foreground mt-1">
                  {activePrompt.description}
                </p>
              )}
            </CardHeader>

            {isExpanded && activePrompt && (
              <CardContent className="pt-0 px-4 pb-4">
                <div className="bg-[hsl(260_10%_6%)] rounded-md p-3 max-h-64 overflow-auto">
                  <pre className="text-xs text-muted-foreground whitespace-pre-wrap font-mono">
                    {activePrompt.content}
                  </pre>
                </div>
                <div className="flex items-center gap-4 mt-2 text-[10px] text-muted-foreground">
                  <span>
                    Tokens estimés: {activePrompt.tokens_estimate || "N/A"}
                  </span>
                  <span>Version: {activePrompt.version}</span>
                  <span>
                    MAJ:{" "}
                    {new Date(activePrompt.updated_at).toLocaleDateString(
                      "fr-FR"
                    )}
                  </span>
                </div>
              </CardContent>
            )}
          </Card>
        );
      })}

      {groups.length === 0 && (
        <div className="text-center py-8 text-muted-foreground">
          <p className="text-sm">Aucun prompt configuré</p>
          <p className="text-xs mt-1">
            Exécutez <code className="bg-muted px-1 rounded">python seed_prompts.py</code> pour
            initialiser les prompts.
          </p>
        </div>
      )}
    </div>
  );
}
