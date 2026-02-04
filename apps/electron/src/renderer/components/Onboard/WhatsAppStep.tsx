import { useCallback, useEffect, useMemo, useState } from "react";

const DM_POLICY_OPTIONS = [
  { value: "pairing", label: "Pairing (recommended)", hint: "Unknown senders get a pairing code." },
  { value: "allowlist", label: "Allowlist only", hint: "Only numbers you approve can DM." },
  { value: "open", label: "Open", hint: "Public inbound DMs (requires allowFrom '*')." },
  { value: "disabled", label: "Disabled", hint: "Ignore WhatsApp DMs." },
] as const;

type DmPolicy = (typeof DM_POLICY_OPTIONS)[number]["value"];

type PhoneMode = "personal" | "separate";

type AllowFromMode = "keep" | "unset" | "list";

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
  const [checkingLink, setCheckingLink] = useState(false);
  const [savingConfig, setSavingConfig] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [phoneMode, setPhoneMode] = useState<PhoneMode | null>(null);
  const [personalNumber, setPersonalNumber] = useState("");
  const [dmPolicy, setDmPolicy] = useState<DmPolicy>("pairing");
  const [allowFromMode, setAllowFromMode] = useState<AllowFromMode>("unset");
  const [allowFromList, setAllowFromList] = useState("");

  const hasExistingAllowFrom = Boolean(status?.allowFrom && status.allowFrom.length > 0);

  const loadStatus = useCallback(async () => {
    if (!window.electronAPI?.onboardWhatsAppStatus) {
      return;
    }
    try {
      const nextStatus = await window.electronAPI.onboardWhatsAppStatus();
      setStatus(nextStatus);
      if (nextStatus.selfChatMode) {
        setPhoneMode("personal");
        const personal = nextStatus.allowFrom?.find((value) => value !== "*") ?? "";
        setPersonalNumber(personal);
      }
      if (nextStatus.dmPolicy) {
        setDmPolicy(nextStatus.dmPolicy);
      }
      if (Array.isArray(nextStatus.allowFrom)) {
        const allowFrom = nextStatus.allowFrom.filter((value) => value !== "*");
        const hasAllowFrom = nextStatus.allowFrom.length > 0;
        setAllowFromList(allowFrom.join(", "));
        setAllowFromMode(hasAllowFrom ? "keep" : "unset");
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

  const allowFromOptions = useMemo(() => {
    const options: Array<{ value: AllowFromMode; label: string }> = [];
    if (hasExistingAllowFrom) {
      options.push({ value: "keep", label: "Keep current allowFrom" });
    }
    options.push({ value: "unset", label: "Unset allowFrom" });
    options.push({ value: "list", label: "Set allowFrom" });
    return options;
  }, [hasExistingAllowFrom]);

  const handleSave = useCallback(async () => {
    if (!window.electronAPI?.onboardWhatsAppConfig) {
      return;
    }
    setError(null);
    if (!phoneMode) {
      setError("Choose a phone setup to continue.");
      return;
    }
    if (phoneMode === "personal" && !personalNumber.trim()) {
      setError("Enter your WhatsApp number.");
      return;
    }
    if (phoneMode === "separate" && dmPolicy !== "disabled" && allowFromMode === "list") {
      if (!allowFromList.trim()) {
        setError("Enter at least one number for allowFrom.");
        return;
      }
    }

    setSavingConfig(true);
    try {
      const payload: WhatsAppConfigRequest =
        phoneMode === "personal"
          ? { mode: "personal", personalNumber }
          : { mode: "separate", dmPolicy, allowFromMode, allowFromList };
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
  }, [phoneMode, personalNumber, dmPolicy, allowFromMode, allowFromList, onDone]);

  return (
    <div className="onboard">
      <div className="onboard-card">
        <div className="flex flex-col gap-6">
          <div className="text-center">
            <h2 className="text-2xl font-semibold text-slate-100">Connect WhatsApp</h2>
            <p className="mt-2 text-sm text-slate-400">
              Link your phone and choose how OpenClaw should handle direct messages.
            </p>
          </div>

          {error && (
            <div className="rounded-lg border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-200">
              <strong>Error:</strong> {error}
            </div>
          )}

          <div className="rounded-xl border border-slate-700 bg-slate-950/40 p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-slate-200">Status</p>
                <p className="text-xs text-slate-400">
                  {status?.linked ? "Linked" : "Not linked"}
                </p>
              </div>
              <span
                className={`rounded-full px-3 py-1 text-xs font-semibold ${
                  status?.linked
                    ? "bg-emerald-500/20 text-emerald-200"
                    : "bg-amber-500/20 text-amber-200"
                }`}
              >
                {status?.linked ? "Linked" : "Needs linking"}
              </span>
            </div>
            {linkMessage && <p className="mt-3 text-xs text-slate-400">{linkMessage}</p>}
          </div>

          <div className="rounded-xl border border-slate-700 bg-slate-900/40 p-4">
            <div className="flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-slate-200">WhatsApp QR</p>
                  <p className="text-xs text-slate-400">
                    Scan with WhatsApp → Linked Devices.
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    className="rounded-md border border-slate-600 px-3 py-1.5 text-xs font-semibold text-slate-200 hover:border-slate-400"
                    onClick={() => handleStartLink(Boolean(status?.linked))}
                    disabled={loadingLink}
                  >
                    {loadingLink ? "Generating..." : status?.linked ? "Re-link" : "Generate QR"}
                  </button>
                  <button
                    type="button"
                    className="rounded-md bg-emerald-500/20 px-3 py-1.5 text-xs font-semibold text-emerald-200 hover:bg-emerald-500/30"
                    onClick={handleCheckLink}
                    disabled={checkingLink}
                  >
                    {checkingLink ? "Checking..." : "I scanned it"}
                  </button>
                </div>
              </div>
              {qrDataUrl ? (
                <div className="flex flex-col items-center gap-3">
                  <div className="rounded-lg bg-white p-3">
                    <img src={qrDataUrl} alt="WhatsApp QR" className="h-48 w-48" />
                  </div>
                  <p className="text-xs text-slate-400">QR expires in a few minutes.</p>
                </div>
              ) : (
                <p className="text-xs text-slate-500">
                  Generate a QR to link your phone. You can still configure policies without linking.
                </p>
              )}
            </div>
          </div>

          <div className="rounded-xl border border-slate-700 bg-slate-950/40 p-4">
            <div className="flex flex-col gap-4">
              <div>
                <p className="text-sm font-medium text-slate-200">Phone setup</p>
                <p className="text-xs text-slate-400">Tell us how you plan to use WhatsApp.</p>
              </div>

              <div className="grid gap-3 md:grid-cols-2">
                <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-slate-700 bg-slate-900/40 p-3">
                  <input
                    type="radio"
                    name="phone-mode"
                    className="mt-1"
                    checked={phoneMode === "personal"}
                    onChange={() => setPhoneMode("personal")}
                  />
                  <span className="text-sm text-slate-200">
                    Personal phone
                    <span className="mt-1 block text-xs text-slate-400">
                      You will message OpenClaw from this same number.
                    </span>
                  </span>
                </label>
                <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-slate-700 bg-slate-900/40 p-3">
                  <input
                    type="radio"
                    name="phone-mode"
                    className="mt-1"
                    checked={phoneMode === "separate"}
                    onChange={() => setPhoneMode("separate")}
                  />
                  <span className="text-sm text-slate-200">
                    Separate phone
                    <span className="mt-1 block text-xs text-slate-400">
                      Dedicated number just for OpenClaw.
                    </span>
                  </span>
                </label>
              </div>

              {phoneMode === "personal" && (
                <div className="flex flex-col gap-2">
                  <label className="text-xs font-semibold text-slate-300" htmlFor="wa-personal">
                    Your WhatsApp number (E.164)
                  </label>
                  <input
                    id="wa-personal"
                    value={personalNumber}
                    onChange={(event) => setPersonalNumber(event.target.value)}
                    placeholder="+15555550123"
                    className="rounded-md border border-slate-700 bg-slate-950/60 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500"
                  />
                  <p className="text-xs text-slate-500">
                    We'll allowlist this number and enable self-chat mode.
                  </p>
                </div>
              )}

              {phoneMode === "separate" && (
                <div className="flex flex-col gap-4">
                  <div className="flex flex-col gap-2">
                    <label className="text-xs font-semibold text-slate-300" htmlFor="wa-policy">
                      DM policy
                    </label>
                    <select
                      id="wa-policy"
                      value={dmPolicy}
                      onChange={(event) => setDmPolicy(event.target.value as DmPolicy)}
                      className="rounded-md border border-slate-700 bg-slate-950/60 px-3 py-2 text-sm text-slate-100"
                    >
                      {DM_POLICY_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                    <p className="text-xs text-slate-500">
                      {DM_POLICY_OPTIONS.find((option) => option.value === dmPolicy)?.hint}
                    </p>
                  </div>

                  {dmPolicy !== "disabled" && (
                    <div className="flex flex-col gap-2">
                      <label className="text-xs font-semibold text-slate-300" htmlFor="wa-allow-mode">
                        allowFrom
                      </label>
                      <select
                        id="wa-allow-mode"
                        value={allowFromMode}
                        onChange={(event) => setAllowFromMode(event.target.value as AllowFromMode)}
                        className="rounded-md border border-slate-700 bg-slate-950/60 px-3 py-2 text-sm text-slate-100"
                      >
                        {allowFromOptions.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>

                      {allowFromMode === "list" && (
                        <div className="mt-2 flex flex-col gap-2">
                          <label
                            className="text-xs font-semibold text-slate-300"
                            htmlFor="wa-allow-list"
                          >
                            Allowed sender numbers
                          </label>
                          <input
                            id="wa-allow-list"
                            value={allowFromList}
                            onChange={(event) => setAllowFromList(event.target.value)}
                            placeholder="+15555550123, +447700900123"
                            className="rounded-md border border-slate-700 bg-slate-950/60 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500"
                          />
                          <p className="text-xs text-slate-500">
                            Comma, semicolon, or newline separated.
                          </p>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3">
            <button
              type="button"
              className="rounded-md border border-slate-700 px-4 py-2 text-sm font-semibold text-slate-200 hover:border-slate-500"
              onClick={onBack}
            >
              Back
            </button>
            <div className="flex items-center gap-2">
              <button
                type="button"
                className="rounded-md border border-slate-700 px-4 py-2 text-sm font-semibold text-slate-300 hover:border-slate-500"
                onClick={onSkip}
              >
                Skip for now
              </button>
              <button
                type="button"
                className="rounded-md bg-emerald-500 px-4 py-2 text-sm font-semibold text-emerald-950 hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-60"
                onClick={handleSave}
                disabled={savingConfig}
              >
                {savingConfig ? "Saving..." : "Save & Finish"}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
