import Cart from "../models/cart.model.js";

export const getCart = async (req, res) => {
  try {
    const userId = req.userId;

    let cart = await Cart.findOne({ userId });

    if (!cart) {
      cart = await Cart.create({ userId, items: [] });
    }

    return res.status(200).json(cart);
  } catch (error) {
    return res.status(500).json({ message: `Get cart error ${error}` });
  }
};

export const addToCart = async (req, res) => {
  try {
    const userId = req.userId;
    const { productId, name, price, quantity, imageUrl, count = 1 } = req.body;

    if (!productId || !name || !price || !quantity) {
      return res.status(400).json({ message: "Missing cart item data" });
    }

    let cart = await Cart.findOne({ userId });

    if (!cart) {
      cart = await Cart.create({ userId, items: [] });
    }

    const existingItem = cart.items.find(
      (item) => item.productId === productId && item.quantity === quantity
    );

    if (existingItem) {
      existingItem.count += count;
      if (imageUrl) {
        existingItem.imageUrl = imageUrl;
      }
    } else {
      cart.items.push({
        productId,
        name,
        price,
        quantity,
        imageUrl: imageUrl || "",
        count,
      });
    }

    await cart.save();

    return res.status(200).json(cart);
  } catch (error) {
    return res.status(500).json({ message: `Add to cart error ${error}` });
  }
};

export const updateCartItem = async (req, res) => {
  try {
    const userId = req.userId;
    const { productId, quantity, count } = req.body;

    if (!productId || !quantity) {
      return res.status(400).json({ message: "Missing product or quantity identifier" });
    }

    const cart = await Cart.findOne({ userId });

    if (!cart) {
      return res.status(404).json({ message: "Cart not found" });
    }

    if (count <= 0) {
      cart.items = cart.items.filter(
        (item) => !(item.productId === productId && item.quantity === quantity)
      );
    } else {
      const item = cart.items.find(
        (item) => item.productId === productId && item.quantity === quantity
      );

      if (!item) {
        return res.status(404).json({ message: "Cart item not found" });
      }

      item.count = count;
    }

    await cart.save();

    return res.status(200).json(cart);
  } catch (error) {
    return res.status(500).json({ message: `Update cart error ${error}` });
  }
};

export const removeFromCart = async (req, res) => {
  try {
    const userId = req.userId;
    const { productId, quantity } = req.body;

    if (!productId || !quantity) {
      return res.status(400).json({ message: "Missing product or quantity identifier" });
    }

    const cart = await Cart.findOne({ userId });

    if (!cart) {
      return res.status(404).json({ message: "Cart not found" });
    }

    cart.items = cart.items.filter(
      (item) => !(item.productId === productId && item.quantity === quantity)
    );

    await cart.save();

    return res.status(200).json(cart);
  } catch (error) {
    return res.status(500).json({ message: `Remove cart item error ${error}` });
  }
};

export const clearCart = async (req, res) => {
  try {
    const userId = req.userId;

    const cart = await Cart.findOneAndUpdate(
      { userId },
      { items: [] },
      { new: true, upsert: true }
    );

    return res.status(200).json(cart);
  } catch (error) {
    return res.status(500).json({ message: `Clear cart error ${error}` });
  }
};