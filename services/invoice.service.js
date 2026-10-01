import PDFDocument from "pdfkit";
import Invoice, { InvoiceSequence } from "../models/invoice.model.js";
import Order from "../models/order.model.js";
import Shipment from "../models/shipment.model.js";
import { env } from "../config/env.js";

/**
 * Computes current Indian Fiscal Year string e.g. "2026-27"
 */
export function getCurrentFiscalYear(date = new Date()) {
  const d = new Date(date);
  const month = d.getMonth() + 1; // 1-12
  const year = d.getFullYear();
  if (month >= 4) {
    const nextYearShort = String(year + 1).slice(-2);
    return `${year}-${nextYearShort}`;
  } else {
    const currentYearShort = String(year).slice(-2);
    return `${year - 1}-${currentYearShort}`;
  }
}

/**
 * Atomically generates the next sequential invoice number for the fiscal year
 * Concurrency-safe via MongoDB findOneAndUpdate with $inc
 */
export async function getNextInvoiceNumber(date = new Date()) {
  const fiscalYear = getCurrentFiscalYear(date);

  const seqDoc = await InvoiceSequence.findOneAndUpdate(
    { fiscalYear },
    { $inc: { lastSequence: 1 } },
    { new: true, upsert: true }
  );

  const seqNumber = seqDoc.lastSequence;
  const paddedSeq = String(seqNumber).padStart(4, "0");
  const invoiceNumber = `DF/${fiscalYear}/${paddedSeq}`;

  return { invoiceNumber, fiscalYear, sequenceNumber: seqNumber };
}

/**
 * Builds or retrieves the official Tax Invoice for an order
 */
