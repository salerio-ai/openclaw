import { useCallback, useEffect, useState } from "react";

type PhoneMode = "personal" | "separate";

interface WhatsAppStepProps {
  onBack: () => void;
  onSkip: () => void;
  onDone: () => void;
}

import bustlyLogo from "../../assets/imgs/collapsed_logo_v2.svg";

export default function WhatsAppStep({ onBack, onSkip, onDone }: WhatsAppStepProps) {
  const [status, setStatus] = useState<WhatsAppStatus | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [linkMessage, setLinkMessage] = useState<string | null>(null);
  const [loadingLink, setLoadingLink] = useState(false);
  const [checkingLink, setCheckingLink] = useState(false);
  const [savingConfig, setSavingConfig] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [phoneMode] = useState<PhoneMode>("personal");
  const [personalNumber, setPersonalNumber] = useState("");

  const loadStatus = useCallback(async () => {
    if (!window.electronAPI?.onboardWhatsAppStatus) {
      return;
    }
    try {
      const nextStatus = await window.electronAPI.onboardWhatsAppStatus();
      setStatus(nextStatus);
      if (nextStatus.selfChatMode) {
        const personal = nextStatus.allowFrom?.find((value) => value !== "*") ?? "";
        setPersonalNumber(personal);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, []);

  useEffect(() => {
    loadStatus();
  }, [loadStatus]);

  const handleStartLink = useCallback(
    async (force: boolean) => {
      if (!window.electronAPI?.onboardWhatsAppStart) {
        return;
      }
      setLoadingLink(true);
      setError(null);
      try {
        const result = await window.electronAPI.onboardWhatsAppStart({ force });
        setQrDataUrl(result.qrDataUrl ?? null);
        setLinkMessage(result.message);
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        setLoadingLink(false);
      }
    },
    [],
  );

  const handleCheckLink = useCallback(async () => {
    if (!window.electronAPI?.onboardWhatsAppWait) {
      return;
    }
    setCheckingLink(true);
    setError(null);
    try {
      const result = await window.electronAPI.onboardWhatsAppWait();
      setLinkMessage(result.message);
      await loadStatus();
      if (result.connected) {
        setQrDataUrl(null);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setCheckingLink(false);
    }
  }, [loadStatus]);

  const handleSave = useCallback(async () => {
    if (!window.electronAPI?.onboardWhatsAppConfig) {
      return;
    }
    setError(null);
    if (phoneMode === "personal" && !personalNumber.trim()) {
      setError("Enter your WhatsApp number.");
      return;
    }

    setSavingConfig(true);
    try {
      const payload: WhatsAppConfigRequest = { mode: "personal", personalNumber };
      const result = await window.electronAPI.onboardWhatsAppConfig(payload);
      if (!result.success) {
        setError(result.error ?? "Failed to save WhatsApp settings");
        return;
      }
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSavingConfig(false);
    }
  }, [phoneMode, personalNumber, onDone]);

  return (
    <div className="onboard onboard--whatsapp !bg-[#F7F7F8]">
      <div className="w-full max-w-lg mx-auto px-6">
        <div className="text-center mb-8">
          <img src={bustlyLogo} alt="Bustly Logo" className="h-12 mx-auto mb-3" />
          <h2 className="text-3xl font-bold text-[#1A162F] mb-3">Connect WhatsApp</h2>
          <p className="text-[#6B6F86] text-lg max-w-2xl mx-auto leading-relaxed">
            Connect WhatsApp to ask Bustly AI questions.
          </p>
        </div>

        {error && (
          <div className="mb-6 rounded-xl border border-red-500/30 bg-red-50 px-4 py-3 text-sm text-red-600">
            <strong>Error:</strong> {error}
          </div>
        )}

        <div className="bg-white border border-gray-200 rounded-2xl p-8 shadow-sm text-center">
          <div className="w-20 h-20 bg-[#25D366]/10 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <img
              src="https://cdn.brandfetch.io/whatsapp.com/w/400/h/400"
              alt="WhatsApp"
              className="w-12 h-12 object-contain"
            />
          </div>

          <h3 className="text-xl font-bold text-[#1A162F] mb-4">WhatsApp</h3>

          {!status?.linked && !qrDataUrl && (
            <button
              type="button"
              onClick={() => handleStartLink(Boolean(status?.linked))}
              className="w-full py-3 bg-[#25D366] text-white font-bold rounded-xl hover:bg-[#25D366]/90 transition-all shadow-lg hover:shadow-xl hover:-translate-y-0.5 disabled:opacity-60"
              disabled={loadingLink}
            >
              {loadingLink ? "Generating..." : "Connect WhatsApp"}
            </button>
          )}

          {!status?.linked && qrDataUrl && (
            <div className="flex flex-col items-center animate-in fade-in slide-in-from-bottom-4 duration-500">
              <div className="w-48 h-48 bg-gray-100 rounded-xl flex items-center justify-center mb-4 border-2 border-gray-100">
                <div className="p-2 bg-white w-full h-full">
                  <img src={qrDataUrl} alt="WhatsApp QR" className="w-full h-full object-contain" />
                </div>
              </div>
              <button
                type="button"
                onClick={handleCheckLink}
                disabled={checkingLink}
                className="mt-2 px-6 py-2 rounded-xl bg-[#1A162F] text-white font-semibold hover:bg-[#1A162F]/90 disabled:opacity-60"
              >
                {checkingLink ? "Checking..." : "I scanned it"}
              </button>
            </div>
          )}

          {status?.linked && (
            <div className="flex flex-col items-center animate-in fade-in zoom-in-95 duration-500">
              <div className="w-48 h-48 bg-green-50 rounded-xl flex items-center justify-center mb-4 border-2 border-green-100">
                <div className="flex flex-col items-center gap-3 text-green-600">
                  <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center">
                    <span className="text-3xl font-bold">✓</span>
                  </div>
                  <span className="font-bold">Connected</span>
                </div>
              </div>
              <p className="text-sm text-[#6B6F86] font-medium">Your AI assistant is ready to help.</p>
            </div>
          )}

          {linkMessage && <p className="mt-4 text-xs text-[#6B6F86]">{linkMessage}</p>}
        </div>

        <div className="bg-white border border-gray-200 rounded-2xl p-6 shadow-sm mt-6">
          <div className="flex flex-col gap-2">
            <label className="text-xs font-semibold text-[#6B6F86]" htmlFor="wa-personal">
              WhatsApp number (E.164)
            </label>
            <input
              id="wa-personal"
              value={personalNumber}
              onChange={(event) => setPersonalNumber(event.target.value)}
              placeholder="+15555550123"
              className="rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm text-[#1A162F] shadow-sm focus:border-[#1A162F] focus:outline-none focus:ring-2 focus:ring-[#1A162F]/10 placeholder:text-[#6B6F86]"
            />
          </div>
        </div>

        <div className="flex justify-end items-center mt-8 border-t border-gray-100 pt-6">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onSkip}
              className="px-6 py-3 text-[#6B6F86] font-semibold rounded-xl hover:bg-gray-100 hover:text-[#1A162F] transition-colors"
            >
              Skip
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={savingConfig}
              className="px-8 py-3 bg-[#1A162F] text-white font-bold rounded-xl hover:bg-[#1A162F]/90 transition-all shadow-lg hover:shadow-xl hover:-translate-y-0.5 disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {savingConfig ? "Saving..." : "Save & Finish"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
