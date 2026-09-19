import jwt  from "jsonwebtoken"

const isAuth = async (req, res, next) => {
    try {
        const token = req.cookies?.token || (req.headers.authorization?.startsWith("Bearer ") ? req.headers.authorization.split(" ")[1] : null);
        if (!token) {
            return res.status(401).json({ message: "token not found" });
        }

        let verifyToken;
        try {
            verifyToken = jwt.verify(token, process.env.JWT_SECRET);
        } catch (jwtErr) {
            return res.status(401).json({ message: "Invalid or expired token" });
        }

        req.userId = verifyToken.userId;
        next();

    } catch (error) {
        console.error("isAuth error:", error);
        return res.status(500).json({ message: "Internal server error in auth" });
    }
  
}

export default isAuth
