import type { Role } from "./models.js";
declare global { namespace Express { interface Request { auth?: { userId: string; institutionId: string; role: Role }; requestId?: string; } interface Locals { validatedQuery?: Record<string, unknown>; } } }
export {};
