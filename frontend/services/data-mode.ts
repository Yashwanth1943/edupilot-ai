export type DataMode = "mock" | "api";

export const dataMode: DataMode = process.env.NEXT_PUBLIC_DATA_MODE === "mock" ? "mock" : "api";
export const apiBaseUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000/api";
