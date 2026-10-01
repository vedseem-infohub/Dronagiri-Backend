import Order from "../models/order.model.js";
import Shipment from "../models/shipment.model.js";
import delhiveryService from "../services/delhivery.service.js";
import { syncActiveShipments } from "../jobs/tracking.sync.js";

/**
 * ============================================================================
 * UNIFIED SHIPPING CONTROLLER
 * ============================================================================
 */

/**
 * 1. Check Pincode Serviceability
 * GET /api/shipping/serviceability/:pincode or POST /api/shipping/check-pincode
 */
export const checkPincodeServiceability = async (req, res) => {
  try {
    const pincode = req.params.pincode || req.query.pincode || req.body.pincode;

    if (!pincode) {
      return res.status(400).json({
        success: false,
        code: "INVALID_REQUEST",
        message: "Pincode parameter is required",
      });
    }

    const result = await delhiveryService.checkServiceability(pincode);
    const statusCode = result.success ? 200 : 400;
    return res.status(statusCode).json(result);
  } catch (error) {
    console.error("Shipping controller - checkServiceability error:", error);
    return res.status(500).json({
      success: false,
      code: "SERVER_ERROR",
      message: `Failed to check serviceability: ${error.message}`,
    });
  }
};

/**
 * 2. Calculate Shipping Cost
 * POST /api/shipping/calculate-cost or GET /api/shipping/calculate-cost
 */
export const calculateShippingCost = async (req, res) => {
  try {
    const data = req.method === "POST" ? req.body : req.query;
    const { originPincode, destPincode, weight, mode, paymentType, orderAmount } = data;

    if (!destPincode) {
      return res.status(400).json({
        success: false,
        code: "INVALID_REQUEST",
        message: "Destination pincode (destPincode) is required",
      });
    }

    const result = await delhiveryService.calculateShippingCost({
      originPincode,
      destPincode,
      weight: Number(weight) || 500,
      mode: mode || "Surface",
      paymentType: paymentType || "Prepaid",
      orderAmount: Number(orderAmount) || 0,
    });

    const statusCode = result.success ? 200 : 400;
    return res.status(statusCode).json(result);
  } catch (error) {
    console.error("Shipping controller - calculateCost error:", error);
    return res.status(500).json({
      success: false,
      code: "SERVER_ERROR",
      message: `Failed to calculate shipping cost: ${error.message}`,
    });
  }
};

/**
 * 3. Track Shipment (Public customer tracking)
 * GET /api/shipping/track/:waybill
 */
export const trackShipment = async (req, res) => {
  try {
    const { waybill } = req.params;
    if (!waybill) {
      return res.status(400).json({
        success: false,
        code: "INVALID_REQUEST",
        message: "Waybill number is required",
      });
    }

    const result = await delhiveryService.trackShipment(waybill);
    const statusCode = result.success ? 200 : 404;
    return res.status(statusCode).json(result);
  } catch (error) {
    console.error("Shipping controller - trackShipment error:", error);
    return res.status(500).json({
      success: false,
      code: "SERVER_ERROR",
      message: `Failed to track shipment: ${error.message}`,
    });
  }
};

/**
 * 4. Create Shipment & Generate Waybill for an Order (Admin / Checkout)
 * POST /api/shipping/shipments/create or POST /api/shipping/create-shipment
 */
export const createShipmentForOrder = async (req, res) => {
  try {
    const { orderId, orderData, dimensions, weight, shippingMode } = req.body;

    let targetOrder = null;
    if (orderId) {
      targetOrder = await Order.findOne({ orderId });
    }

    // Merge parameters
    const shipmentInput = {
      orderId: targetOrder?.orderId || orderData?.orderId || orderId,
      customer: targetOrder?.customer || orderData?.customer,
      items: targetOrder?.items || orderData?.items,
      total: targetOrder?.total || orderData?.total,
      paymentMethod: targetOrder?.paymentMethod || orderData?.paymentMethod || "cod",
      dimensions: dimensions || orderData?.dimensions || { length: 20, width: 15, height: 10 },
      weight: weight || orderData?.weight || (targetOrder?.items || []).reduce((s, i) => s + (i.count || 1) * 500, 0),
      shippingMode: shippingMode || orderData?.shippingMode || "Surface",
      _id: targetOrder?._id,
    };

    const result = await delhiveryService.createShipment(shipmentInput);
    if (!result.success) {
      return res.status(400).json(result);
    }

    const refreshedOrder = targetOrder ? await Order.findOne({ orderId: targetOrder.orderId }) : null;
    return res.status(201).json({
      ...result,
      data: {
        ...result.data,
        order: refreshedOrder,
      },
    });
  } catch (error) {
    console.error("Shipping controller - createShipment error:", error);
    return res.status(500).json({
      success: false,
      code: "SERVER_ERROR",
      message: `Failed to create shipment: ${error.message}`,
    });
  }
};

