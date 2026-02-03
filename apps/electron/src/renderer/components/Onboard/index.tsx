import { useState, useEffect, useCallback } from "react";

interface OnboardProps {
  onComplete: () => void;
  onCancel: () => void;
}

type Step = "welcome" | "select-provider" | "authenticate" | "select-model";

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
    return providerId;
  }, []);

  const handleAuthenticate = useCallback(async () => {
    if (!window.electronAPI || !selectedProvider || !selectedMethod) return;

    setLoading(true);
    setError(null);
    setManualOAuthPrompt(null);

    try {
      let authResult: AuthResult;

      if (selectedMethod === "api_key") {
        authResult = await window.electronAPI.onboardAuthApiKey(selectedProvider.id, credential);
      } else if (selectedMethod === "token") {
        authResult = await window.electronAPI.onboardAuthToken(selectedProvider.id, credential);
      } else if (selectedMethod === "oauth") {
        authResult = await window.electronAPI.onboardAuthOAuth(selectedProvider.id);
      } else {
        setError("Authentication method not yet supported");
        setLoading(false);
        return;
      }

      if (!authResult.success) {
        setError(authResult.error || "Authentication failed");
        setLoading(false);
        return;
      }

      setAuthResult(authResult);

      const modelProvider = resolveModelProvider(selectedProvider.id, selectedMethod);
      setModelLoading(true);
      let models: ModelCatalogEntry[] = [];
      if (window.electronAPI.onboardListModels) {
        models = await window.electronAPI.onboardListModels(modelProvider);
      }
      setModelOptions(models);
      const defaultModel = authResult.defaultModel || selectedProvider.defaultModel;
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
    const completeResult = await window.electronAPI.onboardComplete(
      authResult,
      model ? { model } : undefined,
    );
    if (!completeResult.success) {
      setError(completeResult.error || "Failed to complete onboarding");
      setLoading(false);
      return;
    }
    onComplete();
    setLoading(false);
  }, [authResult, manualModel, selectedModel, onComplete]);

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
  }, [step]);

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
              <li><strong>OpenAI</strong> - GPT-4o and more</li>
              <li><strong>Anthropic</strong> - Claude Sonnet 4</li>
              <li><strong>OpenRouter</strong> - Access to multiple models</li>
            </ul>
          </div>

          <div className="onboard-actions">
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

  // Select provider step
  if (step === "select-provider") {
    return (
      <div className="onboard">
        <div className="onboard-card">
          <h2>Select a Model Provider</h2>
          <p className="onboard-subtitle">Choose which AI provider you'd like to use</p>

          {error && (
            <div className="error-message">
              <strong>Error:</strong> {error}
            </div>
          )}

          <div className="provider-grid">
            {providers.map((provider) => (
              <button
                key={provider.id}
                className={`provider-card ${selectedProvider?.id === provider.id ? "selected" : ""}`}
                onClick={() => handleProviderSelect(provider)}
              >
                <h3>{provider.label}</h3>
                {provider.isDev && <span className="badge badge-dev">Dev</span>}
                <p>{provider.defaultModel}</p>
              </button>
            ))}
          </div>

          <div className="onboard-actions">
            <button className="btn btn-secondary" onClick={handleBack}>
              Back
            </button>
            <button className="btn btn-secondary" onClick={onCancel}>
              Cancel
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Authenticate step
  if (step === "authenticate" && selectedProvider) {
    const selectedAuthMethod = selectedProvider.authMethods.find((m) => m.id === selectedMethod);

    return (
      <div className="onboard">
        <div className="onboard-card">
          <h2>Authenticate with {selectedProvider.label}</h2>
          <p className="onboard-subtitle">Choose your authentication method</p>

          {error && (
            <div className="error-message">
              <strong>Error:</strong> {error}
            </div>
          )}

          {!selectedMethod ? (
            <div className="method-list">
              {selectedProvider.authMethods.map((method) => (
                <button
                  key={method.id}
                  className="method-card"
                  onClick={() => handleMethodSelect(method.id)}
                >
                  <h3>{method.label}</h3>
                  <p className="method-hint">{method.kind}</p>
                </button>
              ))}
              <button className="btn btn-secondary" onClick={handleBack}>
                Back
              </button>
            </div>
          ) : (
            <div className="auth-form">
              <div className="auth-info">
                <p>
                  <strong>Method:</strong> {selectedAuthMethod?.label}
                </p>
                <p className="auth-hint">
                  {manualOAuthPrompt ? (
                     <span style={{ color: "var(--color-warning, #f5a623)" }}>{manualOAuthPrompt}</span>
                  ) : (
                    <>
                      {selectedMethod === "api_key" && "Enter your API key from the provider's dashboard"}
                      {selectedMethod === "token" && "Paste your setup token from Claude CLI"}
                      {selectedMethod === "oauth" && "Click Continue to authenticate in your browser"}
                    </>
                  )}
                </p>
              </div>

              {(selectedMethod !== "oauth" || manualOAuthPrompt) && (
              <div className="credential-input">
                <label htmlFor="credential">
                  {manualOAuthPrompt ? "Redirect URL / Code" : (selectedMethod === "api_key" ? "API Key" : "Token")}
                </label>
                <input
                  id="credential"
                  type={manualOAuthPrompt ? "text" : "password"}
                  value={credential}
                  onChange={(e) => setCredential(e.target.value)}
                  placeholder={
                    manualOAuthPrompt 
                      ? "Paste the full redirect URL or code here"
                      : (selectedMethod === "api_key" ? "sk-..." : "Setup token")
                  }
                  className="input-field"
                  autoFocus
                />
              </div>
              )}

              <div className="onboard-actions">
                <button
                  className="btn btn-secondary"
                  onClick={() => setSelectedMethod(null)}
                  disabled={loading}
                >
                  Back
                </button>
                {manualOAuthPrompt ? (
                  <button
                    className="btn btn-primary"
                    onClick={handleManualOAuthSubmit}
                    disabled={!credential.trim()}
                  >
                    Submit Code
                  </button>
                ) : (
                  <button
                    className="btn btn-primary"
                    onClick={handleAuthenticate}
                    disabled={loading || (selectedMethod !== "oauth" && !credential.trim())}
                  >
                    {loading ? "Authenticating..." : "Continue"}
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  // Select model step
  if (step === "select-model" && selectedProvider && authResult) {
    return (
      <div className="onboard">
        <div className="onboard-card">
          <h2>Select a Default Model</h2>
          <p className="onboard-subtitle">
            Choose which model to use by default for {selectedProvider.label}
          </p>

          {error && (
            <div className="error-message">
              <strong>Error:</strong> {error}
            </div>
          )}

          <div className="auth-form">
            <div className="auth-info">
              <p>
                <strong>Suggested:</strong> {authResult.defaultModel || selectedProvider.defaultModel}
              </p>
            </div>

            {modelLoading ? (
              <p>Loading models...</p>
            ) : (
              <>
                {modelOptions.length > 0 && (
                  <div className="credential-input">
                    <label htmlFor="model-select">Model</label>
                    <select
                      id="model-select"
                      className="input-field"
                      value={selectedModel}
                      onChange={(e) => setSelectedModel(e.target.value)}
                    >
                      {modelOptions.map((model) => {
                        const label = `${model.provider}/${model.id}`;
                        const hintParts: string[] = [];
                        if (model.name && model.name !== model.id) {
                          hintParts.push(model.name);
                        }
                        if (model.contextWindow) {
                          hintParts.push(`ctx ${model.contextWindow}`);
                        }
                        if (model.reasoning) {
                          hintParts.push("reasoning");
                        }
                        const hint = hintParts.length > 0 ? ` (${hintParts.join(" | ")})` : "";
                        return (
                          <option key={label} value={label}>
                            {label}{hint}
                          </option>
                        );
                      })}
                    </select>
                  </div>
                )}

                <div className="credential-input">
                  <label htmlFor="model-manual">Or enter manually</label>
                  <input
                    id="model-manual"
                    type="text"
                    value={manualModel}
                    onChange={(e) => setManualModel(e.target.value)}
                    placeholder="provider/model"
                    className="input-field"
                  />
                </div>
              </>
            )}
          </div>

          <div className="onboard-actions">
            <button className="btn btn-secondary" onClick={handleBack} disabled={loading}>
              Back
            </button>
            <button
              className="btn btn-primary"
              onClick={handleModelContinue}
              disabled={loading || (!manualModel.trim() && !selectedModel.trim())}
            >
              {loading ? "Saving..." : "Continue"}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return null;
}
