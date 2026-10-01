import mongoose from "mongoose";
import assert from "assert";
import { env, validateEnv } from "../config/env.js";
import Shipment from "../models/shipment.model.js";
import Invoice from "../models/invoice.model.js";
import Order from "../models/order.model.js";
import delhiveryService from "../services/delhivery.service.js";
import invoiceService from "../services/invoice.service.js";
import { handleDelhiveryWebhook } from "../controllers/shipping.controller.js";

/**
 * ============================================================================
 * COMPREHENSIVE AUTOMATED TEST SUITE FOR DELHIVERY & INVOICE SYSTEMS
 * ============================================================================
 */

async function runAllTests() {
  console.log("==================================================");
  console.log("🧪 STARTING PRODUCTION SHIPPING & INVOICE TESTS");
  console.log("==================================================");

  let passed = 0;
  let failed = 0;

  function record(testName, fn) {
    try {
      fn();
      console.log(`  ✅ [PASS] ${testName}`);
      passed++;
    } catch (err) {
      console.error(`  ❌ [FAIL] ${testName}:`, err.message);
      failed++;
    }
  }

  async function recordAsync(testName, fn) {
    try {
      await fn();
      console.log(`  ✅ [PASS] ${testName}`);
      passed++;
    } catch (err) {
      console.error(`  ❌ [FAIL] ${testName}:`, err.message);
      failed++;
    }
  }

  // Connect to test/in-memory or active DB
  console.log("\n--- Connecting to MongoDB ---");
  await mongoose.connect(env.MONGODB_URL);
  console.log("Connected to MongoDB.");

  // Force mock mode during automated tests to avoid real carrier calls
  env.DELHIVERY.MOCK_MODE = true;

  // 1. CONFIGURATION VALIDATION TESTS
  console.log("\n--- 1. Configuration & Validation Tests ---");
  record("validateEnv() reports valid configuration", () => {
    const res = validateEnv();
    assert.strictEqual(typeof res.valid, "boolean");
    assert(Array.isArray(res.issues));
  });

  // 2. STATUS MAPPER TESTS
  console.log("\n--- 2. Status Mapping Tests ---");
  record("Maps 'Delivered' to DELIVERED (terminal)", () => {
    const m = delhiveryService.mapCarrierStatus("Delivered");
    assert.strictEqual(m.internalStatus, "DELIVERED");
    assert.strictEqual(m.isTerminal, true);
    assert.strictEqual(m.displayLabel, "Delivered");
  });

  record("Maps 'DL' to DELIVERED", () => {
    const m = delhiveryService.mapCarrierStatus("DL", "Delivered to recipient");
    assert.strictEqual(m.internalStatus, "DELIVERED");
    assert.strictEqual(m.isTerminal, true);
  });

  record("Maps 'Out for delivery' to OUT_FOR_DELIVERY", () => {
    const m = delhiveryService.mapCarrierStatus("Out for Delivery");
    assert.strictEqual(m.internalStatus, "OUT_FOR_DELIVERY");
    assert.strictEqual(m.isTerminal, false);
  });

  record("Maps 'In Transit' to IN_TRANSIT", () => {
    const m = delhiveryService.mapCarrierStatus("In Transit", "Reached Delhi Hub");
    assert.strictEqual(m.internalStatus, "IN_TRANSIT");
    assert.strictEqual(m.isTerminal, false);
  });

  record("Maps 'Picked Up' to PICKED_UP", () => {
    const m = delhiveryService.mapCarrierStatus("Shipment picked up");
    assert.strictEqual(m.internalStatus, "PICKED_UP");
  });

  record("Maps 'Manifested' to AWB_ASSIGNED", () => {
    const m = delhiveryService.mapCarrierStatus("Manifested");
    assert.strictEqual(m.internalStatus, "AWB_ASSIGNED");
    assert.strictEqual(m.displayLabel, "Manifested");
  });

  record("Maps 'Door Locked' / 'Customer Unavailable' to NDR", () => {
    const m = delhiveryService.mapCarrierStatus("Pending", "Customer not available / door locked");
    assert.strictEqual(m.internalStatus, "NDR");
    assert.strictEqual(m.displayLabel, "Delivery Attempted / NDR");
  });

  record("Maps 'RTO Initiated' to RTO_INITIATED", () => {
    const m = delhiveryService.mapCarrierStatus("RTO Initiated", "Customer refused package");
    assert.strictEqual(m.internalStatus, "RTO_INITIATED");
  });

  record("Maps 'RTO Delivered' to RTO_DELIVERED (terminal)", () => {
    const m = delhiveryService.mapCarrierStatus("RTO DL", "Returned to seller warehouse");
    assert.strictEqual(m.internalStatus, "RTO_DELIVERED");
    assert.strictEqual(m.isTerminal, true);
  });

  record("Maps 'Cancelled' to CANCELLED (terminal)", () => {
    const m = delhiveryService.mapCarrierStatus("Cancelled before pickup");
    assert.strictEqual(m.internalStatus, "CANCELLED");
    assert.strictEqual(m.isTerminal, true);
  });

  record("Safely handles unknown carrier status without crashing", () => {
    const m = delhiveryService.mapCarrierStatus("EXOTIC_CUSTOM_STATUS_9999");
    assert.strictEqual(m.internalStatus, "IN_TRANSIT");
    assert.strictEqual(m.isTerminal, false);
    assert.strictEqual(m.displayLabel, "In Transit");
  });

  // 3. SERVICEABILITY & RATE TESTS
  console.log("\n--- 3. Serviceability & Rate Calculation Tests ---");
  await recordAsync("Check serviceable pincode (mock mode)", async () => {
    const res = await delhiveryService.checkServiceability("110001");
    assert.strictEqual(res.success, true);
    assert.strictEqual(res.data?.serviceable, true);
    assert.strictEqual(res.data?.codAvailable, true);
  });

  await recordAsync("Check invalid pincode fails gracefully", async () => {
    const res = await delhiveryService.checkServiceability("123");
    assert.strictEqual(res.success, false);
    assert.strictEqual(res.code, "INVALID_PINCODE");
  });

  await recordAsync("Calculate shipping cost with weight slab and COD fee", async () => {
    const res = await delhiveryService.calculateShippingCost({
      destPincode: "400001",
      weight: 1200,
      paymentType: "COD",
      orderAmount: 1500,
    });
    assert.strictEqual(res.success, true);
    assert(res.data.shippingCharge > 0);
    assert(res.data.codCharge > 0);
    assert.strictEqual(res.data.totalShippingCost, res.data.shippingCharge + res.data.codCharge);
  });

  // 4. SHIPMENT CREATION & IDEMPOTENCY
  console.log("\n--- 4. Shipment Creation & Idempotency Tests ---");
  const testOrderId = `TEST-ORDER-${Date.now()}`;
  let createdAwb = "";

  await recordAsync("Create initial shipment and assign AWB", async () => {
    const testOrder = await Order.create({
      orderId: testOrderId,
      customer: {
        name: "Test Recipient",
        phone: "9876543210",
        address: "123 Test Street, Civil Lines, Kanpur, Uttar Pradesh 208001",
        pincode: "208001",
      },
      items: [{ productId: 1, name: "Wild Forest Honey 500g", count: 2, price: 400, quantity: "500g" }],
      subtotal: 800,
      total: 800,
      paymentMethod: "cod",
      status: "Order Sent to Admin",
      userId: new mongoose.Types.ObjectId(),
    });

    const res = await delhiveryService.createShipment(testOrder);
    assert.strictEqual(res.success, true);
    assert(res.data.waybill, "Waybill should be generated");
    assert(!res.data.waybill.startsWith("UPL"), "Waybill must NEVER be a batch UPL ID");
    createdAwb = res.data.waybill;

    const shipDoc = await Shipment.findOne({ orderId: testOrderId });
    assert(shipDoc, "Shipment record must be saved in database");
    assert.strictEqual(shipDoc.awbNumber, createdAwb);
    assert.strictEqual(shipDoc.internalStatus, "AWB_ASSIGNED");
  });

  await recordAsync("Prevent duplicate shipment creation for same order (Idempotency)", async () => {
    const order = await Order.findOne({ orderId: testOrderId });
    const res = await delhiveryService.createShipment(order);

    assert.strictEqual(res.success, true);
    assert.strictEqual(res.code, "SHIPMENT_ALREADY_EXISTS");
    assert.strictEqual(res.data.waybill, createdAwb, "Must return existing waybill without generating new one");

    const count = await Shipment.countDocuments({ orderId: testOrderId });
    assert.strictEqual(count, 1, "Exactly one shipment must exist in database for this order");
  });

  // 5. TRACKING SYNCHRONIZATION & EVENT DEDUPLICATION
  console.log("\n--- 5. Tracking Synchronization Tests ---");
  await recordAsync("Sync tracking and prevent duplicate event insertion", async () => {
    const mockTracking = {
      internalStatus: "IN_TRANSIT",
      carrierStatus: "In Transit",
      carrierStatusCode: "IT",
      carrierStatusDescription: "Shipment in transit towards regional hub",
      currentLocation: "Kanpur Sorting Hub",
      scans: [
        {
          status: "In Transit",
          statusCode: "IT",
          location: "Kanpur Sorting Hub",
          statusDateTime: new Date().toISOString(),
          instructions: "Package arrived at sorting facility",
        },
      ],
    };

    // First sync
    await delhiveryService.syncTrackingToDatabase(createdAwb, mockTracking);
    const ship1 = await Shipment.findOne({ awbNumber: createdAwb });
    const eventCount1 = ship1.trackingEvents.length;

    // Second sync with identical scan
    await delhiveryService.syncTrackingToDatabase(createdAwb, mockTracking);
    const ship2 = await Shipment.findOne({ awbNumber: createdAwb });
    const eventCount2 = ship2.trackingEvents.length;

    assert.strictEqual(eventCount1, eventCount2, "Duplicate tracking events should be deduplicated");
  });

  // 6. WEBHOOK PROCESSING TESTS
  console.log("\n--- 6. Webhook Processing Tests ---");
  await recordAsync("Process webhook status update safely and idempotently", async () => {
    const req = {
      body: {
        waybill: createdAwb,
        status: "Out for Delivery",
        instructions: "Courier on vehicle for doorstep delivery",
        location: "Kanpur Delivery Station",
        timestamp: new Date().toISOString(),
      },
    };
    let statusCode = null;
    let jsonResponse = null;
    const res = {
      status: (code) => {
        statusCode = code;
        return {
          json: (data) => {
            jsonResponse = data;
          },
        };
      },
    };

    await handleDelhiveryWebhook(req, res);
    assert.strictEqual(statusCode, 200);
    assert.strictEqual(jsonResponse.success, true);

    const ship = await Shipment.findOne({ awbNumber: createdAwb });
    assert.strictEqual(ship.internalStatus, "OUT_FOR_DELIVERY");
  });

  await recordAsync("Handle malformed webhook payload without crashing", async () => {
    const req = { body: null };
    let statusCode = null;
    const res = {
      status: (code) => {
        statusCode = code;
        return { json: () => {} };
      },
    };

    await handleDelhiveryWebhook(req, res);
    assert.strictEqual(statusCode, 400);
  });

  // 7. INVOICE GENERATION & TAX CALCULATIONS
  console.log("\n--- 7. Invoice & Tax Calculation Tests ---");
  record("Calculate current Indian fiscal year correctly", () => {
    const fy = invoiceService.getCurrentFiscalYear(new Date("2026-09-20"));
    assert.strictEqual(fy, "2026-27");
  });

  let generatedInvoice = null;
  await recordAsync("Generate sequential tax invoice with GST breakdown", async () => {
    generatedInvoice = await invoiceService.getOrCreateInvoice(testOrderId);
    assert(generatedInvoice, "Invoice must be created");
    assert(generatedInvoice.invoiceNumber.startsWith("DF/2026-27/"));
    assert(generatedInvoice.taxableTotal > 0);
    assert(generatedInvoice.grandTotal > 0);
    assert.strictEqual(generatedInvoice.orderId, testOrderId);
  });

  await recordAsync("Idempotent invoice lookup returns existing document without duplicate sequence", async () => {
    const invoice2 = await invoiceService.getOrCreateInvoice(testOrderId);
    assert.strictEqual(invoice2.invoiceNumber, generatedInvoice.invoiceNumber);
    assert.strictEqual(invoice2.sequenceNumber, generatedInvoice.sequenceNumber);
  });

  await recordAsync("Generate professional A4 PDF invoice stream", async () => {
    const pdfBuffer = await invoiceService.generateInvoicePDF(generatedInvoice);
    assert(Buffer.isBuffer(pdfBuffer));
    assert(pdfBuffer.length > 500, "PDF buffer must contain content");
    // Verify standard PDF header magic bytes
    const pdfHeader = pdfBuffer.slice(0, 5).toString("utf-8");
    assert.strictEqual(pdfHeader, "%PDF-", "Generated buffer must have valid %PDF- header");
  });

  // 8. CANCELLATION & CLEANUP
  console.log("\n--- 8. Shipment Cancellation Tests ---");
  await recordAsync("Cancel shipment successfully", async () => {
    const cancelRes = await delhiveryService.cancelShipment(createdAwb);
    assert.strictEqual(cancelRes.success, true);

    const ship = await Shipment.findOne({ awbNumber: createdAwb });
    assert.strictEqual(ship.internalStatus, "CANCELLED");

    const ord = await Order.findOne({ orderId: testOrderId });
    assert.strictEqual(ord.status, "Cancelled");
    assert.strictEqual(ord.internalStatus, "CANCELLED");
  });

  // Clean up test order & shipment
  await Shipment.deleteMany({ orderId: testOrderId });
  await Order.deleteMany({ orderId: testOrderId });
  await Invoice.deleteMany({ orderId: testOrderId });

  console.log("\n==================================================");
  console.log(`🏁 TEST SUMMARY: ${passed} PASSED, ${failed} FAILED`);
  console.log("==================================================");

  await mongoose.disconnect();
  if (failed > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

runAllTests().catch((err) => {
  console.error("Fatal test runner error:", err);
  process.exit(1);
});
