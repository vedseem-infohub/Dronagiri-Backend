import mongoose from "mongoose";

const userSchema=new mongoose.Schema({
    name:{
        type:String,
        required:true,
    },
    email:{
        type:String,
        required:true,
        unique:true,
    },
    password:{
        type:String,
        required:true,
    },
    phone:{
        type:String,
        default:""
    },
    address:{
        type:String,
        default:""
    },
    landmark:{
        type:String,
        default:""
    },
    pincode:{
        type:String,
        default:""
    },
    role:{
        type:String,
        enum:["customer", "admin", "super_admin", "store_manager", "inventory_manager", "sales_viewer", "support"],
        default:"customer"
    },
    status:{
        type:String,
        enum:["active", "inactive"],
        default:"active"
    }
}, {timestamps:true})

const User=mongoose.model("User",userSchema)
export default User