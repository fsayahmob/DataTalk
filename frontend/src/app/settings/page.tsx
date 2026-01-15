"use client";

import { useState, useEffect, useCallback } from "react";
import { toast } from "sonner";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ModelsTab, ApiKeysTab, UsageTab, DatabaseTab, PromptsTab } from "@/components/settings";
import * as api from "@/lib/api";
import type { LLMProvider, LLMModel, LLMCosts, LLMStatus } from "@/lib/api";

export default function SettingsPage() {
  // State
  const [providers, setProviders] = useState<LLMProvider[]>([]);
  const [allModels, setAllModels] = useState<LLMModel[]>([]);
  const [selectedProvider, setSelectedProvider] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [defaultModel, setDefaultModel] = useState<LLMModel | null>(null);
  const [llmStatus, setLlmStatus] = useState<LLMStatus | null>(null);
  const [costs, setCosts] = useState<LLMCosts | null>(null);
  const [costsPeriod, setCostsPeriod] = useState<number>(30);

  // Load data
  useEffect(() => {
    void (async () => {
      const [providersData, defaultModelData, statusData, modelsData] = await Promise.all([
        api.fetchLLMProviders(),
        api.fetchDefaultModel(),
        api.fetchLLMStatus(),
        api.fetchLLMModels(),
      ]);
      setProviders(providersData);
      setDefaultModel(defaultModelData);
      setLlmStatus(statusData);
      setAllModels(modelsData);
    })();
  }, []);

  useEffect(() => {
    void api.fetchLLMCosts(costsPeriod).then(setCosts);
  }, [costsPeriod]);

  // Refresh providers and status
  const refreshProviders = useCallback(async () => {
    const [newProviders, newStatus] = await Promise.all([
      api.fetchLLMProviders(),
      api.fetchLLMStatus(),
    ]);
    setProviders(newProviders);
    setLlmStatus(newStatus);
  }, []);

  // Handlers
  const handleSaveApiKey = useCallback(
    async (providerName: string, apiKey: string) => {
      const success = await api.saveApiKey(providerName, apiKey);
      if (success) {
        toast.success(`API key saved for ${providerName}`);
        await refreshProviders();
      } else {
        toast.error("Failed to save API key");
      }
    },
    [refreshProviders]
  );

  const handleDeleteApiKey = useCallback(
    async (providerName: string) => {
      const success = await api.saveApiKey(providerName, "");
      if (success) {
        toast.success(`API key deleted for ${providerName}`);
        await refreshProviders();
      }
    },
    [refreshProviders]
  );

  const handleSaveBaseUrl = useCallback(
    async (providerName: string, baseUrl: string) => {
      const success = await api.saveProviderConfig(providerName, baseUrl || null);
      if (success) {
        toast.success(`Base URL saved for ${providerName}`);
        await refreshProviders();
      } else {
        toast.error("Failed to save base URL");
      }
    },
    [refreshProviders]
  );

  const handleSetDefaultModel = useCallback(async (modelId: string) => {
    const success = await api.setDefaultModel(modelId);
    if (success) {
      toast.success("Default model updated");
      const [newDefault, newStatus] = await Promise.all([
        api.fetchDefaultModel(),
        api.fetchLLMStatus(),
      ]);
      setDefaultModel(newDefault);
      setLlmStatus(newStatus);
    }
  }, []);

  return (
    <div className="flex-1 overflow-auto bg-[hsl(260_10%_6%)]">
      <div className="max-w-6xl mx-auto px-6 py-4">
        {/* Header */}
        <div className="flex items-center justify-between mb-4 pb-3 border-b border-border/30">
          <div>
            <h1 className="text-lg font-semibold text-foreground">Settings</h1>
            <p className="text-xs text-muted-foreground">
              LLM:{" "}
              {llmStatus?.status === "ok" ? (
                <span className="text-emerald-400">{llmStatus.model}</span>
              ) : (
                <span className="text-red-400">Not configured</span>
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
          </TabsList>

          <TabsContent value="models" className="mt-0">
            <ModelsTab
              providers={providers}
              allModels={allModels}
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
        </Tabs>
      </div>
    </div>
  );
}
