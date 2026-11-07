import { Schema, model, type InferSchemaType } from "mongoose";
const schema = new Schema({ institutionId: { type: Schema.Types.ObjectId, ref: "Institution", required: true, index: true }, studentId: { type: Schema.Types.ObjectId, ref: "Student", required: true }, subjectId: { type: Schema.Types.ObjectId, ref: "Subject", required: true }, assignedAt: { type: Date, default: Date.now }, assignedBy: { type: Schema.Types.ObjectId, ref: "User", required: true }, status: { type: String, enum: ["Active", "Removed"], default: "Active" } }, { versionKey: false });
schema.index({ institutionId: 1, studentId: 1, subjectId: 1, status: 1 }, { unique: true, partialFilterExpression: { status: "Active" } });
export type AssignmentDocument = InferSchemaType<typeof schema>;
export const AssignmentModel = model("StudentSubjectAssignment", schema);
