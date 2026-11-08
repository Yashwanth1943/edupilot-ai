import { StudentModel } from "../models/student.js";
import { AssignmentModel } from "../models/assignment.js";
import { pagination } from "../utils/pagination.js";

function escaped(value: string) { return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }

export async function listStudents(institutionId: string, query: Record<string, unknown>) {
  const { page, limit, skip } = pagination(query);
  const search = String(query.q ?? "").trim();
  const filter = { institutionId, ...(search ? { $or: [{ fullName: new RegExp(escaped(search), "i") }, { studentId: new RegExp(escaped(search), "i") }, { email: new RegExp(escaped(search), "i") }, { phone: new RegExp(escaped(search), "i") }] } : {}), ...(query.status ? { status: query.status } : {}) };
  const sortField = ["createdAt", "fullName", "studentId", "enrollmentDate"].includes(String(query.sort)) ? String(query.sort) : "createdAt";
  const sortDirection = query.order === "asc" ? 1 : -1;
  const [docs, total] = await Promise.all([
    StudentModel.find(filter).sort({ [sortField]: sortDirection }).skip(skip).limit(limit).lean(),
    StudentModel.countDocuments(filter)
  ]);

  const studentIds = docs.map((doc) => doc._id);
  const activeAssignments = await AssignmentModel.find({
    institutionId,
    studentId: { $in: studentIds },
    status: "Active"
  }).select("studentId subjectId").lean();

  const assignmentsByStudent = new Map<string, string[]>();
  for (const assignment of activeAssignments) {
    const sId = assignment.studentId.toString();
    const subId = assignment.subjectId.toString();
    const list = assignmentsByStudent.get(sId);
    if (list) {
      list.push(subId);
    } else {
      assignmentsByStudent.set(sId, [subId]);
    }
  }

  const items = docs.map((doc) => ({
    ...doc,
    subjectIds: assignmentsByStudent.get(doc._id.toString()) || []
  }));

  return { items, meta: { page, limit, total, pages: Math.ceil(total / limit) } };
}

export async function getStudent(institutionId: string, id: string) {
  const doc = await StudentModel.findOne({ _id: id, institutionId }).lean();
  if (!doc) return null;
  const activeAssignments = await AssignmentModel.find({
    institutionId,
    studentId: doc._id,
    status: "Active"
  }).select("subjectId").lean();

  return {
    ...doc,
    subjectIds: activeAssignments.map((a) => a.subjectId.toString())
  };
}
export function createStudent(institutionId: string, input: Record<string, unknown>) { return StudentModel.create({ ...input, institutionId }); }
export function updateStudent(institutionId: string, id: string, input: Record<string, unknown>) { return StudentModel.findOneAndUpdate({ _id: id, institutionId }, { $set: input }, { new: true, runValidators: true }); }
export function archiveStudent(institutionId: string, id: string) { return StudentModel.findOneAndUpdate({ _id: id, institutionId }, { $set: { status: "Inactive" } }, { new: true, runValidators: true }); }
