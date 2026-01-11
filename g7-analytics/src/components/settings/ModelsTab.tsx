"use client";

import { useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { LLMProvider, LLMModel } from "@/lib/api";

interface ModelsTabProps {
  providers: LLMProvider[];
  allModels: LLMModel[];
  defaultModel: LLMModel | null;
  selectedProvider: string;
  searchQuery: string;
  onProviderChange: (provider: string) => void;
  onSearchChange: (query: string) => void;
  onSetDefaultModel: (modelId: string) => void;
}

type ProviderStatus = "ready" | "unavailable" | "missing" | null;

export function ModelsTab({
  providers,
  allModels,
  defaultModel,
  selectedProvider,
  searchQuery,
  onProviderChange,
  onSearchChange,
  onSetDefaultModel,
}: ModelsTabProps) {
  // Filter models
  const filteredModels = useMemo(() => {
    let result = allModels;
    if (selectedProvider !== "all") {
      const provider = providers.find((p) => p.name === selectedProvider);
      result = result.filter((m) => m.provider_id === provider?.id);
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(
        (m) =>
          m.model_id.toLowerCase().includes(q) ||
          m.display_name.toLowerCase().includes(q)
      );
    }
    return result;
  }, [allModels, selectedProvider, providers, searchQuery]);

  // Get provider status for a model
  const getProviderStatus = (providerId: number): ProviderStatus => {
    const provider = providers.find((p) => p.id === providerId);
    if (!provider) return null;
    if (provider.is_available) return "ready";
    if (!provider.requires_api_key) return "unavailable";
    return "missing";
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3">
        <Input
          placeholder="Search models..."
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
          className="w-64 h-8 text-xs"
        />
        <Select value={selectedProvider} onValueChange={onProviderChange}>
          <SelectTrigger className="w-40 h-8 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All providers</SelectItem>
            {providers.map((p) => (
              <SelectItem key={p.id} value={p.name}>
                {p.display_name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <span className="text-xs text-muted-foreground">
          {filteredModels.length} models
        </span>
      </div>

      <div className="border border-border/30 rounded-md">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="text-xs">Model</TableHead>
              <TableHead className="text-xs">Provider</TableHead>
              <TableHead className="text-xs text-right">Context</TableHead>
              <TableHead className="text-xs text-right">$/1M in</TableHead>
              <TableHead className="text-xs text-right">$/1M out</TableHead>
              <TableHead className="text-xs text-center w-20">Default</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredModels.map((model) => {
              const provider = providers.find((p) => p.id === model.provider_id);
              const isDefault = defaultModel?.id === model.id;
              const status = getProviderStatus(model.provider_id);

              return (
                <TableRow
                  key={model.id}
                  className={isDefault ? "bg-primary/5" : ""}
                >
                  <TableCell className="py-2">
                    <code className="text-xs text-foreground">{model.model_id}</code>
                  </TableCell>
                  <TableCell className="py-2">
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground">
                        {provider?.display_name}
                      </span>
                      {status === "ready" && (
                        <Badge variant="outline" className="text-[10px] px-1 py-0 h-4 text-emerald-400 border-emerald-400/30">
                          ready
                        </Badge>
                      )}
                      {status === "missing" && (
                        <Badge variant="outline" className="text-[10px] px-1 py-0 h-4 text-red-400 border-red-400/30">
                          no key
                        </Badge>
                      )}
                      {status === "unavailable" && (
                        <Badge variant="outline" className="text-[10px] px-1 py-0 h-4 text-amber-400 border-amber-400/30">
                          offline
                        </Badge>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="py-2 text-right">
                    <span className="text-xs font-mono text-muted-foreground">
                      {(model.context_window / 1000).toFixed(0)}k
                    </span>
                  </TableCell>
                  <TableCell className="py-2 text-right">
                    <span className="text-xs font-mono text-muted-foreground">
                      {model.cost_per_1m_input ?? "—"}
                    </span>
                  </TableCell>
                  <TableCell className="py-2 text-right">
                    <span className="text-xs font-mono text-muted-foreground">
                      {model.cost_per_1m_output ?? "—"}
                    </span>
                  </TableCell>
                  <TableCell className="py-2 text-center">
                    {isDefault ? (
                      <span className="text-primary text-sm">●</span>
                    ) : (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 w-6 p-0 text-muted-foreground hover:text-foreground"
                        onClick={() => onSetDefaultModel(model.model_id)}
                        title="Set as default"
                      >
                        ○
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
