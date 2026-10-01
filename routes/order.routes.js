import express from "express";
import isAuth from "../middlewares/isAuth.js";
import isAdmin from "../middlewares/isAdmin.js";
import {
  createOrder,
  getOrders,
  getAllOrders,
  getOrderById,
  updateOrderStatus,
  getOrderInvoice,
} from "../controllers/order.controllers.js";

const orderRouter = express.Router();

orderRouter.post("/", isAuth, createOrder);
orderRouter.post("/cod", isAuth, createOrder);
orderRouter.get("/", isAuth, getOrders);
orderRouter.get("/all", isAdmin, getAllOrders);
orderRouter.get("/:orderId/invoice", getOrderInvoice);
orderRouter.get("/:orderId", getOrderById);
orderRouter.put("/:orderId/status", isAdmin, updateOrderStatus);

export default orderRouter;
