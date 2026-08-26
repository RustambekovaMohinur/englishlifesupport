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
  TeacherProfileOut,
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
export const updateStudent = (id: string, body: Partial<{ full_name: string; phone: string; group_id: string | null }>) =>
  api.patch<StudentOut>(`/students/${id}`, body).then((r) => r.data);
export const deleteStudent = (id: string) => api.delete(`/students/${id}`);
export const setStudentStatus = (id: string, is_active: boolean) =>
  api.patch<StudentOut>(`/students/${id}/status`, { is_active }).then((r) => r.data);

// --- Groups ---
export const listGroups = (include_archived: boolean = false) =>
  api.get<Group[]>("/groups", { params: { include_archived } }).then((r) => r.data);
export const createGroup = (body: { name: string; english_level: string; schedule?: string }) =>
  api.post<Group>("/groups", body).then((r) => r.data);
export const updateGroup = (id: string, body: Partial<{ name: string; english_level: string; schedule: string; is_active: boolean }>) =>
  api.patch<Group>(`/groups/${id}`, body).then((r) => r.data);
export const deleteGroup = (id: string) => api.delete(`/groups/${id}`);

// --- Teacher Profile ---
export const getMyTeacherProfile = () => api.get<TeacherProfileOut>("/teachers/me").then((r) => r.data);
export const updateTeacherProfile = (body: Partial<{ full_name: string; phone: string; email: string; current_password?: string }>) =>
  api.patch("/teachers/me", body).then((r) => r.data);
export const changeTeacherPassword = (body: { current_password: string; new_password: string; confirm_password: string }) =>
  api.post("/teachers/me/password", body).then((r) => r.data);

// --- Assignments ---
export const listAssignments = (group_id?: string) =>
  api.get<AssignmentOut[]>("/assignments", { params: { group_id } }).then((r) => r.data);
export const createAssignment = (formData: FormData) =>
  api.post<AssignmentOut>("/assignments", formData).then((r) => r.data);
export const updateAssignment = (id: string, body: Partial<{ title: string; description: string; deadline: string; group_id: string; status: string }>) =>
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
  return api.post<SubmissionOut>("/submissions", form).then((r) => r.data);
};

export const gradeSubmission = (id: string, body: { score: number; feedback?: string; stars: number }) =>
  api.post(`/submissions/${id}/grade`, body).then((r) => r.data);
