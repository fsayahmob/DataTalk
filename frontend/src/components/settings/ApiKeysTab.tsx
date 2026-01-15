"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { LLMProvider } from "@/lib/api";

interface ApiKeysTabProps {
  providers: LLMProvider[];
  onSaveApiKey: (providerName: string, apiKey: string) => Promise<void>;
  onDeleteApiKey: (providerName: string) => Promise<void>;
  onSaveBaseUrl: (providerName: string, baseUrl: string) => Promise<void>;
}

export function ApiKeysTab({
  providers,
  onSaveApiKey,
  onDeleteApiKey,
  onSaveBaseUrl,
}: ApiKeysTabProps) {
  const [apiKey, setApiKey] = useState("");
  const [editingProvider, setEditingProvider] = useState<string | null>(null);
  const [editingBaseUrl, setEditingBaseUrl] = useState<string | null>(null);
  const [baseUrl, setBaseUrl] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  const handleSaveApiKey = async (providerName: string) => {
    if (!apiKey.trim()) return;
    setIsSaving(true);
    await onSaveApiKey(providerName, apiKey);
    setApiKey("");
    setEditingProvider(null);
    setIsSaving(false);
  };

  const handleSaveBaseUrl = async (providerName: string) => {
    setIsSaving(true);
    await onSaveBaseUrl(providerName, baseUrl.trim());
    setBaseUrl("");
    setEditingBaseUrl(null);
    setIsSaving(false);
  };

  return (
    <div className="border border-border/30 rounded-md">
      <Table>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead className="text-xs">Provider</TableHead>
            <TableHead className="text-xs">Type</TableHead>
            <TableHead className="text-xs">API Key</TableHead>
            <TableHead className="text-xs">Status</TableHead>
            <TableHead className="text-xs text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {providers.map((provider) => (
            <TableRow key={provider.id}>
              <TableCell className="py-2">
                <span className="text-xs font-medium text-foreground">
                  {provider.display_name}
                </span>
              </TableCell>
              <TableCell className="py-2">
                <div className="flex flex-col gap-1">
                  <span className="text-xs text-muted-foreground">{provider.type}</span>
                  {provider.type === "self-hosted" && (
                    editingBaseUrl === provider.name ? (
                      <div className="flex items-center gap-2">
                        <Input
                          type="text"
                          placeholder="http://localhost:11434"
                          value={baseUrl}
                          onChange={(e) => setBaseUrl(e.target.value)}
                          className="h-6 text-[10px] w-44"
                          autoFocus
                          onKeyDown={(e) => {
                            if (e.key === "Enter") void handleSaveBaseUrl(provider.name);
                            if (e.key === "Escape") {
                              setEditingBaseUrl(null);
                              setBaseUrl("");
                            }
                          }}
                        />
                        <Button
                          size="sm"
                          className="h-6 text-[10px] px-2"
                          onClick={() => void handleSaveBaseUrl(provider.name)}
                          disabled={isSaving}
                        >
                          Save
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-6 text-[10px] px-1"
                          onClick={() => {
                            setEditingBaseUrl(null);
                            setBaseUrl("");
                          }}
                        >
                          ✕
                        </Button>
                      </div>
                    ) : (
                      <button
                        onClick={() => {
                          setEditingBaseUrl(provider.name);
                          setBaseUrl(provider.base_url || "");
                        }}
                        className="text-[10px] text-muted-foreground/60 hover:text-foreground text-left"
                      >
                        {provider.base_url || "Click to configure URL"}
                      </button>
                    )
                  )}
                </div>
              </TableCell>
              <TableCell className="py-2">
                {editingProvider === provider.name ? (
                  <div className="flex items-center gap-2">
                    <Input
                      type="password"
                      placeholder="sk-..."
                      value={apiKey}
                      onChange={(e) => setApiKey(e.target.value)}
                      className="h-7 text-xs w-48"
                      autoFocus
                      onKeyDown={(e) => {
                        if (e.key === "Enter") void handleSaveApiKey(provider.name);
                        if (e.key === "Escape") {
                          setEditingProvider(null);
                          setApiKey("");
                        }
                      }}
                    />
                    <Button
                      size="sm"
                      className="h-7 text-xs px-2"
                      onClick={() => void handleSaveApiKey(provider.name)}
                      disabled={isSaving || !apiKey.trim()}
                    >
                      Save
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 text-xs px-2"
                      onClick={() => {
                        setEditingProvider(null);
                        setApiKey("");
                      }}
                    >
                      Cancel
                    </Button>
                  </div>
                ) : (
                  <code className="text-xs text-muted-foreground">
                    {provider.api_key_hint || (provider.requires_api_key ? "Not configured" : "N/A")}
                  </code>
                )}
              </TableCell>
              <TableCell className="py-2">
                {provider.is_available ? (
                  <Badge variant="outline" className="text-[10px] h-5 text-emerald-400 border-emerald-400/30">
                    ready
                  </Badge>
                ) : !provider.requires_api_key ? (
                  <Badge variant="outline" className="text-[10px] h-5 text-amber-400 border-amber-400/30">
                    offline
                  </Badge>
                ) : (
                  <Badge variant="outline" className="text-[10px] h-5 text-red-400 border-red-400/30">
                    missing key
                  </Badge>
                )}
              </TableCell>
              <TableCell className="py-2 text-right">
                {provider.requires_api_key && editingProvider !== provider.name && (
                  <div className="flex items-center justify-end gap-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 text-xs px-2"
                      onClick={() => {
                        setEditingProvider(provider.name);
                        setApiKey("");
                      }}
                    >
                      {provider.api_key_configured ? "Update" : "Configure"}
                    </Button>
                    {provider.api_key_configured && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 text-xs px-2 text-red-400 hover:text-red-300"
                        onClick={() => void onDeleteApiKey(provider.name)}
                      >
                        Delete
                      </Button>
                    )}
                  </div>
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
