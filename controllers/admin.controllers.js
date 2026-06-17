import User from "../models/user.model.js";
import bcrypt from "bcryptjs";

const VALID_ADMIN_ROLES = ["admin", "super_admin", "store_manager", "inventory_manager", "sales_viewer", "support"];

// 1. Get all admins
export const getAdmins = async (req, res) => {
  try {
    const users = await User.find({ role: { $ne: "customer" } }).sort({ createdAt: -1 });
    const mapped = users.map((u) => ({
      id: u._id,
      name: u.name,
      email: u.email,
      role: u.role,
      status: u.status || "active",
      added: u.createdAt ? u.createdAt.toISOString().split("T")[0] : new Date().toISOString().split("T")[0],
      lastLogin: "—",
      avatar: u.name ? u.name.charAt(0).toUpperCase() : "A"
    }));
    return res.status(200).json(mapped);
  } catch (error) {
    return res.status(500).json({ message: `Get admins error: ${error.message}` });
  }
};

// 2. Create new admin
export const createAdmin = async (req, res) => {
  try {
    const { name, email, password, role, status } = req.body;

    // Validate name, email, password
    if (!name || !email || !password) {
      return res.status(400).json({ message: "Name, email, and password are required" });
    }

    // Role section is REQUIRED and must be validated
    if (!role) {
      return res.status(400).json({ message: "Role is required" });
    }
    if (!VALID_ADMIN_ROLES.includes(role)) {
      return res.status(400).json({ message: `Invalid role. Must be one of: ${VALID_ADMIN_ROLES.join(", ")}` });
    }

    // Check if email already exists
    const existEmail = await User.findOne({ email });
    if (existEmail) {
      return res.status(400).json({ message: "Email already exists" });
    }

    if (password.length < 6) {
      return res.status(400).json({ message: "Password must be at least 6 characters" });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const user = await User.create({
      name,
      email,
      password: hashedPassword,
      role,
      status: status || "active"
    });

    const mapped = {
      id: user._id,
      name: user.name,
      email: user.email,
      role: user.role,
      status: user.status,
      added: user.createdAt ? user.createdAt.toISOString().split("T")[0] : new Date().toISOString().split("T")[0],
      lastLogin: "—",
      avatar: user.name.charAt(0).toUpperCase()
    };

    return res.status(201).json(mapped);
  } catch (error) {
    return res.status(500).json({ message: `Create admin error: ${error.message}` });
  }
};

// 3. Edit admin
export const updateAdmin = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, email, password, role, status } = req.body;

    // Validate inputs
    if (!name || !email) {
      return res.status(400).json({ message: "Name and email are required" });
    }

    // Role section is REQUIRED and must be validated
    if (!role) {
      return res.status(400).json({ message: "Role is required" });
    }
    if (!VALID_ADMIN_ROLES.includes(role)) {
      return res.status(400).json({ message: `Invalid role. Must be one of: ${VALID_ADMIN_ROLES.join(", ")}` });
    }

    const user = await User.findById(id);
    if (!user) {
      return res.status(404).json({ message: "Admin user not found" });
    }

    // Check if email is already taken by another user
    if (email !== user.email) {
      const existEmail = await User.findOne({ email });
      if (existEmail) {
        return res.status(400).json({ message: "Email already exists" });
      }
    }

    user.name = name;
    user.email = email;
    user.role = role;
    user.status = status || user.status;

    if (password) {
      if (password.length < 6) {
        return res.status(400).json({ message: "Password must be at least 6 characters" });
      }
      user.password = await bcrypt.hash(password, 10);
    }

    await user.save();

    const mapped = {
      id: user._id,
      name: user.name,
      email: user.email,
      role: user.role,
      status: user.status,
      added: user.createdAt ? user.createdAt.toISOString().split("T")[0] : new Date().toISOString().split("T")[0],
      lastLogin: "—",
      avatar: user.name.charAt(0).toUpperCase()
    };

    return res.status(200).json(mapped);
  } catch (error) {
    return res.status(500).json({ message: `Update admin error: ${error.message}` });
  }
};

// 4. Delete admin
export const deleteAdmin = async (req, res) => {
  try {
    const { id } = req.params;
    const user = await User.findByIdAndDelete(id);
    if (!user) {
      return res.status(404).json({ message: "Admin user not found" });
    }
    return res.status(200).json({ message: "Admin deleted successfully" });
  } catch (error) {
    return res.status(500).json({ message: `Delete admin error: ${error.message}` });
  }
};

// 5. Get all customers with their order stats
export const getCustomers = async (req, res) => {
  try {
    const customers = await User.aggregate([
      { $match: { role: "customer" } },
      {
        $lookup: {
          from: "orders",
          localField: "_id",
          foreignField: "userId",
          as: "orders"
        }
      },
      {
        $project: {
          _id: 0,
          id: "$_id",
          name: 1,
          email: 1,
          phone: 1,
          city: { $ifNull: ["$address", "N/A"] },
          orders: { $size: "$orders" },
          totalSpent: { $sum: "$orders.total" },
          joined: { $ifNull: ["$createdAt", new Date()] }
        }
      },
      { $sort: { joined: -1 } }
    ]);
    return res.status(200).json(customers);
  } catch (error) {
    return res.status(500).json({ message: `Get customers error: ${error.message}` });
  }
};

