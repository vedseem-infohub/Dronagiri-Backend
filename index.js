import "dotenv/config";
import express from "express";
import connectDb from "./config/db.js";
import authRouter from "./routes/auth.routes.js"
import userRouter from "./routes/user.routes.js"
import cartRouter from "./routes/cart.routes.js";
import orderRouter from "./routes/order.routes.js";
import productRouter from "./routes/product.routes.js";
import categoryRouter from "./routes/category.routes.js";
import adminRouter from "./routes/admin.routes.js";
import paymentRouter from "./routes/payment.routes.js";
import shippingRouter from "./routes/shipping.js";
import settingsRouter from "./routes/settings.routes.js";
import couponRouter from "./routes/coupon.routes.js";
import { startTrackingCron } from "./jobs/trackingCron.js";
import { validateEnv } from "./config/env.js";
import cors from "cors";
import cookieParser from "cookie-parser";

const app = express();
app.set("trust proxy", 1);
const allowedOrigins = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(",").map(o => o.trim().replace(/^["']|["']$/g, ""))
  : ["http://localhost:3000", "http://localhost:3001", "https://dronagirifarms.co.in", "https://admin.dronagirifarms.co.in", "https://q908csxv-3001.inc1.devtunnels.ms", "https://q908csxv-3000.inc1.devtunnels.ms"];

app.use(cors({
  origin: allowedOrigins,
  credentials: true
}))

const port = process.env.PORT || 5000
app.use(express.json({ limit: "10mb" }))
app.use(cookieParser())
app.use("/api/auth", authRouter)
app.use("/api/user", userRouter)
app.use("/api/cart", cartRouter);
app.use("/api/orders", orderRouter);
app.use("/api/products", productRouter);
app.use("/api/categories", categoryRouter);
app.use("/api/admins", adminRouter);
app.use("/api/payments", paymentRouter);
app.use("/api/shipping", shippingRouter);
app.use("/api/settings", settingsRouter);
app.use("/api/coupons", couponRouter);

// Centralized error handler (catches malformed JSON syntax errors)
app.use((err, req, res, next) => {
  if (err instanceof SyntaxError && err.status === 400 && "body" in err) {
    return res.status(400).json({ success: false, error: "Malformed JSON payload in request." });
  }
  return res.status(err.status || 500).json({ success: false, error: err.message || "Internal server error" });
});

app.listen(port, () => {
  validateEnv();
  connectDb();
  startTrackingCron();
  console.log(`Server started on port ${port}`);
});
