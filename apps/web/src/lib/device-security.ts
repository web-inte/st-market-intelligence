const DEVICE_STORAGE_KEY =
  "st_market_device_id";

const DEVICE_COOKIE_NAME =
  "st_device_hash";

function bytesToHex(
  bytes: Uint8Array
) {
  return Array.from(bytes)
    .map((byte) =>
      byte
        .toString(16)
        .padStart(2, "0")
    )
    .join("");
}

async function sha256(
  value: string
) {
  const encoded =
    new TextEncoder().encode(value);

  const digest =
    await crypto.subtle.digest(
      "SHA-256",
      encoded
    );

  return bytesToHex(
    new Uint8Array(digest)
  );
}

function createDeviceId() {
  if (
    typeof crypto.randomUUID ===
    "function"
  ) {
    return crypto.randomUUID();
  }

  const random =
    new Uint8Array(32);

  crypto.getRandomValues(random);

  return bytesToHex(random);
}

function getPersistentDeviceId() {
  let deviceId =
    window.localStorage.getItem(
      DEVICE_STORAGE_KEY
    );

  if (!deviceId) {
    deviceId = createDeviceId();

    window.localStorage.setItem(
      DEVICE_STORAGE_KEY,
      deviceId
    );
  }

  return deviceId;
}

function getFingerprintSource() {
  const navigatorWithMemory =
    navigator as Navigator & {
      deviceMemory?: number;
    };

  return [
    navigator.userAgent,
    navigator.platform,
    navigator.language,
    navigator.languages?.join(",") || "",
    Intl.DateTimeFormat()
      .resolvedOptions()
      .timeZone || "",
    `${screen.width}x${screen.height}`,
    String(screen.colorDepth),
    String(
      navigator.hardwareConcurrency || 0
    ),
    String(
      navigatorWithMemory.deviceMemory ||
        0
    ),
    String(navigator.maxTouchPoints || 0),
  ].join("|");
}

function saveDeviceCookie(
  deviceHash: string
) {
  const secure =
    window.location.protocol ===
    "https:"
      ? "; Secure"
      : "";

  document.cookie =
    `${DEVICE_COOKIE_NAME}=` +
    `${encodeURIComponent(deviceHash)}` +
    `; Path=/; Max-Age=31536000` +
    `; SameSite=Lax${secure}`;
}

export async function getDeviceSecurityData() {
  const deviceId =
    getPersistentDeviceId();

  const [
    deviceHash,
    fingerprintHash,
  ] = await Promise.all([
    sha256(
      `st-market-device:${deviceId}`
    ),
    sha256(
      `st-market-fingerprint:` +
        getFingerprintSource()
    ),
  ]);

  saveDeviceCookie(deviceHash);

  return {
    deviceHash,
    fingerprintHash,
  };
}
