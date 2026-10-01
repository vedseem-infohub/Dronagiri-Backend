/**
 * ============================================================================
 * EXAMPLE CHECKOUT & SHIPMENT LIFECYCLE INTEGRATION
 * ============================================================================
 * Step-by-step example demonstrating the complete checkout flow with Delhivery:
 * 
 * Flow:
 * 1. Customer enters pincode on checkout/cart page -> checkServiceability(pincode)
 * 2. System calculates shipping rate -> calculateShippingCost(...)
 * 3. Customer places order (COD or online via Razorpay) -> save order in DB
 * 4. Create shipment with Delhivery -> createShipment(order)
 * 5. Waybill (AWB) is generated & saved in DB against the order
 * 6. Admin downloads shipping label (packing slip PDF) -> getShippingLabel(waybill)
 * 7. Background tracking & status updates -> trackShipment(waybill)
 * ============================================================================
 */

import Order from "../models/order.model.js";
import {
  checkServiceability,
  calculateShippingCost,
  createShipment,
  getShippingLabel,
  trackShipment,
} from "../services/delhivery.service.js";

/**
 * Step 1: Customer Pincode Validation
 * Called from frontend when user enters shipping address pincode
 */
export async function handlePincodeCheck(pincode, paymentMethod = "cod") {
  const serviceCheck = await checkServiceability(pincode);

  if (!serviceCheck.success || !serviceCheck.data?.serviceable) {
    throw new Error(`Pincode ${pincode} is not serviceable for delivery.`);
  }

  // If customer selected COD, verify COD availability for this pincode
  if (paymentMethod.toLowerCase() === "cod" && !serviceCheck.data.codAvailable) {
    throw new Error(
      `Cash on Delivery (COD) is not available for pincode ${pincode}. Please select Online Payment.`
    );
  }

  return {
    serviceable: true,
    codAvailable: serviceCheck.data.codAvailable,
    prepaidAvailable: serviceCheck.data.prepaidAvailable,
    city: serviceCheck.data.city,
    state: serviceCheck.data.state,
  };
}

/**
 * Step 2: Shipping Cost Calculation
 * Called when calculating order summary / checkout price breakdown
 */
export async function handleCalculateShipping({
  destPincode,
  cartItems,
  paymentMethod,
  orderSubtotal,
}) {
  // Estimate total weight (e.g. 500g per item if not specified)
  const totalWeight = cartItems.reduce((acc, item) => {
    const itemWeight = item.weight || (item.name?.toLowerCase().includes("1kg") ? 1000 : 500);
    return acc + itemWeight * (item.count || 1);
  }, 0);

  const costResult = await calculateShippingCost({
    destPincode,
    weight: Math.max(totalWeight, 500),
    mode: "Surface",
    paymentType: paymentMethod === "cod" ? "COD" : "Prepaid",
    orderAmount: orderSubtotal,
  });

  if (!costResult.success) {
    // Fallback default flat shipping if rate calculation fails
    return {
      shippingCharge: 60,
      codCharge: paymentMethod === "cod" ? 40 : 0,
      totalShippingCost: paymentMethod === "cod" ? 100 : 60,
    };
  }

  return costResult.data;
}

/**
 * Step 3, 4 & 5: Order Placement -> Create Shipment -> Store Waybill
 * Can be executed immediately on COD order placement, or on Razorpay payment verification,
 * or triggered by the Admin when clicking "Fulfill / Ship with Delhivery"
 */
export async function handlePlaceOrderAndShip({
  userId,
  customer,
  items,
  subtotal,
  shippingCost,
  discountAmount,
  total,
  paymentMethod,
  autoShip = true, // Whether to generate AWB immediately or wait for admin confirmation
}) {
  // 1. Validate pincode
  const serviceCheck = await handlePincodeCheck(customer.pincode, paymentMethod);
  console.log(`[Checkout] Pincode ${customer.pincode} verified:`, serviceCheck);

  // 2. Generate unique order ID
  const orderId = `DF-${Date.now().toString().slice(-6)}`;

  // 3. Create initial Order in MongoDB
  const newOrder = await Order.create({
    userId,
    orderId,
    customer,
    items,
    subtotal,
    shippingCost,
    discountAmount,
    total,
    paymentMethod,
    paymentStatus: paymentMethod === "cod" ? "Pending" : "Paid",
    status: autoShip ? "Processing" : "Order Sent to Admin",
  });

  console.log(`[Checkout] Order ${orderId} saved to database.`);

  // 4. Create Shipment in Delhivery & assign Waybill
  if (autoShip) {
    const shipmentResult = await createShipment({
      orderId: newOrder.orderId,
      customer: newOrder.customer,
      items: newOrder.items,
      totalAmount: newOrder.total,
      paymentMethod: newOrder.paymentMethod,
      weight: items.length * 500, // estimated or actual weight in grams
      dimensions: { length: 20, width: 15, height: 10 },
      shippingMode: "Surface",
    });

    if (shipmentResult.success && shipmentResult.data?.waybill) {
      const waybill = shipmentResult.data.waybill;
      console.log(`[Checkout] Waybill ${waybill} successfully generated and linked to Order ${orderId}`);

      // The createShipment service automatically updates the Order in MongoDB,
      // but you can also retrieve the refreshed order document:
      const updatedOrder = await Order.findOne({ orderId });
      return {
        order: updatedOrder,
        waybill,
        shipmentStatus: "Manifested",
      };
    } else {
      console.error(`[Checkout] Warning: Delhivery shipment creation failed:`, shipmentResult.error);
      // Order is still placed; admin can fulfill manually later from Admin Panel
      return {
        order: newOrder,
        waybill: null,
        error: shipmentResult.error,
      };
    }
  }

  return { order: newOrder };
}

/**
 * Step 6: Admin Fulfillment - Generate Printable PDF Shipping Label
 */
export async function handleDownloadLabel(waybill) {
  const labelResult = await getShippingLabel(waybill);
  if (!labelResult.success) {
    throw new Error(`Failed to generate label: ${labelResult.error}`);
  }
  return labelResult.data; // contains pdfBuffer or downloadUrl
}

/**
 * Step 7: Track Shipment
 */
export async function handleTrackOrder(waybill) {
  const trackResult = await trackShipment(waybill);
  if (!trackResult.success) {
    throw new Error(`Failed to track shipment: ${trackResult.error}`);
  }
  return trackResult.data; // contains status, scans, expectedDeliveryDate
}
