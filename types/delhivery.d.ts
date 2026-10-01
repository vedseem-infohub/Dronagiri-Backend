/**
 * Delhivery Shipping API TypeScript Type Definitions
 */

export interface DelhiveryServiceResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string | null;
  message?: string;
  statusCode?: number;
}

// 1. Serviceability Check
export interface ServiceabilityQuery {
  pincode: string | number;
}

export interface ServiceabilityResult {
  pincode: string;
  serviceable: boolean;
  codAvailable: boolean;
  prepaidAvailable: boolean;
  pickupAvailable: boolean;
  isOda: boolean; // Out of Delivery Area
  city?: string;
  state?: string;
  raw?: any;
}

// 2. Shipping Cost Calculation
export interface ShippingCostParams {
  originPincode?: string | number;
  destPincode: string | number;
  weight: number; // in grams
  mode?: "Surface" | "Express" | "S" | "E";
  paymentType?: "Prepaid" | "COD" | "pre-paid" | "cod";
  orderAmount?: number;
}

export interface ShippingCostResult {
  chargeableWeight: number; // in grams or kg
  shippingCharge: number;
  codCharge: number;
  totalShippingCost: number;
  currency: string;
  estimatedDays?: string;
  mode: string;
  raw?: any;
}

// 3. Create Shipment
export interface ShipmentItem {
  productId?: string | number;
  name: string;
  sku?: string;
  count: number;
  price: number;
  hsnCode?: string;
  discount?: number;
}

export interface CreateShipmentInput {
  orderId: string;
  customer: {
    name: string;
    phone: string;
    email?: string;
    address: string;
    pincode: string;
    city?: string;
    state?: string;
    country?: string;
  };
  items: ShipmentItem[];
  totalAmount: number;
  paymentMethod: "cod" | "online" | "prepaid" | string;
  codAmount?: number;
  weight?: number; // in grams
  dimensions?: {
    length?: number; // cm
    width?: number; // cm
    height?: number; // cm
  };
  shippingMode?: "Surface" | "Express";
  pickupLocation?: string;
}

export interface CreateShipmentResult {
  waybill: string;
  orderId: string;
  status: string;
  sortCode?: string;
  pickupLocation: string;
  codAmount: number;
  paymentMode: string;
  raw?: any;
}

// 4. Shipping Label
export interface ShippingLabelResult {
  waybill: string;
  pdfBuffer?: Buffer | string;
  downloadUrl?: string;
  contentType: string;
}

// 5. Track Shipment
export type NormalizedShipmentStatus =
  | "Manifested"
  | "Picked Up"
  | "In Transit"
  | "Out for Delivery"
  | "Delivered"
  | "RTO"
  | "Cancelled"
  | "Pending";

export interface TrackingScan {
  status: string;
  statusDateTime: string | Date;
  location: string;
  instructions?: string;
}

export interface TrackShipmentResult {
  waybill: string;
  orderId?: string;
  status: NormalizedShipmentStatus;
  statusDetails: string;
  statusDateTime: string;
  expectedDeliveryDate?: string;
  origin?: string;
  destination?: string;
  scans: TrackingScan[];
  raw?: any;
}

// 6. Cancel Shipment
export interface CancelShipmentResult {
  waybill: string;
  cancelled: boolean;
  remarks?: string;
  raw?: any;
}

// 7. Schedule Pickup
export interface SchedulePickupInput {
  pickupLocation?: string;
  pickupDate: string; // YYYY-MM-DD
  pickupTime?: string; // HH:MM:SS
  expectedPackageCount?: number;
}

export interface SchedulePickupResult {
  pickupId?: string;
  pickupToken?: string;
  scheduledDate: string;
  pickupLocation: string;
  expectedPackageCount: number;
  message?: string;
  raw?: any;
}
