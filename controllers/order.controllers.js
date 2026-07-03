import Order from "../models/order.model.js";
import Cart from "../models/cart.model.js";
import Product from "../models/product.model.js";

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
      source: source || "admin",
    });

    // Clear the cart on backend after order is created successfully
    await Cart.findOneAndUpdate({ userId }, { items: [] });

    // Reduce stock
    if (items && items.length > 0) {
      for (const item of items) {
        await Product.findOneAndUpdate(
          { id: item.productId },
          { $inc: { stock: -item.count, sold: item.count } }
        );
      }
    }

    return res.status(201).json(newOrder);
  } catch (error) {
    console.error("Create order error:", error);
    return res.status(500).json({ message: `Create order error: ${error.message}` });
  }
};

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

export const getAllOrders = async (req, res) => {
  try {
    const orders = await Order.find({}).sort({ createdAt: -1 });
    return res.status(200).json(orders);
  } catch (error) {
    console.error("Get all orders error:", error);
    return res.status(500).json({ message: `Get all orders error: ${error.message}` });
  }
};

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
