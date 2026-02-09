import { useCallback } from "react";
import ProviderStep from "./ProviderStep";
import { useProviderSetup } from "./useProviderSetup";

interface ProviderSetupPageProps {
  onDone?: () => void;
}

export default function ProviderSetupPage({ onDone }: ProviderSetupPageProps) {
  const handleReturn = useCallback(() => {
    if (onDone) {
      onDone();
      return;
    }
    if (window.electronAPI?.onboardOpenControlUi) {
      void window.electronAPI.onboardOpenControlUi();
    }
  }, [onDone]);
  const providerSetup = useProviderSetup({
    onConfigured: handleReturn,
  });

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
      onBack={handleReturn}
    />
  );
}
