/**
 * Store Zustand pour le statut LLM.
 *
 * Single source of truth pour le statut de connexion LLM,
 * partagé entre Sidebar et Settings.
 */

import { create } from "zustand";
import { devtools } from "zustand/middleware";
import { toast } from "sonner";
import * as api from "@/lib/api";
import type { LLMStatus, LLMProvider, LLMModel } from "@/lib/api";
import { t } from "@/hooks/useTranslation";

export interface LLMStore {
  // State
  status: LLMStatus | null;
  providers: LLMProvider[];
  models: LLMModel[];
  defaultModel: LLMModel | null;
  loading: boolean;

  // Actions
  loadStatus: () => Promise<void>;
  loadProviders: () => Promise<void>;
  loadModels: () => Promise<void>;
  loadDefaultModel: () => Promise<void>;
  loadAll: () => Promise<void>;
  saveApiKey: (providerName: string, apiKey: string) => Promise<boolean>;
  deleteApiKey: (providerName: string) => Promise<boolean>;
  saveBaseUrl: (providerName: string, baseUrl: string) => Promise<boolean>;
  setDefaultModel: (modelId: string) => Promise<boolean>;
}

export const useLLMStore = create<LLMStore>()(
  devtools(
    (set, get) => ({
      status: null,
      providers: [],
      models: [],
      defaultModel: null,
      loading: false,

      loadStatus: async () => {
        try {
          const status = await api.fetchLLMStatus();
          set({ status });
        } catch {
          set({ status: null });
        }
      },

      loadProviders: async () => {
        try {
          const providers = await api.fetchLLMProviders();
          set({ providers });
        } catch {
          // Silent fail
        }
      },

      loadModels: async () => {
        try {
          const models = await api.fetchLLMModels();
          set({ models });
        } catch {
          // Silent fail
        }
      },

      loadDefaultModel: async () => {
        try {
          const defaultModel = await api.fetchDefaultModel();
          set({ defaultModel });
        } catch {
          // Silent fail
        }
      },

      loadAll: async () => {
        set({ loading: true });
        try {
          const [status, providers, models, defaultModel] = await Promise.all([
            api.fetchLLMStatus(),
            api.fetchLLMProviders(),
            api.fetchLLMModels(),
            api.fetchDefaultModel(),
          ]);
          set({ status, providers, models, defaultModel, loading: false });
        } catch {
          set({ loading: false });
        }
      },

      saveApiKey: async (providerName: string, apiKey: string) => {
        const success = await api.saveApiKey(providerName, apiKey);
        if (success) {
          toast.success(t("settings.api_key_saved", { provider: providerName }));
          // Refresh providers and status
          const [providers, status] = await Promise.all([
            api.fetchLLMProviders(),
            api.fetchLLMStatus(),
          ]);
          set({ providers, status });
        } else {
          toast.error(t("settings.api_key_error"));
        }
        return success;
      },

      deleteApiKey: async (providerName: string) => {
        const success = await api.saveApiKey(providerName, "");
        if (success) {
          toast.success(t("settings.api_key_deleted", { provider: providerName }));
          // Refresh providers and status
          const [providers, status] = await Promise.all([
            api.fetchLLMProviders(),
            api.fetchLLMStatus(),
          ]);
          set({ providers, status });
        }
        return success;
      },

      saveBaseUrl: async (providerName: string, baseUrl: string) => {
        const success = await api.saveProviderConfig(providerName, baseUrl || null);
        if (success) {
          toast.success(t("settings.base_url_saved", { provider: providerName }));
          await get().loadProviders();
        } else {
          toast.error(t("settings.base_url_error"));
        }
        return success;
      },

      setDefaultModel: async (modelId: string) => {
        const success = await api.setDefaultModel(modelId);
        if (success) {
          toast.success(t("settings.default_model_updated"));
          // Refresh default model and status
          const [defaultModel, status] = await Promise.all([
            api.fetchDefaultModel(),
            api.fetchLLMStatus(),
          ]);
          set({ defaultModel, status });
        }
        return success;
      },
    }),
    { name: "LLMStore" }
  )
);
