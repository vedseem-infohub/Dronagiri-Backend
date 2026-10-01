import axios from "axios";
import mongoose from "mongoose";
import { env } from "../config/env.js";
import Shipment, { SHIPMENT_STATUSES, TERMINAL_STATUSES } from "../models/shipment.model.js";
import Order from "../models/order.model.js";

/**
 * ============================================================================
 * PRODUCTION-GRADE DELHIVERY SERVICE LAYER
 * ============================================================================
 * Handles all Delhivery logistics lifecycle operations with:
 * - Status normalization layer (raw -> internalStatus -> frontend display label)
 * - Safe retries with exponential backoff on network / 5xx failures
 * - Idempotency & duplicate AWB prevention
 * - Database synchronization across both Shipment and Order models
 * - Normalized, sanitized application errors (no raw tokens leaked)
 * ============================================================================
 */

// Centralized Axios client instance
const delhiveryClient = axios.create({
  baseURL: env.DELHIVERY.BASE_URL,
  timeout: 15000,
  headers: {
    Authorization: `Token ${env.DELHIVERY.API_KEY}`,
    Accept: "application/json",
  },
});

// Update client headers if API key changes
export function updateClientAuth(apiKey) {
  delhiveryClient.defaults.headers["Authorization"] = `Token ${apiKey}`;
}

/**
 * Retry wrapper for network glitches or 5xx server issues.
 * Does NOT retry 4xx validation or client authorization errors.
 */
async function executeWithRetry(apiFn, maxRetries = 2, delayMs = 1000) {
  let attempt = 0;
  while (attempt <= maxRetries) {
    try {
      return await apiFn();
    } catch (error) {
      attempt++;
      const statusCode = error.response?.status;
      const isNetworkError =
        !error.response ||
        error.code === "ECONNABORTED" ||
        error.code === "ETIMEDOUT" ||
        error.code === "ENOTFOUND" ||
        error.code === "ECONNRESET";
      const isServerError = statusCode >= 500;

      const shouldRetry = (isNetworkError || isServerError) && attempt <= maxRetries;
      if (!shouldRetry) {
        throw error;
      }

      const backoff = delayMs * Math.pow(2, attempt - 1);
      console.warn(
        `[Delhivery Service] Request failed (${statusCode || error.code}). Retrying attempt ${attempt}/${maxRetries} in ${backoff}ms...`
      );
      await new Promise((res) => setTimeout(res, backoff));
    }
  }
}

/**
 * Normalized application response builder
 */
export function createServiceResponse({
  success,
  data = null,
  code = "",
  error = null,
  message = "",
  retryable = false,
}) {
  let sanitizedError = error;
  if (typeof sanitizedError === "string" && env.DELHIVERY.API_KEY) {
    sanitizedError = sanitizedError.replace(new RegExp(env.DELHIVERY.API_KEY, "gi"), "[REDACTED]");
  }

  return {
    success: Boolean(success),
    code: code || (success ? "SUCCESS" : "OPERATION_FAILED"),
    message: message || (success ? "Operation completed successfully" : (sanitizedError || "Operation failed")),
    data: data || null,
    error: sanitizedError || null,
    retryable: Boolean(retryable),
  };
}

/**
 * STATUS MAPPER
 * Maps any Delhivery raw scan/status/event string into standard internal statuses
 * and human-friendly customer-facing labels.
 */