export async function getOrCreateInvoice(orderId) {
  // 1. Check if invoice already exists
  let invoice = await Invoice.findOne({ orderId });
  if (invoice) {
    return invoice;
  }

  // 2. Fetch order
  const order = await Order.findOne({ orderId });
  if (!order) {
    throw new Error(`Order ${orderId} not found`);
  }

  // Fetch shipment if available
  const shipment = await Shipment.findOne({ orderId });
  const awbNumber = shipment?.awbNumber || order.waybill || order.shipping?.waybill || "";

  // 3. Determine if customer is interstate or intrastate
  const customerAddress = order.customer?.address || "";
  const customerState = order.customer?.state || inferStateFromAddress(customerAddress);
  const isInterstate =
    Boolean(customerState) &&
    customerState.toLowerCase() !== env.STORE.STATE.toLowerCase();

  // 4. Calculate item-level GST breakdowns
  const gstRatePercent = env.STORE.DEFAULT_GST_RATE || 5; // standard 5% for packaged farm goods
  const gstMultiplier = gstRatePercent / (100 + gstRatePercent); // Inclusive GST calculation

  let calculatedSubtotal = 0;
  let calculatedTaxableTotal = 0;
  let calculatedCgstTotal = 0;
  let calculatedSgstTotal = 0;
  let calculatedIgstTotal = 0;

  const invoiceItems = (order.items || []).map((item, idx) => {
    const count = Number(item.count || 1);
    const unitPrice = Number(item.price || 0);
    const lineTotal = unitPrice * count;
    calculatedSubtotal += lineTotal;

    // Line tax calculation
    const taxAmount = Math.round(lineTotal * gstMultiplier * 100) / 100;
    const taxableValue = Math.round((lineTotal - taxAmount) * 100) / 100;
    calculatedTaxableTotal += taxableValue;

    let cgstAmount = 0;
    let sgstAmount = 0;
    let igstAmount = 0;

    if (isInterstate) {
      igstAmount = taxAmount;
      calculatedIgstTotal += igstAmount;
    } else {
      cgstAmount = Math.round((taxAmount / 2) * 100) / 100;
      sgstAmount = Math.round((taxAmount / 2) * 100) / 100;
      calculatedCgstTotal += cgstAmount;
      calculatedSgstTotal += sgstAmount;
    }

    return {
      productId: String(item.productId || idx + 1),
      sku: `DF-SKU-${item.productId || idx + 1}`,
      name: item.name,
      variant: item.quantity || "Standard",
      count,
      unitPrice,
      discount: 0,
      taxableValue,
      hsn: env.STORE.DEFAULT_HSN,
      gstRate: gstRatePercent,
      cgstAmount,
      sgstAmount,
      igstAmount,
      total: lineTotal,
    };
  });

  const discountTotal = Number(order.discountAmount || 0);
  const shippingCharge = Number(order.shippingCost || 0);
  const grandTotal = Number(order.total || calculatedSubtotal - discountTotal + shippingCharge);
  const isPaid = (order.paymentStatus || "").toLowerCase() === "paid";
  const amountPaid = isPaid ? grandTotal : 0;
  const balanceDue = grandTotal - amountPaid;

  // 5. Generate next sequential number
  const { invoiceNumber, fiscalYear, sequenceNumber } = await getNextInvoiceNumber();

  invoice = await Invoice.create({
    invoiceNumber,
    fiscalYear,
    sequenceNumber,
    orderId: order.orderId,
    orderRef: order._id,
    invoiceDate: new Date(),
    seller: {
      name: env.STORE.NAME,
      address: env.STORE.ADDRESS,
      state: env.STORE.STATE,
      stateCode: env.STORE.STATE_CODE,
      gstin: env.STORE.GSTIN,
      phone: env.STORE.PHONE,
      email: env.STORE.EMAIL,
    },
    customer: {
      name: order.customer.name,
      phone: order.customer.phone,
      email: order.customer.email || "",
      billingAddress: customerAddress,
      shippingAddress: customerAddress,
      state: customerState,
      pincode: order.customer.pincode || (customerAddress.match(/\b\d{6}\b/)?.[0] || ""),
    },
    items: invoiceItems,
    subtotal: calculatedSubtotal,
    discountTotal,
    taxableTotal: calculatedTaxableTotal,
    cgstTotal: calculatedCgstTotal,
    sgstTotal: calculatedSgstTotal,
    igstTotal: calculatedIgstTotal,
    shippingCharge,
    grandTotal,
    amountPaid,
    balanceDue,
    paymentMethod: (order.paymentMethod || "COD").toUpperCase(),
    paymentStatus: order.paymentStatus || (isPaid ? "Paid" : "Pending"),
    paymentId: order.razorpayPaymentId || "",
    awbNumber,
    carrier: "Delhivery",
    isInterstate,
  });

  // Link to order
  await Order.findByIdAndUpdate(order._id, { invoiceNumber });

  return invoice;
}

/**
 * State inferrer from address text
 */
function inferStateFromAddress(addr = "") {
  const s = addr.toLowerCase();
  if (s.includes("delhi")) return "Delhi";
  if (s.includes("uttar pradesh") || s.includes("up") || s.includes("noida") || s.includes("lucknow") || s.includes("jhansi")) return "Uttar Pradesh";
  if (s.includes("maharashtra") || s.includes("mumbai") || s.includes("pune")) return "Maharashtra";
  if (s.includes("karnataka") || s.includes("bangalore") || s.includes("bengaluru")) return "Karnataka";
  if (s.includes("madhya pradesh") || s.includes("mp") || s.includes("bhopal") || s.includes("indore")) return "Madhya Pradesh";
  if (s.includes("haryana") || s.includes("gurugram") || s.includes("gurgaon")) return "Haryana";
  if (s.includes("rajasthan") || s.includes("jaipur")) return "Rajasthan";
  if (s.includes("gujarat") || s.includes("ahmedabad")) return "Gujarat";
  return env.STORE.STATE;
}

/**
 * Generates an A4 PDF document buffer for the tax invoice
 * Clean, print-friendly, professional e-commerce standards.
 */
