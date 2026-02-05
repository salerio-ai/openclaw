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

type Step = "bustly-login" | "welcome" | "select-provider" | "authenticate" | "select-model"  | "connect-whatsapp";

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
  const [manualOAuthPrompt, setManualOAuthPrompt] = useState<string | null>(null);
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
        setStep("welcome");
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
    if (step === "bustly-login") {
      // Can't go back from login page
      return;
    }
    if (step === "welcome") {
      setStep("bustly-login");
      setError(null);
      return;
    }
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

  if (step === "bustly-login") {
    return (
      <div className="onboard">
        <div className="onboard-card">
          <h1>Sign in to Bustly</h1>
          <p className="onboard-subtitle">
            Sign in to sync your OpenClaw workspace and unlock provider setup.
          </p>

          {error && (
            <div className="error-message">
              <strong>Error:</strong> {error}
            </div>
          )}

          <div className="onboard-info">
            {checkingLogin ? (
              <p>Checking your sign-in status...</p>
            ) : isLoggedIn ? (
              <>
                <h3>Signed in</h3>
                <p>
                  {userInfo?.userName ?? "Bustly user"}{" "}
                  {userInfo?.userEmail ? `(${userInfo.userEmail})` : ""}
                </p>
                {userInfo?.workspaceId && (
                  <p>Workspace: {userInfo.workspaceId}</p>
                )}
              </>
            ) : (
              <>
                <h3>What happens next</h3>
                <p>We will open your browser to complete a secure OAuth login.</p>
              </>
            )}
          </div>

          <div className="onboard-actions">
            {isLoggedIn ? (
              <>
                <button
                  className="btn btn-primary"
                  onClick={() => setStep("welcome")}
                  disabled={checkingLogin || loading}
                >
                  Continue
                </button>
                <button
                  className="btn btn-secondary"
                  onClick={handleBustlyLogout}
                  disabled={checkingLogin || loading}
                >
                  {loading ? "Signing out..." : "Sign out"}
                </button>
              </>
            ) : (
              <button
                className="btn btn-primary"
                onClick={handleBustlyLogin}
                disabled={checkingLogin || loading}
              >
                {loading ? "Opening browser..." : "Sign in with Bustly"}
              </button>
            )}
            <button className="btn btn-secondary" onClick={onCancel} disabled={loading}>
              Cancel
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Welcome step
  if (step === "welcome") {
    return (
      <div className="onboard">
        <div className="onboard-card">
          <h1>Welcome to OpenClaw Desktop</h1>
          <p className="onboard-subtitle">
            Let's get you set up with a model provider to start using AI.
          </p>

          <div className="onboard-info">
            <h3>Supported Providers</h3>
            <ul>
              <li><strong>OpenAI</strong> - GPT-5.2 (Codex) and more</li>
              <li><strong>Google</strong> - Gemini 3 and more</li>
              <li><strong>OpenRouter</strong> - Access to multiple models</li>
            </ul>
          </div>

          <div className="onboard-actions">
            <button className="btn btn-secondary" onClick={handleBack}>
              Back
            </button>
            <button className="btn btn-primary" onClick={() => setStep("select-provider")}>
              Get Started
            </button>
            <button className="btn btn-secondary" onClick={onCancel}>
              Cancel
            </button>
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
