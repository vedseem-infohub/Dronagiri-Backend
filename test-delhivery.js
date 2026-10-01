import "dotenv/config";
import {
  checkServiceability,
  calculateShippingCost,
  createShipment,
  getShippingLabel,
  trackShipment,
  cancelShipment,
  schedulePickup,
} from "./services/delhivery.service.js";

async function runTests() {
  console.log("=== 1. TEST PINCODE SERVICEABILITY ===");
  const serviceRes = await checkServiceability("110001");
  console.log("Result (110001):", JSON.stringify(serviceRes, null, 2));

  console.log("\n=== 2. TEST SHIPPING COST CALCULATION ===");
  const costRes = await calculateShippingCost({
    originPincode: "110001",
    destPincode: "400001",
    weight: 750,
    mode: "Surface",
    paymentType: "COD",
    orderAmount: 1200,
  });
  console.log("Cost Result:", JSON.stringify(costRes, null, 2));

  console.log("\n=== 3. TEST CREATE SHIPMENT (MOCK / LIVE) ===");
  const shipmentRes = await createShipment({
    orderId: "TEST-ORDER-101",
    customer: {
      name: "Rohan Sharma",
      phone: "9876543210",
      email: "rohan@example.com",
      address: "Flat 402, Green Avenue, Connaught Place",
      pincode: "110001",
    },
    items: [
      { name: "Organic Forest Honey 500g", count: 2, price: 450 },
    ],
    total: 900,
    paymentMethod: "cod",
    weight: 1000,
  });
  console.log("Shipment Result:", JSON.stringify(shipmentRes, null, 2));

  const waybill = shipmentRes.data?.waybill || "1400000000001";

  console.log("\n=== 4. TEST TRACK SHIPMENT ===");
  const trackRes = await trackShipment(waybill);
  console.log("Track Result:", JSON.stringify(trackRes, null, 2));

  console.log("\n=== 5. TEST GET SHIPPING LABEL ===");
  const labelRes = await getShippingLabel(waybill);
  console.log("Label Result:", {
    success: labelRes.success,
    contentType: labelRes.data?.contentType,
    hasBuffer: Boolean(labelRes.data?.pdfBuffer),
    downloadUrl: labelRes.data?.downloadUrl,
  });

  console.log("\n=== 6. TEST SCHEDULE PICKUP ===");
  const pickupRes = await schedulePickup({
    pickupLocation: "Dronagiri Farms",
    expectedPackageCount: 3,
    pickupTime: "15:00:00",
  }, "2026-09-25");
  console.log("Pickup Result:", JSON.stringify(pickupRes, null, 2));

  console.log("\n=== 7. TEST CANCEL SHIPMENT ===");
  const cancelRes = await cancelShipment(waybill);
  console.log("Cancel Result:", JSON.stringify(cancelRes, null, 2));

  console.log("\nALL 7 DELHIVERY SERVICE TESTS COMPLETED!");
  process.exit(0);
}

runTests().catch((err) => {
  console.error("Test execution error:", err);
  process.exit(1);
});
