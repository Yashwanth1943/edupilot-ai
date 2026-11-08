import { Schema, model, type InferSchemaType } from "mongoose";
const emailValidator = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const schema = new Schema(
  {
    institutionId: { type: Schema.Types.ObjectId, ref: "Institution", required: true, index: true },
    studentId: { type: String, required: true, trim: true },
    fullName: { type: String, trim: true, default: "" },
    email: {
      type: String,
      lowercase: true,
      trim: true,
      default: "",
      validate: {
        validator: (v: string | null | undefined) => !v || emailValidator.test(v),
        message: "Invalid email format"
      }
    },
    phone: { type: String, trim: true, default: "" },
    department: String,
    enrollmentDate: { type: Date, default: Date.now },
    status: { type: String, enum: ["Active", "Inactive"], default: "Active" }
  },
  { timestamps: true, versionKey: false }
);
schema.index({ institutionId: 1, studentId: 1 }, { unique: true });
export type StudentDocument = InferSchemaType<typeof schema>;
export const StudentModel = model("Student", schema);
