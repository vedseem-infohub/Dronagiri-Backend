import genToken from "../config/token.js";
import User from "../models/user.model.js";
import bcrypt from "bcryptjs";

export const signUp = async (req, res) => {

    try {

        const { name, email, password } = req.body

        const existEmail = await User.findOne({ email })

        if (existEmail) {
            return res.status(400).json({ message: "email already exist" })
        }

        if (password.length < 6) {
            return res.status(400).json({ message: "password must be atleast 6 characters !" })
        }

        if (password.length > 12) {
            return res.status(400).json({ message: "password must be  atmost 12 characters !" })
        }

        const hashedPassword = await bcrypt.hash(password, 10)

        const user = await User.create({
            name, password: hashedPassword, email
        })

        const token = await genToken(user._id)

        const isSecure = process.env.NODE_ENV === "production" ||
            req.secure ||
            req.headers["x-forwarded-proto"] === "https" ||
            (process.env.ALLOWED_ORIGINS && !process.env.ALLOWED_ORIGINS.includes("localhost"));

        res.cookie("token", token, {
            httpOnly: true,
            maxAge: 1 * 24 * 60 * 60 * 1000,
            sameSite: isSecure ? "none" : "lax",
            secure: isSecure,
        })

        const userData = user.toObject ? user.toObject() : user;
        return res.status(201).json({ ...userData, token })

    } catch (error) {
        return res.status(500).json({ message: `signUp error ${error}` })
    }

}
export const Login = async (req, res) => {

    try {

        const { email, password } = req.body

        const user = await User.findOne({ email })

        if (!user) {
            return res.status(400).json({ message: "email does not exist" })
        }

        const isMatch = await bcrypt.compare(password, user.password)

        if (!isMatch) {
            return res.status(400).json({ message: "incorrect password" })
        }

        const token = await genToken(user._id)

        const isSecure = process.env.NODE_ENV === "production" ||
            req.secure ||
            req.headers["x-forwarded-proto"] === "https" ||
            (process.env.ALLOWED_ORIGINS && !process.env.ALLOWED_ORIGINS.includes("localhost"));

        res.cookie("token", token, {
            httpOnly: true,
            maxAge: 1 * 24 * 60 * 60 * 1000,
            sameSite: isSecure ? "none" : "lax",
            secure: isSecure,
        })

        const userData = user.toObject ? user.toObject() : user;
        return res.status(200).json({ ...userData, token })

    } catch (error) {
        return res.status(500).json({ message: `Login error ${error}` })
    }

}

export const LogOut = async (req, res) => {
    try {
        const isSecure = process.env.NODE_ENV === "production" ||
            req.secure ||
            req.headers["x-forwarded-proto"] === "https" ||
            (process.env.ALLOWED_ORIGINS && !process.env.ALLOWED_ORIGINS.includes("localhost"));
        res.clearCookie("token", {
            httpOnly: true,
            sameSite: isSecure ? "none" : "lax",
            secure: isSecure
        })
        return res.status(200).json({ message: "log out successfully" })
    } catch (error) {
        return res.status(500).json({ message: `log out error ${error}` })
    }
}
