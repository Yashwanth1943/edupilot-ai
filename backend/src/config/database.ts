import mongoose from "mongoose";

export type DatabaseStatus = "connected" | "connecting" | "disconnected" | "disconnecting";

export async function connectDatabase(uri: string) {
  mongoose.set("strictQuery", true);
  mongoose.connection.on("connected", () => console.log("MongoDB connection established."));
  mongoose.connection.on("disconnected", () => console.warn("MongoDB connection disconnected."));
  await mongoose.connect(uri);
}

export function getDatabaseStatus(): DatabaseStatus {
  const states: Record<number, DatabaseStatus> = { 0: "disconnected", 1: "connected", 2: "connecting", 3: "disconnecting" };
  return states[mongoose.connection.readyState] ?? "disconnected";
}

export async function disconnectDatabase() { await mongoose.disconnect(); }
