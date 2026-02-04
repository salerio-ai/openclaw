import { formatTokenK } from "./utils";

interface ModelStepProps {
  provider: ProviderConfig;
  authResult: AuthResult;
  modelLoading: boolean;
  modelOptions: ModelCatalogEntry[];
  selectedModel: string;
  manualModel: string;
  loading: boolean;
  error: string | null;
  onSelectedModelChange: (value: string) => void;
  onManualModelChange: (value: string) => void;
  onBack: () => void;
  onContinue: () => void;
}

export default function ModelStep({
  provider,
  authResult,
  modelLoading,
  modelOptions,
  selectedModel,
  manualModel,
  loading,
  error,
  onSelectedModelChange,
  onManualModelChange,
  onBack,
  onContinue,
}: ModelStepProps) {
  return (
    <div className="onboard">
      <div className="onboard-card">
        <h2>Select a Default Model</h2>
        <p className="onboard-subtitle">
          Choose which model to use by default for {provider.label}
        </p>

        {error && (
          <div className="error-message">
            <strong>Error:</strong> {error}
          </div>
        )}

        <div className="auth-form">
          <div className="auth-info">
            <p>
              <strong>Suggested:</strong> {authResult.defaultModel || provider.defaultModel}
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
                    onChange={(event) => onSelectedModelChange(event.target.value)}
                  >
                    {modelOptions.map((model) => {
                      const label = `${model.provider}/${model.id}`;
                      const hintParts: string[] = [];
                      if (model.name && model.name !== model.id) {
                        hintParts.push(model.name);
                      }
                      if (model.contextWindow) {
                        hintParts.push(`ctx ${formatTokenK(model.contextWindow)}`);
                      }
                      if (model.reasoning) {
                        hintParts.push("reasoning");
                      }
                      if (model.aliases && model.aliases.length > 0) {
                        hintParts.push(`alias: ${model.aliases.join(", ")}`);
                      }
                      const hint = hintParts.length > 0 ? ` (${hintParts.join(" | ")})` : "";
                      return (
                        <option key={label} value={label}>
                          {label}
                          {hint}
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
                  onChange={(event) => onManualModelChange(event.target.value)}
                  placeholder="provider/model"
                  className="input-field"
                />
              </div>
            </>
          )}
        </div>

        <div className="onboard-actions">
          <button className="btn btn-secondary" onClick={onBack} disabled={loading}>
            Back
          </button>
          <button
            className="btn btn-primary"
            onClick={onContinue}
            disabled={loading || (!manualModel.trim() && !selectedModel.trim())}
          >
            {loading ? "Saving..." : "Continue"}
          </button>
        </div>
      </div>
    </div>
  );
}
