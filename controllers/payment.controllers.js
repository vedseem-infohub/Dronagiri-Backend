import Razorpay from "razorpay";
import crypto from "crypto";
import Order from "../models/order.model.js";
import Cart from "../models/cart.model.js";
import Product from "../models/product.model.js";

// Utility to reduce stock
const reduceStock = async (items) => {
  for (const item of items) {
    await Product.findOneAndUpdate(
      { id: item.productId },
      { $inc: { stock: -item.count, sold: item.count } }
    );
  }
};

export const createRazorpayOrder = async (req, res) => {
  try {
    const { amount } = req.body;

    if (!amount) {
      return res.status(400).json({ message: "Amount is required" });
    }

    const instance = new Razorpay({
      key_id: process.env.RAZORPAY_KEY_ID,
      key_secret: process.env.RAZORPAY_KEY_SECRET,
    });

    const options = {
      amount: Math.round(amount * 100), // amount in the smallest currency unit (paise)
      currency: "INR",
      receipt: "receipt_order_" + Date.now(),
    };

    const order = await instance.orders.create(options);

    if (!order) {
      return res.status(500).json({ message: "Failed to create Razorpay order" });
    }

    res.status(200).json({
      orderId: order.id,
      amount: order.amount,
      currency: order.currency,
      keyId: process.env.RAZORPAY_KEY_ID,
    });
  } catch (error) {
    console.error("Create Razorpay Order error:", error);
    res.status(500).json({ message: `Razorpay error: ${error.message}` });
  }
};

export const verifyPayment = async (req, res) => {
  try {
    const userId = req.userId;
    const {
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature,
      orderDetails, // This contains the same data as what was sent for COD order
    } = req.body;

    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
      return res.status(400).json({ message: "Payment details missing" });
    }

    const sign = razorpay_order_id + "|" + razorpay_payment_id;
    const expectedSign = crypto
      .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
      .update(sign.toString())
      .digest("hex");

    if (razorpay_signature !== expectedSign) {
      return res.status(400).json({ message: "Invalid payment signature!" });
    }

    // Payment is valid, now create the order
    const {
      customer,
      items,
      subtotal,
      discountAmount,
      promoCode,
      shippingCost,
      total,
      paymentMethod,
      source,
    } = orderDetails;

    // Generate custom orderId if not provided by the client
    const orderId = orderDetails.orderId || "DF-" + Math.floor(100000 + Math.random() * 900000);

    const newOrder = await Order.create({
      userId,
      orderId,
      customer,
      items,
      subtotal,
      discountAmount: discountAmount || 0,
      promoCode: promoCode || "",
      shippingCost: shippingCost || 0,
      total,
      paymentMethod: paymentMethod || "online",
      paymentStatus: "Paid",
      razorpayOrderId: razorpay_order_id,
      razorpayPaymentId: razorpay_payment_id,
      razorpaySignature: razorpay_signature,
      status: "Order Sent to Admin",
      source: source || "admin",
    });

    // Reduce stock
    if (items && items.length > 0) {
      await reduceStock(items);
    }

    // Clear the cart on backend after order is created successfully
    await Cart.findOneAndUpdate({ userId }, { items: [] });

    return res.status(201).json({ message: "Payment verified successfully", order: newOrder });
  } catch (error) {
    console.error("Verify Payment error:", error);
    return res.status(500).json({ message: `Verify Payment error: ${error.message}` });
  }
};

export const webhookHandler = async (req, res) => {
  try {
    const secret = process.env.RAZORPAY_WEBHOOK_SECRET;
    
    // Express raw body is needed to compute signature properly, but Razorpay webhooks 
    // work with raw body string or we can use the library's utility
    const signature = req.headers["x-razorpay-signature"];
    
    // We expect express.json() was used. We can stringify req.body or better, if the webhook 
    // verifies properly using crypto HMAC on JSON stringified body (might have ordering issues).
    // For safety, Razorpay utility:
    const isValid = Razorpay.validateWebhookSignature(
      JSON.stringify(req.body),
      signature,
      secret
    );

    if (isValid) {
      const event = req.body.event;
      if (event === "payment.captured") {
        const payment = req.body.payload.payment.entity;
        const razorpay_order_id = payment.order_id;
        
        // Update order status if needed. 
        // Note: We already mark as 'Paid' in verifyPayment. This webhook acts as a fallback.
        await Order.findOneAndUpdate(
          { razorpayOrderId: razorpay_order_id },
          { paymentStatus: "Paid" }
        );
      } else if (event === "payment.failed") {
        const payment = req.body.payload.payment.entity;
        const razorpay_order_id = payment.order_id;

        await Order.findOneAndUpdate(
          { razorpayOrderId: razorpay_order_id },
          { paymentStatus: "Failed" }
        );
      }
      res.status(200).json({ status: "ok" });
    } else {
      res.status(400).json({ status: "invalid signature" });
    }
  } catch (error) {
    console.error("Webhook error:", error);
    res.status(500).json({ message: "Webhook error" });
  }
};
