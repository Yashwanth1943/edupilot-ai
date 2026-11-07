import mongoose from "mongoose";
export async function connectDatabase(uri: string) { mongoose.set("strictQuery", true); await mongoose.connect(uri); }
export async function disconnectDatabase() { await mongoose.disconnect(); }
