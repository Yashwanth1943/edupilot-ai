import "dotenv/config";
import { createApp } from "./app.js";
import { connectDatabase } from "./config/database.js";
import { loadEnv } from "./config/env.js";

const env = loadEnv();
const server = createApp(env).listen(env.PORT, () => console.log(`EduPilot API listening on port ${env.PORT}`));
const shutdown = async (signal: string) => { console.log(`${signal}: shutting down`); server.close(async () => { const { disconnectDatabase } = await import("./config/database.js"); await disconnectDatabase(); process.exit(0); }); };
process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));
connectDatabase(env.MONGODB_URI).catch((error: unknown) => { console.error("MongoDB connection unavailable; API started in degraded mode.", error instanceof Error ? error.message : "Unknown connection error"); });
