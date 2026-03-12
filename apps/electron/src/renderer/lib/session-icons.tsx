import {
  Backpack,
  BagSimple,
  Barcode,
  Basket,
  ChartBar,
  ChatCircleText,
  CreditCard,
  Database,
  Globe,
  Heart,
  MagnifyingGlass,
  Package,
  PencilSimpleLine,
  Plug,
  Receipt,
  Robot,
  ShoppingBag,
  ShoppingBagOpen,
  ShoppingCart,
  ShoppingCartSimple,
  SquaresFour,
  Stack,
  StackOverflowLogo,
  Storefront,
  Tag,
  TagSimple,
  TrendUp,
  Truck,
  User,
  Users,
  Wallet,
} from "@phosphor-icons/react";
import type { ComponentType } from "react";

export const DEFAULT_SESSION_KEY = "agent:main:main";

export const SESSION_ICON_IDS = [
  "SquaresFour",
  "Basket",
  "ShoppingBag",
  "ShoppingBagOpen",
  "ShoppingCart",
  "ShoppingCartSimple",
  "Backpack",
  "BagSimple",
  "Barcode",
  "Package",
  "Receipt",
  "Storefront",
  "Tag",
  "TagSimple",
  "Truck",
  "Wallet",
  "Robot",
  "User",
  "Globe",
  "Plug",
  "CreditCard",
  "StackOverflowLogo",
] as const;

export type SessionIconId = (typeof SESSION_ICON_IDS)[number];

export const SESSION_ICON_OPTIONS: Array<{
  id: SessionIconId;
  label: string;
  icon: ComponentType<{ size?: number; weight?: "bold"; className?: string }>;
}> = [
  { id: "Basket", label: "Basket", icon: Basket },
  { id: "ShoppingBag", label: "Shopping bag", icon: ShoppingBag },
  { id: "ShoppingBagOpen", label: "Open bag", icon: ShoppingBagOpen },
  { id: "ShoppingCart", label: "Shopping cart", icon: ShoppingCart },
  { id: "ShoppingCartSimple", label: "Simple cart", icon: ShoppingCartSimple },
  { id: "Backpack", label: "Backpack", icon: Backpack },
  { id: "BagSimple", label: "Bag", icon: BagSimple },
  { id: "Barcode", label: "Barcode", icon: Barcode },
  { id: "Package", label: "Package", icon: Package },
  { id: "Receipt", label: "Receipt", icon: Receipt },
  { id: "Storefront", label: "Storefront", icon: Storefront },
  { id: "Tag", label: "Tag", icon: Tag },
  { id: "TagSimple", label: "Simple tag", icon: TagSimple },
  { id: "Truck", label: "Shipping", icon: Truck },
  { id: "Wallet", label: "Wallet", icon: Wallet },
  { id: "CreditCard", label: "Card", icon: CreditCard },
];

type PhosphorIcon = ComponentType<{ size?: number; weight?: "bold"; className?: string }>;

const SESSION_ICON_COMPONENTS: Record<SessionIconId, PhosphorIcon> = {
  SquaresFour,
  Basket,
  ShoppingBag,
  ShoppingBagOpen,
  ShoppingCart,
  ShoppingCartSimple,
  Backpack,
  BagSimple,
  Barcode,
  Package,
  Receipt,
  Storefront,
  Tag,
  TagSimple,
  Truck,
  Wallet,
  Robot,
  User,
  Globe,
  Plug,
  CreditCard,
  StackOverflowLogo,
};

export function isSessionIconId(value: string | null | undefined): value is SessionIconId {
  return typeof value === "string" && (SESSION_ICON_IDS as readonly string[]).includes(value);
}

export function getSessionIconComponent(iconId?: string | null): PhosphorIcon {
  if (iconId && isSessionIconId(iconId)) {
    return SESSION_ICON_COMPONENTS[iconId];
  }
  return SquaresFour;
}

export function resolveSessionIconGuess(label: string, sessionKey: string): PhosphorIcon {
  const value = `${label} ${sessionKey}`.toLowerCase();
  if (value.includes("heart")) {
    return Heart;
  }
  if (value.includes("shop") || value.includes("order") || value.includes("source") || value.includes("product")) {
    return ShoppingBag;
  }
  if (value.includes("sale") || value.includes("revenue") || value.includes("growth") || value.includes("trend")) {
    return TrendUp;
  }
  if (value.includes("data") || value.includes("report") || value.includes("chart") || value.includes("analytics")) {
    return ChartBar;
  }
  if (value.includes("inventory") || value.includes("db") || value.includes("database")) {
    return Database;
  }
  if (value.includes("user") || value.includes("profile")) {
    return User;
  }
  if (value.includes("team") || value.includes("member") || value.includes("customer")) {
    return Users;
  }
  if (value.includes("search") || value.includes("find") || value.includes("research")) {
    return MagnifyingGlass;
  }
  if (value.includes("write") || value.includes("draft") || value.includes("content")) {
    return PencilSimpleLine;
  }
  if (value.includes("web") || value.includes("browser")) {
    return Globe;
  }
  if (value.includes("chat") || value.includes("support")) {
    return ChatCircleText;
  }
  if (value.includes("openclaw") || value.includes("codex") || value.includes("stack")) {
    return StackOverflowLogo;
  }
  return Robot;
}

export function resolveSessionIconComponent(params: {
  icon?: string | null;
  label: string;
  sessionKey: string;
}): PhosphorIcon {
  if (params.icon) {
    return getSessionIconComponent(params.icon);
  }
  return resolveSessionIconGuess(params.label, params.sessionKey);
}

export function deriveScenarioLabel(sessionKey: string, rawLabel?: string | null) {
  const trimmed = rawLabel?.trim();
  if (trimmed) {
    return trimmed;
  }
  if (sessionKey === DEFAULT_SESSION_KEY || /^agent:[a-z0-9_-]+:main$/i.test(sessionKey)) {
    return "Bustly AI";
  }
  return "Scenario";
}

export function buildChatRoute(params: {
  sessionKey: string;
  label?: string | null;
  icon?: string | null;
}) {
  const searchParams = new URLSearchParams();
  searchParams.set("session", params.sessionKey);
  if (params.label?.trim()) {
    searchParams.set("label", params.label.trim());
  }
  if (params.icon?.trim()) {
    searchParams.set("icon", params.icon.trim());
  }
  return `/chat?${searchParams.toString()}`;
}

export const CollapsedScenariosIcon = Stack;
