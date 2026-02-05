import { useState, useEffect, useCallback, useRef } from "react";
import ProviderStep from "./ProviderStep";
import WhatsAppStep from "./WhatsAppStep";
import bustlyLogo from "../../../../assets/imgs/collapsed_logo_v2.svg";

interface OnboardProps {
  onComplete: () => void;
  onCancel: () => void;
}

type Step = "bustly-login" | "select-provider" | "connect-whatsapp";

export default function Onboard({ onComplete, onCancel }: OnboardProps) {
  const [step, setStep] = useState<Step>("bustly-login");
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
  // Bustly login state
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [userInfo, setUserInfo] = useState<BustlyUserInfo | null>(null);
  const [checkingLogin, setCheckingLogin] = useState(true);

  // Check Bustly login status on mount and when returning to bustly-login step
  useEffect(() => {
    const checkLoginStatus = async () => {
      if (!window.electronAPI?.bustlyIsLoggedIn) return;

      try {
        setCheckingLogin(true);
        const loggedIn = await window.electronAPI.bustlyIsLoggedIn();
        setIsLoggedIn(loggedIn);

        if (loggedIn && window.electronAPI.bustlyGetUserInfo) {
          const info = await window.electronAPI.bustlyGetUserInfo();
          setUserInfo(info);
        } else {
          setUserInfo(null);
        }
      } catch (err) {
        console.error("Failed to check login status:", err);
        setIsLoggedIn(false);
        setUserInfo(null);
      } finally {
        setCheckingLogin(false);
      }
    };

    checkLoginStatus();
  }, []); // Run on mount to check initial login status

  // Check login status again when returning to bustly-login step
  useEffect(() => {
    if (step === "bustly-login") {
      const checkLoginStatus = async () => {
        if (!window.electronAPI?.bustlyIsLoggedIn) return;

        try {
          setCheckingLogin(true);
          const loggedIn = await window.electronAPI.bustlyIsLoggedIn();
          setIsLoggedIn(loggedIn);

          if (loggedIn && window.electronAPI.bustlyGetUserInfo) {
            const info = await window.electronAPI.bustlyGetUserInfo();
            setUserInfo(info);
          } else {
            setUserInfo(null);
          }
        } catch (err) {
          console.error("Failed to check login status:", err);
          setIsLoggedIn(false);
          setUserInfo(null);
        } finally {
          setCheckingLogin(false);
        }
      };

      checkLoginStatus();
    }
  }, [step]);

  useEffect(() => {
    if (step === "bustly-login" && isLoggedIn && !checkingLogin) {
      setStep("select-provider");
    }
  }, [step, isLoggedIn, checkingLogin]);

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

    return undefined;
  }, []);

  const handleBustlyLogin = useCallback(async () => {
    if (!window.electronAPI) return;
    setLoading(true);
    setError(null);

    try {
      const result = await window.electronAPI.bustlyLogin();
      // Only proceed to welcome step if login was successful
      if (result.success) {
        // Update login state
        setIsLoggedIn(true);
        if (window.electronAPI.bustlyGetUserInfo) {
          const info = await window.electronAPI.bustlyGetUserInfo();
          setUserInfo(info);
        }
        setStep("select-provider");
      } else {
        setError(result.error || "Login failed");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  const handleBustlyLogout = useCallback(async () => {
    if (!window.electronAPI) return;
    setLoading(true);
    setError(null);

    try {
      const result = await window.electronAPI.bustlyLogout();
      if (result.success) {
        // Clear login state
        setIsLoggedIn(false);
        setUserInfo(null);
      } else {
        setError(result.error || "Logout failed");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
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
          nextAuthResult = await window.electronAPI.onboardAuthApiKey(
            provider.id,
            nextCredential,
          );
        } else if (methodId === "token") {
          nextAuthResult = await window.electronAPI.onboardAuthToken(
            provider.id,
            nextCredential,
          );
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
        setStep("select-provider");
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
      <div className="onboard !bg-[#F7F7F8]">
        <div className="w-full max-w-md mx-auto px-6 text-center pt-10">
          <div className="mb-10">
            <img src={bustlyLogo} alt="Bustly AI" className="h-20 mx-auto mb-2" />
            <h1 className="text-4xl font-bold text-[#1A162F] mb-2">Bustly AI</h1>
          </div>

          {error && (
            <div className="mb-6 rounded-xl border border-red-500/30 bg-red-50 px-4 py-3 text-sm text-red-600 text-left">
              <strong>Error:</strong> {error}
            </div>
          )}

          <div className="space-y-4">
            <button
              onClick={isLoggedIn ? () => setStep("select-provider") : handleBustlyLogin}
              disabled={loading || checkingLogin}
              className="w-full py-4 bg-[#1A162F] text-white font-bold rounded-xl hover:bg-[#1A162F]/90 disabled:opacity-80 transition-all shadow-lg hover:shadow-xl hover:-translate-y-0.5 flex items-center justify-center gap-2 text-lg"
            >
              {loading ? (
                <>
                  <span className="inline-flex h-5 w-5 animate-spin rounded-full border-2 border-white/40 border-t-white" />
                  <span>{isLoggedIn ? "Loading..." : "Logging in..."}</span>
                </>
              ) : isLoggedIn ? (
                "Continue"
              ) : (
                "Log In"
              )}
            </button>

            {isLoggedIn && (
              <button
                onClick={handleBustlyLogout}
                disabled={loading || checkingLogin}
                className="w-full py-4 bg-white border border-gray-200 text-[#1A162F] font-bold rounded-xl hover:bg-gray-50 disabled:opacity-50 transition-all shadow-sm hover:shadow-md hover:-translate-y-0.5 flex items-center justify-center gap-2 text-lg"
              >
                Sign out
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  if (step === "select-provider") {
    return (
      <ProviderStep
        providers={providers}
        selectedProvider={selectedProvider}
        error={error}
        selectedMethod={selectedMethod}
        credential={credential}
        loading={loading}
        onCredentialChange={setCredential}
        onAuthenticate={handleAuthenticate}
        onCancelAuth={handleCancelAuth}
        onResetProvider={() => {
          setSelectedProvider(null);
          setSelectedMethod(null);
          setCredential("");
          setAuthResult(null);
          setModelOptions([]);
          setSelectedModel("");
          setManualModel("");
          setError(null);
        }}
        authResult={authResult}
        modelLoading={modelLoading}
        modelOptions={modelOptions}
        selectedModel={selectedModel}
        manualModel={manualModel}
        onSelectedModelChange={setSelectedModel}
        onManualModelChange={setManualModel}
        onModelContinue={handleModelContinue}
        onSelect={handleProviderSelect}
        onBack={handleBack}
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