export function mapCarrierStatus(rawStatus = "", scanDetail = "") {
  const s = `${rawStatus} ${scanDetail}`.trim().toLowerCase();

  // RTO (Return to Origin) sequence - Check BEFORE general delivered so 'RTO Delivered' is not matched by 'delivered'
  if (s.includes("rto dl") || s.includes("rto delivered") || s.includes("returned to origin") || s.includes("rto_dl")) {
    return {
      internalStatus: "RTO_DELIVERED",
      carrierStatusCode: "RTO_DL",
      carrierStatusDescription: "Shipment returned and delivered back to warehouse",
      displayLabel: "Returned to Seller",
      isTerminal: true,
    };
  }

  if (s.includes("rto in transit") || s.includes("rto reached") || s.includes("return in transit") || s.includes("rto_it")) {
    return {
      internalStatus: "RTO_IN_TRANSIT",
      carrierStatusCode: "RTO_IT",
      carrierStatusDescription: "Shipment in transit back to origin warehouse",
      displayLabel: "Returning to Origin",
      isTerminal: false,
    };
  }

  if (s.includes("rto") || s.includes("return initiated") || s.includes("rejected by customer") || s.includes("refused")) {
    return {
      internalStatus: "RTO_INITIATED",
      carrierStatusCode: "RTO_INIT",
      carrierStatusDescription: "Return to origin initiated",
      displayLabel: "Return Initiated",
      isTerminal: false,
    };
  }

  // Terminal: Delivered
  if (s.includes("dl") || s.includes("delivered")) {
    return {
      internalStatus: "DELIVERED",
      carrierStatusCode: "DL",
      carrierStatusDescription: "Shipment delivered to recipient",
      displayLabel: "Delivered",
      isTerminal: true,
    };
  }

  // NDR (Non-Delivery Report) / Delivery Exception
  if (
    s.includes("ndr") ||
    s.includes("undelivered") ||
    s.includes("customer not available") ||
    s.includes("door locked") ||
    s.includes("rescheduled") ||
    s.includes("delivery failed")
  ) {
    return {
      internalStatus: "NDR",
      carrierStatusCode: "NDR",
      carrierStatusDescription: "Delivery attempt unsuccessful. Reattempt scheduled.",
      displayLabel: "Delivery Attempted / NDR",
      isTerminal: false,
    };
  }

  // Cancelled
  if (s.includes("cancel") || s.includes("cn") || s.includes("cancelled before pickup")) {
    return {
      internalStatus: "CANCELLED",
      carrierStatusCode: "CN",
      carrierStatusDescription: "Shipment cancelled",
      displayLabel: "Cancelled",
      isTerminal: true,
    };
  }

  // Out For Delivery
  if (s.includes("out for delivery") || s.includes("ofd") || s.includes("dispatched for delivery")) {
    return {
      internalStatus: "OUT_FOR_DELIVERY",
      carrierStatusCode: "OFD",
      carrierStatusDescription: "Out with courier for doorstep delivery",
      displayLabel: "Out for Delivery",
      isTerminal: false,
    };
  }

  // Picked Up / Handed over to courier
  if (
    s.includes("picked up") ||
    s.includes("pu") ||
    s.includes("pickup done") ||
    s.includes("shipment picked up") ||
    s.includes("handed over")
  ) {
    return {
      internalStatus: "PICKED_UP",
      carrierStatusCode: "PU",
      carrierStatusDescription: "Package picked up by courier from warehouse",
      displayLabel: "Picked Up",
      isTerminal: false,
    };
  }

  // Pickup Scheduled / Requested
  if (s.includes("pickup scheduled") || s.includes("pickup assigned")) {
    return {
      internalStatus: "PICKUP_SCHEDULED",
      carrierStatusCode: "PS",
      carrierStatusDescription: "Courier assigned for warehouse pickup",
      displayLabel: "Pickup Scheduled",
      isTerminal: false,
    };
  }

  if (s.includes("pickup requested") || s.includes("pickup request")) {
    return {
      internalStatus: "PICKUP_REQUESTED",
      carrierStatusCode: "PR",
      carrierStatusDescription: "Warehouse pickup requested with Delhivery",
      displayLabel: "Pickup Requested",
      isTerminal: false,
    };
  }

  // In Transit
  if (
    s.includes("in transit") ||
    s.includes("transit") ||
    s.includes("reached") ||
    s.includes("arrived at hub") ||
    s.includes("departed") ||
    s.includes("bagged")
  ) {
    return {
      internalStatus: "IN_TRANSIT",
      carrierStatusCode: "IT",
      carrierStatusDescription: "Shipment in transit through courier logistics network",
      displayLabel: "In Transit",
      isTerminal: false,
    };
  }

  // Manifested / AWB Assigned
  if (s.includes("manifest") || s.includes("open") || s.includes("booked") || s.includes("awb assigned")) {
    return {
      internalStatus: "AWB_ASSIGNED",
      carrierStatusCode: "MN",
      carrierStatusDescription: "Shipment manifest generated. Awaiting pickup.",
      displayLabel: "Manifested",
      isTerminal: false,
    };
  }

  // Fallback for unknown statuses: preserve safely without crashing
  console.warn(`[Delhivery Status Mapper] Unmapped carrier status string encountered: "${rawStatus}"`);
  return {
    internalStatus: "IN_TRANSIT",
    carrierStatusCode: "UNKNOWN",
    carrierStatusDescription: rawStatus || "Status update received",
    displayLabel: "In Transit",
    isTerminal: false,
  };
}

/**
 * 1. CHECK PINCODE SERVICEABILITY
 * API: GET /c/api/pin-codes/json/?filter_codes={pincode}
 */
export async function checkServiceability(pincode) {
  try {
    const cleanPin = String(pincode || "").trim().replace(/\D/g, "");
    if (!cleanPin || cleanPin.length !== 6) {
      return createServiceResponse({
        success: false,
        code: "INVALID_PINCODE",
        message: "Please enter a valid 6-digit Indian postal pincode.",
        error: "Invalid pincode format",
      });
    }

    // Mock Mode Fallback for local dev/testing
    if (env.DELHIVERY.MOCK_MODE) {
      const isUnserviceable = cleanPin.startsWith("0") || cleanPin.startsWith("999");
      const isNoCod = cleanPin.startsWith("7");

      return createServiceResponse({
        success: true,
        code: "SERVICEABILITY_CHECKED",
        message: !isUnserviceable ? "Pincode is serviceable" : "Pincode is not serviceable",
        data: {
          pincode: cleanPin,
          serviceable: !isUnserviceable,
          codAvailable: !isUnserviceable && !isNoCod,
          prepaidAvailable: !isUnserviceable,
          pickupAvailable: true,
          isOda: cleanPin.endsWith("9"),
          city: "Jhansi / Orchha Region",
          state: "Uttar Pradesh",
          simulated: true,
        },
      });
    }

    const response = await executeWithRetry(() =>
      delhiveryClient.get("/c/api/pin-codes/json/", {
        params: { filter_codes: cleanPin },
      })
    );

    const deliveryCodes = response.data?.delivery_codes || [];
    if (!Array.isArray(deliveryCodes) || deliveryCodes.length === 0) {
      return createServiceResponse({
        success: true,
        code: "UNSERVICEABLE",
        message: "This pincode is currently not serviceable by Delhivery.",
        data: {
          pincode: cleanPin,
          serviceable: false,
          codAvailable: false,
          prepaidAvailable: false,
          pickupAvailable: false,
          isOda: false,
        },
      });
    }

    const pinInfo = deliveryCodes[0]?.postal_code || deliveryCodes[0];
    const codAvailable = pinInfo.cod === "Y" || pinInfo.cod === true || pinInfo.cash === "Y";
    const prepaidAvailable = pinInfo.pre_paid === "Y" || pinInfo.pre_paid === true;
    const pickupAvailable = pinInfo.pickup === "Y" || pinInfo.pickup === true;
    const isOda = pinInfo.is_oda === "Y" || pinInfo.is_oda === true;
    const serviceable = codAvailable || prepaidAvailable;

    return createServiceResponse({
      success: true,
      code: serviceable ? "SERVICEABLE" : "UNSERVICEABLE",
      message: serviceable ? "Pincode is serviceable by Delhivery." : "Pincode is not serviceable by Delhivery.",
      data: {
        pincode: cleanPin,
        serviceable,
        codAvailable,
        prepaidAvailable,
        pickupAvailable,
        isOda,
        city: pinInfo.district || pinInfo.city || "",
        state: pinInfo.state_code || pinInfo.state || "",
      },
    });
  } catch (error) {
    console.error(`[Delhivery Service] checkServiceability error for ${pincode}:`, error.message);
    return createServiceResponse({
      success: false,
      code: "SERVICEABILITY_CHECK_FAILED",
      message: "Unable to verify pincode serviceability with courier at this time.",
      error: error.response?.data?.message || error.message,
      retryable: true,
    });
  }
}

