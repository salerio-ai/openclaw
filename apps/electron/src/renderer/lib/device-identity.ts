type StoredIdentity = {
  version: 1;
  deviceId: string;
  publicKey: string;
  privateKey: string;
  createdAtMs: number;
};

export type DeviceIdentity = {
  deviceId: string;
  publicKey: string;
  privateKey: string;
};

const STORAGE_KEY = "bustly-device-identity-v1";

function base64UrlEncode(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/g, "");
}

function base64UrlDecode(input: string): Uint8Array {
  const normalized = input.replaceAll("-", "+").replaceAll("_", "/");
  const padded = normalized + "=".repeat((4 - (normalized.length % 4)) % 4);
  const binary = atob(padded);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    out[i] = binary.charCodeAt(i);
  }
  return out;
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function fingerprintPublicKey(publicKey: Uint8Array): Promise<string> {
  const hash = await crypto.subtle.digest("SHA-256", publicKey.slice().buffer);
  return bytesToHex(new Uint8Array(hash));
}

async function generateIdentity(): Promise<DeviceIdentity> {
  const keyPair = await crypto.subtle.generateKey({ name: "Ed25519" }, true, ["sign", "verify"]);
  const publicKey = new Uint8Array(await crypto.subtle.exportKey("raw", keyPair.publicKey));
  const privateKey = new Uint8Array(await crypto.subtle.exportKey("pkcs8", keyPair.privateKey));
  const deviceId = await fingerprintPublicKey(publicKey);
  return {
    deviceId,
    publicKey: base64UrlEncode(publicKey),
    privateKey: base64UrlEncode(privateKey),
  };
}

async function isImportableEd25519Pkcs8(privateKeyBase64Url: string): Promise<boolean> {
  try {
    const privateKeyPkcs8 = base64UrlDecode(privateKeyBase64Url);
    await crypto.subtle.importKey(
      "pkcs8",
      privateKeyPkcs8 as unknown as BufferSource,
      { name: "Ed25519" },
      false,
      ["sign"],
    );
    return true;
  } catch {
    return false;
  }
}

export async function loadOrCreateDeviceIdentity(): Promise<DeviceIdentity> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as StoredIdentity;
      if (
        parsed?.version === 1 &&
        typeof parsed.deviceId === "string" &&
        typeof parsed.publicKey === "string" &&
        typeof parsed.privateKey === "string"
      ) {
        const publicKeyRaw = base64UrlDecode(parsed.publicKey);
        const privateKeyRaw = base64UrlDecode(parsed.privateKey);
        // Migration: old builds stored a raw 32-byte secret key (noble-ed25519).
        // WebCrypto requires PKCS8; detect and regenerate identity automatically.
        const privateKeyLooksPkcs8 = privateKeyRaw.length > 40;
        const privateKeyImportable =
          privateKeyLooksPkcs8 && (await isImportableEd25519Pkcs8(parsed.privateKey));
        if (!privateKeyImportable) {
          throw new Error("legacy device identity format");
        }
        const derivedId = await fingerprintPublicKey(publicKeyRaw);
        if (derivedId !== parsed.deviceId) {
          const updated: StoredIdentity = {
            ...parsed,
            deviceId: derivedId,
          };
          localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
          return {
            deviceId: derivedId,
            publicKey: parsed.publicKey,
            privateKey: parsed.privateKey,
          };
        }
        return {
          deviceId: parsed.deviceId,
          publicKey: parsed.publicKey,
          privateKey: parsed.privateKey,
        };
      }
    }
  } catch {
    // regenerate on parse/import/migration failures
  }

  const identity = await generateIdentity();
  const stored: StoredIdentity = {
    version: 1,
    deviceId: identity.deviceId,
    publicKey: identity.publicKey,
    privateKey: identity.privateKey,
    createdAtMs: Date.now(),
  };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(stored));
  return identity;
}

export async function signDevicePayload(privateKeyBase64Url: string, payload: string) {
  const privateKeyPkcs8 = base64UrlDecode(privateKeyBase64Url);
  const key = await crypto.subtle.importKey(
    "pkcs8",
    privateKeyPkcs8 as unknown as BufferSource,
    { name: "Ed25519" },
    false,
    ["sign"],
  );
  const data = new TextEncoder().encode(payload);
  const signature = await crypto.subtle.sign("Ed25519", key, data);
  return base64UrlEncode(new Uint8Array(signature));
}
