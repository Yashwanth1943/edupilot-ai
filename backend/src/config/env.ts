import { z } from "zod";
const schema = z.object({ NODE_ENV: z.enum(["development", "test", "production"]).default("development"), PORT: z.coerce.number().int().positive().default(4000), MONGODB_URI: z.string().min(1), JWT_SECRET: z.string().min(32), FRONTEND_ORIGIN: z.string().url().default("http://localhost:3000"), COOKIE_NAME: z.string().default("edupilot_session") });
export type Env = z.infer<typeof schema>;
export function loadEnv(): Env { const result = schema.safeParse(process.env); if (!result.success) throw new Error(`Invalid environment configuration: ${result.error.message}`); return result.data; }