/**
 * 2. CALCULATE SHIPPING CHARGES / RATE ESTIMATION
 * API: GET /api/kinko/v1/invoice/charges/.json
 */
export async function calculateShippingCost({
  originPincode = env.DELHIVERY.ORIGIN_PINCODE,
  destPincode,
  weight = 500, // grams
  mode = "Surface",
  paymentType = "Prepaid",
  orderAmount = 0,
}) {
  try {
    const cleanDestPin = String(destPincode || "").trim().replace(/\D/g, "");
    const cleanOriginPin = String(originPincode || env.DELHIVERY.ORIGIN_PINCODE).trim().replace(/\D/g, "");

    if (!cleanDestPin || cleanDestPin.length !== 6) {
      return createServiceResponse({
        success: false,
        code: "INVALID_DEST_PINCODE",
        message: "A valid 6-digit destination pincode is required to calculate shipping cost.",
      });
    }

    const isCod = String(paymentType).toLowerCase().includes("cod");
    const shippingModeCode = mode.toLowerCase().startsWith("e") ? "E" : "S";
    const weightInGrams = Math.max(Number(weight) || 500, 100);

    // Rule-based standard B2C formula helper
    const calculateStandardRate = () => {
      const isSameState = cleanOriginPin.substring(0, 2) === cleanDestPin.substring(0, 2);
      const baseRate = isSameState ? 50 : 80;
      const additionalSlabs = Math.ceil(Math.max(0, weightInGrams - 500) / 500);
      const perSlabRate = isSameState ? 35 : 55;
      const expressSurcharge = shippingModeCode === "E" ? 40 : 0;
      const shippingCharge = baseRate + additionalSlabs * perSlabRate + expressSurcharge;
      const codCharge = isCod ? Math.max(40, Math.round(Number(orderAmount || 0) * 0.02)) : 0;

      return {
        chargeableWeight: weightInGrams,
        shippingCharge,
        codCharge,
        totalShippingCost: shippingCharge + codCharge,
        totalAmount: shippingCharge + codCharge,
        baseCharge: shippingCharge,
        codCharges: codCharge,
        currency: "INR",
        estimatedDays: isSameState ? "2-3 Days" : "4-6 Days",
        mode: shippingModeCode === "E" ? "Express" : "Surface",
      };
    };

    if (env.DELHIVERY.MOCK_MODE) {
      const mockResult = calculateStandardRate();
      return createServiceResponse({
        success: true,
        code: "RATE_CALCULATED",
        data: { ...mockResult, simulated: true },
      });
    }

    // Attempt live rate calculation API
    try {
      const response = await executeWithRetry(() =>
        delhiveryClient.get("/api/kinko/v1/invoice/charges/.json", {
          params: {
            md: shippingModeCode,
            ss: "Delivered",
            d_pin: cleanDestPin,
            o_pin: cleanOriginPin,
            cgm: weightInGrams,
            pt: isCod ? "COD" : "Pre-paid",
            amount: orderAmount,
          },
        })
      );

      const rateData = Array.isArray(response.data) ? response.data[0] : response.data;
      if (rateData && (rateData.total_amount !== undefined || rateData.charge_DL !== undefined)) {
        const totalAmount = Number(rateData.total_amount || rateData.charge_DL || 0);
        const codCharge = isCod ? Number(rateData.charge_COD || 40) : 0;
        const shippingCharge = Math.max(totalAmount - codCharge, 0);

        return createServiceResponse({
          success: true,
          code: "LIVE_RATE_CALCULATED",
          data: {
            chargeableWeight: Number(rateData.chargeable_weight || weightInGrams),
            shippingCharge,
            codCharge,
            totalShippingCost: totalAmount,
            totalAmount: totalAmount,
            baseCharge: shippingCharge,
            codCharges: codCharge,
            currency: "INR",
            mode: shippingModeCode === "E" ? "Express" : "Surface",
            raw: rateData,
          },
        });
      }
    } catch (apiError) {
      console.warn(
        `[Delhivery Service] Live rate API endpoint unavailable (${apiError.response?.status || apiError.message}). Using standard rate model.`
      );
    }

    // Fallback standard rate model
    const fallbackRate = calculateStandardRate();
    return createServiceResponse({
      success: true,
      code: "STANDARD_RATE_CALCULATED",
      data: { ...fallbackRate, fallback: true },
    });
  } catch (error) {
    console.error("[Delhivery Service] calculateShippingCost error:", error.message);
    return createServiceResponse({
      success: false,
      code: "RATE_CALCULATION_FAILED",
      message: "Could not calculate shipping rate.",
      error: error.message,
    });
  }
}

/**
 * 3. CREATE SHIPMENT (AWB GENERATION & ORDER DISPATCH MANIFEST)
 * API: POST /api/cmu/create.json
 * Payload: format=json&data={ shipments: [...], pickup_location: {...} }
 */
