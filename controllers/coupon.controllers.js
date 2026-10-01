import Coupon from "../models/coupon.model.js";

/**
 * Get all coupons for Admin with statistics
 * GET /api/coupons/admin
 */
export const getAllCouponsAdmin = async (req, res) => {
  try {
    const coupons = await Coupon.find({}).sort({ createdAt: -1 });

    const now = new Date();
    const stats = {
      total: coupons.length,
      active: coupons.filter((c) => c.isActive && (!c.expiresAt || new Date(c.expiresAt) > now)).length,
      expired: coupons.filter((c) => c.expiresAt && new Date(c.expiresAt) <= now).length,
      inactive: coupons.filter((c) => !c.isActive).length,
      totalUsage: coupons.reduce((sum, c) => sum + (c.usedCount || 0), 0),
    };

    return res.status(200).json({
      success: true,
      stats,
      data: coupons,
    });
  } catch (error) {
    console.error("Get all coupons error:", error);
    return res.status(500).json({ success: false, message: `Failed to fetch coupons: ${error.message}` });
  }
};

/**
 * Create a new coupon (Admin)
 * POST /api/coupons/admin
 */
export const createCouponAdmin = async (req, res) => {
  try {
    let {
      code,
      description,
      discountType,
      discountValue,
      minOrderAmount,
      maxDiscountAmount,
      startDate,
      expiresAt,
      usageLimit,
      isActive,
    } = req.body;

    if (!code || !code.trim()) {
      return res.status(400).json({ success: false, message: "Coupon code is required" });
    }

    const normalizedCode = code.trim().toUpperCase();

    // Check duplicate code
    const existingCoupon = await Coupon.findOne({ code: normalizedCode });
    if (existingCoupon) {
      return res.status(400).json({ success: false, message: `Coupon with code "${normalizedCode}" already exists` });
    }

    if (discountValue === undefined || discountValue === null || Number(discountValue) < 0) {
      return res.status(400).json({ success: false, message: "A valid positive discount value is required" });
    }

    discountType = discountType === "flat" ? "flat" : "percentage";
    const numericDiscount = Number(discountValue);

    if (discountType === "percentage" && numericDiscount > 100) {
      return res.status(400).json({ success: false, message: "Percentage discount cannot exceed 100%" });
    }

    // Process expiration date
    let parsedExpiry = null;
    if (expiresAt) {
      parsedExpiry = new Date(expiresAt);
      if (isNaN(parsedExpiry.getTime())) {
        return res.status(400).json({ success: false, message: "Invalid expiration date format" });
      }
    }

    let parsedStartDate = new Date();
    if (startDate) {
      const d = new Date(startDate);
      if (!isNaN(d.getTime())) {
        parsedStartDate = d;
      }
    }

    const newCoupon = await Coupon.create({
      code: normalizedCode,
      description: description?.trim() || "",
      discountType,
      discountValue: numericDiscount,
      minOrderAmount: Number(minOrderAmount) || 0,
      maxDiscountAmount: maxDiscountAmount ? Number(maxDiscountAmount) : null,
      startDate: parsedStartDate,
      expiresAt: parsedExpiry,
      usageLimit: usageLimit ? Number(usageLimit) : null,
      isActive: isActive !== false,
      usedCount: 0,
    });

    return res.status(201).json({
      success: true,
      message: `Coupon "${normalizedCode}" created successfully`,
      data: newCoupon,
    });
  } catch (error) {
    console.error("Create coupon error:", error);
    return res.status(500).json({ success: false, message: `Failed to create coupon: ${error.message}` });
  }
};

/**
 * Update an existing coupon (Admin)
 * PUT /api/coupons/admin/:id
 */
