import type { RequestHandler } from "express";
import { z } from "zod";
import { initializePlatform, setupStatus } from "../services/setup.js";

export const setupSchema = z.object({ body: z.object({ institutionName: z.string().trim().min(2), institutionCode: z.string().trim().min(2).max(32).regex(/^[a-zA-Z0-9_-]+$/), adminName: z.string().trim().min(2), adminEmail: z.string().email(), adminPassword: z.string().min(12) }), params: z.object({}), query: z.object({}) });
export const setupStatusController: RequestHandler = async (_request, response, next) => { try { response.json({ data: await setupStatus() }); } catch (error) { next(error); } };
export const initializeController: RequestHandler = async (request, response, next) => { try { response.status(201).json({ data: await initializePlatform(request.body) }); } catch (error) { next(error); } };