export async function createShipment(orderData) {
  try {
    if (!orderData) {
      return createServiceResponse({
        success: false,
        code: "INVALID_ORDER_DATA",
        message: "Order data is required to create a shipment.",
      });
    }

    const orderId = orderData.orderId || orderData._id?.toString();
    if (!orderId) {
      return createServiceResponse({
        success: false,
        code: "MISSING_ORDER_ID",
        message: "A valid orderId is required.",
      });
    }

    // Check if an existing shipment with an AWB already exists (Idempotency)
    let existingShipment = null;
    if (mongoose.connection?.readyState === 1) {
      existingShipment = await Shipment.findOne({
        orderId,
        awbNumber: { $exists: true, $ne: "" },
        internalStatus: { $ne: "SHIPMENT_FAILED" },
      });
    }

    if (existingShipment && existingShipment.awbNumber) {
      console.log(`[Delhivery Service] Shipment already exists for Order ${orderId} with AWB ${existingShipment.awbNumber}`);
      return createServiceResponse({
        success: true,
        code: "SHIPMENT_ALREADY_EXISTS",
        message: `Shipment already manifested with AWB: ${existingShipment.awbNumber}`,
        data: {
          shipmentId: existingShipment._id,
          waybill: existingShipment.awbNumber,
          internalStatus: existingShipment.internalStatus,
          carrierStatus: existingShipment.carrierStatus,
          existing: true,
        },
      });
    }

    // Extract customer info
    const customer = orderData.customer || {};
    const customerName = customer.name || orderData.customerName || "";
    const customerPhone = String(customer.phone || orderData.customerPhone || "").replace(/\D/g, "");
    const customerAddress = customer.address || orderData.customerAddress || "";
    let customerPincode =
      customer.pincode ||
      orderData.customerPincode ||
      orderData.pincode ||
      orderData.destPincode ||
      (customerAddress.match(/\b\d{6}\b/) ? customerAddress.match(/\b\d{6}\b/)[0] : "");
    customerPincode = String(customerPincode || "").replace(/\D/g, "");

    if (!customerName) {
      return createServiceResponse({
        success: false,
        code: "VALIDATION_FAILED",
        message: "Customer name is required for courier dispatch.",
      });
    }
    if (!customerPhone || customerPhone.length < 10) {
      return createServiceResponse({
        success: false,
        code: "VALIDATION_FAILED",
        message: "A valid 10-digit customer phone number is required.",
      });
    }
    if (!customerAddress) {
      return createServiceResponse({
        success: false,
        code: "VALIDATION_FAILED",
        message: "Delivery address is required.",
      });
    }
    if (!customerPincode || customerPincode.length !== 6) {
      return createServiceResponse({
        success: false,
        code: "VALIDATION_FAILED",
        message: "A valid 6-digit delivery pincode is required.",
      });
    }

    const items = orderData.items || [];
    const paymentMethod = (orderData.paymentMethod || "cod").toLowerCase();
    const isCod = paymentMethod === "cod";
    const totalAmount = Number(orderData.total || orderData.totalAmount || 0);
    const codAmount = isCod ? totalAmount : 0;
    const shippingWeight = Number(orderData.weight || orderData.shippingWeight || 500);

    const productsDescription =
      items.length > 0
        ? items.map((it) => `${it.name || "Produce"} (x${it.count || 1})`).join(", ").substring(0, 240)
        : "Organic Farm Goods";
    const totalQuantity = items.reduce((sum, it) => sum + (Number(it.count) || 1), 0);

    // Initial shipment document creation in DB
    let shipment = null;
    if (mongoose.connection?.readyState === 1) {
      shipment = await Shipment.create({
        orderId,
        orderRef: orderData._id || null,
        carrier: "Delhivery",
        internalStatus: "SHIPMENT_CREATED",
        carrierStatus: "Manifested",
        paymentMode: isCod ? "COD" : "Prepaid",
        codAmount,
        shippingMode: orderData.shippingMode === "Express" ? "Express" : "Surface",
        dimensions: {
          length: Number(orderData.dimensions?.length) || 20,
          width: Number(orderData.dimensions?.width) || 15,
          height: Number(orderData.dimensions?.height) || 10,
          weight: shippingWeight,
        },
        trackingEvents: [
          {
            status: "Shipment Created",
            statusCode: "SC",
            internalStatus: "SHIPMENT_CREATED",
            description: "Shipment record initialized in Dronagiri store",
            location: env.DELHIVERY.WAREHOUSE,
            eventTime: new Date(),
            source: "api_response",
          },
        ],
      });
    }

    // ----------------------------------------------------
    // MOCK MODE
    // ----------------------------------------------------
    if (env.DELHIVERY.MOCK_MODE) {
      console.log(`[Delhivery Service: MOCK] Manifesting order ${orderId}`);
      const mockAwb = `14${Date.now().toString().slice(-9)}${Math.floor(10 + Math.random() * 90)}`;

      if (shipment) {
        shipment.awbNumber = mockAwb;
        shipment.internalStatus = "AWB_ASSIGNED";
        shipment.carrierStatus = "Manifested";
        shipment.carrierStatusCode = "MN";
        shipment.carrierStatusDescription = "Shipment manifested successfully in Mock Mode";
        shipment.currentLocation = env.DELHIVERY.WAREHOUSE;
        shipment.lastSyncedAt = new Date();
        shipment.trackingEvents.push({
          status: "Manifested",
          statusCode: "MN",
          internalStatus: "AWB_ASSIGNED",
          description: "Order booked / AWB generated (Mock Mode)",
          location: env.DELHIVERY.WAREHOUSE,
          eventTime: new Date(),
          source: "api_response",
        });
        await shipment.save();
      }

      // Safely synchronize parent Order without setting premature 'Shipped' status
      if (mongoose.connection?.readyState === 1) {
        await Order.findOneAndUpdate(
          { orderId },
          {
            waybill: mockAwb,
            shipmentRef: shipment?._id,
            internalStatus: "AWB_ASSIGNED",
            shipmentStatus: "manifested",
            "shipping.waybill": mockAwb,
            "shipping.courier": "Delhivery",
            "shipping.status": "Manifested",
            "shipping.statusDetails": "Manifested with Delhivery (AWB: " + mockAwb + ")",
            "shipping.lastTrackedAt": new Date(),
          }
        );
      }

      return createServiceResponse({
        success: true,
        code: "SHIPMENT_CREATED",
        message: "Shipment manifested successfully. AWB assigned.",
        data: {
          shipmentId: shipment._id,
          waybill: mockAwb,
          orderId,
          internalStatus: "AWB_ASSIGNED",
          carrierStatus: "Manifested",
          pickupLocation: env.DELHIVERY.WAREHOUSE,
          codAmount,
          paymentMode: isCod ? "COD" : "Prepaid",
          simulated: true,
        },
      });
    }

    // ----------------------------------------------------
    // LIVE DELHIVERY API
    // ----------------------------------------------------
    const shipmentPayload = {
      shipments: [
        {
          name: customerName,
          add: customerAddress,
          pin: customerPincode,
          phone: customerPhone,
          order: orderId,
          payment_mode: isCod ? "COD" : "Prepaid",
          cod_amount: codAmount,
          total_amount: totalAmount,
          products_desc: productsDescription,
          quantity: String(totalQuantity || 1),
          weight: String(shippingWeight),
          shipment_width: String(orderData.dimensions?.width || 15),
          shipment_height: String(orderData.dimensions?.height || 10),
          shipment_length: String(orderData.dimensions?.length || 20),
          shipping_mode: orderData.shippingMode === "Express" ? "Express" : "Surface",
          seller_name: env.DELHIVERY.CLIENT_NAME,
          order_date: new Date().toISOString().split("T")[0],
          waybill: "", // Empty to let Delhivery assign new AWB
        },
      ],
      pickup_location: {
        name: env.DELHIVERY.WAREHOUSE,
      },
    };

    const formBody = new URLSearchParams();
    formBody.append("format", "json");
    formBody.append("data", JSON.stringify(shipmentPayload));

    const response = await executeWithRetry(() =>
      delhiveryClient.post("/api/cmu/create.json", formBody.toString(), {
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
      })
    );

    const resData = response.data;
    const pkg = resData?.packages?.[0] || {};
    const uploadWbn = resData?.upload_wbn || "";
    const isFailed = resData?.success === false || pkg?.status === "Fail";
    const pkgRemarks = (Array.isArray(pkg?.remarks) ? pkg.remarks.join("; ") : String(pkg?.remarks || "")).trim();

    if (isFailed) {
      const errorDetail = pkgRemarks || resData?.rmk || "Courier rejected shipment creation.";
      shipment.internalStatus = "SHIPMENT_FAILED";
      shipment.lastError = errorDetail;
      shipment.rawApiResponse = resData;
      await shipment.save();

      return createServiceResponse({
        success: false,
        code: "CARRIER_REJECTED",
        message: errorDetail.toLowerCase().includes("balance")
          ? "Delhivery Wallet Error: Insufficient balance in your Delhivery prepaid account. Please recharge at one.delhivery.com."
          : errorDetail,
        error: errorDetail,
      });
    }

    const assignedWaybill = pkg.waybill;
    // CRITICAL: Ensure upload_wbn is never mistaken for waybill!
    if (!assignedWaybill || assignedWaybill.startsWith("UPL")) {
      shipment.internalStatus = "SHIPMENT_FAILED";
      shipment.lastError = "No valid AWB returned by Delhivery.";
      shipment.rawApiResponse = resData;
      await shipment.save();

      return createServiceResponse({
        success: false,
        code: "AWB_GENERATION_FAILED",
        message: "Waybill was not assigned by Delhivery.",
        error: "Missing waybill in carrier response",
      });
    }

    // Successfully manifested
    if (shipment) {
      shipment.awbNumber = assignedWaybill;
      shipment.uploadWbn = uploadWbn;
      shipment.internalStatus = "AWB_ASSIGNED";
      shipment.carrierStatus = pkg.status || "Manifested";
      shipment.carrierStatusCode = "MN";
      shipment.carrierStatusDescription = pkgRemarks || "Manifested with Delhivery";
      shipment.rawApiResponse = resData;
      shipment.lastSyncedAt = new Date();
      shipment.trackingEvents.push({
        status: "Manifested",
        statusCode: "MN",
        internalStatus: "AWB_ASSIGNED",
        description: "Order manifested with Delhivery. AWB: " + assignedWaybill,
        location: env.DELHIVERY.WAREHOUSE,
        eventTime: new Date(),
        source: "api_response",
      });
      await shipment.save();
    }

    // Safely update Order with AWB and shipment link (do not force status to 'Shipped' yet!)
    if (mongoose.connection?.readyState === 1) {
      await Order.findOneAndUpdate(
        { orderId },
        {
          waybill: assignedWaybill,
          shipmentRef: shipment?._id,
          internalStatus: "AWB_ASSIGNED",
          shipmentStatus: "manifested",
          "shipping.waybill": assignedWaybill,
          "shipping.courier": "Delhivery",
          "shipping.status": "Manifested",
          "shipping.statusDetails": "Manifested with Delhivery (AWB: " + assignedWaybill + ")",
          "shipping.lastTrackedAt": new Date(),
        }
      );
    }

    console.log(`[Delhivery Service] Order ${orderId} successfully manifested with AWB ${assignedWaybill}`);

    return createServiceResponse({
      success: true,
      code: "SHIPMENT_CREATED",
      message: "Shipment created successfully. Waybill generated and assigned to order.",
      data: {
        shipmentId: shipment._id,
        waybill: assignedWaybill,
        uploadWbn,
        orderId,
        internalStatus: "AWB_ASSIGNED",
        carrierStatus: pkg.status || "Success",
        pickupLocation: env.DELHIVERY.WAREHOUSE,
        codAmount,
        paymentMode: isCod ? "COD" : "Prepaid",
      },
    });
  } catch (error) {
    const errorData = error.response?.data;
    console.error("[Delhivery Service] createShipment exception:", errorData || error.message);

    return createServiceResponse({
      success: false,
      code: "SHIPMENT_CREATION_FAILED",
      message: "We could not create the shipment with Delhivery at this time.",
      error: typeof errorData === "string" ? errorData : errorData?.rmk || error.message,
      retryable: true,
    });
  }
}

