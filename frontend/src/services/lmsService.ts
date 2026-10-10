import { api } from "./api";
import {
  AssignmentForStudent,
  AssignmentOut,
  Group,
  Paginated,
  StudentDashboard,
  StudentListItem,
  StudentOut,
  SubmissionOut,
  TeacherDashboard,
} from "@/types";

// --- Dashboard ---
export const getTeacherDashboard = () => api.get<TeacherDashboard>("/dashboard/teacher").then((r) => r.data);
export const getStudentDashboard = () => api.get<StudentDashboard>("/dashboard/student").then((r) => r.data);

// --- Students (teacher) ---
export interface StudentQuery {
  search?: string;
  group_id?: string;
  is_active?: boolean;
  page?: number;
  page_size?: number;
}
export const listStudents = (params: StudentQuery) =>
  api.get<Paginated<StudentListItem>>("/students", { params }).then((r) => r.data);
export const getStudent = (id: string) => api.get<StudentOut>(`/students/${id}`).then((r) => r.data);
export const getMyStudentProfile = () => api.get<StudentOut>("/students/me").then((r) => r.data);
export const updateStudent = (id: string, body: Partial<{ full_name: string; phone: string; group_id: string }>) =>
  api.patch<StudentOut>(`/students/${id}`, body).then((r) => r.data);
export const setStudentStatus = (id: string, is_active: boolean) =>
  api.patch<StudentOut>(`/students/${id}/status`, { is_active }).then((r) => r.data);

// --- Groups ---
export const listGroups = () => api.get<Group[]>("/groups").then((r) => r.data);
export const createGroup = (body: { name: string; english_level: string; schedule?: string; telegram_chat_id?: string; telegram_chat_title?: string; telegram_sync_enabled?: boolean }) =>
  api.post<Group>("/groups", body).then((r) => r.data);
export const updateGroup = (id: string, body: Partial<{ name: string; english_level: string; schedule: string; is_active: boolean; telegram_chat_id: string; telegram_chat_title: string; telegram_sync_enabled: boolean }>) =>
  api.patch<Group>(`/groups/${id}`, body).then((r) => r.data);
export const syncGroupTelegram = (id: string, body: { telegram_chat_id?: string; telegram_chat_title?: string; telegram_sync_enabled: boolean }) =>
  api.patch<Group>(`/groups/${id}/telegram`, body).then((r) => r.data);
export const sendGroupReminders = (id: string) => api.post<{ sent: number; students: string[] }>(`/groups/${id}/telegram/remind`).then((r) => r.data);
export const deleteGroup = (id: string) => api.delete(`/groups/${id}`);

// --- Assignments ---
export const listAssignments = (group_id?: string) =>
  api.get<AssignmentOut[]>("/assignments", { params: { group_id } }).then((r) => r.data);
export const createAssignment = (body: { group_id: string; title: string; description: string; deadline: string }) =>
  api.post<AssignmentOut>("/assignments", body).then((r) => r.data);
export const updateAssignment = (id: string, body: Partial<{ title: string; description: string; deadline: string; group_id: string }>) =>
  api.patch<AssignmentOut>(`/assignments/${id}`, body).then((r) => r.data);
export const deleteAssignment = (id: string) => api.delete(`/assignments/${id}`);
export const listMyAssignments = () => api.get<AssignmentForStudent[]>("/assignments/mine").then((r) => r.data);

// --- Submissions ---
export interface SubmissionQuery {
  group_id?: string;
  student_id?: string;
  status?: string;
  page?: number;
  page_size?: number;
}
export const listSubmissions = (params: SubmissionQuery) =>
  api.get<Paginated<SubmissionOut>>("/submissions", { params }).then((r) => r.data);
export const listMySubmissions = () => api.get<SubmissionOut[]>("/submissions/mine").then((r) => r.data);
export const getSubmission = (id: string) => api.get<SubmissionOut>(`/submissions/${id}`).then((r) => r.data);

export const submitHomework = (assignment_id: string, text_answer: string, file: File | null) => {
  const form = new FormData();
  form.append("assignment_id", assignment_id);
  if (text_answer) form.append("text_answer", text_answer);
  if (file) form.append("file", file);
  return api.post<SubmissionOut>("/submissions", form, { headers: { "Content-Type": "multipart/form-data" } }).then((r) => r.data);
};

export const gradeSubmission = (id: string, body: { score: number; feedback?: string; stars: number }) =>
  api.post(`/submissions/${id}/grade`, body).then((r) => r.data);
