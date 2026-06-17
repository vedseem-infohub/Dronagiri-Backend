import mongoose from "mongoose";

const productVariantSchema = new mongoose.Schema(
  {
    size: {
      type: String,
      required: true,
    },
    quantity: {
      type: String,
      required: true,
    },
    price: {
      type: Number,
      required: true,
    },
  },
  { _id: false }
);

const productSchema = new mongoose.Schema(
  {
    id: {
      type: Number,
      required: true,
      unique: true,
    },
    name: {
      type: String,
      required: true,
    },
    nameHindi: {
      type: String,
      default: "",
    },
    category: {
      type: String,
      required: true,
    },
    description: {
      type: String,
      required: true,
    },
    variants: [productVariantSchema],
    stock: {
      type: Number,
      required: true,
      default: 0,
    },
    active: {
      type: Boolean,
      required: true,
      default: true,
    },
    sold: {
      type: Number,
      required: true,
      default: 0,
    },
    imageUrl: {
      type: String,
      default: "",
    },
    imageUrl2: {
      type: String,
      default: "",
    },
  },
  {
    timestamps: true,
  }
);

const Product = mongoose.model("Product", productSchema);
export default Product;
