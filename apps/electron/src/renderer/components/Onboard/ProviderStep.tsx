import bustlyLogo from "../../assets/imgs/collapsed_logo_v2.svg";
import geminiLogo from "../../assets/imgs/Gemini.png";
import { formatTokenK } from "./utils";

const providerLogos: Record<string, string | undefined> = {
  openai: "https://cdn.brandfetch.io/openai.com/w/400/h/400",
  google: geminiLogo,
};

interface ProviderStepProps {
  providers: ProviderConfig[];
  selectedProvider: ProviderConfig | null;
  error: string | null;
  selectedMethod: string | null;
  credential: string;
  loading: boolean;
  onCredentialChange: (value: string) => void;
  onAuthenticate: () => void;
  onCancelAuth: () => void;
  onResetProvider: () => void;
  authResult: AuthResult | null;
  modelLoading: boolean;
  modelOptions: ModelCatalogEntry[];
  selectedModel: string;
  manualModel: string;
  onSelectedModelChange: (value: string) => void;
  onManualModelChange: (value: string) => void;
  onModelContinue: () => void;
  onSelect: (provider: ProviderConfig) => void;
  onBack: () => void;
}

export default function ProviderStep({
  providers,
  selectedProvider,
  error,
  selectedMethod,
  credential,
  loading,
  onCredentialChange,
  onAuthenticate,
  onCancelAuth,
  onResetProvider,
  authResult,
  modelLoading,
  modelOptions,
  selectedModel,
  manualModel,
  onSelectedModelChange,
  onManualModelChange,
  onModelContinue,
  onSelect,
  onBack,
}: ProviderStepProps) {
  const authHint =
    selectedMethod === "api_key"
      ? "Enter your API key from the provider dashboard."
      : selectedMethod === "token"
        ? "Paste your setup token."
        : "We will open a browser window to authenticate.";

  return (
    <div className="onboard !bg-[#F7F7F8]">
      <div className="w-full max-w-4xl mx-auto px-6">
        <div className="text-center mb-8">
          <img src={bustlyLogo} alt="Bustly Logo" className="h-12 mx-auto mb-3" />
          <h2 className="text-3xl font-bold text-[#1A162F] mb-3">Configure AI Model</h2>
          <p className="text-[#6B6F86] text-lg max-w-2xl mx-auto leading-relaxed">
            Select the AI provider to power your assistant.
          </p>
        </div>

        {error && (
          <div className="mb-6 rounded-xl border border-red-500/30 bg-red-50 px-4 py-3 text-sm text-red-600">
            <strong>Error:</strong> {error}
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-10">
          {providers.filter((provider) => provider.id !== "openrouter").map((provider) => {
            const isSelected = selectedProvider?.id === provider.id;
            const logo = providerLogos[provider.id];
            return (
              <div
                key={provider.id}
                className={`relative p-6 rounded-2xl border-2 transition-all flex flex-col items-center text-center gap-4 group ${
                  isSelected
                    ? "border-gray-200 bg-white shadow-md"
                    : "border-gray-200 bg-white hover:border-[#1A162F] hover:shadow-lg"
                }`}
              >
                <div className="w-16 h-16 rounded-full bg-white shadow-sm border border-gray-100 flex items-center justify-center p-3">
                  {logo ? (
                    <img src={logo} alt={provider.label} className="w-full h-full object-contain" />
                  ) : (
                    <span className="text-lg font-bold text-[#1A162F]">
                      {provider.label.slice(0, 2).toUpperCase()}
                    </span>
                  )}
                </div>
                <div>
                  <h3 className="text-xl font-bold text-[#1A162F]">{provider.label}</h3>
                  <p className="text-sm text-[#6B6F86] mt-1">{provider.defaultModel}</p>
                </div>

                {isSelected ? (
                  <button
                    type="button"
                    onClick={() => {
                      if (selectedMethod === "oauth" && !loading) {
                        onAuthenticate();
                      }
                    }}
                    disabled={selectedMethod !== "oauth"}
                    className={`mt-2 w-full max-w-[200px] px-3 py-2 rounded-lg font-bold flex items-center justify-center gap-2 shadow-sm h-[42px] ${
                      selectedMethod === "oauth"
                        ? "bg-[#1A162F] text-white"
                        : "bg-green-100 border border-green-500 text-green-800 cursor-default"
                    } ${selectedMethod === "oauth" ? "group relative" : ""} ${
                      loading && selectedMethod === "oauth" ? "opacity-80" : ""
                    } ${authResult ? "hidden" : ""}`}
                  >
                    {selectedMethod === "oauth" && loading ? (
                      <>
                        <span className="flex items-center gap-2 transition-opacity duration-200 group-hover:opacity-0 pointer-events-none">
                          <span className="inline-flex h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />
                          Connecting...
                        </span>
                        <span
                          className="absolute inset-0 flex items-center justify-center opacity-0 transition-opacity duration-200 group-hover:opacity-100"
                          onClick={(event) => {
                            event.stopPropagation();
                            onCancelAuth();
                          }}
                        >
                          Cancel
                        </span>
                      </>
                    ) : selectedMethod === "oauth" ? (
                      "Connect"
                    ) : (
                      "Selected"
                    )}
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => onSelect(provider)}
                    className="mt-2 w-full max-w-[200px] px-6 py-2 rounded-lg bg-gray-100 text-[#1A162F] font-semibold group-hover:bg-[#1A162F] group-hover:text-white transition-colors h-[42px]"
                  >
                    Connect
                  </button>
                )}

                {isSelected && selectedMethod && selectedMethod !== "oauth" && (
                  <div className="mt-4 w-full rounded-xl border border-gray-200 bg-gray-50 p-4 text-left">
                    <div className="mb-3">
                      <p className="text-sm font-semibold text-[#1A162F]">
                        {provider.label} credentials
                      </p>
                      <p className="mt-1 text-sm text-[#6B6F86]">{authHint}</p>
                    </div>
                    <div className="flex flex-col gap-2">
                      <label
                        className="text-xs font-semibold text-[#6B6F86]"
                        htmlFor={`provider-credential-${provider.id}`}
                      >
                        {selectedMethod === "api_key" ? "API Key" : "Token"}
                      </label>
                      <input
                        id={`provider-credential-${provider.id}`}
                        type="password"
                        value={credential}
                        onChange={(event) => onCredentialChange(event.target.value)}
                        placeholder={selectedMethod === "api_key" ? "sk-..." : "Setup token"}
                        className="rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm text-[#1A162F] shadow-sm focus:border-[#1A162F] focus:outline-none focus:ring-2 focus:ring-[#1A162F]/10 placeholder:text-[#6B6F86]"
                      />
                    </div>
                    <div className="mt-4 flex flex-wrap items-center gap-3">
                      <button
                        type="button"
                        onClick={onResetProvider}
                        className="px-4 py-2 text-sm font-semibold text-[#6B6F86] rounded-xl hover:bg-gray-100 hover:text-[#1A162F] transition-colors"
                        disabled={loading}
                      >
                        Change provider
                      </button>
                      <button
                        type="button"
                        onClick={onAuthenticate}
                        disabled={!credential.trim() || loading}
                        className="px-5 py-2 text-sm font-semibold text-white rounded-xl bg-[#1A162F] hover:bg-[#1A162F]/90 disabled:opacity-60 disabled:cursor-not-allowed"
                      >
                        {loading ? "Authenticating..." : "Continue"}
                      </button>
                    </div>
                  </div>
                )}

                {isSelected && authResult && (
                  <div
                    className="mt-4 w-full rounded-xl border border-gray-200 bg-white p-4 text-left"
                    onClick={(event) => event.stopPropagation()}
                  >
                    {modelLoading ? (
                      <p className="text-sm text-[#6B6F86]">Loading models...</p>
                    ) : (
                      <div className="flex flex-col gap-2">
                        <label
                          className="text-xs font-semibold text-[#6B6F86]"
                          htmlFor={`model-select-${provider.id}`}
                        >
                          Model
                        </label>
                        <select
                          id={`model-select-${provider.id}`}
                          className="rounded-xl border border-gray-200 bg-white px-4 py-3 pr-12 text-sm text-[#1A162F] shadow-sm focus:border-[#1A162F] focus:outline-none focus:ring-2 focus:ring-[#1A162F]/10 appearance-none bg-[url('data:image/svg+xml,%3Csvg%20xmlns=%22http://www.w3.org/2000/svg%22%20fill=%22%236B6F86%22%20viewBox=%220%200%2020%2020%22%3E%3Cpath%20d=%22M5.5%207.5l4.5%204.5%204.5-4.5%22%20stroke=%22%236B6F86%22%20stroke-width=%221.8%22%20fill=%22none%22%20stroke-linecap=%22round%22%20stroke-linejoin=%22round%22/%3E%3C/svg%3E')] bg-no-repeat bg-[right_1rem_center] bg-[length:16px_16px]"
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
                            return (
                              <option key={label} value={label}>
                                {label}
                              </option>
                            );
                          })}
                        </select>
                      </div>
                    )}
                    <div className="mt-4 flex items-center justify-end">
                      <button
                        type="button"
                        onClick={onModelContinue}
                        disabled={loading || (!manualModel.trim() && !selectedModel.trim())}
                        className="px-5 py-2 text-sm font-semibold text-white rounded-xl bg-[#1A162F] hover:bg-[#1A162F]/90 disabled:opacity-60 disabled:cursor-not-allowed"
                      >
                        {loading ? "Saving..." : "Continue"}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <div className="border-t border-gray-100 pt-6" />
      </div>
    </div>
  );
}
