import { html, nothing } from "lit";
import type { IMessageStatus } from "../types";
import type { ChannelsProps } from "./channels.types";
import { renderChannelCard } from "./channels.card";
import { renderChannelConfigSection } from "./channels.config";

export function renderIMessageCard(params: {
  props: ChannelsProps;
  imessage?: IMessageStatus | null;
  accountCountLabel: unknown;
}) {
  const { props, imessage, accountCountLabel } = params;

  return renderChannelCard({
    title: "iMessage",
    description: "macOS bridge integration.",
    icon: html`
      <img
        src="https://cdn.brandfetch.io/apple.com/w/100/h/100"
        class="channel-logo"
        alt="Apple iMessage"
      />
    `,
    connected: !!imessage?.running,
    configured: !!imessage?.configured,
    error: imessage?.lastError,
    children: html`
      ${accountCountLabel}
      ${renderChannelConfigSection({ channelId: "imessage", props })}

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
          imessage?.running
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
