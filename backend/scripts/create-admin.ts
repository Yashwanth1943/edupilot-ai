import "dotenv/config";
import bcrypt from "bcryptjs";
import { connectDatabase, disconnectDatabase } from "../src/config/database.js";
import { InstitutionModel } from "../src/models/institution.js";
import { UserModel } from "../src/models/user.js";
import { loadEnv } from "../src/config/env.js";

const required = ["INITIAL_ADMIN_NAME", "INITIAL_ADMIN_EMAIL", "INITIAL_ADMIN_PASSWORD", "INITIAL_INSTITUTION_NAME", "INITIAL_INSTITUTION_CODE"] as const;
const values = Object.fromEntries(required.map((key) => [key, process.env[key]]));
if (required.some((key) => !values[key])) throw new Error(`Set ${required.join(", ")} in the environment before running the admin bootstrap.`);
const env = loadEnv();
await connectDatabase(env.MONGODB_URI);
try { const institution = await InstitutionModel.create({ name: values.INITIAL_INSTITUTION_NAME, code: values.INITIAL_INSTITUTION_CODE, slug: `${values.INITIAL_INSTITUTION_CODE!.toLowerCase()}-${Date.now()}` }); await UserModel.create({ institutionId: institution._id, name: values.INITIAL_ADMIN_NAME, email: values.INITIAL_ADMIN_EMAIL, passwordHash: await bcrypt.hash(values.INITIAL_ADMIN_PASSWORD!, 12), role: "Admin" }); console.log(`Created initial admin for ${institution.name}.`); } finally { await disconnectDatabase(); }
