import { html, type TemplateResult } from "lit";

// Phosphor Icons (Bold)
// Integrated via <script> in index.html

export const icons = {
  // Navigation icons
  messageSquare: html`
    <i class="ph-bold ph-chat-teardrop-text"></i>
  `,
  barChart: html`
    <i class="ph-bold ph-chart-bar"></i>
  `,
  link: html`
    <i class="ph-bold ph-link"></i>
  `,
  radio: html`
    <i class="ph-bold ph-radio-button"></i>
  `,
  fileText: html`
    <i class="ph-bold ph-file-text"></i>
  `,
  zap: html`
    <i class="ph-bold ph-lightning"></i>
  `,
  monitor: html`
    <i class="ph-bold ph-desktop"></i>
  `,
  settings: html`
    <i class="ph-bold ph-gear"></i>
  `,
  bug: html`
    <i class="ph-bold ph-bug"></i>
  `,
  scrollText: html`
    <i class="ph-bold ph-scroll"></i>
  `,
  folder: html`
    <i class="ph-bold ph-folder"></i>
  `,

  // UI icons
  menu: html`
    <i class="ph-bold ph-list"></i>
  `,
  x: html`
    <i class="ph-bold ph-x"></i>
  `,
  check: html`
    <i class="ph-bold ph-check"></i>
  `,
  copy: html`
    <i class="ph-bold ph-copy"></i>
  `,
  search: html`
    <i class="ph-bold ph-magnifying-glass"></i>
  `,
  brain: html`
    <i class="ph-bold ph-brain"></i>
  `,
  book: html`
    <i class="ph-bold ph-book"></i>
  `,
  loader: html`
    <i class="ph-bold ph-spinner"></i>
  `,
  caretDown: html`
    <i class="ph-bold ph-caret-down"></i>
  `,
  arrowRight: html`
    <i class="ph-bold ph-arrow-right"></i>
  `,
  signOut: html`
    <i class="ph-bold ph-sign-out"></i>
  `,
  user: html`
    <i class="ph-bold ph-user"></i>
  `,

  // Tool icons
  wrench: html`
    <i class="ph-bold ph-wrench"></i>
  `,
  fileCode: html`
    <i class="ph-bold ph-file-code"></i>
  `,
  edit: html`
    <i class="ph-bold ph-pencil-simple"></i>
  `,
  penLine: html`
    <i class="ph-bold ph-pen"></i>
  `,
  paperclip: html`
    <i class="ph-bold ph-paperclip"></i>
  `,
  globe: html`
    <i class="ph-bold ph-globe"></i>
  `,
  image: html`
    <i class="ph-bold ph-image"></i>
  `,
  smartphone: html`
    <i class="ph-bold ph-device-mobile"></i>
  `,
  plug: html`
    <i class="ph-bold ph-plug"></i>
  `,
  circle: html`
    <i class="ph-bold ph-circle"></i>
  `,
  puzzle: html`
    <i class="ph-bold ph-puzzle-piece"></i>
  `,
  plus: html`
    <i class="ph-bold ph-plus"></i>
  `,
  code: html`
    <i class="ph-bold ph-code"></i>
  `,
  terminal: html`
    <i class="ph-bold ph-terminal-window"></i>
  `,
} as const;

export type IconName = keyof typeof icons;

export function icon(name: IconName): TemplateResult {
  return icons[name];
}

export function renderIcon(name: IconName, className = "nav-item__icon"): TemplateResult {
  return html`<span class=${className} aria-hidden="true">${icons[name]}</span>`;
}

// Legacy function for compatibility
export function renderEmojiIcon(
  iconContent: string | TemplateResult,
  className: string,
): TemplateResult {
  return html`<span class=${className} aria-hidden="true">${iconContent}</span>`;
}

export function setEmojiIcon(target: HTMLElement | null, icon: string): void {
  if (!target) return;
  target.textContent = icon;
}
