import { Schema, model, type InferSchemaType } from "mongoose";
const schema = new Schema({ institutionId: { type: Schema.Types.ObjectId, ref: "Institution", required: true, index: true }, studentId: { type: String, required: true, trim: true }, fullName: { type: String, required: true, trim: true }, email: { type: String, required: true, lowercase: true, trim: true }, phone: String, department: String, enrollmentDate: { type: Date, required: true }, status: { type: String, enum: ["Active", "Inactive"], default: "Active" } }, { timestamps: true, versionKey: false });
schema.index({ institutionId: 1, studentId: 1 }, { unique: true });
export type StudentDocument = InferSchemaType<typeof schema>;
export const StudentModel = model("Student", schema);
