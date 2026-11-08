import { Schema, model, type InferSchemaType } from "mongoose";
import type { Role } from "../types/models.js";
const emailValidator = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const schema = new Schema({ institutionId: { type: Schema.Types.ObjectId, ref: "Institution", required: true, index: true }, name: { type: String, required: true, trim: true }, email: { type: String, required: true, lowercase: true, trim: true, match: emailValidator }, passwordHash: { type: String, required: true, select: false }, role: { type: String, enum: ["Admin", "Mentor"], default: "Mentor" as Role }, accountStatus: { type: String, enum: ["Active", "Suspended"], default: "Active" } }, { timestamps: true, versionKey: false });
schema.index({ institutionId: 1, email: 1 }, { unique: true });
export type UserDocument = InferSchemaType<typeof schema>;
export const UserModel = model("User", schema);
