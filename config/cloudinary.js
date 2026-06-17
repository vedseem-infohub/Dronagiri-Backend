import { v2 as cloudinary } from "cloudinary";
import fs from "fs";

const uploadOnCloudinary = async (filePathOrBase64) => {
    cloudinary.config({
        cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
        api_key: process.env.CLOUDINARY_API_KEY,
        api_secret: process.env.CLOUDINARY_API_SECRET,
    });
    try {
        if (!filePathOrBase64) return null;
        const uploadResult = await cloudinary.uploader.upload(filePathOrBase64);
        
        // Clean up temporary local file if it exists
        if (typeof filePathOrBase64 === "string" && fs.existsSync(filePathOrBase64)) {
            fs.unlinkSync(filePathOrBase64);
        }
        
        return uploadResult.secure_url;
    } catch (error) {
        // Clean up temporary local file in case of error
        if (typeof filePathOrBase64 === "string" && fs.existsSync(filePathOrBase64)) {
            fs.unlinkSync(filePathOrBase64);
        }
        console.error("Cloudinary upload failed:", error);
        throw error;
    }
};

export default uploadOnCloudinary;