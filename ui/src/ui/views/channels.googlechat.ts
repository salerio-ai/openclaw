import { html, nothing } from "lit";
import type { GoogleChatStatus } from "../types";
import type { ChannelsProps } from "./channels.types";
import { renderChannelCard } from "./channels.card";
import { renderChannelConfigSection } from "./channels.config";

export function renderGoogleChatCard(params: {
  props: ChannelsProps;
  googleChat?: GoogleChatStatus | null;
  accountCountLabel: unknown;
}) {
  const { props, googleChat, accountCountLabel } = params;

  return renderChannelCard({
    title: "Google Chat",
    description: "Chat API webhook integration.",
    icon: html`
      <img
        src="https://cdn.brandfetch.io/google.com/icon/theme/dark/w/100/h/100"
        class="channel-logo"
        alt="Google Chat"
      />
    `,
    connected: !!googleChat?.running,
    configured: !!googleChat?.configured,
    error: googleChat?.lastError,
    children: html`
      ${accountCountLabel}
      ${renderChannelConfigSection({ channelId: "googlechat", props })}

      <div class="row" style="margin-top: 12px; justify-content: space-between; align-items: flex-start;">
        <details class="advanced-config">
          <summary style="font-size: 12px; color: var(--muted); cursor: pointer;">Advanced</summary>
          <div style="margin-top: 8px;">
            <button class="btn" @click=${() => props.onRefresh(true)}>
              Probe Connection
            </button>
          </div>
        </details>

        ${
          googleChat?.running
            ? html`
                <button
                  class="btn"
                  @click=${() => alert("To disconnect, please clear the configuration above and save.")}
                >
                  Disconnect
                </button>
              `
            : nothing
        }
      </div>
    `,
  });
}
