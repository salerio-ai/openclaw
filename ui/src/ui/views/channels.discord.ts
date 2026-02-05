import { html, nothing } from "lit";
import type { DiscordStatus } from "../types";
import type { ChannelsProps } from "./channels.types";
import { formatAgo } from "../format";
import { renderChannelCard } from "./channels.card";
import { renderChannelConfigSection } from "./channels.config";

export function renderDiscordCard(params: {
  props: ChannelsProps;
  discord?: DiscordStatus | null;
  accountCountLabel: unknown;
}) {
  const { props, discord, accountCountLabel } = params;

  return renderChannelCard({
    title: "Discord",
    description: "Connect your Discord bot.",
    icon: html`
      <img src="https://cdn.brandfetch.io/discord.com/w/100/h/100" class="channel-logo" alt="Discord" />
    `,
    connected: !!discord?.running,
    configured: !!discord?.configured,
    error: discord?.lastError,
    children: html`
      ${accountCountLabel}

      ${renderChannelConfigSection({ channelId: "discord", props })}

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
          discord?.running
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
