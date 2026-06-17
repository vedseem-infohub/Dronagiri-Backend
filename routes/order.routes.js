import express from "express";
import isAuth from "../middlewares/isAuth.js";
import isAdmin from "../middlewares/isAdmin.js";
import { createOrder, getOrders, getAllOrders, updateOrderStatus } from "../controllers/order.controllers.js";

const orderRouter = express.Router();

orderRouter.post("/", isAuth, createOrder);
orderRouter.get("/", isAuth, getOrders);
orderRouter.get("/all", isAdmin, getAllOrders);
orderRouter.put("/:orderId/status", isAdmin, updateOrderStatus);

export default orderRouter;
