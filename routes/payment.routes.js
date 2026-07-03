import express from "express";
import isAuth from "../middlewares/isAuth.js";
import { createRazorpayOrder, verifyPayment, webhookHandler } from "../controllers/payment.controllers.js";

const paymentRouter = express.Router();

paymentRouter.post("/create-order", isAuth, createRazorpayOrder);
paymentRouter.post("/verify", isAuth, verifyPayment);
paymentRouter.post("/webhook", webhookHandler); // No isAuth middleware for webhook, Razorpay hits this directly

export default paymentRouter;
