import { Schema, model, type InferSchemaType } from "mongoose";
const schema = new Schema({ institutionId: { type: Schema.Types.ObjectId, ref: "Institution", required: true, index: true }, subjectId: { type: String, required: true, trim: true }, name: { type: String, required: true, trim: true }, description: { type: String, required: true }, department: { type: String, required: true }, totalModules: { type: Number, required: true, min: 1 }, status: { type: String, enum: ["Active", "Draft", "Archived"], default: "Active" } }, { timestamps: true, versionKey: false });
schema.index({ institutionId: 1, subjectId: 1 }, { unique: true });
export type SubjectDocument = InferSchemaType<typeof schema>;
export const SubjectModel = model("Subject", schema);
