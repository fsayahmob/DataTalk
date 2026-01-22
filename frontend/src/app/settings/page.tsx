"use client";

import { useState, useEffect } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ModelsTab, ApiKeysTab, UsageTab, DatabaseTab, PromptsTab, AppearanceTab } from "@/components/settings";
import * as api from "@/lib/api";
import type { LLMCosts } from "@/lib/api";
import { useLLMStore } from "@/stores/useLLMStore";

export default function SettingsPage() {
  // LLM store - single source of truth
  const status = useLLMStore((state) => state.status);
  const providers = useLLMStore((state) => state.providers);
  const models = useLLMStore((state) => state.models);
  const defaultModel = useLLMStore((state) => state.defaultModel);
  const loadAll = useLLMStore((state) => state.loadAll);
  const saveApiKey = useLLMStore((state) => state.saveApiKey);
  const deleteApiKey = useLLMStore((state) => state.deleteApiKey);
  const saveBaseUrl = useLLMStore((state) => state.saveBaseUrl);
  const setDefaultModelAction = useLLMStore((state) => state.setDefaultModel);

  // Local UI state only
  const [selectedProvider, setSelectedProvider] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [costs, setCosts] = useState<LLMCosts | null>(null);
  const [costsPeriod, setCostsPeriod] = useState<number>(30);

  // Load all LLM data on mount
  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  // Load costs separately (not in store as it's page-specific)
  useEffect(() => {
    void api.fetchLLMCosts(costsPeriod).then(setCosts);
  }, [costsPeriod]);

  // Handlers - delegate to store
  const handleSaveApiKey = async (providerName: string, apiKey: string) => {
    await saveApiKey(providerName, apiKey);
  };

  const handleDeleteApiKey = async (providerName: string) => {
    await deleteApiKey(providerName);
  };

  const handleSaveBaseUrl = async (providerName: string, baseUrl: string) => {
    await saveBaseUrl(providerName, baseUrl);
  };

  const handleSetDefaultModel = async (modelId: string) => {
    await setDefaultModelAction(modelId);
  };

  return (
    <div className="flex-1 overflow-auto bg-background">
      <div className="max-w-6xl mx-auto px-6 py-4">
        {/* Header */}
        <div className="flex items-center justify-between mb-4 pb-3 border-b border-border/30">
          <div>
            <h1 className="text-lg font-semibold text-foreground">Settings</h1>
            <p className="text-xs text-muted-foreground">
              LLM:{" "}
              {status?.status === "ok" ? (
                <span className="text-status-success">{status.model}</span>
              ) : (
                <span className="text-status-error">Not configured</span>
              )}
            </p>
          </div>
        </div>

        <Tabs defaultValue="models" className="w-full">
          <TabsList className="h-8 mb-4">
            <TabsTrigger value="models" className="text-xs px-3 h-7">
              Models
            </TabsTrigger>
            <TabsTrigger value="keys" className="text-xs px-3 h-7">
              API Keys
            </TabsTrigger>
            <TabsTrigger value="prompts" className="text-xs px-3 h-7">
              Prompts
            </TabsTrigger>
            <TabsTrigger value="usage" className="text-xs px-3 h-7">
              Usage
            </TabsTrigger>
            <TabsTrigger value="database" className="text-xs px-3 h-7">
              Database
            </TabsTrigger>
            <TabsTrigger value="appearance" className="text-xs px-3 h-7">
              Appearance
            </TabsTrigger>
          </TabsList>

          <TabsContent value="models" className="mt-0">
            <ModelsTab
              providers={providers}
              allModels={models}
              defaultModel={defaultModel}
              selectedProvider={selectedProvider}
              searchQuery={searchQuery}
              onProviderChange={setSelectedProvider}
              onSearchChange={setSearchQuery}
              onSetDefaultModel={(modelId) => void handleSetDefaultModel(modelId)}
            />
          </TabsContent>

          <TabsContent value="keys" className="mt-0">
            <ApiKeysTab
              providers={providers}
              onSaveApiKey={handleSaveApiKey}
              onDeleteApiKey={handleDeleteApiKey}
              onSaveBaseUrl={handleSaveBaseUrl}
            />
          </TabsContent>

          <TabsContent value="prompts" className="mt-0">
            <PromptsTab />
          </TabsContent>

          <TabsContent value="usage" className="mt-0">
            <UsageTab
              costs={costs}
              costsPeriod={costsPeriod}
              onPeriodChange={setCostsPeriod}
            />
          </TabsContent>

          <TabsContent value="database" className="mt-0">
            <DatabaseTab />
          </TabsContent>

          <TabsContent value="appearance" className="mt-0">
            <AppearanceTab />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
