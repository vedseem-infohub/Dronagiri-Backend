import mongoose from "mongoose";

const invoiceSequenceSchema = new mongoose.Schema(
  {
    fiscalYear: {
      type: String,
      required: true,
      unique: true,
    },
    lastSequence: {
      type: Number,
      default: 0,
    },
  },
  { timestamps: true }
);

export const InvoiceSequence = mongoose.model(
  "InvoiceSequence",
  invoiceSequenceSchema
);

const invoiceItemSchema = new mongoose.Schema(
  {
    productId: {
      type: String,
      default: "",
    },
    sku: {
      type: String,
      default: "",
    },
    name: {
      type: String,
      required: true,
    },
    variant: {
      type: String,
      default: "Standard",
    },
    count: {
      type: Number,
      required: true,
      min: 1,
    },
    unitPrice: {
      type: Number,
      required: true,
    },
    discount: {
      type: Number,
      default: 0,
    },
    taxableValue: {
      type: Number,
      required: true,
    },
    hsn: {
      type: String,
      default: "04090000",
    },
    gstRate: {
      type: Number,
      default: 5, // percentage
    },
    cgstAmount: {
      type: Number,
      default: 0,
    },
    sgstAmount: {
      type: Number,
      default: 0,
    },
    igstAmount: {
      type: Number,
      default: 0,
    },
    total: {
      type: Number,
      required: true,
    },
  },
  { _id: false }
);

const invoiceSchema = new mongoose.Schema(
  {
    invoiceNumber: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    fiscalYear: {
      type: String,
      required: true,
      index: true,
    },
    sequenceNumber: {
      type: Number,
      required: true,
    },
    orderId: {
      type: String,
      required: true,
      index: true,
    },
    orderRef: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Order",
      index: true,
    },
    invoiceDate: {
      type: Date,
      default: Date.now,
    },
    seller: {
      name: { type: String, required: true },
      address: { type: String, required: true },
      state: { type: String, required: true },
      stateCode: { type: String, default: "09" },
      gstin: { type: String, default: "" },
      phone: { type: String, default: "" },
      email: { type: String, default: "" },
    },
    customer: {
      name: { type: String, required: true },
      phone: { type: String, required: true },
      email: { type: String, default: "" },
      billingAddress: { type: String, required: true },
      shippingAddress: { type: String, required: true },
      state: { type: String, default: "" },
      pincode: { type: String, default: "" },
    },
    items: [invoiceItemSchema],
    subtotal: {
      type: Number,
      required: true,
    },
    discountTotal: {
      type: Number,
      default: 0,
    },
    taxableTotal: {
      type: Number,
      required: true,
    },
    cgstTotal: {
      type: Number,
      default: 0,
    },
    sgstTotal: {
      type: Number,
      default: 0,
    },
    igstTotal: {
      type: Number,
      default: 0,
    },
    shippingCharge: {
      type: Number,
      default: 0,
    },
    otherCharges: {
      type: Number,
      default: 0,
    },
    grandTotal: {
      type: Number,
      required: true,
    },
    amountPaid: {
      type: Number,
      default: 0,
    },
    balanceDue: {
      type: Number,
      default: 0,
    },
    paymentMethod: {
      type: String,
      default: "COD",
    },
    paymentStatus: {
      type: String,
      default: "Pending",
    },
    paymentId: {
      type: String,
      default: "",
    },
    awbNumber: {
      type: String,
      default: "",
    },
    carrier: {
      type: String,
      default: "Delhivery",
    },
    isInterstate: {
      type: Boolean,
      default: false,
    },
    terms: {
      type: String,
      default:
        "Goods once sold cannot be returned unless damaged in transit. All disputes are subject to Jhansi/Orchha jurisdiction.",
    },
  },
  {
    timestamps: true,
  }
);

invoiceSchema.index({ orderId: 1, invoiceNumber: 1 });

const Invoice = mongoose.model("Invoice", invoiceSchema);
export default Invoice;
