import { useCallback, useEffect, useRef, useState } from "react";

interface ProviderSetupOptions {
  onConfigured?: () => void;
}

export function useProviderSetup(options: ProviderSetupOptions) {
  const onConfigured = options.onConfigured;
  const [providers, setProviders] = useState<ProviderConfig[]>([]);
  const [selectedProvider, setSelectedProvider] = useState<ProviderConfig | null>(null);
  const [selectedMethod, setSelectedMethod] = useState<string | null>(null);
  const [credential, setCredential] = useState("");
  const [authResult, setAuthResult] = useState<AuthResult | null>(null);
  const [modelOptions, setModelOptions] = useState<ModelCatalogEntry[]>([]);
  const [selectedModel, setSelectedModel] = useState("");
  const [manualModel, setManualModel] = useState("");
  const [modelLoading, setModelLoading] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const authRequestIdRef = useRef(0);

  useEffect(() => {
    const loadProviders = async () => {
      if (!window.electronAPI) return;
      try {
        const providerList = await window.electronAPI.onboardListProviders();
        setProviders(providerList);
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      }
    };
    loadProviders();

    return undefined;
  }, []);

  const resolveModelProvider = useCallback((providerId: string, method: string) => {
    if (providerId === "openai" && method === "oauth") {
      return "openai-codex";
    }
    if (providerId === "google" && method === "oauth") {
      return "google-antigravity";
    }
    return providerId;
  }, []);

  const resolveAuthMethod = useCallback((provider: ProviderConfig) => {
    const oauth = provider.authMethods.find((method) => method.id === "oauth");
    if (oauth) {
      return oauth.id;
    }
    return provider.authMethods[0]?.id ?? null;
  }, []);

  const startAuthenticate = useCallback(
    async (provider: ProviderConfig, methodId: string, nextCredential: string) => {
      if (!window.electronAPI) return;
      if (methodId === "oauth" && window.electronAPI.onboardAuthOAuthCancel) {
        void window.electronAPI.onboardAuthOAuthCancel();
      }
      const requestId = authRequestIdRef.current + 1;
      authRequestIdRef.current = requestId;

      setLoading(true);
      setError(null);

      try {
        let nextAuthResult: AuthResult;

        if (methodId === "api_key") {
          nextAuthResult = await window.electronAPI.onboardAuthApiKey(provider.id, nextCredential);
        } else if (methodId === "token") {
          nextAuthResult = await window.electronAPI.onboardAuthToken(provider.id, nextCredential);
        } else if (methodId === "oauth") {
          nextAuthResult = await window.electronAPI.onboardAuthOAuth(provider.id);
        } else {
          setError("Authentication method not yet supported");
          setLoading(false);
          return;
        }

        if (requestId !== authRequestIdRef.current) {
          return;
        }
        if (!nextAuthResult.success) {
          setError(nextAuthResult.error || "Authentication failed");
          setLoading(false);
          return;
        }

        setAuthResult(nextAuthResult);

        const modelProvider = resolveModelProvider(provider.id, methodId);
        setModelLoading(true);
        let models: ModelCatalogEntry[] = [];
        if (window.electronAPI.onboardListModels) {
          models = await window.electronAPI.onboardListModels(modelProvider);
        }
        if (requestId !== authRequestIdRef.current) {
          return;
        }
        setModelOptions(models);
        const defaultModel = nextAuthResult.defaultModel || provider.defaultModel;
        const defaultInOptions = models.some(
          (model) => `${model.provider}/${model.id}` === defaultModel,
        );
        const initialModel =
          defaultInOptions || models.length === 0
            ? defaultModel
            : `${models[0].provider}/${models[0].id}`;
        setSelectedModel(initialModel);
        setManualModel("");
        setLoading(false);
        setModelLoading(false);
      } catch (err) {
        if (requestId !== authRequestIdRef.current) {
          return;
        }
        setError(err instanceof Error ? err.message : String(err));
        setLoading(false);
        setModelLoading(false);
      }
    },
    [resolveModelProvider],
  );

  const handleAuthenticate = useCallback(async () => {
    if (!window.electronAPI || !selectedProvider || !selectedMethod) return;
    await startAuthenticate(selectedProvider, selectedMethod, credential);
  }, [credential, selectedProvider, selectedMethod, startAuthenticate]);

  const handleProviderSelect = useCallback(
    (provider: ProviderConfig) => {
      setSelectedProvider(provider);
      const methodId = resolveAuthMethod(provider);
      setSelectedMethod(methodId);
      setCredential("");
      setAuthResult(null);
      setModelOptions([]);
      setSelectedModel("");
      setManualModel("");
      setError(null);
      if (methodId === "oauth") {
        void startAuthenticate(provider, methodId, "");
      }
    },
    [resolveAuthMethod, startAuthenticate],
  );

  const handleCancelAuth = useCallback(() => {
    authRequestIdRef.current += 1;
    if (window.electronAPI?.onboardAuthOAuthCancel) {
      void window.electronAPI.onboardAuthOAuthCancel();
    }
    setLoading(false);
    setModelLoading(false);
    setError(null);
    setSelectedProvider(null);
    setSelectedMethod(null);
    setCredential("");
    setAuthResult(null);
    setModelOptions([]);
    setSelectedModel("");
    setManualModel("");
  }, []);

  const resetProvider = useCallback(() => {
    setSelectedProvider(null);
    setSelectedMethod(null);
    setCredential("");
    setAuthResult(null);
    setModelOptions([]);
    setSelectedModel("");
    setManualModel("");
    setError(null);
  }, []);

  const handleModelContinue = useCallback(async () => {
    if (!window.electronAPI || !authResult) return;
    setLoading(true);
    setError(null);

    const manual = manualModel.trim();
    const model = manual || selectedModel.trim() || authResult.defaultModel || "";
    const completeResult = await window.electronAPI.onboardComplete(authResult, {
      model: model || undefined,
      openControlUi: false,
    });
    if (!completeResult.success) {
      setError(completeResult.error || "Failed to complete onboarding");
      setLoading(false);
      return;
    }
    setLoading(false);
    onConfigured?.();
  }, [authResult, manualModel, onConfigured, selectedModel]);

  return {
    providers,
    selectedProvider,
    selectedMethod,
    credential,
    authResult,
    modelOptions,
    selectedModel,
    manualModel,
    modelLoading,
    loading,
    error,
    setCredential,
    setSelectedModel,
    setManualModel,
    handleAuthenticate,
    handleCancelAuth,
    handleProviderSelect,
    handleModelContinue,
    resetProvider,
  };
}
