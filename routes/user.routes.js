import express from "express"
import { getCurrenUser, updateAddress } from "../controllers/user.controllers.js"
import isAuth from "../middlewares/isAuth.js"

const userRouter=express.Router()

userRouter.get("/current",isAuth,getCurrenUser)
userRouter.put("/address",isAuth,updateAddress)

export default userRouter