/**
 * 5. Download Shipping Label (Packing Slip)
 * GET /api/shipping/label/:waybill or GET /api/shipping/labels/:waybill
 */
export const getShippingLabel = async (req, res) => {
  try {
    const { waybill } = req.params;
    const format = req.query.format; // 'json' or 'pdf' (default)

    if (!waybill) {
      return res.status(400).json({
        success: false,
        code: "INVALID_REQUEST",
        message: "Waybill number is required",
      });
    }

    const result = await delhiveryService.getShippingLabel(waybill);
    if (!result.success) {
      return res.status(404).json(result);
    }

    if (format === "json" || !result.data?.pdfBuffer) {
      return res.status(200).json(result);
    }

    res.setHeader("Content-Type", result.data.contentType || "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="delhivery-label-${waybill}.pdf"`);
    return res.send(result.data.pdfBuffer);
  } catch (error) {
    console.error("Shipping controller - getShippingLabel error:", error);
    return res.status(500).json({
      success: false,
      code: "SERVER_ERROR",
      message: `Failed to fetch shipping label: ${error.message}`,
    });
  }
};

/**
 * 6. Cancel Shipment
 * POST /api/shipping/shipments/:waybill/cancel
 */
export const cancelShipment = async (req, res) => {
  try {
    const { waybill } = req.params;
    if (!waybill) {
      return res.status(400).json({
        success: false,
        code: "INVALID_REQUEST",
        message: "Waybill number is required to cancel shipment",
      });
    }

    const result = await delhiveryService.cancelShipment(waybill);
    const statusCode = result.success ? 200 : 400;
    return res.status(statusCode).json(result);
  } catch (error) {
    console.error("Shipping controller - cancelShipment error:", error);
    return res.status(500).json({
      success: false,
      code: "SERVER_ERROR",
      message: `Failed to cancel shipment: ${error.message}`,
    });
  }
};

/**
 * 7. Schedule Warehouse Pickup
 * POST /api/shipping/pickups/schedule
 */
export const schedulePickup = async (req, res) => {
  try {
    const { pickupDate, pickupTime, expectedPackageCount, pickupLocation } = req.body;

    const result = await delhiveryService.schedulePickup(
      { pickupLocation, pickupTime, expectedPackageCount },
      pickupDate
    );

    const statusCode = result.success ? 201 : 400;
    return res.status(statusCode).json(result);
  } catch (error) {
    console.error("Shipping controller - schedulePickup error:", error);
    return res.status(500).json({
      success: false,
      code: "SERVER_ERROR",
      message: `Failed to schedule pickup: ${error.message}`,
    });
  }
};

/**
 * 8. Trigger Active Tracking Sync (Admin Polling)
 * POST /api/shipping/sync-tracking
 */
export const syncTracking = async (req, res) => {
  try {
    const summary = await syncActiveShipments();
    return res.status(200).json({
      success: true,
      code: "SYNC_COMPLETED",
      message: `Shipments tracking sync complete. Polled: ${summary.total || 0}, Updated: ${summary.updated || 0}`,
      data: summary,
    });
  } catch (error) {
    console.error("Shipping controller - syncTracking error:", error);
    return res.status(500).json({
      success: false,
      code: "SERVER_ERROR",
      message: `Failed to sync tracking: ${error.message}`,
    });
  }
};

/**
 * 9. Get Shipment Details from Database
 * GET /api/shipping/shipments/:orderIdOrAwb
 */
export const getShipmentDetails = async (req, res) => {
  try {
    const { orderIdOrAwb } = req.params;
    const shipment = await Shipment.findOne({
      $or: [{ orderId: orderIdOrAwb }, { awbNumber: orderIdOrAwb }],
    });

    if (!shipment) {
      return res.status(404).json({
        success: false,
        code: "SHIPMENT_NOT_FOUND",
        message: `No shipment record found for '${orderIdOrAwb}'`,
      });
    }

    return res.status(200).json({
      success: true,
      data: shipment,
    });
  } catch (error) {
    console.error("Shipping controller - getShipmentDetails error:", error);
    return res.status(500).json({
      success: false,
      code: "SERVER_ERROR",
      message: error.message,
    });
  }
};

/**
 * 10. Delhivery Webhook Handler
 * POST /api/shipping/webhook or POST /api/shipping/delhivery-webhook
 */
export const handleDelhiveryWebhook = async (req, res) => {
  try {
    const payload = req.body;
    console.log("[Delhivery Webhook] Received status event:", JSON.stringify(payload).substring(0, 200));

    if (!payload) {
      return res.status(400).json({ success: false, message: "Empty webhook payload" });
    }

    // Delhivery push webhook payload structure can contain waybill, status, scan datetime, etc.
    const waybill =
      payload.waybill ||
      payload.Waybill ||
      payload.Shipment?.Waybill ||
      payload.data?.waybill;

    if (!waybill) {
      return res.status(200).json({ success: true, message: "Webhook acknowledged (no waybill present)" });
    }

    const rawStatus =
      payload.status ||
      payload.Status?.Status ||
      payload.Status ||
      payload.data?.status ||
      "In Transit";

    const instructions =
      payload.instructions ||
      payload.Status?.Instructions ||
      payload.remarks ||
      "";

    const location =
      payload.location ||
      payload.scanned_location ||
      payload.ScanDetail?.ScannedLocation ||
      "";

    const eventTime = payload.scan_time || payload.timestamp || new Date();

    const mapped = delhiveryService.mapCarrierStatus(rawStatus, instructions);

    // Update shipment idempotently
    const shipment = await Shipment.findOne({ awbNumber: waybill });
    if (shipment) {
      shipment.internalStatus = mapped.internalStatus;
      shipment.carrierStatus = rawStatus;
      shipment.carrierStatusCode = mapped.carrierStatusCode;
      shipment.carrierStatusDescription = mapped.carrierStatusDescription;
      if (location) shipment.currentLocation = location;
      shipment.lastSyncedAt = new Date();

      // Check event duplicate
      const alreadyHasEvent = shipment.trackingEvents.some(
        (e) =>
          e.status === rawStatus &&
          Math.abs(new Date(e.eventTime).getTime() - new Date(eventTime).getTime()) < 60000
      );

      if (!alreadyHasEvent) {
        shipment.trackingEvents.push({
          status: rawStatus,
          statusCode: mapped.carrierStatusCode,
          internalStatus: mapped.internalStatus,
          description: instructions || rawStatus,
          location,
          eventTime: new Date(eventTime),
          source: "webhook",
          rawData: payload,
        });
      }

      await shipment.save();

      // Synchronize parent Order
      const orderUpdates = {
        internalStatus: mapped.internalStatus,
        "shipping.status": rawStatus,
        "shipping.statusDetails": mapped.carrierStatusDescription,
        "shipping.lastTrackedAt": new Date(),
      };
      if (mapped.internalStatus === "DELIVERED") {
        orderUpdates.status = "Delivered";
        orderUpdates.paymentStatus = "Paid";
      } else if (mapped.internalStatus === "CANCELLED") {
        orderUpdates.status = "Cancelled";
      } else if (mapped.internalStatus === "PICKED_UP" || mapped.internalStatus === "IN_TRANSIT") {
        orderUpdates.status = "Shipped";
      }
      await Order.findOneAndUpdate({ waybill }, orderUpdates);
    }

    return res.status(200).json({
      success: true,
      message: `Webhook processed for AWB ${waybill}`,
    });
  } catch (error) {
    console.error("[Delhivery Webhook] Processing error:", error.message);
    // Return 200 to acknowledge Delhivery so it doesn't storm with repeated delivery retries
    return res.status(200).json({
      success: false,
      message: "Error processing webhook payload safely handled.",
    });
  }
};

export default {
  checkPincodeServiceability,
  calculateShippingCost,
  trackShipment,
  createShipmentForOrder,
  getShippingLabel,
  cancelShipment,
  schedulePickup,
  syncTracking,
  getShipmentDetails,
  handleDelhiveryWebhook,
};
