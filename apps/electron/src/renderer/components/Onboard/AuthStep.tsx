interface AuthStepProps {
  provider: ProviderConfig;
  selectedMethod: string | null;
  manualOAuthPrompt: string | null;
  credential: string;
  loading: boolean;
  error: string | null;
  onMethodSelect: (methodId: string) => void;
  onCredentialChange: (value: string) => void;
  onAuthenticate: () => void;
  onManualOAuthSubmit: () => void;
  onResetMethod: () => void;
  onBack: () => void;
}

export default function AuthStep({
  provider,
  selectedMethod,
  manualOAuthPrompt,
  credential,
  loading,
  error,
  onMethodSelect,
  onCredentialChange,
  onAuthenticate,
  onManualOAuthSubmit,
  onResetMethod,
  onBack,
}: AuthStepProps) {
  const selectedAuthMethod = provider.authMethods.find((method) => method.id === selectedMethod);

  return (
    <div className="onboard">
      <div className="onboard-card">
        <h2>Authenticate with {provider.label}</h2>
        <p className="onboard-subtitle">Choose your authentication method</p>

        {error && (
          <div className="error-message">
            <strong>Error:</strong> {error}
          </div>
        )}

        {!selectedMethod ? (
          <div className="method-list">
            {provider.authMethods.map((method) => (
              <button
                key={method.id}
                className="method-card"
                onClick={() => onMethodSelect(method.id)}
              >
                <h3>{method.label}</h3>
                <p className="method-hint">{method.kind}</p>
              </button>
            ))}
            <button className="btn btn-secondary" onClick={onBack}>
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
                  <span style={{ color: "var(--color-warning, #f5a623)" }}>
                    {manualOAuthPrompt}
                  </span>
                ) : (
                  <>
                    {selectedMethod === "api_key" &&
                      "Enter your API key from the provider's dashboard"}
                    {selectedMethod === "token" && "Paste your setup token from Claude CLI"}
                    {selectedMethod === "oauth" && "Click Continue to authenticate in your browser"}
                  </>
                )}
              </p>
            </div>

            {(selectedMethod !== "oauth" || manualOAuthPrompt) && (
              <div className="credential-input">
                <label htmlFor="credential">
                  {manualOAuthPrompt
                    ? "Redirect URL / Code"
                    : selectedMethod === "api_key"
                      ? "API Key"
                      : "Token"}
                </label>
                <input
                  id="credential"
                  type={manualOAuthPrompt ? "text" : "password"}
                  value={credential}
                  onChange={(event) => onCredentialChange(event.target.value)}
                  placeholder={
                    manualOAuthPrompt
                      ? "Paste the full redirect URL or code here"
                      : selectedMethod === "api_key"
                        ? "sk-..."
                        : "Setup token"
                  }
                  className="input-field"
                  autoFocus
                />
              </div>
            )}

            <div className="onboard-actions">
              <button className="btn btn-secondary" onClick={onResetMethod} disabled={loading}>
                Back
              </button>
              {manualOAuthPrompt ? (
                <button
                  className="btn btn-primary"
                  onClick={onManualOAuthSubmit}
                  disabled={!credential.trim()}
                >
                  Submit Code
                </button>
              ) : (
                <button
                  className="btn btn-primary"
                  onClick={onAuthenticate}
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