export function generateInvoicePDF(invoice) {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({
        size: "A4",
        margin: 36, // 0.5 inch margins
        info: {
          Title: `Tax Invoice - ${invoice.invoiceNumber}`,
          Author: env.STORE.NAME,
          Subject: `Invoice for Order ${invoice.orderId}`,
        },
      });

      const buffers = [];
      doc.on("data", (chunk) => buffers.push(chunk));
      doc.on("end", () => resolve(Buffer.concat(buffers)));
      doc.on("error", (err) => reject(err));

      const primaryColor = "#203515"; // Forest Green
      const textDark = "#1f2937";
      const textMuted = "#4b5563";
      const borderGray = "#d1d5db";
      const lightBg = "#f9fafb";

      // ----------------------------------------------------
      // HEADER SECTION
      // ----------------------------------------------------
      // Company Name / Branding
      doc
        .fontSize(20)
        .font("Helvetica-Bold")
        .fillColor(primaryColor)
        .text(invoice.seller.name, 36, 36);

      doc
        .fontSize(8.5)
        .font("Helvetica")
        .fillColor(textMuted)
        .text(env.STORE.TAGLINE, 36, 60)
        .text(invoice.seller.address, 36, 72, { width: 300 })
        .text(`GSTIN: ${invoice.seller.gstin} | State Code: ${invoice.seller.stateCode}`, 36, 92)
        .text(`Phone: ${invoice.seller.phone} | Email: ${invoice.seller.email}`, 36, 104);

      // Invoice Badge & Meta (Right Column)
      doc
        .fontSize(16)
        .font("Helvetica-Bold")
        .fillColor(primaryColor)
        .text("TAX INVOICE", 380, 36, { align: "right" });

      doc
        .fontSize(9)
        .font("Helvetica-Bold")
        .fillColor(textDark)
        .text(`Invoice No: `, 360, 60, { continued: true })
        .font("Helvetica")
        .text(invoice.invoiceNumber)
        .font("Helvetica-Bold")
        .text(`Invoice Date: `, 360, 74, { continued: true })
        .font("Helvetica")
        .text(new Date(invoice.invoiceDate).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }))
        .font("Helvetica-Bold")
        .text(`Order ID: `, 360, 88, { continued: true })
        .font("Helvetica")
        .text(invoice.orderId)
        .font("Helvetica-Bold")
        .text(`AWB / Tracking: `, 360, 102, { continued: true })
        .font("Helvetica")
        .text(invoice.awbNumber || "Pending Courier Dispatch");

      // Divider line
      doc
        .moveTo(36, 122)
        .lineTo(559, 122)
        .strokeColor(primaryColor)
        .lineWidth(1.5)
        .stroke();

      // ----------------------------------------------------
      // BILLED TO & SHIPPED TO
      // ----------------------------------------------------
      const billToY = 132;
      doc.rect(36, billToY, 255, 75).fillAndStroke(lightBg, borderGray);
      doc.rect(304, billToY, 255, 75).fillAndStroke(lightBg, borderGray);

      // Bill To
      doc
        .fontSize(8.5)
        .font("Helvetica-Bold")
        .fillColor(primaryColor)
        .text("BILLED TO (CUSTOMER)", 44, billToY + 8)
        .font("Helvetica-Bold")
        .fillColor(textDark)
        .text(invoice.customer.name, 44, billToY + 22)
        .font("Helvetica")
        .fillColor(textMuted)
        .text(`Phone: ${invoice.customer.phone}`, 44, billToY + 34)
        .text(invoice.customer.billingAddress, 44, billToY + 46, { width: 238, height: 26, ellipsis: true });

      // Ship To
      doc
        .fontSize(8.5)
        .font("Helvetica-Bold")
        .fillColor(primaryColor)
        .text("SHIPPED TO (DELIVERY ADDRESS)", 312, billToY + 8)
        .font("Helvetica-Bold")
        .fillColor(textDark)
        .text(invoice.customer.name, 312, billToY + 22)
        .font("Helvetica")
        .fillColor(textMuted)
        .text(`Delivery Courier: ${invoice.carrier} Logistics`, 312, billToY + 34)
        .text(invoice.customer.shippingAddress, 312, billToY + 46, { width: 238, height: 26, ellipsis: true });

      // ----------------------------------------------------
      // PRODUCT ITEMS TABLE
      // ----------------------------------------------------
      const tableTop = 220;
      doc.rect(36, tableTop, 523, 22).fillAndStroke(primaryColor, primaryColor);

      // Table Headers
      doc.fillColor("#ffffff").font("Helvetica-Bold").fontSize(8);
      doc.text("#", 42, tableTop + 6, { width: 20 });
      doc.text("ITEM DESCRIPTION", 66, tableTop + 6, { width: 175 });
      doc.text("HSN", 245, tableTop + 6, { width: 45 });
      doc.text("QTY", 295, tableTop + 6, { width: 30, align: "center" });
      doc.text("RATE", 330, tableTop + 6, { width: 50, align: "right" });
      doc.text("TAXABLE", 385, tableTop + 6, { width: 55, align: "right" });
      doc.text("GST", 445, tableTop + 6, { width: 45, align: "right" });
      doc.text("TOTAL", 495, tableTop + 6, { width: 58, align: "right" });

      let currentY = tableTop + 22;
      const items = invoice.items || [];

      items.forEach((item, index) => {
        const rowHeight = 22;
        // Alternate row background
        if (index % 2 === 1) {
          doc.rect(36, currentY, 523, rowHeight).fill(lightBg);
        }

        doc.fillColor(textDark).font("Helvetica").fontSize(8);
        doc.text(String(index + 1), 42, currentY + 6, { width: 20 });
        doc.font("Helvetica-Bold").text(item.name, 66, currentY + 4, { width: 175, ellipsis: true });
        doc.font("Helvetica").fillColor(textMuted).fontSize(7).text(`(${item.variant})`, 66, currentY + 13);
        doc.fontSize(8).fillColor(textDark);
        doc.text(item.hsn || "0409", 245, currentY + 6, { width: 45 });
        doc.text(String(item.count), 295, currentY + 6, { width: 30, align: "center" });
        doc.text(`₹${item.unitPrice.toFixed(2)}`, 330, currentY + 6, { width: 50, align: "right" });
        doc.text(`₹${item.taxableValue.toFixed(2)}`, 385, currentY + 6, { width: 55, align: "right" });

        const taxStr = invoice.isInterstate
          ? `IGST ₹${item.igstAmount.toFixed(2)}`
          : `GST ₹${(item.cgstAmount + item.sgstAmount).toFixed(2)}`;
        doc.fontSize(7).text(taxStr, 445, currentY + 6, { width: 45, align: "right" });

        doc.fontSize(8).font("Helvetica-Bold").text(`₹${item.total.toFixed(2)}`, 495, currentY + 6, { width: 58, align: "right" });

        // Bottom border per row
        doc.moveTo(36, currentY + rowHeight).lineTo(559, currentY + rowHeight).strokeColor(borderGray).lineWidth(0.5).stroke();
        currentY += rowHeight;
      });

      // ----------------------------------------------------
      // SUMMARY & TAX BREAKUP SECTION
      // ----------------------------------------------------
      currentY += 8;
      const summaryStartY = currentY;

      // Left Box: Payment Details & Terms
      doc.rect(36, summaryStartY, 260, 110).fillAndStroke(lightBg, borderGray);
      doc
        .fontSize(8.5)
        .font("Helvetica-Bold")
        .fillColor(primaryColor)
        .text("PAYMENT INFORMATION", 44, summaryStartY + 8)
        .font("Helvetica-Bold")
        .fillColor(textDark)
        .text("Method: ", 44, summaryStartY + 22, { continued: true })
        .font("Helvetica")
        .text(invoice.paymentMethod)
        .font("Helvetica-Bold")
        .text("Payment Status: ", 44, summaryStartY + 34, { continued: true })
        .font("Helvetica")
        .text(invoice.paymentStatus)
        .font("Helvetica-Bold")
        .text("Amount Paid: ", 44, summaryStartY + 46, { continued: true })
        .font("Helvetica")
        .text(`₹${Number(invoice.amountPaid || 0).toLocaleString("en-IN")}`)
        .font("Helvetica-Bold")
        .text("Balance Due: ", 44, summaryStartY + 58, { continued: true })
        .font("Helvetica")
        .text(`₹${Number(invoice.balanceDue || 0).toLocaleString("en-IN")}`);

      doc
        .fontSize(7.5)
        .font("Helvetica-Oblique")
        .fillColor(textMuted)
        .text(invoice.terms, 44, summaryStartY + 76, { width: 244 });

      // Right Box: Totals & Tax Calculation
      doc.rect(304, summaryStartY, 255, 110).fillAndStroke(lightBg, borderGray);

      const renderSummaryRow = (label, value, y, isBold = false) => {
        doc
          .font(isBold ? "Helvetica-Bold" : "Helvetica")
          .fontSize(isBold ? 9.5 : 8.5)
          .fillColor(isBold ? primaryColor : textDark)
          .text(label, 314, y, { width: 140 })
          .text(value, 454, y, { width: 95, align: "right" });
      };

      let sumY = summaryStartY + 8;
      renderSummaryRow("Subtotal:", `₹${invoice.subtotal.toFixed(2)}`, sumY);
      sumY += 14;
      if (invoice.discountTotal > 0) {
        renderSummaryRow("Discount Applied:", `- ₹${invoice.discountTotal.toFixed(2)}`, sumY);
        sumY += 14;
      }
      renderSummaryRow("Taxable Value:", `₹${invoice.taxableTotal.toFixed(2)}`, sumY);
      sumY += 14;

      if (invoice.isInterstate) {
        renderSummaryRow(`IGST (${env.STORE.DEFAULT_GST_RATE}%):`, `₹${invoice.igstTotal.toFixed(2)}`, sumY);
      } else {
        renderSummaryRow(`CGST (${env.STORE.DEFAULT_GST_RATE / 2}%):`, `₹${invoice.cgstTotal.toFixed(2)}`, sumY);
        sumY += 14;
        renderSummaryRow(`SGST (${env.STORE.DEFAULT_GST_RATE / 2}%):`, `₹${invoice.sgstTotal.toFixed(2)}`, sumY);
      }
      sumY += 14;

      renderSummaryRow("Shipping Charges:", invoice.shippingCharge > 0 ? `₹${invoice.shippingCharge.toFixed(2)}` : "FREE", sumY);
      sumY += 16;

      doc.moveTo(314, sumY).lineTo(549, sumY).strokeColor(primaryColor).lineWidth(1).stroke();
      sumY += 6;
      renderSummaryRow("GRAND TOTAL:", `₹${invoice.grandTotal.toFixed(2)}`, sumY, true);

      // ----------------------------------------------------
      // SIGNATURE & FOOTER
      // ----------------------------------------------------
      const footerY = 760;
      doc
        .fontSize(8)
        .font("Helvetica")
        .fillColor(textMuted)
        .text("This is a computer-generated tax invoice. No physical signature is required.", 36, footerY, { align: "center", width: 523 })
        .text(`Thank you for choosing ${env.STORE.NAME} for pure, farm-fresh produce!`, 36, footerY + 14, { align: "center", width: 523 });

      doc.end();
    } catch (err) {
      reject(err);
    }
  });
}

export default {
  getOrCreateInvoice,
  generateInvoicePDF,
  getNextInvoiceNumber,
  getCurrentFiscalYear,
};