/**
 * 4. GET SHIPPING LABEL (PACKING SLIP / BARCODE LABEL)
 * API: GET /api/p/packing_slip?wbns={waybill}&pdf=true
 */
export async function getShippingLabel(waybill) {
  try {
    const cleanWaybill = String(waybill || "").trim();
    if (!cleanWaybill || cleanWaybill.startsWith("UPL")) {
      return createServiceResponse({
        success: false,
        code: "INVALID_WAYBILL",
        message: "A valid AWB waybill number is required (batch UPL numbers cannot generate labels).",
      });
    }

    if (env.DELHIVERY.MOCK_MODE) {
      const mockPdf = `%PDF-1.4\n% Delhivery Shipping Label Mock\n1 0 obj<< /Type /Catalog /Pages 2 0 R >>endobj\n2 0 obj<< /Type /Pages /Kids [3 0 R] /Count 1 >>endobj\n3 0 obj<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 400] >>endobj\nxref\n0 4\n0000000000 65535 f \n0000000050 00000 n \n0000000100 00000 n \n0000000160 00000 n \ntrailer<< /Size 4 /Root 1 0 R >>\nstartxref\n235\n%%EOF`;
      const pdfBuffer = Buffer.from(mockPdf, "utf-8");

      return createServiceResponse({
        success: true,
        code: "LABEL_GENERATED",
        data: {
          waybill: cleanWaybill,
          pdfBuffer,
          contentType: "application/pdf",
          downloadUrl: `${env.DELHIVERY.BASE_URL}/api/p/packing_slip?wbns=${cleanWaybill}&pdf=true`,
          simulated: true,
        },
      });
    }

    const response = await executeWithRetry(() =>
      delhiveryClient.get("/api/p/packing_slip", {
        params: { wbns: cleanWaybill, pdf: "true" },
        responseType: "arraybuffer",
      })
    );

    const contentType = response.headers["content-type"] || "application/pdf";
    const pdfBuffer = Buffer.from(response.data);

    // Update shipment and order flags
    if (mongoose.connection?.readyState === 1) {
      await Shipment.findOneAndUpdate({ awbNumber: cleanWaybill }, { labelDownloaded: true });
      await Order.findOneAndUpdate({ waybill: cleanWaybill }, { "shipping.labelDownloaded": true });
    }

    return createServiceResponse({
      success: true,
      code: "LABEL_DOWNLOADED",
      data: {
        waybill: cleanWaybill,
        pdfBuffer,
        contentType,
        downloadUrl: `${env.DELHIVERY.BASE_URL}/api/p/packing_slip?wbns=${cleanWaybill}&pdf=true`,
      },
    });
  } catch (error) {
    console.error(`[Delhivery Service] getShippingLabel error for ${waybill}:`, error.message);
    return createServiceResponse({
      success: false,
      code: "LABEL_RETRIEVAL_FAILED",
      message: "Could not retrieve shipping label from Delhivery.",
      error: error.message,
    });
  }
}

