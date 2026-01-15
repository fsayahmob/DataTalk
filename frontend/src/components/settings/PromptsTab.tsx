"use client";

import { useState, useEffect, useCallback, startTransition } from "react";
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
import * as api from "@/lib/api";
import type { LLMPrompt, CatalogContextMode, Prompt } from "@/lib/api";

// Group prompts by key
interface PromptGroup {
  key: string;
  category: string;
  versions: LLMPrompt[];
  activeVersion: string | null;
}

function _groupPromptsByKey(prompts: LLMPrompt[]): PromptGroup[] {
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
  const [prompts, setPrompts] = useState<Prompt[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [expandedKey, setExpandedKey] = useState<string | null>(null);
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [editedContent, setEditedContent] = useState<string>("");
  const [contextMode, setContextMode] = useState<CatalogContextMode>("full");

  const loadPrompts = useCallback(async () => {
    setLoading(true);
    const [promptsData, modeData] = await Promise.all([
      api.fetchPrompts(),
      api.fetchCatalogContextMode(),
    ]);
    setPrompts(promptsData);
    setContextMode(modeData);
    setLoading(false);
  }, []);

  useEffect(() => {
    startTransition(() => {
      void loadPrompts();
    });
  }, [loadPrompts]);

  const handleContextModeChange = useCallback(
    async (mode: CatalogContextMode) => {
      setSaving("catalog_context_mode");
      const success = await api.setCatalogContextMode(mode);
      if (success) {
        setContextMode(mode);
        toast.success(`Mode de contexte: ${mode}`);
      } else {
        toast.error("Erreur lors de la mise à jour");
      }
      setSaving(null);
    },
    []
  );

  const handleEdit = (prompt: Prompt) => {
    setEditingKey(prompt.key);
    setEditedContent(prompt.content);
    setExpandedKey(prompt.key);
  };

  const handleCancelEdit = () => {
    setEditingKey(null);
    setEditedContent("");
  };

  const handleSaveEdit = async (key: string) => {
    setSaving(key);
    const success = await api.updatePrompt(key, editedContent);
    if (success) {
      toast.success("Prompt mis à jour");
      setEditingKey(null);
      await loadPrompts();
    } else {
      toast.error("Erreur lors de la mise à jour");
    }
    setSaving(null);
  };

  // Grouper les prompts actifs seulement
  const activePrompts = prompts.filter((p) => p.is_active);

  // Category display names and colors
  const categoryInfo: Record<string, { label: string; color: string }> = {
    analytics: { label: "Analytics", color: "text-blue-400" },
    catalog: { label: "Catalogue", color: "text-purple-400" },
    enrichment: { label: "Enrichissement", color: "text-amber-400" },
    widgets: { label: "Widgets", color: "text-green-400" },
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
        Configurez les prompts utilisés par le LLM pour l&apos;analyse et l&apos;enrichissement du catalogue.
      </div>

      {activePrompts.map((prompt) => {
        const info = categoryInfo[prompt.category] || {
          label: prompt.category,
          color: "text-gray-400",
        };
        const isExpanded = expandedKey === prompt.key;
        const isEditing = editingKey === prompt.key;
        const isAnalyticsSystem = prompt.key === "analytics_system";

        return (
          <Card
            key={prompt.key}
            className="bg-[hsl(220_10%_10%)] border-border/30"
          >
            <CardHeader className="py-3 px-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <CardTitle className="text-sm font-mono">
                    {prompt.name}
                  </CardTitle>
                  <span className={`text-xs ${info.color}`}>{info.label}</span>
                </div>
                <div className="flex items-center gap-2">
                  {/* Sélecteur compact/full pour analytics_system */}
                  {isAnalyticsSystem && !isEditing && (
                    <Select
                      value={contextMode}
                      onValueChange={(v) => void handleContextModeChange(v as CatalogContextMode)}
                      disabled={saving === "catalog_context_mode"}
                    >
                      <SelectTrigger className="w-28 h-7 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="compact">compact ~800t</SelectItem>
                        <SelectItem value="full">full ~2200t</SelectItem>
                      </SelectContent>
                    </Select>
                  )}
                  {!isEditing && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 px-2 text-xs"
                      onClick={() => handleEdit(prompt)}
                    >
                      Éditer
                    </Button>
                  )}
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 px-2 text-xs"
                    onClick={() => setExpandedKey(isExpanded ? null : prompt.key)}
                  >
                    {isExpanded ? "Masquer" : "Voir"}
                  </Button>
                </div>
              </div>
              {prompt.description && (
                <p className="text-xs text-muted-foreground mt-1">
                  {prompt.description}
                </p>
              )}
            </CardHeader>

            {isExpanded && (
              <CardContent className="pt-0 px-4 pb-4">
                {/* Explication du mode compact/full pour analytics_system */}
                {isAnalyticsSystem && !isEditing && (
                  <div className="mb-3 p-2 rounded bg-primary/10 border border-primary/20">
                    <p className="text-xs text-muted-foreground">
                      <strong className="text-foreground">Mode {contextMode}:</strong>{" "}
                      {contextMode === "compact"
                        ? "Schéma simple (nom, type). Moins de tokens, réponses plus rapides."
                        : "Schéma enrichi (stats, ENUM, distribution). Plus précis pour les requêtes complexes."}
                    </p>
                  </div>
                )}

                {isEditing ? (
                  <div className="space-y-3">
                    <textarea
                      value={editedContent}
                      onChange={(e) => setEditedContent(e.target.value)}
                      className="w-full h-96 px-3 py-2 rounded-md border border-border bg-[hsl(220_10%_6%)] font-mono text-xs resize-none focus:outline-none focus:ring-2 focus:ring-primary"
                    />
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        onClick={() => void handleSaveEdit(prompt.key)}
                        disabled={saving === prompt.key || editedContent === prompt.content}
                      >
                        {saving === prompt.key ? "Enregistrement..." : "Enregistrer"}
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={handleCancelEdit}
                      >
                        Annuler
                      </Button>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="bg-[hsl(220_10%_6%)] rounded-md p-3 max-h-64 overflow-auto">
                      <pre className="text-xs text-muted-foreground whitespace-pre-wrap font-mono">
                        {prompt.content}
                      </pre>
                    </div>
                    <div className="flex items-center gap-4 mt-2 text-[10px] text-muted-foreground">
                      <span>Key: {prompt.key}</span>
                      {prompt.tokens_estimate && (
                        <span>Tokens: {prompt.tokens_estimate}</span>
                      )}
                      <span>
                        MAJ: {new Date(prompt.updated_at).toLocaleDateString("fr-FR")}
                      </span>
                    </div>
                  </>
                )}
              </CardContent>
            )}
          </Card>
        );
      })}

      {activePrompts.length === 0 && (
        <div className="text-center py-8 text-muted-foreground">
          <p className="text-sm">Aucun prompt configuré</p>
          <p className="text-xs mt-1">
            Exécutez <code className="bg-muted px-1 rounded">sqlite3 catalog.sqlite {"<"} schema.sql</code> pour
            initialiser les prompts.
          </p>
        </div>
      )}
    </div>
  );
}
