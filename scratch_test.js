import mongoose from "mongoose";
import dotenv from "dotenv";
import Cart from "./models/cart.model.js";
import User from "./models/user.model.js";

dotenv.config();

async function runTest() {
  try {
    console.log("Connecting to DB...");
    await mongoose.connect(process.env.MONGODB_URL);
    console.log("DB Connected.");

    // Find any user
    const user = await User.findOne();
    if (!user) {
      console.log("No user found in DB. Please sign up a user first.");
      mongoose.disconnect();
      return;
    }
    console.log(`Using User ID: ${user._id} (${user.email})`);

    // Try to run addToCart logic manually
    const userId = user._id;
    const productId = 1;
    const name = "Haldi Powder";
    const price = 450;
    const quantity = "500g";
    const count = 1;

    let cart = await Cart.findOne({ userId });
    if (!cart) {
      console.log("Creating new cart for user...");
      cart = await Cart.create({ userId, items: [] });
    }
    console.log("Cart found:", cart);

    const existingItem = cart.items.find(
      (item) => item.productId === productId && item.quantity === quantity
    );

    if (existingItem) {
      console.log("Existing item found in cart, incrementing count...");
      existingItem.count += count;
    } else {
      console.log("Item not in cart, pushing new item...");
      cart.items.push({
        productId,
        name,
        price,
        quantity,
        count,
      });
    }

    console.log("Saving cart...");
    const saved = await cart.save();
    console.log("Cart saved successfully!", saved);

  } catch (error) {
    console.error("TEST FAILED WITH ERROR:", error);
  } finally {
    mongoose.disconnect();
  }
}

runTest();
