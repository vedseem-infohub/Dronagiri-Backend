import jwt from "jsonwebtoken";
import User from "../models/user.model.js";

const isAdmin = async (req, res, next) => {
  try {
    const token = req.cookies?.token || (req.headers.authorization?.startsWith("Bearer ") ? req.headers.authorization.split(" ")[1] : null);
    if (!token) {
      return res.status(401).json({ message: "Unauthorized: Token not found" });
    }

    let verifyToken;
    try {
      verifyToken = jwt.verify(token, process.env.JWT_SECRET);
    } catch (jwtErr) {
      return res.status(401).json({ message: "Unauthorized: Invalid or expired token" });
    }
    req.userId = verifyToken.userId;

    const user = await User.findById(req.userId);
    const adminRoles = ["admin", "super_admin", "store_manager", "inventory_manager", "sales_viewer", "support"];
    if (!user || !adminRoles.includes(user.role) || user.status === "inactive") {
      return res.status(403).json({ message: "Forbidden: Admin access required or account is deactivated" });
    }

    next();
  } catch (error) {
    console.error("isAdmin middleware error:", error);
    return res.status(500).json({ message: "Internal server error in admin auth" });
  }
};

export default isAdmin;
