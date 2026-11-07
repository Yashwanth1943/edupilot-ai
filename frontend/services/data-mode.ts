export type DataMode = "mock" | "api";

export const dataMode: DataMode = process.env.NODE_ENV === "production" ? "api" : process.env.NEXT_PUBLIC_DATA_MODE === "api" ? "api" : "mock";
export const apiBaseUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000/api";
