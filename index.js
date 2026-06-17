import express from "express"
import dotenv from "dotenv"
dotenv.config()
import connectDb from "./config/db.js"
import authRouter from "./routes/auth.routes.js"
import userRouter from "./routes/user.routes.js"
import cartRouter from "./routes/cart.routes.js";
import orderRouter from "./routes/order.routes.js";
import productRouter from "./routes/product.routes.js";
import adminRouter from "./routes/admin.routes.js";
import cors from "cors"
import cookieParser from "cookie-parser"

const app=express()
app.use(cors({
    origin: ["http://localhost:3000", "http://localhost:3001"], // Allow both client and admin ports if separate
    credentials:true
}))

const port=process.env.PORT || 5000
app.use(express.json({ limit: "10mb" }))
app.use(cookieParser())
app.use("/api/auth", authRouter)
app.use("/api/user", userRouter)
app.use("/api/cart", cartRouter);
app.use("/api/orders", orderRouter);
app.use("/api/products", productRouter);
app.use("/api/admins", adminRouter);

app.listen(port,()=>{
    connectDb()
    console.log("server started")
})