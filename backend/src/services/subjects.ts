import { AssignmentModel } from "../models/assignment.js";
import { SubjectModel } from "../models/subject.js";
import { pagination } from "../utils/pagination.js";

function escaped(value: string) { return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }

export async function listSubjects(institutionId: string, query: Record<string, unknown>) {
  const { page, limit, skip } = pagination(query);
  const search = String(query.q ?? "").trim();
  const filter = { institutionId, ...(search ? { $or: [{ name: new RegExp(escaped(search), "i") }, { subjectId: new RegExp(escaped(search), "i") }, { department: new RegExp(escaped(search), "i") }] } : {}), ...(query.status ? { status: query.status } : {}) };
  const sortField = ["createdAt", "name", "subjectId", "totalModules"].includes(String(query.sort)) ? String(query.sort) : "createdAt";
  const sortDirection = query.order === "asc" ? 1 : -1;
  const [items, total, counts] = await Promise.all([
    SubjectModel.find(filter).sort({ [sortField]: sortDirection }).skip(skip).limit(limit),
    SubjectModel.countDocuments(filter),
    AssignmentModel.aggregate([{ $match: { institutionId, status: "Active" } }, { $group: { _id: "$subjectId", count: { $sum: 1 } } }]),
  ]);
  const countBySubject = new Map(counts.map((entry) => [entry._id.toString(), entry.count]));
  return { items: items.map((item) => ({ ...item.toObject(), enrolledStudentCount: countBySubject.get(item._id.toString()) ?? 0 })), meta: { page, limit, total, pages: Math.ceil(total / limit) } };
}

export function getSubject(institutionId: string, id: string) { return SubjectModel.findOne({ _id: id, institutionId }); }
export function createSubject(institutionId: string, input: Record<string, unknown>) { return SubjectModel.create({ ...input, institutionId }); }
export function updateSubject(institutionId: string, id: string, input: Record<string, unknown>) { return SubjectModel.findOneAndUpdate({ _id: id, institutionId }, { $set: input }, { new: true, runValidators: true }); }
export function archiveSubject(institutionId: string, id: string) { return SubjectModel.findOneAndUpdate({ _id: id, institutionId }, { $set: { status: "Archived" } }, { new: true, runValidators: true }); }
