import { html, nothing } from "lit";
import type { WhatsAppStatus } from "../types";
import type { ChannelsProps } from "./channels.types";
import { renderChannelCard } from "./channels.card";
import { renderChannelConfigSection } from "./channels.config";

export function renderWhatsAppCard(params: {
  props: ChannelsProps;
  whatsapp?: WhatsAppStatus;
  accountCountLabel: unknown;
}) {
  const { props, whatsapp, accountCountLabel } = params;

  const isConnected = !!whatsapp?.connected;
  const isScanning = !!props.whatsappQrDataUrl;
  const isBusy = !!props.whatsappBusy;

  return renderChannelCard({
    title: "WhatsApp",
    description: "Link WhatsApp Web and monitor connection health.",
    icon: html`
      <img
        src="https://cdn.brandfetch.io/whatsapp.com/w/100/h/100"
        class="channel-logo"
        alt="WhatsApp Logo"
      />
    `,
    connected: isConnected,
    configured: !!whatsapp?.configured,
    loading: isBusy,
    error: whatsapp?.lastError,
    isOpen: isScanning ? true : undefined, // Auto-expand only when QR is ready
    children: html`
      ${
        isScanning
          ? html`
            <div class="qr-container" style="display: flex; flex-direction: column; align-items: center; padding: 20px;">
              <div style="font-weight: 500; margin-bottom: 12px; color: var(--text-secondary);">Scan this QR code with WhatsApp</div>
              <div class="qr-wrap" style="background: white; padding: 12px; border-radius: 12px; box-shadow: 0 4px 12px rgba(0,0,0,0.05);">
                <img src=${props.whatsappQrDataUrl} alt="WhatsApp QR" style="width: 200px; height: 200px; display: block;" />
              </div>
              <div style="margin-top: 16px;">
                 <button class="btn" @click=${() => props.onWhatsAppLogout()}>Cancel</button>
              </div>
            </div>
          `
          : nothing
      }

      ${
        !isScanning
          ? html`
             <div class="row" style="margin-bottom: 16px; justify-content: flex-end;">
                ${
                  isConnected
                    ? html`<button class="btn" @click=${() => props.onWhatsAppLogout()}>Disconnect</button>`
                    : isBusy
                      ? html`
                          <button class="btn" disabled>Connecting...</button>
                        `
                      : html`<button class="btn primary" @click=${() => props.onWhatsAppStart(false)}>Connect WhatsApp</button>`
                }
             </div>
          `
          : nothing
      }

      ${
        props.whatsappMessage
          ? html`<div class="callout" style="margin-top: 12px;">
            ${props.whatsappMessage}
          </div>`
          : nothing
      }

      <!-- Advanced Configuration (Hidden by default, simple toggle) -->
      <details class="advanced-config" style="margin-top: 16px;">
        <summary style="cursor: pointer; font-size: 0.9em; color: var(--text-secondary); user-select: none;">
          Advanced Settings
        </summary>
        <div style="margin-top: 12px; padding-top: 12px; border-top: 1px solid var(--border-color);">
           ${renderChannelConfigSection({ channelId: "whatsapp", props })}
        </div>
      </details>
    `,
  });
}
