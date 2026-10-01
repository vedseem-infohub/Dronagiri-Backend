import Category, { generateSlug } from "../models/category.model.js";
import Product from "../models/product.model.js";

const DEFAULT_CATEGORIES = [
  { name: "Spices", nameHindi: "मसाले", description: "Farm-fresh pure spices with rich aroma and natural flavor.", displayOrder: 1 },
  { name: "Millets", nameHindi: "मिलेट्स", description: "Wholesome nutritious finger millets and grains.", displayOrder: 2 },
  { name: "Pulses", nameHindi: "दालें", description: "High protein, farm-harvested unpolished pulses.", displayOrder: 3 },
  { name: "Rice", nameHindi: "चावल", description: "Aromatic indigenous farm rice varieties.", displayOrder: 4 },
  { name: "Wheat & Grains", nameHindi: "गेहूं और अनाज", description: "Natural whole wheat and ancient grains.", displayOrder: 5 },
  { name: "Oils & Ghee", nameHindi: "तेल और घी", description: "Cold-pressed natural oils and pure desi ghee.", displayOrder: 6 },
  { name: "Sweeteners", nameHindi: "प्राकृतिक मिठास", description: "Unrefined jaggery, honey and organic sweeteners.", displayOrder: 7 },
  { name: "Nuts & Seeds", nameHindi: "मेवे और बीज", description: "Protein-rich healthy nuts, seeds and dry fruits.", displayOrder: 8 },
];

/**
 * Ensure default categories exist if collection is empty
 */
async function seedDefaultCategoriesIfEmpty() {
  try {
    const count = await Category.countDocuments();
    if (count === 0) {
      console.log("🌱 [Category] Seeding default product categories...");
      for (const item of DEFAULT_CATEGORIES) {
        await Category.create({
          ...item,
          slug: generateSlug(item.name),
        });
      }
      console.log("✅ [Category] Default categories seeded successfully.");
    }
  } catch (err) {
    console.error("Error seeding default categories:", err);
  }
}

/**
 * GET /api/categories
 * Returns all categories along with live product count
 */
export async function getCategories(req, res) {
  try {
    await seedDefaultCategoriesIfEmpty();

    const categories = await Category.find().sort({ displayOrder: 1, name: 1 });

    // Aggregate product counts per category
    const productCounts = await Product.aggregate([
      { $group: { _id: "$category", count: { $sum: 1 } } },
    ]);

    const countMap = {};
    productCounts.forEach((item) => {
      if (item._id) countMap[item._id.toLowerCase()] = item.count;
    });

    const result = categories.map((cat) => {
      const plain = cat.toObject();
      return {
        ...plain,
        productCount: countMap[cat.name.toLowerCase()] || 0,
      };
    });

    res.set("Cache-Control", "public, max-age=120, stale-while-revalidate=600");
    res.status(200).json(result);
  } catch (error) {
    console.error("getCategories error:", error);
    res.status(500).json({ success: false, message: "Failed to fetch categories", error: error.message });
  }
}

/**
 * POST /api/categories
 * Admin adds a new product category
 */
export async function createCategory(req, res) {
  try {
    const { name, nameHindi = "", description = "", imageUrl = "", active = true, displayOrder = 0 } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({ success: false, message: "Category name is required" });
    }

    const trimmedName = name.trim();
    const slug = generateSlug(trimmedName);

    // Concurrency / Idempotency check: category created in last 5 seconds with same name
    const recentDuplicate = await Category.findOne({
      name: { $regex: new RegExp(`^${trimmedName}$`, "i") },
      createdAt: { $gte: new Date(Date.now() - 5000) },
    });
    if (recentDuplicate) {
      return res.status(200).json(recentDuplicate);
    }

    // Check if category name or slug already exists
    const existing = await Category.findOne({
      $or: [
        { name: { $regex: new RegExp(`^${trimmedName}$`, "i") } },
        { slug },
      ],
    });

    if (existing) {
      return res.status(400).json({
        success: false,
        message: `Category with name "${trimmedName}" already exists`,
      });
    }

    const newCategory = await Category.create({
      name: trimmedName,
      nameHindi: nameHindi.trim(),
      slug,
      description: description.trim(),
      imageUrl: imageUrl.trim(),
      active: Boolean(active),
      displayOrder: Number(displayOrder) || 0,
    });

    res.status(201).json(newCategory);
  } catch (error) {
    console.error("createCategory error:", error);
    res.status(500).json({ success: false, message: "Failed to create category", error: error.message });
  }
}

/**
 * PUT /api/categories/:id
 * Admin updates a product category (with product cascade on rename)
 */
export async function updateCategory(req, res) {
  try {
    const { id } = req.params;
    const { name, nameHindi, description, imageUrl, active, displayOrder } = req.body;

    const category = await Category.findById(id);
    if (!category) {
      return res.status(404).json({ success: false, message: "Category not found" });
    }

    const oldName = category.name;
    const newName = name ? name.trim() : oldName;

    // If name is changing, check uniqueness
    if (newName.toLowerCase() !== oldName.toLowerCase()) {
      const slug = generateSlug(newName);
      const duplicate = await Category.findOne({
        _id: { $ne: id },
        $or: [
          { name: { $regex: new RegExp(`^${newName}$`, "i") } },
          { slug },
        ],
      });
      if (duplicate) {
        return res.status(400).json({
          success: false,
          message: `Category "${newName}" already exists`,
        });
      }

      category.name = newName;
      category.slug = slug;

      // Cascade update existing products referencing the old category name
      const updateResult = await Product.updateMany(
        { category: oldName },
        { $set: { category: newName } }
      );
      console.log(`[Category Rename] Renamed "${oldName}" to "${newName}" across ${updateResult.modifiedCount} products.`);
    }

    if (nameHindi !== undefined) category.nameHindi = nameHindi.trim();
    if (description !== undefined) category.description = description.trim();
    if (imageUrl !== undefined) category.imageUrl = imageUrl.trim();
    if (active !== undefined) category.active = Boolean(active);
    if (displayOrder !== undefined) category.displayOrder = Number(displayOrder) || 0;

    const updated = await category.save();

    // Get live product count
    const productCount = await Product.countDocuments({ category: updated.name });

    res.status(200).json({
      ...updated.toObject(),
      productCount,
    });
  } catch (error) {
    console.error("updateCategory error:", error);
    res.status(500).json({ success: false, message: "Failed to update category", error: error.message });
  }
}

/**
 * DELETE /api/categories/:id
 * Admin deletes a product category (protected against deleting categories with assigned products)
 */
export async function deleteCategory(req, res) {
  try {
    const { id } = req.params;
    const { force } = req.query;

    const category = await Category.findById(id);
    if (!category) {
      return res.status(404).json({ success: false, message: "Category not found" });
    }

    // Check if products are currently assigned to this category
    const assignedProductsCount = await Product.countDocuments({ category: category.name });

    if (assignedProductsCount > 0 && force !== "true") {
      return res.status(400).json({
        success: false,
        message: `Cannot delete category "${category.name}" because ${assignedProductsCount} product(s) are currently assigned to it. Please reassign or delete these products first.`,
        productCount: assignedProductsCount,
      });
    }

    await Category.findByIdAndDelete(id);

    res.status(200).json({
      success: true,
      message: `Category "${category.name}" was successfully deleted.`,
    });
  } catch (error) {
    console.error("deleteCategory error:", error);
    res.status(500).json({ success: false, message: "Failed to delete category", error: error.message });
  }
}
