import { html, nothing } from "lit";
import type { AppViewState } from "../app-view-state";
import type { GatewayBrowserClient } from "../gateway";
import { icons } from "../icons";

// Wizard step types matching the backend
type WizardStep = {
  id: string;
  type: "note" | "select" | "text" | "confirm" | "multiselect" | "progress" | "action";
  title?: string;
  message?: string;
  options?: Array<{ value: unknown; label: string; hint?: string }>;
  initialValue?: unknown;
  placeholder?: string;
  sensitive?: boolean;
};

type WizardStatus = {
  status: "running" | "done" | "cancelled" | "error";
  error?: string;
};

// Store wizard state locally since it's transient
let wizardState: {
  sessionId?: string;
  currentStep?: WizardStep;
  status?: "running" | "done" | "cancelled" | "error";
  error?: string;
  loading: boolean;
  history: Array<{ stepId: string; value: unknown }>;
} = {
  loading: false,
  history: [],
};

// API helpers
async function startWizard(client: GatewayBrowserClient) {
  wizardState.loading = true;
  requestUpdate();
  try {
    const body: any = await client.request("wizard.start", { mode: "local" });
    wizardState.sessionId = body.sessionId;
    wizardState.currentStep = body.step;
    wizardState.status = body.status;
    wizardState.error = undefined;
  } catch (err: any) {
    wizardState.error = err.message || "Failed to start wizard";
  } finally {
    wizardState.loading = false;
    requestUpdate();
  }
}

async function nextStep(client: GatewayBrowserClient, answer?: { stepId: string; value: unknown }) {
  if (!wizardState.sessionId) return;
  
  wizardState.loading = true;
  requestUpdate();
  try {
    const body: any = await client.request("wizard.next", {
      sessionId: wizardState.sessionId,
      answer,
    });
    
    if (body.done) {
      wizardState.status = "done";
      wizardState.currentStep = undefined;
    } else {
      wizardState.currentStep = body.step;
      wizardState.status = body.status;
    }
  } catch (err: any) {
    wizardState.error = err.message;
  } finally {
    wizardState.loading = false;
    requestUpdate();
  }
}

async function cancelWizard(client: GatewayBrowserClient) {
  if (!wizardState.sessionId) return;
  
  try {
    await client.request("wizard.cancel", { sessionId: wizardState.sessionId });
    wizardState = { loading: false, history: [] };
  } catch (err) {
    console.error(err);
  } finally {
    requestUpdate();
  }
}

// Helper to trigger re-render
function requestUpdate() {
  const app = document.querySelector("openclaw-app") as any;
  if (app) app.requestUpdate();
}

function renderStep(step: WizardStep, client: GatewayBrowserClient) {
  const submit = (value: unknown) => {
    wizardState.history.push({ stepId: step.id, value });
    nextStep(client, { stepId: step.id, value });
  };

  switch (step.type) {
    case "note":
      return html`
        <div class="step-note">
          ${step.title ? html`<h3>${step.title}</h3>` : nothing}
          <div class="step-message markdown-body">${step.message}</div>
          <button class="btn btn-primary" @click=${() => submit(null)}>Next</button>
        </div>
      `;

    case "text":
      return html`
        <div class="step-text">
          <div class="step-message">${step.message}</div>
          <form @submit=${(e: Event) => {
            e.preventDefault();
            const form = e.target as HTMLFormElement;
            const input = form.querySelector("input") as HTMLInputElement;
            submit(input.value);
          }}>
            <input 
              type=${step.sensitive ? "password" : "text"} 
              class="form-control"
              placeholder=${step.placeholder || ""}
              .value=${step.initialValue || ""}
              autofocus
            >
            <button type="submit" class="btn btn-primary">Next</button>
          </form>
        </div>
      `;

    case "select":
      return html`
        <div class="step-select">
          <div class="step-message">${step.message}</div>
          <div class="options-list">
            ${step.options?.map(opt => html`
              <button class="option-btn" @click=${() => submit(opt.value)}>
                <div class="option-label">${opt.label}</div>
                ${opt.hint ? html`<div class="option-hint">${opt.hint}</div>` : nothing}
              </button>
            `)}
          </div>
        </div>
      `;

    case "confirm":
      return html`
        <div class="step-confirm">
          <div class="step-message">${step.message}</div>
          <div class="confirm-actions">
            <button class="btn btn-primary" @click=${() => submit(true)}>Yes</button>
            <button class="btn btn-secondary" @click=${() => submit(false)}>No</button>
          </div>
        </div>
      `;
      
    case "multiselect":
      // Simple implementation for multiselect
      return html`
        <div class="step-multiselect">
          <div class="step-message">${step.message}</div>
          <div class="options-list">
            ${step.options?.map(opt => html`
              <label class="option-item">
                <input type="checkbox" value=${String(opt.value)} name="multi">
                <span class="option-content">
                  <div class="option-label">${opt.label}</div>
                  ${opt.hint ? html`<div class="option-hint">${opt.hint}</div>` : nothing}
                </span>
              </label>
            `)}
          </div>
          <button class="btn btn-primary" @click=${(e: Event) => {
            const container = (e.target as Element).closest(".step-multiselect");
            const checked = Array.from(container?.querySelectorAll("input:checked") || [])
              .map((input: any) => input.value);
            submit(checked);
          }}>Next</button>
        </div>
      `;

    default:
      return html`<div class="error">Unsupported step type: ${step.type}</div>`;
  }
}

