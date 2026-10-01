import mongoose from "mongoose";

const orderItemSchema = new mongoose.Schema(
  {
    productId: {
      type: Number,
      required: true,
    },
    name: {
      type: String,
      required: true,
    },
    price: {
      type: Number,
      required: true,
    },
    quantity: {
      type: String,
      required: true,
    },
    count: {
      type: Number,
      required: true,
      min: 1,
    },
    imageUrl: {
      type: String,
      default: "",
    },
  },
  { _id: false }
);

const orderSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    orderId: {
      type: String,
      required: true,
      unique: true,
    },
    customer: {
      name: {
        type: String,
        required: true,
      },
      phone: {
        type: String,
        required: true,
      },
      email: {
        type: String,
        default: "",
      },
      address: {
        type: String,
        required: true,
      },
      pincode: {
        type: String,
        default: "",
      },
    },
    items: [orderItemSchema],
    subtotal: {
      type: Number,
      required: true,
    },
    discountAmount: {
      type: Number,
      default: 0,
    },
    promoCode: {
      type: String,
      default: "",
    },
    shippingCost: {
      type: Number,
      default: 0,
    },
    total: {
      type: Number,
      required: true,
    },
    paymentMethod: {
      type: String,
      default: "cod",
    },
    paymentStatus: {
      type: String,
      default: "Pending",
    },
    razorpayOrderId: {
      type: String,
    },
    razorpayPaymentId: {
      type: String,
    },
    razorpaySignature: {
      type: String,
    },
    status: {
      type: String,
      default: "Order Sent to Admin",
    },
    internalStatus: {
      type: String,
      default: "ORDER_CREATED",
      index: true,
    },
    shipmentRef: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Shipment",
    },
    invoiceNumber: {
      type: String,
      default: "",
    },
    source: {
      type: String,
      default: "admin",
    },
    waybill: {
      type: String,
      index: true,
      sparse: true,
      default: "",
    },
    shipmentStatus: {
      type: String,
      default: "unfulfilled",
    },
    labelUrl: {
      type: String,
      default: "",
    },
    courierPartner: {
      type: String,
      default: "Delhivery",
    },
    shipping: {
      courier: {
        type: String,
        default: "Delhivery",
      },
      waybill: {
        type: String,
        index: true,
        sparse: true,
      },
      status: {
        type: String,
        default: "Unfulfilled",
      },
      statusDetails: {
        type: String,
        default: "",
      },
      labelDownloaded: {
        type: Boolean,
        default: false,
      },
      pickupScheduled: {
        type: Boolean,
        default: false,
      },
      pickupToken: {
        type: String,
        default: "",
      },
      estimatedDeliveryDate: {
        type: Date,
      },
      trackingHistory: [
        {
          status: String,
          statusDateTime: Date,
          location: String,
          instructions: String,
        },
      ],
      lastTrackedAt: {
        type: Date,
      },
    },
  },
  {
    timestamps: true,
  }
);

const Order = mongoose.model("Order", orderSchema);
export default Order;
