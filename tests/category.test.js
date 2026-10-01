import mongoose from "mongoose";
import assert from "assert";
import "dotenv/config";
import Category, { generateSlug } from "../models/category.model.js";
import Product from "../models/product.model.js";
import {
  getCategories,
  createCategory,
  updateCategory,
  deleteCategory,
} from "../controllers/category.controllers.js";

async function runCategoryTests() {
  console.log("==================================================");
  console.log("🧪 STARTING PRODUCT CATEGORY TESTS");
  console.log("==================================================");

  const mongoUri = process.env.MONGODB_URL || process.env.MONGO_URI || process.env.MONGODB_URI;
  if (!mongoUri) {
    console.error("No MONGODB_URL provided in env");
    process.exit(1);
  }

  await mongoose.connect(mongoUri);
  console.log("Connected to MongoDB for Category Tests.");

  let passed = 0;
  let failed = 0;

  async function recordAsync(testName, fn) {
    try {
      await fn();
      console.log(`  ✅ [PASS] ${testName}`);
      passed++;
    } catch (err) {
      console.error(`  ❌ [FAIL] ${testName}:`, err.message);
      failed++;
    }
  }

  // 1. Slug generator test
  await recordAsync("generateSlug correctly slugifies category names", () => {
    assert.strictEqual(generateSlug("Wheat & Grains"), "wheat-and-grains");
    assert.strictEqual(generateSlug("Oils & Ghee!"), "oils-and-ghee");
    assert.strictEqual(generateSlug("Organic Herbal Tea 100%"), "organic-herbal-tea-100");
  });

  // 2. getCategories auto-seeding
  await recordAsync("getCategories returns seeded categories with product counts", async () => {
    let mockResJson = null;
    let mockStatusCode = null;
    const req = {};
    const res = {
      status: (code) => {
        mockStatusCode = code;
        return res;
      },
      json: (data) => {
        mockResJson = data;
        return res;
      },
    };

    await getCategories(req, res);
    assert.strictEqual(mockStatusCode, 200);
    assert.ok(Array.isArray(mockResJson));
    assert.ok(mockResJson.length >= 8, `Expected at least 8 categories, got ${mockResJson.length}`);
    const spices = mockResJson.find((c) => c.name === "Spices");
    assert.ok(spices, "Expected Spices category to exist");
    assert.strictEqual(typeof spices.productCount, "number");
  });

  // 3. createCategory
  const testCatName = `Test Category ${Date.now()}`;
  let createdCatId = null;

  await recordAsync("createCategory successfully adds a new category", async () => {
    const req = {
      body: {
        name: testCatName,
        nameHindi: "परीक्षण श्रेणी",
        description: "A category created during testing",
        displayOrder: 99,
      },
    };
    let statusCode = null;
    let resData = null;
    const res = {
      status: (code) => {
        statusCode = code;
        return res;
      },
      json: (data) => {
        resData = data;
        return res;
      },
    };

    await createCategory(req, res);
    assert.strictEqual(statusCode, 201);
    assert.strictEqual(resData.name, testCatName);
    assert.strictEqual(resData.nameHindi, "परीक्षण श्रेणी");
    assert.strictEqual(resData.slug, generateSlug(testCatName));
    createdCatId = resData._id;
  });

  // 4. Duplicate category rejection
  await recordAsync("createCategory rejects duplicate category name", async () => {
    // Wait 5 seconds to bypass concurrency idempotency window and test uniqueness validation
    await new Promise((r) => setTimeout(r, 5200));

    const req = {
      body: {
        name: testCatName,
      },
    };
    let statusCode = null;
    let resData = null;
    const res = {
      status: (code) => {
        statusCode = code;
        return res;
      },
      json: (data) => {
        resData = data;
        return res;
      },
    };

    await createCategory(req, res);
    assert.strictEqual(statusCode, 400);
    assert.ok(resData.message.includes("already exists"));
  });

  // 5. updateCategory with cascade
  const renamedCatName = `${testCatName} Renamed`;
  await recordAsync("updateCategory updates details and cascade-renames products", async () => {
    // Create a temporary test product assigned to testCatName
    const tempProdId = 99990000 + Math.floor(Math.random() * 10000);
    await Product.create({
      id: tempProdId,
      name: "Temporary Test Product",
      category: testCatName,
      description: "Temp product for category rename test",
      variants: [{ size: "1kg", quantity: "1kg", price: 100 }],
      stock: 10,
    });

    const req = {
      params: { id: createdCatId },
      body: {
        name: renamedCatName,
        description: "Updated description",
      },
    };
    let statusCode = null;
    let resData = null;
    const res = {
      status: (code) => {
        statusCode = code;
        return res;
      },
      json: (data) => {
        resData = data;
        return res;
      },
    };

    await updateCategory(req, res);
    assert.strictEqual(statusCode, 200);
    assert.strictEqual(resData.name, renamedCatName);

    // Verify temp product's category was updated to renamedCatName
    const updatedProd = await Product.findOne({ id: tempProdId });
    assert.strictEqual(updatedProd.category, renamedCatName, "Product category should have been cascade updated");

    // Clean up temp product
    await Product.deleteOne({ id: tempProdId });
  });

  // 6. deleteCategory prevents deletion if products exist
  await recordAsync("deleteCategory blocks deletion if products are assigned", async () => {
    const tempProdId2 = 99990000 + Math.floor(Math.random() * 10000);
    await Product.create({
      id: tempProdId2,
      name: "Temporary Guard Product",
      category: renamedCatName,
      description: "Temp product guarding category from deletion",
      variants: [{ size: "1kg", quantity: "1kg", price: 100 }],
      stock: 10,
    });

    const req = { params: { id: createdCatId }, query: {} };
    let statusCode = null;
    let resData = null;
    const res = {
      status: (code) => {
        statusCode = code;
        return res;
      },
      json: (data) => {
        resData = data;
        return res;
      },
    };

    await deleteCategory(req, res);
    assert.strictEqual(statusCode, 400);
    assert.ok(resData.message.includes("Cannot delete category"));
    assert.strictEqual(resData.productCount, 1);

    // Clean up guard product
    await Product.deleteOne({ id: tempProdId2 });
  });

  // 7. deleteCategory succeeds when no products exist
  await recordAsync("deleteCategory succeeds when no products are assigned", async () => {
    const req = { params: { id: createdCatId }, query: {} };
    let statusCode = null;
    let resData = null;
    const res = {
      status: (code) => {
        statusCode = code;
        return res;
      },
      json: (data) => {
        resData = data;
        return res;
      },
    };

    await deleteCategory(req, res);
    assert.strictEqual(statusCode, 200);
    assert.strictEqual(resData.success, true);

    const check = await Category.findById(createdCatId);
    assert.strictEqual(check, null);
  });

  console.log("==================================================");
  console.log(`🏁 CATEGORY TESTS SUMMARY: ${passed} PASSED, ${failed} FAILED`);
  console.log("==================================================");

  await mongoose.disconnect();
  process.exit(failed > 0 ? 1 : 0);
}

runCategoryTests().catch((err) => {
  console.error("Fatal error during category tests:", err);
  process.exit(1);
});
