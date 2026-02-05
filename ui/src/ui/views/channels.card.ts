import { html, nothing, type TemplateResult } from "lit";
import { icons } from "../icons";

export type ChannelCardProps = {
  title: string;
  description: string;
  icon: TemplateResult;
  connected: boolean;
  configured: boolean;
  loading?: boolean;
  error?: string | null;
  isOpen?: boolean; // Control expanded state
  children: TemplateResult; // The expanded content (config form, etc.)
};

export function renderChannelCard(props: ChannelCardProps) {
  const {
    title,
    description,
    icon,
    connected,
    configured,
    loading,
    error,
    children,
    isOpen,
  } = props;

  const showLoadingBadge = Boolean(loading);

  // Suppress "Schema unavailable" error from UI as it is a default state for some channels
  const isSchemaError = error?.includes("Schema unavailable");
  const displayError = isSchemaError ? null : error;

  const innerContent = html`
    <summary class="channel-summary">
      <div class="channel-icon">
        ${icon}
      </div>
      <div class="channel-info">
        <div class="channel-name">${title}</div>
        <div class="channel-desc">${description}</div>
      </div>
      
      ${
        displayError
          ? html`
          <div class="channel-status-badge error" title="${displayError}">
              ${icons.bug} Failed
          </div>
      `
          : showLoadingBadge
            ? html`
                <div class="channel-status-badge warn">Connecting...</div>
              `
            : connected
              ? html`
                  <div class="channel-status-badge connected">Connected</div>
                `
              : nothing
      }

      <div class="channel-expand-icon">
        ${icons.caretDown}
      </div>
    </summary>
    
    <div class="channel-content">
      ${displayError ? html`<div class="callout danger" style="margin-bottom: 16px;">${displayError}</div>` : nothing}
      ${children}
    </div>
  `;

  if (typeof isOpen === "boolean") {
    return html`
      <details class="card channel-card" ?open=${isOpen}>
        ${innerContent}
      </details>
    `;
  }

  return html`
    <details class="card channel-card">
      ${innerContent}
    </details>
  `;
}
