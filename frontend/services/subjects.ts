import type { Subject, SubjectStatus } from "@/types/dashboard";

let subjectStore: Subject[] = [
  { id: "sub-math", name: "Mathematics", description: "Core numeracy, algebra, geometry, and problem solving.", department: "STEM", totalModules: 12, status: "Active" },
  { id: "sub-science", name: "General Science", description: "An exploration of life, physical, and earth sciences.", department: "STEM", totalModules: 10, status: "Active" },
  { id: "sub-english", name: "English Literature", description: "Reading, writing, communication, and critical analysis.", department: "Humanities", totalModules: 8, status: "Active" },
  { id: "sub-history", name: "World History", description: "Key people, places, and events that shaped our world.", department: "Humanities", totalModules: 9, status: "Draft" },
  { id: "sub-cs", name: "Computer Science", description: "Computational thinking, programming, and digital systems.", department: "Technology", totalModules: 14, status: "Active" },
  { id: "sub-art", name: "Visual Arts", description: "Creative expression through visual media and design.", department: "Creative Arts", totalModules: 7, status: "Archived" },
];

export interface SubjectInput {
  name: string;
  description: string;
  department: string;
  totalModules: number;
  status: SubjectStatus;
}

export function listSubjects(): Subject[] { return [...subjectStore]; }
export function getSubjectById(id: string): Subject | undefined { return subjectStore.find((subject) => subject.id === id); }
export function createSubject(input: SubjectInput): Subject { const subject = { ...input, id: `sub-${Date.now()}` }; subjectStore = [subject, ...subjectStore]; return subject; }
export function updateSubject(id: string, input: SubjectInput): Subject | undefined { subjectStore = subjectStore.map((subject) => subject.id === id ? { ...subject, ...input } : subject); return getSubjectById(id); }
export function deleteSubject(id: string): boolean { const next = subjectStore.filter((subject) => subject.id !== id); const deleted = next.length !== subjectStore.length; subjectStore = next; return deleted; }
