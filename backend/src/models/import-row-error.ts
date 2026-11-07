import { Schema, model, type InferSchemaType } from "mongoose";
const schema = new Schema({ batchId: { type: Schema.Types.ObjectId, ref: "ImportBatch", required: true, index: true }, institutionId: { type: Schema.Types.ObjectId, ref: "Institution", required: true, index: true }, spreadsheetRowNumber: { type: Number, required: true }, originalRow: { type: Schema.Types.Mixed, required: true }, classification: { type: String, enum: ["Warning", "Invalid"], required: true }, errorCode: { type: String, required: true }, errorMessage: { type: String, required: true } }, { timestamps: true, versionKey: false });
schema.index({ institutionId: 1, batchId: 1, spreadsheetRowNumber: 1 });
export type ImportRowErrorDocument = InferSchemaType<typeof schema>;
export const ImportRowErrorModel = model("ImportRowError", schema);
