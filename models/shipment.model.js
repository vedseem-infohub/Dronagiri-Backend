import mongoose from "mongoose";

export const SHIPMENT_STATUSES = [
  "ORDER_CREATED",
  "PAYMENT_CONFIRMED",
  "SHIPMENT_CREATED",
  "AWB_ASSIGNED",
  "PICKUP_REQUESTED",
  "PICKUP_SCHEDULED",
  "PICKED_UP",
  "IN_TRANSIT",
  "OUT_FOR_DELIVERY",
  "DELIVERED",
  "NDR",
  "RTO_INITIATED",
  "RTO_IN_TRANSIT",
  "RTO_DELIVERED",
  "CANCELLED",
  "SHIPMENT_FAILED",
];

export const TERMINAL_STATUSES = [
  "DELIVERED",
  "CANCELLED",
  "RTO_DELIVERED",
];

const trackingEventSchema = new mongoose.Schema(
  {
    status: {
      type: String,
      required: true,
    },
    statusCode: {
      type: String,
      default: "",
    },
    internalStatus: {
      type: String,
      enum: SHIPMENT_STATUSES,
      default: "IN_TRANSIT",
    },
    description: {
      type: String,
      default: "",
    },
    location: {
      type: String,
      default: "",
    },
    eventTime: {
      type: Date,
      default: Date.now,
    },
    source: {
      type: String,
      enum: ["carrier_scan", "webhook", "manual_sync", "cron_sync", "api_response", "admin"],
      default: "carrier_scan",
    },
    carrierEventId: {
      type: String,
      default: "",
    },
    rawData: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
    },
  },
  { _id: true, timestamps: true }
);

const shipmentSchema = new mongoose.Schema(
  {
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
    carrier: {
      type: String,
      default: "Delhivery",
    },
    awbNumber: {
      type: String,
      sparse: true,
      index: true,
      trim: true,
    },
    carrierShipmentId: {
      type: String,
      sparse: true,
      index: true,
    },
    uploadWbn: {
      type: String,
      default: "",
    },
    internalStatus: {
      type: String,
      enum: SHIPMENT_STATUSES,
      default: "SHIPMENT_CREATED",
      index: true,
    },
    carrierStatus: {
      type: String,
      default: "Manifested",
    },
    carrierStatusCode: {
      type: String,
      default: "",
    },
    carrierStatusDescription: {
      type: String,
      default: "",
    },
    pickupStatus: {
      type: String,
      default: "Pending",
    },
    pickupToken: {
      type: String,
      default: "",
    },
    pickupScheduledDate: {
      type: Date,
    },
    currentLocation: {
      type: String,
      default: "",
    },
    lastEvent: {
      type: String,
      default: "",
    },
    lastEventAt: {
      type: Date,
    },
    expectedDeliveryDate: {
      type: Date,
    },
    dimensions: {
      length: { type: Number, default: 20 }, // cm
      width: { type: Number, default: 15 },
      height: { type: Number, default: 10 },
      weight: { type: Number, default: 500 }, // grams
    },
    shippingMode: {
      type: String,
      enum: ["Surface", "Express"],
      default: "Surface",
    },
    paymentMode: {
      type: String,
      enum: ["COD", "Prepaid"],
      default: "Prepaid",
    },
    codAmount: {
      type: Number,
      default: 0,
    },
    shippingCharge: {
      type: Number,
      default: 0,
    },
    labelUrl: {
      type: String,
      default: "",
    },
    labelDownloaded: {
      type: Boolean,
      default: false,
    },
    shippedAt: {
      type: Date,
    },
    deliveredAt: {
      type: Date,
    },
    cancelledAt: {
      type: Date,
    },
    lastSyncedAt: {
      type: Date,
      default: Date.now,
      index: true,
    },
    retryCount: {
      type: Number,
      default: 0,
    },
    lastError: {
      type: String,
      default: "",
    },
    trackingEvents: [trackingEventSchema],
    rawApiResponse: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

// Compound indexes for background syncing and lookups
shipmentSchema.index({ internalStatus: 1, lastSyncedAt: 1 });
shipmentSchema.index({ awbNumber: 1, carrier: 1 });
shipmentSchema.index({ orderId: 1, createdAt: -1 });

const Shipment = mongoose.model("Shipment", shipmentSchema);
export default Shipment;
