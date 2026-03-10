import { useState, useCallback } from "react";
import BustlyLoginPage from "./BustlyLoginPage";
import WhatsAppStep from "./WhatsAppStep";

interface OnboardProps {
  onComplete: () => void;
  onCancel: () => void;
}

type Step = "bustly-login" | "connect-whatsapp";

export default function Onboard({ onComplete, onCancel: _onCancel }: OnboardProps) {
  const [step, setStep] = useState<Step>("bustly-login");

  const handleLoginContinue = useCallback(() => {
    void (async () => {
      let bootstrapOk = false;
      try {
        const electronAPI = window.electronAPI;
        if (electronAPI?.onboardAuthOAuth && electronAPI?.onboardComplete) {
          const authResult = await electronAPI.onboardAuthOAuth("bustly");
          if (!authResult.success) {
            throw new Error(authResult.error || "Bustly provider authentication failed");
          }
          const completeResult = await electronAPI.onboardComplete(authResult, {
            model: "bustly/chat.lite",
            openControlUi: false,
          });
          if (!completeResult.success) {
            throw new Error(completeResult.error || "Failed to configure bustly provider");
          }
        }
        bootstrapOk = true;
      } catch (error) {
        console.error("Bustly provider bootstrap failed:", error);
      } finally {
        if (bootstrapOk) {
          setStep("connect-whatsapp");
        }
      }
    })();
  }, []);

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
        onContinue={handleLoginContinue}
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
