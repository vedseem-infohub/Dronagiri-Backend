import "dotenv/config";

/**
 * ============================================================================
 * ENVIRONMENT & DELHIVERY CONFIGURATION MANAGER
 * ============================================================================
 * Centralized, validated environment configuration for Dronagiri e-commerce
 * shipping, billing, and logistics.
 * ============================================================================
 */

export const env = {
  // Application & Server
  NODE_ENV: process.env.NODE_ENV || "development",
  PORT: process.env.PORT || 8000,
  MONGODB_URL: process.env.MONGODB_URL,
  JWT_SECRET: process.env.JWT_SECRET,

  // Delhivery API Configuration
  DELHIVERY: {
    API_KEY: (
      process.env.DELHIVERY_API_KEY ||
      process.env.DELHIVERY_API_TOKEN ||
      ""
    ).trim(),
    BASE_URL: (
      process.env.DELHIVERY_BASE_URL ||
      "https://track.delhivery.com"
    ).replace(/\/+$/, ""),
    CLIENT_NAME: (
      process.env.DELHIVERY_CLIENT_NAME ||
      "Dronagiri Farms"
    ).trim(),
    WAREHOUSE: (
      process.env.DELHIVERY_WAREHOUSE ||
      process.env.DELHIVERY_PICKUP_LOCATION ||
      process.env.DELHIVERY_CLIENT_NAME ||
      "Dronagiri Farms"
    ).trim(),
    ORIGIN_PINCODE: String(
      process.env.DELHIVERY_DEFAULT_ORIGIN_PINCODE ||
      process.env.DELHIVERY_ORIGIN_PINCODE ||
      "284002"
    ).trim(),
    MOCK_MODE:
      process.env.DELHIVERY_MOCK_MODE === "true" ||
      process.env.NODE_ENV === "test" ||
      !(process.env.DELHIVERY_API_KEY || process.env.DELHIVERY_API_TOKEN),
    WEBHOOK_SECRET: (
      process.env.DELHIVERY_WEBHOOK_SECRET ||
      process.env.JWT_SECRET ||
      "dronagiri_delhivery_webhook_secret"
    ).trim(),
    CRON_SCHEDULE: process.env.TRACKING_CRON_SCHEDULE || "*/30 * * * *",
    DISABLE_CRON: process.env.DISABLE_TRACKING_CRON === "true",
  },

  // Store & Billing Metadata (for Professional Tax Invoices)
  STORE: {
    NAME: process.env.STORE_NAME || "Dronagiri Farms",
    TAGLINE: "Pure Natural & Farm-Fresh Produce",
    ADDRESS:
      process.env.STORE_ADDRESS ||
      "Dronagiri Farms Organic Hub, Post Orchha, Jhansi Region, Uttar Pradesh - 284002",
    STATE: process.env.STORE_STATE || "Uttar Pradesh",
    STATE_CODE: process.env.STORE_STATE_CODE || "09", // Uttar Pradesh GST state code
    GSTIN: process.env.STORE_GSTIN || "09AAAAA0000A1Z5", // Default or configured GSTIN
    PHONE: process.env.STORE_PHONE || "+91 98765 43210",
    EMAIL: process.env.STORE_EMAIL || "support@dronagirifarms.co.in",
    WEBSITE: process.env.STORE_WEBSITE || "https://dronagirifarms.co.in",
    DEFAULT_HSN: process.env.STORE_DEFAULT_HSN || "04090000", // Natural Honey / Farm Produce
    DEFAULT_GST_RATE: Number(process.env.STORE_DEFAULT_GST_RATE) || 5, // 5% standard farm goods
  },
};

/**
 * Validates critical environment settings at server boot.
 * Returns an object with status and messages.
 */
export function validateEnv() {
  const issues = [];
  const warnings = [];

  if (!env.MONGODB_URL) {
    issues.push("MONGODB_URL is missing in environment variables.");
  }
  if (!env.JWT_SECRET) {
    issues.push("JWT_SECRET is missing. Authentication cannot function securely.");
  }

  // Delhivery check
  if (!env.DELHIVERY.API_KEY) {
    if (env.DELHIVERY.MOCK_MODE) {
      warnings.push(
        "DELHIVERY_API_KEY / DELHIVERY_API_TOKEN is not set. Operating in MOCK_MODE for local testing."
      );
    } else {
      issues.push(
        "DELHIVERY_API_KEY / DELHIVERY_API_TOKEN is missing and MOCK_MODE is disabled. Shipment operations will fail."
      );
    }
  }

  if (env.DELHIVERY.ORIGIN_PINCODE.length !== 6) {
    warnings.push(
      `DELHIVERY origin pincode '${env.DELHIVERY.ORIGIN_PINCODE}' may be invalid (expected 6 digits).`
    );
  }

  console.log("--------------------------------------------------");
  console.log("🌱 [Dronagiri Configuration Validation]");
  console.log(`- Environment: ${env.NODE_ENV}`);
  console.log(`- Delhivery Base URL: ${env.DELHIVERY.BASE_URL}`);
  console.log(`- Delhivery Warehouse: ${env.DELHIVERY.WAREHOUSE}`);
  console.log(`- Origin Pincode: ${env.DELHIVERY.ORIGIN_PINCODE}`);
  console.log(
    `- Delhivery Token: ${
      env.DELHIVERY.API_KEY ? `Configured (ends with ...${env.DELHIVERY.API_KEY.slice(-4)})` : "Not Set"
    }`
  );
  console.log(`- Mock Mode: ${env.DELHIVERY.MOCK_MODE ? "ENABLED" : "DISABLED (Live API)"}`);
  console.log(`- Tracking Cron: ${env.DELHIVERY.DISABLE_CRON ? "DISABLED" : env.DELHIVERY.CRON_SCHEDULE}`);

  if (warnings.length > 0) {
    warnings.forEach((w) => console.warn(`⚠️  Warning: ${w}`));
  }

  if (issues.length > 0) {
    issues.forEach((i) => console.error(`❌ Critical Config Error: ${i}`));
    if (env.NODE_ENV === "production") {
      throw new Error(`Production Configuration Error: ${issues.join("; ")}`);
    }
  } else {
    console.log("✅ All critical configurations verified successfully.");
  }
  console.log("--------------------------------------------------");

  return {
    valid: issues.length === 0,
    issues,
    warnings,
  };
}

export default env;