/**
 * 5. TRACK SHIPMENT
 * API: GET /api/v1/packages/json/?waybill={waybill}
 */
export async function trackShipment(waybill) {
  try {
    const cleanWaybill = String(waybill || "").trim();
    if (!cleanWaybill) {
      return createServiceResponse({
        success: false,
        code: "INVALID_WAYBILL",
        message: "Waybill number is required to track shipment.",
      });
    }

    // Mock Mode
    if (env.DELHIVERY.MOCK_MODE) {
      const now = new Date();
      return createServiceResponse({
        success: true,
        code: "TRACKING_RETRIEVED",
        data: {
          waybill: cleanWaybill,
          internalStatus: "IN_TRANSIT",
          carrierStatus: "In Transit",
          displayLabel: "In Transit",
          statusDetails: "Shipment in transit towards regional hub (Mock Mode)",
          currentLocation: "Regional Logistics Center",
          expectedDeliveryDate: new Date(now.getTime() + 3 * 86400000).toISOString().split("T")[0],
          origin: env.DELHIVERY.WAREHOUSE,
          destination: "Destination Center",
          scans: [
            {
              status: "Manifested",
              statusCode: "MN",
              location: env.DELHIVERY.WAREHOUSE,
              statusDateTime: new Date(now.getTime() - 86400000).toISOString(),
              instructions: "Order booked and manifest generated",
            },
            {
              status: "Picked Up",
              statusCode: "PU",
              location: "Orchha Sorting Hub",
              statusDateTime: new Date(now.getTime() - 43200000).toISOString(),
              instructions: "Package collected from merchant",
            },
            {
              status: "In Transit",
              statusCode: "IT",
              location: "National Logistics Hub",
              statusDateTime: now.toISOString(),
              instructions: "Package in transit to delivery station",
            },
          ],
          simulated: true,
        },
      });
    }

    const response = await executeWithRetry(() =>
      delhiveryClient.get("/api/v1/packages/json/", {
        params: { waybill: cleanWaybill },
      })
    );

    const shipmentData = response.data?.ShipmentData?.[0]?.Shipment;
    if (!shipmentData) {
      return createServiceResponse({
        success: false,
        code: "NO_SHIPMENT_DATA",
        message: `No shipment data found on Delhivery network for waybill ${cleanWaybill}`,
      });
    }

    const rawStatus = shipmentData.Status?.Status || shipmentData.Status?.StatusType || "In Transit";
    const statusInstructions = shipmentData.Status?.Instructions || "";
    const mapped = mapCarrierStatus(rawStatus, statusInstructions);

    const scans = (shipmentData.Scans || []).map((scan) => ({
      status: scan.ScanDetail?.Scan || scan.ScanDetail?.Instructions || "Scan Updated",
      statusCode: scan.ScanDetail?.ScanType || "",
      location: scan.ScanDetail?.ScannedLocation || "",
      statusDateTime: scan.ScanDetail?.ScanDateTime || new Date().toISOString(),
      instructions: scan.ScanDetail?.Instructions || "",
    }));

    const result = {
      waybill: cleanWaybill,
      orderId: shipmentData.ReferenceNo || "",
      internalStatus: mapped.internalStatus,
      carrierStatus: rawStatus,
      carrierStatusCode: mapped.carrierStatusCode,
      carrierStatusDescription: mapped.carrierStatusDescription,
      displayLabel: mapped.displayLabel,
      currentLocation: shipmentData.Scans?.[0]?.ScanDetail?.ScannedLocation || shipmentData.Origin || "",
      expectedDeliveryDate: shipmentData.ExpectedDeliveryDate || null,
      origin: shipmentData.Origin || env.DELHIVERY.WAREHOUSE,
      destination: shipmentData.Destination || "",
      scans,
      raw: shipmentData,
    };

    // Synchronize to Shipment entity in DB
    await syncTrackingToDatabase(cleanWaybill, result);

    return createServiceResponse({
      success: true,
      code: "TRACKING_RETRIEVED",
      message: `Shipment status: ${mapped.displayLabel}`,
      data: result,
    });
  } catch (error) {
    console.error(`[Delhivery Service] trackShipment error for ${waybill}:`, error.message);
    return createServiceResponse({
      success: false,
      code: "TRACKING_FAILED",
      message: "Unable to track shipment at this time.",
      error: error.response?.data?.message || error.message,
      retryable: true,
    });
  }
}

