import express from "express";
import {
  getProducts,
  getProductById,
  createProduct,
  updateProduct,
  deleteProduct,
} from "../controllers/product.controllers.js";
import isAdmin from "../middlewares/isAdmin.js";

const productRouter = express.Router();

productRouter.get("/", getProducts);
productRouter.get("/:id", getProductById);
productRouter.post("/", isAdmin, createProduct);
productRouter.put("/:id", isAdmin, updateProduct);
productRouter.delete("/:id", isAdmin, deleteProduct);

export default productRouter;
