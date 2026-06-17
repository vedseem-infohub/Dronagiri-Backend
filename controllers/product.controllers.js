import Product from "../models/product.model.js";
import uploadOnCloudinary from "../config/cloudinary.js";

// Helper to check if string is base64 image
const isBase64Image = (str) => {
  return typeof str === "string" && str.startsWith("data:image/");
};

export const getProducts = async (req, res) => {
  try {
    const { category, includeInactive } = req.query;
    
    let filter = {};
    if (category && category !== "All") {
      filter.category = category;
    }
    
    // By default, only show active products to customers
    if (includeInactive !== "true") {
      filter.active = true;
    }

    const products = await Product.find(filter).sort({ createdAt: -1 });
    return res.status(200).json(products);
  } catch (error) {
    return res.status(500).json({ message: `Get products error: ${error.message}` });
  }
};

export const getProductById = async (req, res) => {
  try {
    const { id } = req.params;
    const product = await Product.findOne({ id: Number(id) });
    if (!product) {
      return res.status(404).json({ message: "Product not found" });
    }
    return res.status(200).json(product);
  } catch (error) {
    return res.status(500).json({ message: `Get product error: ${error.message}` });
  }
};

export const createProduct = async (req, res) => {
  try {
    const {
      name,
      nameHindi,
      category,
      description,
      variants,
      stock,
      active,
      imageUrl,
      imageUrl2,
    } = req.body;

    if (!name || !category || !description) {
      return res.status(400).json({ message: "Name, category, and description are required" });
    }

    // Auto-increment numeric ID
    const lastProduct = await Product.findOne().sort({ id: -1 });
    const nextId = lastProduct ? lastProduct.id + 1 : 1;

    // Handle Cloudinary Image uploads for base64 source
    let finalImageUrl = "";
    if (imageUrl) {
      if (isBase64Image(imageUrl)) {
        finalImageUrl = await uploadOnCloudinary(imageUrl);
      } else {
        finalImageUrl = imageUrl;
      }
    }

    let finalImageUrl2 = "";
    if (imageUrl2) {
      if (isBase64Image(imageUrl2)) {
        finalImageUrl2 = await uploadOnCloudinary(imageUrl2);
      } else {
        finalImageUrl2 = imageUrl2;
      }
    }

    // Normalize variants (ensure both size & quantity are populated)
    const normalizedVariants = (variants || []).map((v) => {
      const qtyVal = v.quantity || v.size || "";
      return {
        size: qtyVal,
        quantity: qtyVal,
        price: Number(v.price) || 0,
      };
    });

    const product = await Product.create({
      id: nextId,
      name,
      nameHindi: nameHindi || "",
      category,
      description,
      variants: normalizedVariants,
      stock: Number(stock) || 0,
      active: active !== undefined ? active : true,
      imageUrl: finalImageUrl,
      imageUrl2: finalImageUrl2,
      sold: 0,
    });

    return res.status(201).json(product);
  } catch (error) {
    console.error("Create product error:", error);
    return res.status(500).json({ message: `Create product error: ${error.message}` });
  }
};

export const updateProduct = async (req, res) => {
  try {
    const { id } = req.params;
    const {
      name,
      nameHindi,
      category,
      description,
      variants,
      stock,
      active,
      imageUrl,
      imageUrl2,
    } = req.body;

    const product = await Product.findOne({ id: Number(id) });
    if (!product) {
      return res.status(404).json({ message: "Product not found" });
    }

    // Handle Cloudinary Image updates
    let finalImageUrl = product.imageUrl;
    if (imageUrl !== undefined) {
      if (isBase64Image(imageUrl)) {
        finalImageUrl = await uploadOnCloudinary(imageUrl);
      } else {
        finalImageUrl = imageUrl; // can be empty string or existing url
      }
    }

    let finalImageUrl2 = product.imageUrl2;
    if (imageUrl2 !== undefined) {
      if (isBase64Image(imageUrl2)) {
        finalImageUrl2 = await uploadOnCloudinary(imageUrl2);
      } else {
        finalImageUrl2 = imageUrl2;
      }
    }

    // Normalize variants if provided
    let normalizedVariants = product.variants;
    if (variants !== undefined) {
      normalizedVariants = (variants || []).map((v) => {
        const qtyVal = v.quantity || v.size || "";
        return {
          size: qtyVal,
          quantity: qtyVal,
          price: Number(v.price) || 0,
        };
      });
    }

    product.name = name !== undefined ? name : product.name;
    product.nameHindi = nameHindi !== undefined ? nameHindi : product.nameHindi;
    product.category = category !== undefined ? category : product.category;
    product.description = description !== undefined ? description : product.description;
    product.variants = normalizedVariants;
    product.stock = stock !== undefined ? Number(stock) : product.stock;
    product.active = active !== undefined ? active : product.active;
    product.imageUrl = finalImageUrl;
    product.imageUrl2 = finalImageUrl2;

    await product.save();

    return res.status(200).json(product);
  } catch (error) {
    console.error("Update product error:", error);
    return res.status(500).json({ message: `Update product error: ${error.message}` });
  }
};

export const deleteProduct = async (req, res) => {
  try {
    const { id } = req.params;
    const product = await Product.findOneAndDelete({ id: Number(id) });
    if (!product) {
      return res.status(404).json({ message: "Product not found" });
    }
    return res.status(200).json({ message: "Product deleted successfully" });
  } catch (error) {
    return res.status(500).json({ message: `Delete product error: ${error.message}` });
  }
};
