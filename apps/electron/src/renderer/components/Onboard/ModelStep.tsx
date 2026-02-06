import OnboardContainer from "./OnboardContainer";
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
    <OnboardContainer className="onboard-card w-full max-w-3xl border border-gray-200 bg-white shadow-sm">
      <div className="mb-8 text-center">
        <div
          className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-[#111111] text-white"
          aria-hidden="true"
        >
          B
        </div>
        <h2 className="text-3xl font-bold text-text-main">Configure AI Model</h2>
        <p className="mt-3 text-base text-text-sub">
          Choose which model to use by default for {provider.label}.
        </p>
      </div>

      {error && (
        <div className="rounded-xl border border-red-500/30 bg-red-50 px-4 py-3 text-sm text-red-600">
          <strong>Error:</strong> {error}
        </div>
      )}

      <div className="rounded-2xl border border-gray-200 bg-[#F4F4F5] p-5">
        <p className="text-sm font-semibold text-text-main">Suggested</p>
        <p className="mt-2 text-sm text-text-sub">
          {authResult.defaultModel || provider.defaultModel}
        </p>
      </div>

      <div className="mt-6 grid gap-4">
        {modelLoading ? (
          <p className="text-sm text-text-sub">Loading models...</p>
        ) : (
          <>
            {modelOptions.length > 0 && (
              <div className="flex flex-col gap-2">
                <label className="text-xs font-semibold text-text-sub" htmlFor="model-select">
                  Model
                </label>
                <select
                  id="model-select"
                  className="rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm text-text-main shadow-sm focus:border-[#1A162F] focus:outline-none focus:ring-2 focus:ring-[#1A162F]/10"
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

            <div className="flex flex-col gap-2">
              <label className="text-xs font-semibold text-text-sub" htmlFor="model-manual">
                Or enter manually
              </label>
              <input
                id="model-manual"
                type="text"
                value={manualModel}
                onChange={(event) => onManualModelChange(event.target.value)}
                placeholder="provider/model"
                className="rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm text-text-main shadow-sm focus:border-[#1A162F] focus:outline-none focus:ring-2 focus:ring-[#1A162F]/10 placeholder:text-text-sub/60"
              />
            </div>
          </>
        )}
      </div>

      <div className="mt-8 flex flex-wrap items-center justify-between gap-3">
        <button
          className="rounded-xl border border-gray-200 bg-white px-6 py-3 text-sm font-semibold text-text-main shadow-sm transition-all hover:-translate-y-0.5 hover:bg-gray-50 hover:shadow-md disabled:cursor-not-allowed disabled:opacity-60"
          onClick={onBack}
          disabled={loading}
        >
          Back
        </button>
        <button
          className="rounded-xl bg-text-main px-6 py-3 text-sm font-semibold text-white shadow-lg transition-all hover:-translate-y-0.5 hover:bg-text-main/90 hover:shadow-xl disabled:cursor-not-allowed disabled:opacity-60"
          onClick={onContinue}
          disabled={loading || (!manualModel.trim() && !selectedModel.trim())}
        >
          {loading ? "Saving..." : "Continue"}
        </button>
      </div>
    </OnboardContainer>
  );
}
