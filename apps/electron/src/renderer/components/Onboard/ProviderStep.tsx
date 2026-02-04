interface ProviderStepProps {
  providers: ProviderConfig[];
  selectedProvider: ProviderConfig | null;
  error: string | null;
  onSelect: (provider: ProviderConfig) => void;
  onBack: () => void;
  onCancel: () => void;
}

export default function ProviderStep({
  providers,
  selectedProvider,
  error,
  onSelect,
  onBack,
  onCancel,
}: ProviderStepProps) {
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
              onClick={() => onSelect(provider)}
            >
              <h3>{provider.label}</h3>
              {provider.isDev && <span className="badge badge-dev">Dev</span>}
              <p>{provider.defaultModel}</p>
            </button>
          ))}
        </div>

        <div className="onboard-actions">
          <button className="btn btn-secondary" onClick={onBack}>
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
