import "dotenv/config";
import { createApp } from "./app.js";
import { connectDatabase } from "./config/database.js";
import { loadEnv } from "./config/env.js";

const env = loadEnv();
connectDatabase(env.MONGODB_URI).then(() => { const server = createApp(env).listen(env.PORT, () => console.log(`EduPilot API listening on port ${env.PORT}`)); const shutdown = async (signal: string) => { console.log(`${signal}: shutting down`); server.close(async () => { const { disconnectDatabase } = await import("./config/database.js"); await disconnectDatabase(); process.exit(0); }); }; process.on("SIGINT", () => void shutdown("SIGINT")); process.on("SIGTERM", () => void shutdown("SIGTERM")); }).catch((error) => { console.error("Database connection failed", error); process.exit(1); });
