#!/usr/bin/env node
/**
 * Sentry plumbing test — proves the DSN in .env.local can actually send events.
 *
 * Usage:
 *   node scripts/test-sentry.js
 *
 * Reads EXPO_PUBLIC_SENTRY_DSN from .env.local, parses the DSN, and POSTs a
 * test event directly to Sentry's ingest API. If it succeeds you'll see a new
 * issue in the Sentry dashboard within ~30 seconds titled:
 *   "Sentry plumbing test — from test-sentry.js"
 *
 * If it fails, the error message tells you exactly why (invalid DSN, 401/403,
 * network unreachable, etc.) without having to rebuild the mobile app.
 */

const fs = require("fs");
const path = require("path");
const https = require("https");

// ── 1. Load DSN from .env.local ─────────────────────────────────────────────
const envPath = path.join(__dirname, "..", ".env.local");
if (!fs.existsSync(envPath)) {
  console.error("❌ .env.local not found at", envPath);
  process.exit(1);
}

const env = fs
  .readFileSync(envPath, "utf8")
  .split(/\r?\n/)
  .filter((l) => l && !l.startsWith("#") && l.includes("="))
  .reduce((acc, l) => {
    const idx = l.indexOf("=");
    const k = l.slice(0, idx).trim();
    const v = l
      .slice(idx + 1)
      .trim()
      .replace(/^["']|["']$/g, "");
    acc[k] = v;
    return acc;
  }, {});

const dsn = env.EXPO_PUBLIC_SENTRY_DSN;
if (!dsn) {
  console.error("❌ EXPO_PUBLIC_SENTRY_DSN not found in .env.local");
  process.exit(1);
}

console.log("🔑 DSN:", dsn.slice(0, 30) + "…");

// ── 2. Parse the DSN ────────────────────────────────────────────────────────
// Format: https://<PUBLIC_KEY>@<HOST>/<PROJECT_ID>
const dsnMatch = dsn.match(/^https:\/\/([^@]+)@([^/]+)\/(\d+)$/);
if (!dsnMatch) {
  console.error("❌ Invalid DSN format:", dsn);
  console.error("   Expected: https://<key>@<host>/<project-id>");
  process.exit(1);
}
const [, publicKey, host, projectId] = dsnMatch;
console.log("📍 Host:", host);
console.log("📍 Project ID:", projectId);

// ── 3. Build a test event ───────────────────────────────────────────────────
const eventId = Array.from({ length: 32 }, () =>
  Math.floor(Math.random() * 16).toString(16),
).join("");

const payload = JSON.stringify({
  event_id: eventId,
  timestamp: new Date().toISOString(),
  platform: "javascript",
  level: "error",
  logger: "test-sentry.js",
  message: {
    message: "Sentry plumbing test — from test-sentry.js",
  },
  exception: {
    values: [
      {
        type: "SentryPlumbingTest",
        value:
          "This is a synthetic test event sent via scripts/test-sentry.js to verify DSN connectivity.",
      },
    ],
  },
  tags: {
    source: "test-sentry.js",
    environment: "preview",
    synthetic: "true",
  },
  extra: {
    note: "If you see this in Sentry, the DSN/network/project-id are all correct. Delete this issue after confirming.",
    nodeVersion: process.version,
    sentAt: new Date().toISOString(),
  },
});

// ── 4. POST to Sentry ingest API ────────────────────────────────────────────
const options = {
  hostname: host,
  port: 443,
  path: `/api/${projectId}/store/`,
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "Content-Length": Buffer.byteLength(payload),
    "X-Sentry-Auth": [
      "Sentry sentry_version=7",
      "sentry_client=test-sentry.js/1.0",
      `sentry_key=${publicKey}`,
    ].join(", "),
  },
};

console.log("📤 Sending test event to", `https://${host}${options.path}`);

const req = https.request(options, (res) => {
  let body = "";
  res.on("data", (chunk) => (body += chunk));
  res.on("end", () => {
    if (res.statusCode >= 200 && res.statusCode < 300) {
      console.log(`✅ Sentry accepted the event (HTTP ${res.statusCode})`);
      console.log("   Response:", body);
      console.log("");
      console.log("👀 Check the dashboard (may take 10–30 seconds to appear):");
      console.log(
        `   https://chongtechnologies.sentry.io/issues/?project=${projectId}&query=is%3Aunresolved+source%3Atest-sentry.js`,
      );
      console.log("");
      console.log(
        "   If the issue shows up, your Sentry pipe WORKS — the mobile app's silence is a DIFFERENT problem (network on tablet, buffering, or wrong project).",
      );
      console.log(
        "   If nothing shows up, the DSN/project is wrong or Sentry is rejecting events silently.",
      );
    } else {
      console.error(
        `❌ Sentry rejected the event (HTTP ${res.statusCode}):`,
        body,
      );
      console.error("");
      if (res.statusCode === 401 || res.statusCode === 403) {
        console.error(
          "   → The DSN public key is invalid for this project. Regenerate it in Sentry → Settings → Client Keys.",
        );
      } else if (res.statusCode === 404) {
        console.error(
          "   → Project ID not found. Confirm the DSN belongs to entryflow-guard-mobile.",
        );
      } else if (res.statusCode === 429) {
        console.error("   → Rate-limited. Wait a minute and try again.");
      }
      process.exit(1);
    }
  });
});

req.on("error", (err) => {
  console.error("❌ Network error:", err.message);
  console.error("");
  console.error(
    "   → PC cannot reach Sentry. If the tablet can't either, that's why you see no events from the app.",
  );
  process.exit(1);
});

req.write(payload);
req.end();
