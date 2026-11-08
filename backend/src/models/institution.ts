import { Schema, model, type InferSchemaType } from "mongoose";
const schema = new Schema({ name: { type: String, required: true, trim: true }, code: { type: String, required: true, uppercase: true, trim: true }, slug: { type: String, required: true, unique: true, trim: true }, status: { type: String, enum: ["Active", "Suspended"], default: "Active" } }, { timestamps: true, versionKey: false });
schema.index({ code: 1 }, { unique: true });
export type InstitutionDocument = InferSchemaType<typeof schema>;
export const InstitutionModel = model("Institution", schema);