/**
 * Helper: Synchronizes tracking updates into both Shipment and Order models safely
 */
export async function syncTrackingToDatabase(waybill, trackingData) {
  try {
    if (!waybill || !trackingData || mongoose.connection?.readyState !== 1) return;

    const {
      internalStatus,
      carrierStatus,
      carrierStatusCode,
      carrierStatusDescription,
      currentLocation,
      expectedDeliveryDate,
      scans = [],
    } = trackingData;

    // 1. Update Shipment record
    const shipment = await Shipment.findOne({ awbNumber: waybill });
    if (shipment) {
      shipment.internalStatus = internalStatus;
      shipment.carrierStatus = carrierStatus;
      shipment.carrierStatusCode = carrierStatusCode;
      shipment.carrierStatusDescription = carrierStatusDescription;
      shipment.currentLocation = currentLocation || shipment.currentLocation;
      if (expectedDeliveryDate) shipment.expectedDeliveryDate = new Date(expectedDeliveryDate);
      shipment.lastSyncedAt = new Date();

      if (internalStatus === "DELIVERED") {
        shipment.deliveredAt = shipment.deliveredAt || new Date();
      } else if (internalStatus === "CANCELLED") {
        shipment.cancelledAt = shipment.cancelledAt || new Date();
      } else if (internalStatus === "PICKED_UP" || internalStatus === "IN_TRANSIT") {
        shipment.shippedAt = shipment.shippedAt || new Date();
      }

      // Deduplicate tracking events by timestamp & status
      for (const scan of scans) {
        const scanTime = new Date(scan.statusDateTime || Date.now());
        const alreadyExists = shipment.trackingEvents.some(
          (e) =>
            e.status === scan.status &&
            Math.abs(new Date(e.eventTime).getTime() - scanTime.getTime()) < 60000
        );
        if (!alreadyExists) {
          const scanMapped = mapCarrierStatus(scan.status, scan.instructions);
          shipment.trackingEvents.push({
            status: scan.status,
            statusCode: scan.statusCode || "",
            internalStatus: scanMapped.internalStatus,
            description: scan.instructions || scan.status,
            location: scan.location || "",
            eventTime: scanTime,
            source: "carrier_scan",
          });
        }
      }

      await shipment.save();
    }

    // 2. Synchronize parent Order record
    const orderUpdates = {
      internalStatus,
      "shipping.status": carrierStatus,
      "shipping.statusDetails": carrierStatusDescription,
      "shipping.lastTrackedAt": new Date(),
    };

    if (internalStatus === "DELIVERED") {
      orderUpdates.status = "Delivered";
      orderUpdates.paymentStatus = "Paid";
    } else if (internalStatus === "CANCELLED") {
      orderUpdates.status = "Cancelled";
    } else if (internalStatus === "PICKED_UP" || internalStatus === "IN_TRANSIT" || internalStatus === "OUT_FOR_DELIVERY") {
      orderUpdates.status = "Shipped";
      orderUpdates.shipmentStatus = "in-transit";
    }

    await Order.findOneAndUpdate({ waybill }, orderUpdates);
  } catch (err) {
    console.warn(`[Delhivery Service] syncTrackingToDatabase warning for AWB ${waybill}:`, err.message);
  }
}

/**
 * 6. CANCEL SHIPMENT
 * API: POST /api/p/edit
 * Payload: { waybill, cancellation: "true" }
 */
