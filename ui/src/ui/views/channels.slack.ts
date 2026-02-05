import { html, nothing } from "lit";
import type { SlackStatus } from "../types";
import type { ChannelsProps } from "./channels.types";
import { renderChannelCard } from "./channels.card";
import { renderChannelConfigSection } from "./channels.config";

export function renderSlackCard(params: {
  props: ChannelsProps;
  slack?: SlackStatus | null;
  accountCountLabel: unknown;
}) {
  const { props, slack, accountCountLabel } = params;

  return renderChannelCard({
    title: "Slack",
    description: "Connect via Socket Mode.",
    icon: html`
      <img src="https://cdn.brandfetch.io/slack.com/w/100/h/100" class="channel-logo" alt="Slack" />
    `,
    connected: !!slack?.running,
    configured: !!slack?.configured,
    error: slack?.lastError,
    children: html`
      ${accountCountLabel}
      ${renderChannelConfigSection({ channelId: "slack", props })}

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
          slack?.running
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
