import cron from "node-cron";
import mongoose from "mongoose";
import { env } from "../config/env.js";
import Shipment, { TERMINAL_STATUSES } from "../models/shipment.model.js";
import Order from "../models/order.model.js";
import { trackShipment } from "../services/delhivery.service.js";

/**
 * ============================================================================
 * BACKGROUND TRACKING SYNCHRONIZER
 * ============================================================================
 * Synchronizes non-terminal Delhivery shipments into MongoDB:
 * - Avoids polling completed shipments (DELIVERED, CANCELLED, RTO_DELIVERED)
 * - Rate limit protection with safe delays between calls
 * - Updates both dedicated Shipment entity and legacy Order model
 * - Resilient error handling (never crashes the server/process)
 * ============================================================================
 */

let isSyncRunning = false;

export async function syncActiveShipments() {
  if (isSyncRunning) {
    console.log("[TrackingSync] Previous sync cycle still running. Skipping.");
    return { skipped: true };
  }

  if (mongoose.connection?.readyState !== 1) {
    console.log("[TrackingSync] MongoDB not ready. Skipping sync cycle.");
    return { skipped: true };
  }

  isSyncRunning = true;
  console.log(`[TrackingSync] [${new Date().toISOString()}] Starting background shipment tracking sync...`);

  try {
    // 1. Query active shipments that have an AWB and are NOT in terminal status
    const activeShipments = await Shipment.find({
      awbNumber: { $exists: true, $ne: "" },
      internalStatus: { $nin: TERMINAL_STATUSES },
    })
      .sort({ lastSyncedAt: 1 }) // Prioritize shipments not synced recently
      .limit(100);

    // 2. Fallback query on legacy orders in case shipments table is being populated
    const legacyOrders = await Order.find({
      waybill: { $exists: true, $ne: "" },
      "shipping.status": { $nin: ["Delivered", "Cancelled", "RTO"] },
      internalStatus: { $nin: TERMINAL_STATUSES },
    }).limit(100);

    // Merge unique waybills to sync
    const waybillMap = new Map();
    for (const ship of activeShipments) {
      if (ship.awbNumber && !ship.awbNumber.startsWith("UPL")) {
        waybillMap.set(ship.awbNumber, { shipment: ship });
      }
    }
    for (const order of legacyOrders) {
      const w = order.waybill || order.shipping?.waybill;
      if (w && !w.startsWith("UPL") && !waybillMap.has(w)) {
        waybillMap.set(w, { order });
      }
    }

    const uniqueWaybills = Array.from(waybillMap.keys());
    if (uniqueWaybills.length === 0) {
      console.log("[TrackingSync] No active shipments pending tracking update.");
      return { total: 0, updated: 0, failed: 0 };
    }

    console.log(`[TrackingSync] Found ${uniqueWaybills.length} active shipments to poll.`);

    let updated = 0;
    let failed = 0;

    for (const waybill of uniqueWaybills) {
      try {
        // Safe rate limit gap (250ms between requests)
        await new Promise((res) => setTimeout(res, 250));

        const result = await trackShipment(waybill);
        if (result.success && result.data) {
          updated++;
          console.log(
            `[TrackingSync] AWB ${waybill} -> Status: ${result.data.displayLabel || result.data.internalStatus}`
          );
        } else {
          failed++;
          await Shipment.findOneAndUpdate(
            { awbNumber: waybill },
            {
              $inc: { retryCount: 1 },
              lastError: result.error || "Tracking lookup failed",
              lastSyncedAt: new Date(),
            }
          );
        }
      } catch (itemErr) {
        failed++;
        console.warn(`[TrackingSync] Error updating AWB ${waybill}:`, itemErr.message);
      }
    }

    console.log(`[TrackingSync] Job completed. Polled: ${uniqueWaybills.length}, Updated: ${updated}, Failed: ${failed}`);
    return { total: uniqueWaybills.length, updated, failed };
  } catch (err) {
    console.error("[TrackingSync] Unexpected error in sync job:", err.message);
    return { total: 0, updated: 0, failed: 0, error: err.message };
  } finally {
    isSyncRunning = false;
  }
}

/**
 * Initializes the background recurring tracking cron
 */
export function initTrackingCron() {
  if (env.DELHIVERY.DISABLE_CRON) {
    console.log("[TrackingSync] Background cron is disabled via DISABLE_TRACKING_CRON=true");
    return null;
  }

  const schedule = env.DELHIVERY.CRON_SCHEDULE;
  console.log(`[TrackingSync] Registering tracking cron with schedule: "${schedule}"`);

  return cron.schedule(schedule, async () => {
    try {
      await syncActiveShipments();
    } catch (err) {
      console.error("[TrackingSync] Uncaught cron execution error:", err.message);
    }
  });
}

export default {
  syncActiveShipments,
  initTrackingCron,
};
