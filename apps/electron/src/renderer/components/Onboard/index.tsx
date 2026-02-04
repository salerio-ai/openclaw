import { useState, useEffect, useCallback } from "react";
import WelcomeStep from "./WelcomeStep";
import ProviderStep from "./ProviderStep";
import AuthStep from "./AuthStep";
import ModelStep from "./ModelStep";
import WhatsAppStep from "./WhatsAppStep";

interface OnboardProps {
  onComplete: () => void;
  onCancel: () => void;
}

type Step = "welcome" | "select-provider" | "authenticate" | "select-model" | "connect-whatsapp";

export default function Onboard({ onComplete, onCancel }: OnboardProps) {
  const [step, setStep] = useState<Step>("welcome");
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
  const [manualOAuthPrompt, setManualOAuthPrompt] = useState<string | null>(null);

  // Load providers on mount
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

    // Listen for manual OAuth code requests
    if (window.electronAPI?.onOAuthRequestCode) {
      const removeListener = window.electronAPI.onOAuthRequestCode((message) => {
        setManualOAuthPrompt(message);
        // Ensure credential input is cleared for fresh input
        setCredential("");
      });
      return () => {
        removeListener();
      };
    }
  }, []);

  const handleProviderSelect = useCallback((provider: ProviderConfig) => {
    setSelectedProvider(provider);
    setSelectedMethod(null);
    setCredential("");
    setAuthResult(null);
    setModelOptions([]);
    setSelectedModel("");
    setManualModel("");
    setError(null);
    setManualOAuthPrompt(null);
    setStep("authenticate");
  }, []);

  const handleMethodSelect = useCallback((methodId: string) => {
    setSelectedMethod(methodId);
    setError(null);
    setManualOAuthPrompt(null);
  }, []);

  const handleManualOAuthSubmit = useCallback(async () => {
    if (!window.electronAPI || !credential.trim()) return;
    try {
      await window.electronAPI.onboardOAuthSubmitCode(credential.trim());
      // Don't clear loading state here, we're still waiting for authResult in handleAuthenticate
      setManualOAuthPrompt(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, [credential]);

  const resolveModelProvider = useCallback((providerId: string, method: string) => {
    if (providerId === "openai" && method === "oauth") {
      return "openai-codex";
    }
    if (providerId === "google" && method === "oauth") {
      return "google-antigravity";
    }
    return providerId;
  }, []);

  const handleAuthenticate = useCallback(async () => {
    if (!window.electronAPI || !selectedProvider || !selectedMethod) return;

    setLoading(true);
    setError(null);
    setManualOAuthPrompt(null);

    try {
      let nextAuthResult: AuthResult;

      if (selectedMethod === "api_key") {
        nextAuthResult = await window.electronAPI.onboardAuthApiKey(
          selectedProvider.id,
          credential,
        );
      } else if (selectedMethod === "token") {
        nextAuthResult = await window.electronAPI.onboardAuthToken(
          selectedProvider.id,
          credential,
        );
      } else if (selectedMethod === "oauth") {
        nextAuthResult = await window.electronAPI.onboardAuthOAuth(selectedProvider.id);
      } else {
        setError("Authentication method not yet supported");
        setLoading(false);
        return;
      }

      if (!nextAuthResult.success) {
        setError(nextAuthResult.error || "Authentication failed");
        setLoading(false);
        return;
      }

      setAuthResult(nextAuthResult);

      const modelProvider = resolveModelProvider(selectedProvider.id, selectedMethod);
      setModelLoading(true);
      let models: ModelCatalogEntry[] = [];
      if (window.electronAPI.onboardListModels) {
        models = await window.electronAPI.onboardListModels(modelProvider);
      }
      setModelOptions(models);
      const defaultModel = nextAuthResult.defaultModel || selectedProvider.defaultModel;
      const defaultInOptions = models.some(
        (model) => `${model.provider}/${model.id}` === defaultModel,
      );
      const initialModel =
        defaultInOptions || models.length === 0
          ? defaultModel
          : `${models[0].provider}/${models[0].id}`;
      setSelectedModel(initialModel);
      setManualModel("");
      setStep("select-model");
      setLoading(false);
      setModelLoading(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setLoading(false);
      setModelLoading(false);
    }
  }, [selectedProvider, selectedMethod, credential, resolveModelProvider]);

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
    setStep("connect-whatsapp");
  }, [authResult, manualModel, selectedModel]);

  const handleWhatsAppDone = useCallback(async () => {
    if (window.electronAPI?.onboardOpenControlUi) {
      await window.electronAPI.onboardOpenControlUi();
    }
    onComplete();
  }, [onComplete]);

  const handleBack = useCallback(() => {
    if (step === "authenticate") {
      setStep("select-provider");
      setSelectedProvider(null);
      setSelectedMethod(null);
      setCredential("");
      setAuthResult(null);
      setModelOptions([]);
      setSelectedModel("");
      setManualModel("");
      setError(null);
      return;
    }
    if (step === "select-model") {
      setStep("authenticate");
      setSelectedModel("");
      setManualModel("");
    }
    if (step === "connect-whatsapp") {
      setStep("select-model");
    }
  }, [step]);

  if (step === "welcome") {
    return <WelcomeStep onStart={() => setStep("select-provider")} onCancel={onCancel} />;
  }

  if (step === "select-provider") {
    return (
      <ProviderStep
        providers={providers}
        selectedProvider={selectedProvider}
        error={error}
        onSelect={handleProviderSelect}
        onBack={handleBack}
        onCancel={onCancel}
      />
    );
  }

  if (step === "authenticate" && selectedProvider) {
    return (
      <AuthStep
        provider={selectedProvider}
        selectedMethod={selectedMethod}
        manualOAuthPrompt={manualOAuthPrompt}
        credential={credential}
        loading={loading}
        error={error}
        onMethodSelect={handleMethodSelect}
        onCredentialChange={setCredential}
        onAuthenticate={handleAuthenticate}
        onManualOAuthSubmit={handleManualOAuthSubmit}
        onResetMethod={() => setSelectedMethod(null)}
        onBack={handleBack}
      />
    );
  }

  if (step === "select-model" && selectedProvider && authResult) {
    return (
      <ModelStep
        provider={selectedProvider}
        authResult={authResult}
        modelLoading={modelLoading}
        modelOptions={modelOptions}
        selectedModel={selectedModel}
        manualModel={manualModel}
        loading={loading}
        error={error}
        onSelectedModelChange={setSelectedModel}
        onManualModelChange={setManualModel}
        onBack={handleBack}
        onContinue={handleModelContinue}
      />
    );
  }

  if (step === "connect-whatsapp") {
    return (
      <WhatsAppStep
        onBack={handleBack}
        onSkip={handleWhatsAppDone}
        onDone={handleWhatsAppDone}
      />
    );
  }

  return null;
}