export function renderOnboard(state: AppViewState) {
  // Access client from state (OpenClawApp instance)
  const client = (state as any).client as GatewayBrowserClient | null;

  if (!client) {
     return html`
      <div class="onboard-view">
        <div class="error-banner">Gateway disconnected. Please connect first.</div>
      </div>
    `;
  }

  return html`
    <div class="onboard-view">
      <div class="onboard-header">
        <h1>Onboarding Wizard</h1>
        ${wizardState.status === "running" ? html`
          <button class="btn btn-sm btn-danger" @click=${() => cancelWizard(client)}>Cancel</button>
        ` : nothing}
      </div>

      <div class="onboard-content">
        ${!wizardState.sessionId ? html`
          <div class="start-screen">
            <p>Setup your OpenClaw agent with the interactive wizard.</p>
            <button class="btn btn-primary btn-lg" @click=${() => startWizard(client)} ?disabled=${wizardState.loading}>
              ${wizardState.loading ? "Starting..." : "Start Setup"}
            </button>
            ${wizardState.error ? html`<div class="error-banner">${wizardState.error}</div>` : nothing}
          </div>
        ` : html`
          ${wizardState.loading ? html`<div class="loading-spinner">Loading...</div>` : nothing}
          
          ${wizardState.status === "done" ? html`
            <div class="success-screen">
              <h2>Setup Complete! 🎉</h2>
              <p>Your agent is ready to go.</p>
              <button class="btn btn-primary" @click=${() => {
                wizardState = { loading: false, history: [] };
                requestUpdate();
              }}>Done</button>
            </div>
          ` : nothing}

          ${wizardState.currentStep ? renderStep(wizardState.currentStep, client) : nothing}
          
          ${wizardState.error ? html`<div class="error-banner">${wizardState.error}</div>` : nothing}
        `}
      </div>
    </div>

    <style>
      .onboard-view {
        max-width: 800px;
        margin: 0 auto;
        padding: 2rem;
      }
      .onboard-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 2rem;
        border-bottom: 1px solid var(--border-color);
        padding-bottom: 1rem;
      }
      .step-message {
        font-size: 1.2rem;
        margin-bottom: 1.5rem;
        white-space: pre-wrap;
      }
      .options-list {
        display: grid;
        gap: 0.8rem;
        margin-bottom: 1.5rem;
      }
      .option-btn {
        text-align: left;
        padding: 1rem;
        border: 1px solid var(--border-color);
        background: var(--bg-surface);
        border-radius: 8px;
        cursor: pointer;
        transition: all 0.2s;
      }
      .option-btn:hover {
        border-color: var(--primary-color);
        background: var(--bg-hover);
      }
      .option-hint {
        font-size: 0.9rem;
        color: var(--text-muted);
        margin-top: 0.25rem;
      }
      .confirm-actions {
        display: flex;
        gap: 1rem;
      }
      .error-banner {
        margin-top: 1rem;
        padding: 1rem;
        background: var(--danger-bg);
        color: var(--danger-text);
        border-radius: 8px;
      }
      .form-control {
        width: 100%;
        padding: 0.8rem;
        margin-bottom: 1rem;
        border: 1px solid var(--border-color);
        border-radius: 6px;
        background: var(--bg-input);
        color: var(--text-color);
      }
      .step-note button {
        margin-top: 1rem;
      }
    </style>
  `;
}
