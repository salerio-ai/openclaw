import { html, nothing } from "lit";
import type { ChannelAccountSnapshot, TelegramStatus } from "../types";
import type { ChannelsProps } from "./channels.types";
import { formatAgo } from "../format";
import { renderChannelCard } from "./channels.card";
import { renderChannelConfigSection } from "./channels.config";

export function renderTelegramCard(params: {
  props: ChannelsProps;
  telegram?: TelegramStatus;
  telegramAccounts: ChannelAccountSnapshot[];
  accountCountLabel: unknown;
}) {
  const { props, telegram, telegramAccounts, accountCountLabel } = params;
  const hasMultipleAccounts = telegramAccounts.length > 1;

  const renderAccountCard = (account: ChannelAccountSnapshot) => {
    const probe = account.probe as { bot?: { username?: string } } | undefined;
    const botUsername = probe?.bot?.username;
    const label = account.name || account.accountId;
    return html`
      <div class="account-card">
        <div class="account-card-header">
          <div class="account-card-title">
            ${botUsername ? `@${botUsername}` : label}
          </div>
          <div class="account-card-id">${account.accountId}</div>
        </div>
        <div class="status-list account-card-status">
          <div>
            <span class="label">Running</span>
            <span>${account.running ? "Yes" : "No"}</span>
          </div>
          <div>
            <span class="label">Configured</span>
            <span>${account.configured ? "Yes" : "No"}</span>
          </div>
          <div>
            <span class="label">Last inbound</span>
            <span>${account.lastInboundAt ? formatAgo(account.lastInboundAt) : "n/a"}</span>
          </div>
          ${
            account.lastError
              ? html`
                <div class="account-card-error">
                  ${account.lastError}
                </div>
              `
              : nothing
          }
        </div>
      </div>
    `;
  };

  return renderChannelCard({
    title: "Telegram",
    description: "Connect your Telegram bot.",
    icon: html`
      <img src="https://cdn.brandfetch.io/telegram.org/w/100/h/100" class="channel-logo" alt="Telegram" />
    `,
    connected: !!telegram?.running,
    configured: !!telegram?.configured,
    error: telegram?.lastError,
    children: html`
      ${accountCountLabel}
      ${
        hasMultipleAccounts
          ? html`
            <div class="account-card-list" style="margin-top: 16px;">
              ${telegramAccounts.map((account) => renderAccountCard(account))}
            </div>
          `
          : nothing
      }

      ${renderChannelConfigSection({ channelId: "telegram", props })}

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
          telegram?.running
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
