import Order from "../models/order.model.js";
import Cart from "../models/cart.model.js";
import Product from "../models/product.model.js";
import Shipment from "../models/shipment.model.js";
import Coupon from "../models/coupon.model.js";
import delhiveryService from "../services/delhivery.service.js";
import invoiceService from "../services/invoice.service.js";

/**
 * Create COD or Offline Order
 */
export const createOrder = async (req, res) => {
  try {
    const userId = req.userId;
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
    } = req.body;

    if (!customer || !customer.name || !customer.phone || !customer.address) {
      return res.status(400).json({ message: "Customer name, phone, and delivery address are required." });
    }

    if (!items || items.length === 0) {
      return res.status(400).json({ message: "Order must contain at least one item." });
    }

    if (subtotal === undefined || total === undefined) {
      return res.status(400).json({ message: "Order subtotal and total are required." });
    }

    // Generate custom orderId if not provided by the client
    const orderId = req.body.orderId || "DF-" + Math.floor(100000 + Math.random() * 900000);

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
      paymentMethod: paymentMethod || "cod",
      status: "Order Sent to Admin",
      internalStatus: "ORDER_CREATED",
      source: source || "admin",
    });

    // Increment coupon usage count if coupon applied
    if (promoCode) {
      try {
        await Coupon.findOneAndUpdate(
          { code: promoCode.trim().toUpperCase() },
          { $inc: { usedCount: 1 } }
        );
      } catch (couponErr) {
        console.warn("Could not increment coupon usage:", couponErr.message);
      }
    }

    // Clear the cart on backend after order is created successfully
    if (userId) {
      await Cart.findOneAndUpdate({ userId }, { items: [] });
    }

    // Reduce stock
    if (items && items.length > 0) {
      for (const item of items) {
        await Product.findOneAndUpdate(
          { id: item.productId },
          { $inc: { stock: -item.count, sold: item.count } }
        );
      }
    }

    // Auto-manifest Delhivery shipment & Waybill (AWB)
    try {
      const shipResult = await delhiveryService.createShipment({
        orderId,
        customer,
        items,
        total,
        paymentMethod: paymentMethod || "cod",
        weight: (items || []).reduce((sum, i) => sum + (Number(i.count) || 1) * 500, 0),
        _id: newOrder._id,
      });

      if (shipResult.success && shipResult.data?.waybill) {
        const refreshedOrder = await Order.findById(newOrder._id);
        return res.status(201).json(refreshedOrder || newOrder);
      }
    } catch (shipErr) {
      console.warn("[Delhivery Checkout] Auto shipment creation note:", shipErr.message);
    }

    return res.status(201).json(newOrder);
  } catch (error) {
    console.error("Create order error:", error);
    return res.status(500).json({ message: `Create order error: ${error.message}` });
  }
};

/**
 * Get Orders for Logged-In User
 */
export const getOrders = async (req, res) => {
  try {
    const userId = req.userId;
    const orders = await Order.find({ userId }).sort({ createdAt: -1 });
    return res.status(200).json(orders);
  } catch (error) {
    console.error("Get orders error:", error);
    return res.status(500).json({ message: `Get orders error: ${error.message}` });
  }
};

/**
 * Get All Orders (Admin)
 */
export const getAllOrders = async (req, res) => {
  try {
    const orders = await Order.find({}).sort({ createdAt: -1 });
    return res.status(200).json(orders);
  } catch (error) {
    console.error("Get all orders error:", error);
    return res.status(500).json({ message: `Get all orders error: ${error.message}` });
  }
};

/**
 * Get Single Order Details by ID (with Shipment & Tracking timeline)
 */
export const getOrderById = async (req, res) => {
  try {
    const { orderId } = req.params;
    const order = await Order.findOne({
      $or: [{ orderId }, { _id: mongoose.Types.ObjectId.isValid(orderId) ? orderId : null }],
    });

    if (!order) {
      return res.status(404).json({ message: "Order not found" });
    }

    // Attach shipment & tracking if present
    const shipment = await Shipment.findOne({ orderId: order.orderId });

    return res.status(200).json({
      ...order.toObject(),
      shipmentDetails: shipment || null,
    });
  } catch (error) {
    console.error("Get order by ID error:", error);
    return res.status(500).json({ message: `Get order error: ${error.message}` });
  }
};

/**
 * Update Order Status (Admin)
 */
export const updateOrderStatus = async (req, res) => {
  try {
    const { orderId } = req.params;
    const { status } = req.body;

    const order = await Order.findOneAndUpdate(
      { orderId },
      { status },
      { new: true }
    );

    if (!order) {
      return res.status(404).json({ message: "Order not found" });
    }

    return res.status(200).json(order);
  } catch (error) {
    console.error("Update order status error:", error);
    return res.status(500).json({ message: `Update order status error: ${error.message}` });
  }
};

/**
 * Download or View Professional Tax Invoice (PDF / JSON)
 * GET /api/orders/:orderId/invoice
 */
export const getOrderInvoice = async (req, res) => {
  try {
    const { orderId } = req.params;
    const format = req.query.format; // 'json' or 'pdf' (default)

    const invoice = await invoiceService.getOrCreateInvoice(orderId);

    if (format === "json") {
      return res.status(200).json({
        success: true,
        data: invoice,
      });
    }

    // Generate pure-JS PDF stream
    const pdfBuffer = await invoiceService.generateInvoicePDF(invoice);

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="Invoice-${invoice.invoiceNumber.replace(/\//g, "-")}.pdf"`
    );
    return res.send(pdfBuffer);
  } catch (error) {
    console.error("Get order invoice error:", error);
    return res.status(500).json({
      success: false,
      message: `Failed to generate tax invoice: ${error.message}`,
    });
  }
};

export default {
  createOrder,
  getOrders,
  getAllOrders,
  getOrderById,
  updateOrderStatus,
  getOrderInvoice,
};
