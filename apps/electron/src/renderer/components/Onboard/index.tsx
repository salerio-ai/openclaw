import { useState, useCallback } from "react";
import BustlyLoginPage from "./BustlyLoginPage";
import ProviderStep from "./ProviderStep";
import WhatsAppStep from "./WhatsAppStep";
import { useProviderSetup } from "./useProviderSetup";

interface OnboardProps {
  onComplete: () => void;
  onCancel: () => void;
}

type Step = "bustly-login" | "select-provider" | "connect-whatsapp";

const BETA_AUTO_BOOTSTRAP = {
  providerId: "openrouter",
  apiKey: "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",
  model: "openrouter/z-ai/glm-5",
} as const;

export default function Onboard({ onComplete, onCancel }: OnboardProps) {
  const [step, setStep] = useState<Step>("bustly-login");
  const providerSetup = useProviderSetup({
    onConfigured: () => setStep("connect-whatsapp"),
    autoBootstrap: BETA_AUTO_BOOTSTRAP,
  });

  const handleWhatsAppDone = useCallback(async () => {
    if (window.electronAPI?.onboardOpenControlUi) {
      await window.electronAPI.onboardOpenControlUi();
    }
    onComplete();
  }, [onComplete]);

  const handleBack = useCallback(() => {
    if (step === "bustly-login") {
      // Can't go back from login page
      return;
    }
    if (step === "connect-whatsapp") {
      setStep("select-provider");
    }
  }, [step]);

  if (step === "bustly-login") {
    return (
      <BustlyLoginPage
        onContinue={() => setStep("select-provider")}
        autoContinue
        showContinueWhenLoggedIn={false}
      />
    );
  }

  if (step === "select-provider") {
    return (
      <ProviderStep
        providers={providerSetup.providers}
        selectedProvider={providerSetup.selectedProvider}
        error={providerSetup.error}
        selectedMethod={providerSetup.selectedMethod}
        credential={providerSetup.credential}
        loading={providerSetup.loading}
        onCredentialChange={providerSetup.setCredential}
        onAuthenticate={providerSetup.handleAuthenticate}
        onCancelAuth={providerSetup.handleCancelAuth}
        onResetProvider={providerSetup.resetProvider}
        authResult={providerSetup.authResult}
        modelLoading={providerSetup.modelLoading}
        modelOptions={providerSetup.modelOptions}
        selectedModel={providerSetup.selectedModel}
        manualModel={providerSetup.manualModel}
        onSelectedModelChange={providerSetup.setSelectedModel}
        onManualModelChange={providerSetup.setManualModel}
        onModelContinue={providerSetup.handleModelContinue}
        onSelect={providerSetup.handleProviderSelect}
        onBack={handleBack}
        showClose={false}
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