export async function cancelShipment(waybill) {
  try {
    const cleanWaybill = String(waybill || "").trim();
    if (!cleanWaybill) {
      return createServiceResponse({
        success: false,
        code: "INVALID_WAYBILL",
        message: "Waybill number is required to cancel shipment.",
      });
    }

    if (env.DELHIVERY.MOCK_MODE) {
      if (mongoose.connection?.readyState === 1) {
        await Shipment.findOneAndUpdate(
          { awbNumber: cleanWaybill },
          {
            internalStatus: "CANCELLED",
            carrierStatus: "Cancelled",
            cancelledAt: new Date(),
            $push: {
              trackingEvents: {
                status: "Cancelled",
                statusCode: "CN",
                internalStatus: "CANCELLED",
                description: "Shipment cancelled before pickup (Mock Mode)",
                location: env.DELHIVERY.WAREHOUSE,
                eventTime: new Date(),
                source: "admin",
              },
            },
          }
        );

        await Order.findOneAndUpdate(
          { waybill: cleanWaybill },
          {
            status: "Cancelled",
            internalStatus: "CANCELLED",
            "shipping.status": "Cancelled",
            "shipping.statusDetails": "Shipment cancelled before pickup",
          }
        );
      }

      return createServiceResponse({
        success: true,
        code: "SHIPMENT_CANCELLED",
        message: "Shipment cancelled successfully.",
        data: { waybill: cleanWaybill, cancelled: true, simulated: true },
      });
    }

    const response = await executeWithRetry(() =>
      delhiveryClient.post("/api/p/edit", {
        waybill: cleanWaybill,
        cancellation: "true",
      })
    );

    const resData = response.data;
    const isSuccess =
      resData?.status === true ||
      resData?.success === true ||
      (typeof resData === "string" && resData.toLowerCase().includes("success"));

    if (isSuccess || response.status === 200) {
      if (mongoose.connection?.readyState === 1) {
        await Shipment.findOneAndUpdate(
          { awbNumber: cleanWaybill },
          {
            internalStatus: "CANCELLED",
            carrierStatus: "Cancelled",
            cancelledAt: new Date(),
            $push: {
              trackingEvents: {
                status: "Cancelled",
                statusCode: "CN",
                internalStatus: "CANCELLED",
                description: "Shipment cancelled before pickup with Delhivery",
                location: env.DELHIVERY.WAREHOUSE,
                eventTime: new Date(),
                source: "admin",
              },
            },
          }
        );

        await Order.findOneAndUpdate(
          { waybill: cleanWaybill },
          {
            status: "Cancelled",
            internalStatus: "CANCELLED",
            "shipping.status": "Cancelled",
            "shipping.statusDetails": "Shipment cancelled before pickup with Delhivery",
          }
        );
      }

      return createServiceResponse({
        success: true,
        code: "SHIPMENT_CANCELLED",
        message: "Shipment cancelled successfully with Delhivery.",
        data: { waybill: cleanWaybill, cancelled: true, raw: resData },
      });
    }

    return createServiceResponse({
      success: false,
      code: "CANCELLATION_REJECTED",
      message: resData?.message || "Delhivery did not accept shipment cancellation.",
      error: resData?.message || "Cancellation rejected",
    });
  } catch (error) {
    console.error(`[Delhivery Service] cancelShipment error for ${waybill}:`, error.message);
    return createServiceResponse({
      success: false,
      code: "CANCELLATION_FAILED",
      message: "Failed to cancel shipment.",
      error: error.response?.data?.message || error.message,
    });
  }
}

/**
 * 7. SHIPMENT PICKUP REQUEST / SCHEDULING
 * API: POST /fm/request/new/
 */
export async function schedulePickup(details = {}, pickupDate) {
  try {
    const scheduledDate =
      pickupDate ||
      details.pickupDate ||
      new Date(Date.now() + 86400000).toISOString().split("T")[0]; // Defaults to tomorrow
    const pickupLocation = details.pickupLocation || env.DELHIVERY.WAREHOUSE;
    const pickupTime = details.pickupTime || "14:00:00";
    const expectedPackageCount = Math.max(Number(details.expectedPackageCount) || 1, 1);

    if (env.DELHIVERY.MOCK_MODE) {
      const mockPickupToken = `PKP-${Date.now().toString().slice(-6)}`;
      return createServiceResponse({
        success: true,
        code: "PICKUP_SCHEDULED",
        message: `Pickup scheduled successfully for ${scheduledDate} at ${pickupLocation}`,
        data: {
          pickupToken: mockPickupToken,
          scheduledDate,
          pickupTime,
          pickupLocation,
          expectedPackageCount,
          simulated: true,
        },
      });
    }

    const payload = {
      pickup_time: pickupTime,
      pickup_date: scheduledDate,
      pickup_location: pickupLocation,
      expected_package_count: expectedPackageCount,
    };

    const response = await executeWithRetry(() =>
      delhiveryClient.post("/fm/request/new/", payload)
    );

    const resData = response.data;
    const pickupToken =
      resData?.pickup_id ||
      resData?.pr_id ||
      resData?.incoming_center ||
      `PKP-${Date.now().toString().slice(-6)}`;

    return createServiceResponse({
      success: true,
      code: "PICKUP_SCHEDULED",
      message: `Pickup scheduled successfully with token ${pickupToken}`,
      data: {
        pickupToken: String(pickupToken),
        scheduledDate,
        pickupTime,
        pickupLocation,
        expectedPackageCount,
        raw: resData,
      },
    });
  } catch (error) {
    console.error("[Delhivery Service] schedulePickup error:", error.message);
    return createServiceResponse({
      success: false,
      code: "PICKUP_SCHEDULING_FAILED",
      message: "Failed to schedule warehouse pickup with Delhivery.",
      error: error.response?.data?.message || error.message,
    });
  }
}

export default {
  checkServiceability,
  calculateShippingCost,
  createShipment,
  getShippingLabel,
  trackShipment,
  cancelShipment,
  schedulePickup,
  mapCarrierStatus,
  syncTrackingToDatabase,
  createServiceResponse,
};
