import { useCallback, useEffect, useRef, useState } from "react";
import bustlyLogo from "../../assets/imgs/collapsed_logo_v2.svg";
import whatsAppIcon from "../../assets/imgs/whats-app.svg";
import OnboardContainer from "./OnboardContainer";

const DEFAULT_WHATSAPP_NUMBER = "+1";

interface WhatsAppStepProps {
  onBack: () => void;
  onSkip: () => void;
  onDone: () => void;
}

export default function WhatsAppStep({ onBack, onSkip, onDone }: WhatsAppStepProps) {
  const [status, setStatus] = useState<WhatsAppStatus | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [linkMessage, setLinkMessage] = useState<string | null>(null);
  const [loadingLink, setLoadingLink] = useState(false);
  const [savingConfig, setSavingConfig] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const checkingLinkRef = useRef(false);

  const loadStatus = useCallback(async () => {
    if (!window.electronAPI?.onboardWhatsAppStatus) {
      return;
    }
    try {
      const nextStatus = await window.electronAPI.onboardWhatsAppStatus();
      setStatus(nextStatus);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, []);

  useEffect(() => {
    loadStatus();
  }, [loadStatus]);

  const handleStartLink = useCallback(
    async () => {
      if (!window.electronAPI?.onboardWhatsAppStart) {
        return;
      }
      setLoadingLink(true);
      setError(null);
      try {
        const result = await window.electronAPI.onboardWhatsAppStart({ force: false });
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
    if (!window.electronAPI?.onboardWhatsAppWait || checkingLinkRef.current) {
      return;
    }
    checkingLinkRef.current = true;
    try {
      const result = await window.electronAPI.onboardWhatsAppWait({ timeoutMs: 1000 });
      setLinkMessage(result.message);
      await loadStatus();
      if (result.connected) {
        setQrDataUrl(null);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      checkingLinkRef.current = false;
    }
  }, [loadStatus]);

  useEffect(() => {
    if (status?.linked || !qrDataUrl) {
      return;
    }
    void handleCheckLink();
    const intervalId = setInterval(() => {
      void handleCheckLink();
    }, 1000);
    return () => clearInterval(intervalId);
  }, [status?.linked, qrDataUrl, handleCheckLink]);

  const handleSave = useCallback(async () => {
    if (!window.electronAPI?.onboardWhatsAppConfig) {
      return;
    }
    if (!status?.linked) {
      return;
    }
    setError(null);

    setSavingConfig(true);
    try {
      const payload: WhatsAppConfigRequest = {
        mode: "personal",
        personalNumber: DEFAULT_WHATSAPP_NUMBER,
      };
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
  }, [onDone, status?.linked]);

  const hasQr = Boolean(qrDataUrl);
  const isLinked = Boolean(status?.linked);
  const canSave = isLinked && !savingConfig;
  const showConnectAction = !hasQr && !isLinked;

  return (
    <OnboardContainer className="px-6">
      <div className="text-center mb-8">
        <img src={bustlyLogo} alt="Bustly Logo" className="h-12 mx-auto mb-3" />
        <h2 className="text-3xl font-bold text-[#1A162F] mb-3">Connect WhatsApp</h2>
        <p className="text-[#6B6F86] text-lg max-w-2xl mx-auto leading-relaxed">
          Send Bustly tasks anytime, anywhere.
        </p>
      </div>

      {error && (
        <div className="mb-6 rounded-xl border border-red-500/30 bg-red-50 px-4 py-3 text-sm text-red-600">
          <strong>Error:</strong> {error}
        </div>
      )}

      <div className="bg-white border border-gray-200 rounded-2xl p-8 shadow-sm text-center min-w-[400px]">
        <div className="w-20 h-20 bg-[#25D366]/10 rounded-2xl flex items-center justify-center mx-auto mb-4">
          <img src={whatsAppIcon} alt="WhatsApp" className="w-12 h-12 object-contain" />
        </div>

        <h3 className="text-xl font-bold text-[#1A162F]">WhatsApp</h3>

        {!status?.linked && qrDataUrl && (
          <div className="flex flex-col items-center animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="w-48 h-48 bg-gray-100 rounded-xl flex items-center justify-center mb-4 border-2 border-gray-100">
              <div className="p-2 bg-white w-full h-full">
                <img src={qrDataUrl} alt="WhatsApp QR" className="w-full h-full object-contain" />
              </div>
            </div>
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
          </div>
        )}
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
            onClick={showConnectAction ? () => void handleStartLink() : handleSave}
            disabled={showConnectAction ? loadingLink : !canSave}
            className="px-8 py-3 bg-[#1A162F] text-white font-bold rounded-xl hover:bg-[#1A162F]/90 transition-all shadow-lg hover:shadow-xl hover:-translate-y-0.5 disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {showConnectAction ? (loadingLink ? "Connecting..." : "Connect") : (savingConfig ? "Saving..." : "Save")}
          </button>
        </div>
      </div>
    </OnboardContainer>
  );
}
