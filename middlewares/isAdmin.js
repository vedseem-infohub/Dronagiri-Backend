import jwt from "jsonwebtoken";
import User from "../models/user.model.js";

const isAdmin = async (req, res, next) => {
  try {
    const token = req.cookies.token;
    if (!token) {
      return res.status(401).json({ message: "Unauthorized: Token not found" });
    }

    const verifyToken = await jwt.verify(token, process.env.JWT_SECRET);
    req.userId = verifyToken.userId;

    const user = await User.findById(req.userId);
    const adminRoles = ["admin", "super_admin", "store_manager", "inventory_manager", "sales_viewer", "support"];
    if (!user || !adminRoles.includes(user.role) || user.status === "inactive") {
      return res.status(403).json({ message: "Forbidden: Admin access required or account is deactivated" });
    }

    next();
  } catch (error) {
    console.error("isAdmin middleware error:", error);
    return res.status(401).json({ message: "Unauthorized: Invalid token" });
  }
};

export default isAdmin;
