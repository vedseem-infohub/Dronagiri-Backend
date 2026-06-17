import express from "express";
import isAuth from "../middlewares/isAuth.js";
import {
  addToCart,
  clearCart,
  getCart,
  removeFromCart,
  updateCartItem,
} from "../controllers/cart.controllers.js";

const cartRouter = express.Router();

cartRouter.get("/", isAuth, getCart);
cartRouter.post("/add", isAuth, addToCart);
cartRouter.put("/update", isAuth, updateCartItem);
cartRouter.delete("/remove", isAuth, removeFromCart);
cartRouter.delete("/clear", isAuth, clearCart);

export default cartRouter;