/**
 * Backward-compatible wrapper delegating to tracking.sync.js
 */
import { initTrackingCron, syncActiveShipments } from "./tracking.sync.js";

export const initTrackingCronExport = initTrackingCron;
export const pollActiveShipments = syncActiveShipments;

export default {
  initTrackingCron,
  pollActiveShipments,
};
