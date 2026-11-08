import { AssignmentModel } from "../models/assignment.js";
import { StudentModel } from "../models/student.js";
import { SubjectModel } from "../models/subject.js";
import { ApiError } from "../middleware/errors.js";

export async function assignSubject(institutionId: string, studentId: string, subjectId: string, assignedBy: string) {
  const [student, subject] = await Promise.all([StudentModel.findOne({ _id: studentId, institutionId }), SubjectModel.findOne({ _id: subjectId, institutionId })]);
  if (!student || !subject) throw new ApiError(404, "Student or subject not found.");
  const existing = await AssignmentModel.findOne({ institutionId, studentId, subjectId }).sort({ status: 1 });
  if (existing?.status === "Active") throw new ApiError(409, "This subject is already assigned to the student.");
  if (existing) return AssignmentModel.findOneAndUpdate({ _id: existing._id, institutionId }, { $set: { status: "Active", assignedAt: new Date(), assignedBy } }, { new: true, runValidators: true });
  return AssignmentModel.create({ institutionId, studentId, subjectId, assignedBy });
}

export function listStudentAssignments(institutionId: string, studentId: string) { return AssignmentModel.find({ institutionId, studentId, status: "Active" }).populate("subjectId").sort({ assignedAt: -1 }); }
export function listSubjectAssignments(institutionId: string, subjectId: string) { return AssignmentModel.find({ institutionId, subjectId, status: "Active" }).populate("studentId").sort({ assignedAt: -1 }); }
export async function removeAssignment(institutionId: string, studentId: string, subjectId: string) { const item = await AssignmentModel.findOneAndUpdate({ institutionId, studentId, subjectId, status: "Active" }, { $set: { status: "Removed" } }, { new: true, runValidators: true }); if (!item) throw new ApiError(404, "Assignment not found."); return item; }
