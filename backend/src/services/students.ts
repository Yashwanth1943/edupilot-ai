import { StudentModel } from "../models/student.js";
import { pagination } from "../utils/pagination.js";

function escaped(value: string) { return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }

export async function listStudents(institutionId: string, query: Record<string, unknown>) {
  const { page, limit, skip } = pagination(query);
  const search = String(query.q ?? "").trim();
  const filter = { institutionId, ...(search ? { $or: [{ fullName: new RegExp(escaped(search), "i") }, { studentId: new RegExp(escaped(search), "i") }, { email: new RegExp(escaped(search), "i") }] } : {}), ...(query.status ? { status: query.status } : {}) };
  const sortField = ["createdAt", "fullName", "studentId", "enrollmentDate"].includes(String(query.sort)) ? String(query.sort) : "createdAt";
  const sortDirection = query.order === "asc" ? 1 : -1;
  const [items, total] = await Promise.all([StudentModel.find(filter).sort({ [sortField]: sortDirection }).skip(skip).limit(limit), StudentModel.countDocuments(filter)]);
  return { items, meta: { page, limit, total, pages: Math.ceil(total / limit) } };
}

export function getStudent(institutionId: string, id: string) { return StudentModel.findOne({ _id: id, institutionId }); }
export function createStudent(institutionId: string, input: Record<string, unknown>) { return StudentModel.create({ ...input, institutionId }); }
export function updateStudent(institutionId: string, id: string, input: Record<string, unknown>) { return StudentModel.findOneAndUpdate({ _id: id, institutionId }, { $set: input }, { new: true, runValidators: true }); }
export function archiveStudent(institutionId: string, id: string) { return StudentModel.findOneAndUpdate({ _id: id, institutionId }, { $set: { status: "Inactive" } }, { new: true, runValidators: true }); }
