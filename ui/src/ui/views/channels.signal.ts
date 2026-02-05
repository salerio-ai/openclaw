import { html, nothing } from "lit";
import type { SignalStatus } from "../types";
import type { ChannelsProps } from "./channels.types";
import { renderChannelCard } from "./channels.card";
import { renderChannelConfigSection } from "./channels.config";

export function renderSignalCard(params: {
  props: ChannelsProps;
  signal?: SignalStatus | null;
  accountCountLabel: unknown;
}) {
  const { props, signal, accountCountLabel } = params;

  return renderChannelCard({
    title: "Signal",
    description: "Connect via signal-cli.",
    icon: html`
      <img src="https://cdn.brandfetch.io/signal.org/w/100/h/100" class="channel-logo" alt="Signal" />
    `,
    connected: !!signal?.running,
    configured: !!signal?.configured,
    error: signal?.lastError,
    children: html`
      ${accountCountLabel}
      ${renderChannelConfigSection({ channelId: "signal", props })}

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
          signal?.running
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
