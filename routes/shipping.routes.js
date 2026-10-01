import express from "express";
import isAdmin from "../middlewares/isAdmin.js";
import {
  checkPincodeServiceability,
  calculateShippingCost,
  createShipmentForOrder,
  getShippingLabel,
  trackShipment,
  cancelShipment,
  schedulePickup,
  syncTracking,
  getShipmentDetails,
  handleDelhiveryWebhook,
} from "../controllers/shipping.controller.js";

const shippingRouter = express.Router();

/**
 * ============================================================================
 * PUBLIC / CHECKOUT ENDPOINTS
 * ============================================================================
 */

// 1. Pincode Serviceability Check
shippingRouter.get("/serviceability/:pincode", checkPincodeServiceability);
shippingRouter.get("/serviceability", checkPincodeServiceability);
shippingRouter.post("/check-pincode", checkPincodeServiceability);

// 2. Shipping Cost Estimation
shippingRouter.get("/calculate-cost", calculateShippingCost);
shippingRouter.post("/calculate-cost", calculateShippingCost);

// 3. Public Shipment Tracking
shippingRouter.get("/track/:waybill", trackShipment);

/**
 * ============================================================================
 * WEBHOOK ENDPOINTS (INCOMING DELHIVERY STATUS EVENTS)
 * ============================================================================
 */
shippingRouter.post("/webhook", handleDelhiveryWebhook);
shippingRouter.post("/delhivery-webhook", handleDelhiveryWebhook);

/**
 * ============================================================================
 * ADMIN / PROTECTED LOGISTICS ENDPOINTS
 * ============================================================================
 */

// 4. Create Shipment & Generate Waybill for an order
shippingRouter.post("/shipments/create", isAdmin, createShipmentForOrder);
shippingRouter.post("/create-shipment", isAdmin, createShipmentForOrder);

// 5. Download Shipping Label (PDF Packing Slip)
shippingRouter.get("/labels/:waybill", isAdmin, getShippingLabel);
shippingRouter.get("/label/:waybill", isAdmin, getShippingLabel);

// 6. Cancel Shipment
shippingRouter.post("/shipments/:waybill/cancel", isAdmin, cancelShipment);

// 7. Schedule Warehouse Courier Pickup
shippingRouter.post("/pickups/schedule", isAdmin, schedulePickup);

// 8. Trigger manual tracking sync for in-transit orders
shippingRouter.post("/sync-tracking", isAdmin, syncTracking);

// 9. View complete shipment & tracking event history
shippingRouter.get("/shipments/:orderIdOrAwb", isAdmin, getShipmentDetails);

export default shippingRouter;
