import User from "../models/user.model.js"

export const getCurrenUser=async (req, res)=>{
    try {
        const userId = req.userId
        const user=await User.findById(userId).select("-password")
        if(!user){
            return res.status(400).json({message:"user not find"})
        }
        return res.status(200).json(user)
    } catch (error) {
        return res.status(400).json({message:"get current user error"})
    }
}

export const updateAddress = async (req, res) => {
    try {
        const userId = req.userId
        const { phone, address, landmark, pincode } = req.body

        if (!phone || !address || !pincode) {
            return res.status(400).json({ message: "Phone, Address, and Pincode are required" })
        }

        const user = await User.findByIdAndUpdate(
            userId,
            { phone, address, landmark: landmark || "", pincode },
            { new: true }
        ).select("-password")

        if (!user) {
            return res.status(400).json({ message: "user not find" })
        }

        return res.status(200).json(user)
    } catch (error) {
        return res.status(500).json({ message: `update address error ${error}` })
    }
}