export const updateCouponAdmin = async (req, res) => {
  try {
    const { id } = req.params;
    let {
      code,
      description,
      discountType,
      discountValue,
      minOrderAmount,
      maxDiscountAmount,
      startDate,
      expiresAt,
      usageLimit,
      isActive,
    } = req.body;

    const coupon = await Coupon.findById(id);
    if (!coupon) {
      return res.status(404).json({ success: false, message: "Coupon not found" });
    }

    if (code && code.trim()) {
      const normalizedCode = code.trim().toUpperCase();
      if (normalizedCode !== coupon.code) {
        const duplicate = await Coupon.findOne({ code: normalizedCode, _id: { $ne: id } });
        if (duplicate) {
          return res.status(400).json({ success: false, message: `Coupon with code "${normalizedCode}" already exists` });
        }
        coupon.code = normalizedCode;
      }
    }

    if (description !== undefined) coupon.description = description.trim();
    if (discountType !== undefined) {
      coupon.discountType = discountType === "flat" ? "flat" : "percentage";
    }

    if (discountValue !== undefined) {
      const numericVal = Number(discountValue);
      if (numericVal < 0) {
        return res.status(400).json({ success: false, message: "Discount value cannot be negative" });
      }
      if (coupon.discountType === "percentage" && numericVal > 100) {
        return res.status(400).json({ success: false, message: "Percentage discount cannot exceed 100%" });
      }
      coupon.discountValue = numericVal;
    }

    if (minOrderAmount !== undefined) {
      coupon.minOrderAmount = Number(minOrderAmount) || 0;
    }

    if (maxDiscountAmount !== undefined) {
      coupon.maxDiscountAmount = maxDiscountAmount ? Number(maxDiscountAmount) : null;
    }

    if (startDate !== undefined) {
      coupon.startDate = startDate ? new Date(startDate) : coupon.startDate;
    }

    // Admin control over expiry date
    if (expiresAt !== undefined) {
      if (!expiresAt || expiresAt === "" || expiresAt === null) {
        coupon.expiresAt = null; // Clear expiration
      } else {
        const d = new Date(expiresAt);
        if (isNaN(d.getTime())) {
          return res.status(400).json({ success: false, message: "Invalid expiration date format" });
        }
        coupon.expiresAt = d;
      }
    }

    if (usageLimit !== undefined) {
      coupon.usageLimit = usageLimit ? Number(usageLimit) : null;
    }

    if (isActive !== undefined) {
      coupon.isActive = Boolean(isActive);
    }

    await coupon.save();

    return res.status(200).json({
      success: true,
      message: "Coupon updated successfully",
      data: coupon,
    });
  } catch (error) {
    console.error("Update coupon error:", error);
    return res.status(500).json({ success: false, message: `Failed to update coupon: ${error.message}` });
  }
};

/**
 * Toggle coupon active status (Admin)
 * PATCH /api/coupons/admin/:id/toggle
 */
export const toggleCouponAdmin = async (req, res) => {
  try {
    const { id } = req.params;
    const coupon = await Coupon.findById(id);
    if (!coupon) {
      return res.status(404).json({ success: false, message: "Coupon not found" });
    }

    coupon.isActive = !coupon.isActive;
    await coupon.save();

    return res.status(200).json({
      success: true,
      message: `Coupon is now ${coupon.isActive ? "Active" : "Inactive"}`,
      data: coupon,
    });
  } catch (error) {
    console.error("Toggle coupon error:", error);
    return res.status(500).json({ success: false, message: `Failed to toggle coupon status: ${error.message}` });
  }
};

/**
 * Delete a coupon (Admin)
 * DELETE /api/coupons/admin/:id
 */
export const deleteCouponAdmin = async (req, res) => {
  try {
    const { id } = req.params;
    const coupon = await Coupon.findByIdAndDelete(id);
    if (!coupon) {
      return res.status(404).json({ success: false, message: "Coupon not found" });
    }

    return res.status(200).json({
      success: true,
      message: `Coupon "${coupon.code}" deleted successfully`,
    });
  } catch (error) {
    console.error("Delete coupon error:", error);
    return res.status(500).json({ success: false, message: `Failed to delete coupon: ${error.message}` });
  }
};

/**
 * Validate coupon code (Customer / Public)
 * POST /api/coupons/validate
 * Body: { code, subtotal }
 */
