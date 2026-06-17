import mongoose from "mongoose";
import User from "../models/user.model.js";
import bcrypt from "bcryptjs";

const seedAdmin = async () => {
  try {
    const adminEmail = "admin@dronagiri.com";
    const existAdmin = await User.findOne({ email: adminEmail });
    if (!existAdmin) {
      const hashedPassword = await bcrypt.hash("admin123", 10);
      await User.create({
        name: "Admin User",
        email: adminEmail,
        password: hashedPassword,
        role: "admin"
      });
      console.log("Admin user seeded successfully");
    } else if (existAdmin.role !== "admin") {
      existAdmin.role = "admin";
      await existAdmin.save();
      console.log("Admin user role updated to admin successfully");
    }
  } catch (error) {
    console.error("Seeding admin error:", error);
  }
};

const connectDb = async () => {
  
    try {
        await mongoose.connect(process.env.MONGODB_URL)
        console.log("db connected")
        await seedAdmin();
    } catch (error) {
        console.log(error)
    }

}

export default connectDb;
