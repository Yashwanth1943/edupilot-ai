import bcrypt from "bcryptjs";
import { startSession } from "mongoose";
import { ApiError } from "../middleware/errors.js";
import { InstitutionModel } from "../models/institution.js";
import { UserModel } from "../models/user.js";
import { slugify } from "../utils/slug.js";

let initializationInProgress = false;

export async function setupStatus() {
  const institutionCount = await InstitutionModel.countDocuments();
  return { initialized: institutionCount > 0 };
}

export async function initializePlatform(input: { institutionName: string; institutionCode: string; adminName: string; adminEmail: string; adminPassword: string }) {
  if (initializationInProgress) throw new ApiError(409, "Initialization is already in progress.");
  initializationInProgress = true;
  const session = await startSession();
  try {
    let result: { institutionId: string; adminId: string } | undefined;
    await session.withTransaction(async () => {
      if (await InstitutionModel.findOne({}, null, { session }).lean()) throw new ApiError(409, "EduPilot AI has already been initialized.");
      const [institution] = await InstitutionModel.create([{ name: input.institutionName.trim(), code: input.institutionCode.trim().toUpperCase(), slug: slugify(input.institutionCode) }], { session });
      if (!institution) throw new ApiError(500, "Institution initialization failed.");
      const passwordHash = await bcrypt.hash(input.adminPassword, 12);
      const [admin] = await UserModel.create([{ institutionId: institution._id, name: input.adminName.trim(), email: input.adminEmail.trim().toLowerCase(), passwordHash, role: "Admin", accountStatus: "Active" }], { session });
      if (!admin) throw new ApiError(500, "Admin initialization failed.");
      result = { institutionId: institution._id.toString(), adminId: admin._id.toString() };
    });
    return result!;
  } finally { await session.endSession(); initializationInProgress = false; }
}
