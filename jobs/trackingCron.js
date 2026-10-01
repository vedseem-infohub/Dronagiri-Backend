/**
 * Backward-compatible wrapper delegating to tracking.sync.js
 */
import { initTrackingCron, syncActiveShipments } from "./tracking.sync.js";

export const startTrackingCron = initTrackingCron;
export const pollTrackingUpdates = syncActiveShipments;

export default {
  startTrackingCron,
  pollTrackingUpdates,
};
