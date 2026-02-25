import { useState, useCallback, useEffect } from "react";
import BustlyLoginPage from "./BustlyLoginPage";
import WhatsAppStep from "./WhatsAppStep";
import { useProviderSetup } from "./useProviderSetup";

interface OnboardProps {
  onComplete: () => void;
  onCancel: () => void;
}

type Step = "bustly-login" | "connect-whatsapp";

const BETA_AUTO_BOOTSTRAP = {
  providerId: "openrouter",
  // model: "openrouter/anthropic/claude-opus-4.6",
  model: "openrouter/z-ai/glm-5",
} as const;

export default function Onboard({ onComplete, onCancel }: OnboardProps) {
  const [step, setStep] = useState<Step>("bustly-login");
  const [betaOpenRouterApiKey, setBetaOpenRouterApiKey] = useState("");

  useEffect(() => {
    if (!window.electronAPI?.onboardBetaOpenRouterApiKey) {
      return;
    }
    void (async () => {
      try {
        const apiKey = await window.electronAPI.onboardBetaOpenRouterApiKey();
        setBetaOpenRouterApiKey(apiKey.trim());
      } catch (error) {
        console.error("Failed to load beta OpenRouter API key:", error);
      }
    })();
  }, []);

  // Start auto bootstrap as soon as the app has the beta key (no login-step gating).
  const autoBootstrap = betaOpenRouterApiKey
    ? {
        ...BETA_AUTO_BOOTSTRAP,
        apiKey: betaOpenRouterApiKey,
      }
    : undefined;

  const providerSetup = useProviderSetup({
    skipModelSelection: true,
    autoBootstrap,
  });

  useEffect(() => {
    if (!providerSetup.error) {
      return;
    }
    console.error("Auto bootstrap failed:", providerSetup.error);
  }, [providerSetup.error]);

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
    setStep("bustly-login");
  }, [step]);

  if (step === "bustly-login") {
    return (
      <BustlyLoginPage
        onContinue={() => setStep("connect-whatsapp")}
        autoContinue
        showContinueWhenLoggedIn={false}
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