export const validateCoupon = async (req, res) => {
  try {
    const { code, subtotal } = req.body;

    if (!code || !code.trim()) {
      return res.status(400).json({
        valid: false,
        message: "Please enter a coupon code.",
      });
    }

    const orderSubtotal = Number(subtotal) || 0;
    const normalizedCode = code.trim().toUpperCase();

    const coupon = await Coupon.findOne({ code: normalizedCode });
    if (!coupon) {
      return res.status(404).json({
        valid: false,
        message: `Coupon code "${normalizedCode}" is invalid.`,
      });
    }

    // 1. Check if coupon is active
    if (!coupon.isActive) {
      return res.status(400).json({
        valid: false,
        message: `Coupon "${normalizedCode}" is currently inactive.`,
      });
    }

    const now = new Date();

    // 2. Check if coupon has started
    if (coupon.startDate && new Date(coupon.startDate) > now) {
      return res.status(400).json({
        valid: false,
        message: `Coupon "${normalizedCode}" is not valid yet.`,
      });
    }

    // 3. Check if coupon is expired
    if (coupon.expiresAt && new Date(coupon.expiresAt) <= now) {
      const expDateStr = new Date(coupon.expiresAt).toLocaleDateString("en-IN", {
        day: "numeric",
        month: "short",
        year: "numeric",
      });
      return res.status(400).json({
        valid: false,
        message: `Coupon "${normalizedCode}" expired on ${expDateStr}.`,
      });
    }

    // 4. Check usage limit
    if (coupon.usageLimit && coupon.usedCount >= coupon.usageLimit) {
      return res.status(400).json({
        valid: false,
        message: `Coupon "${normalizedCode}" has reached its maximum usage limit.`,
      });
    }

    // 5. Check minimum order amount
    if (coupon.minOrderAmount > 0 && orderSubtotal < coupon.minOrderAmount) {
      const difference = coupon.minOrderAmount - orderSubtotal;
      return res.status(400).json({
        valid: false,
        message: `Coupon requires a minimum order of ₹${coupon.minOrderAmount.toLocaleString("en-IN")}. Add ₹${difference.toLocaleString("en-IN")} more to apply.`,
        minOrderAmount: coupon.minOrderAmount,
      });
    }

    // 6. Calculate discount amount
    let calculatedDiscount = 0;
    if (coupon.discountType === "percentage") {
      calculatedDiscount = Math.round((orderSubtotal * coupon.discountValue) / 100);
      if (coupon.maxDiscountAmount && calculatedDiscount > coupon.maxDiscountAmount) {
        calculatedDiscount = coupon.maxDiscountAmount;
      }
    } else {
      // flat discount
      calculatedDiscount = Math.min(coupon.discountValue, orderSubtotal);
    }

    // Build human-friendly discount explanation
    let discountDisplay = "";
    if (coupon.discountType === "percentage") {
      discountDisplay = `${coupon.discountValue}% OFF`;
      if (coupon.maxDiscountAmount) {
        discountDisplay += ` (up to ₹${coupon.maxDiscountAmount})`;
      }
    } else {
      discountDisplay = `₹${coupon.discountValue} FLAT OFF`;
    }

    return res.status(200).json({
      valid: true,
      message: `Coupon applied! You save ₹${calculatedDiscount.toLocaleString("en-IN")}.`,
      discountAmount: calculatedDiscount,
      discountDisplay,
      coupon: {
        code: coupon.code,
        discountType: coupon.discountType,
        discountValue: coupon.discountValue,
        maxDiscountAmount: coupon.maxDiscountAmount,
        minOrderAmount: coupon.minOrderAmount,
        description: coupon.description,
        expiresAt: coupon.expiresAt,
      },
    });
  } catch (error) {
    console.error("Validate coupon error:", error);
    return res.status(500).json({
      valid: false,
      message: `Error validating coupon: ${error.message}`,
    });
  }
};

/**
 * Get active coupons for customer view (Public)
 * GET /api/coupons/active
 */
export const getActiveCouponsPublic = async (req, res) => {
  try {
    const now = new Date();
    const coupons = await Coupon.find({
      isActive: true,
      $and: [
        { $or: [{ expiresAt: null }, { expiresAt: { $gt: now } }] },
        { $or: [{ startDate: null }, { startDate: { $lte: now } }] },
      ],
    })
      .select("code description discountType discountValue minOrderAmount maxDiscountAmount expiresAt")
      .sort({ createdAt: -1 })
      .limit(10);

    return res.status(200).json({
      success: true,
      data: coupons,
    });
  } catch (error) {
    console.error("Get active coupons error:", error);
    return res.status(500).json({
      success: false,
      message: `Failed to fetch coupons: ${error.message}`,
    });
  }
};
