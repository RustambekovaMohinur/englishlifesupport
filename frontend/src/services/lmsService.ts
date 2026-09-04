import { api } from "./api";
import {
  AssignmentForStudent,
  AssignmentOut,
  Group,
  GroupDetailOut,
  Paginated,
  PaginatedPendingStudents,
  PendingStudentItem,
  StudentDashboard,
  StudentHistoryOut,
  StudentListItem,
  StudentOut,
  SubmissionCommentOut,
  SubmissionCorrectionOut,
  SubmissionOut,
  TeacherDashboard,
  TeacherProfileOut,
  UserProfileOut,
  UserProfileUpdate,
} from "@/types";

// --- Dashboard ---
export const getTeacherDashboard = () => api.get<TeacherDashboard>("/dashboard/teacher").then((r) => r.data);
export const getStudentDashboard = () => api.get<StudentDashboard>("/dashboard/student").then((r) => r.data);

// --- Students (teacher) ---
export interface StudentQuery {
  search?: string;
  group_id?: string;
  is_active?: boolean;
  approval_status?: string;
  page?: number;
  page_size?: number;
}
export const listStudents = (params: StudentQuery) =>
  api.get<Paginated<StudentListItem>>("/students", { params }).then((r) => r.data);
export const listPendingStudents = (params?: { page?: number; page_size?: number }) =>
  api.get<PaginatedPendingStudents>("/students/pending", { params }).then((r) => r.data);
export const approveStudent = (student_id: string) =>
  api.post<{ success: boolean; message: string; student: any }>(`/students/${student_id}/approve`).then((r) => r.data);
export const rejectStudent = (student_id: string) =>
  api.post<{ success: boolean; message: string; student: any }>(`/students/${student_id}/reject`).then((r) => r.data);
export const handleStudentApproval = (student_id: string, action: "approve" | "reject") =>
  action === "approve" ? approveStudent(student_id) : rejectStudent(student_id);
export const getStudent = (id: string) => api.get<StudentOut>(`/students/${id}`).then((r) => r.data);
export const getStudentHistory = (student_id: string) =>
  api.get<StudentHistoryOut>(`/students/${student_id}/history`).then((r) => r.data);
export const getMyStudentProfile = () => api.get<StudentOut>("/students/me").then((r) => r.data);
export const updateStudent = (id: string, body: Partial<{ full_name: string; phone: string; group_id: string | null }>) =>
  api.patch<StudentOut>(`/students/${id}`, body).then((r) => r.data);
export const deleteStudent = (id: string) => api.delete(`/students/${id}`);
export const setStudentStatus = (id: string, is_active: boolean) =>
  api.patch<StudentOut>(`/students/${id}/status`, { is_active }).then((r) => r.data);

// --- Groups ---
export const listGroups = (include_archived: boolean = false) =>
  api.get<Group[]>("/groups", { params: { include_archived } }).then((r) => r.data);
export const getGroupDetail = (group_id: string) =>
  api.get<GroupDetailOut>(`/groups/${group_id}/detail`).then((r) => r.data);
export const createGroup = (body: { name: string; english_level: string; schedule?: string }) =>
  api.post<Group>("/groups", body).then((r) => r.data);
export const updateGroup = (id: string, body: Partial<{ name: string; english_level: string; schedule: string; is_active: boolean }>) =>
  api.patch<Group>(`/groups/${id}`, body).then((r) => r.data);
export const deleteGroup = (id: string) => api.delete(`/groups/${id}`);

// --- Teacher Profile ---
export const getMyTeacherProfile = () => api.get<TeacherProfileOut>("/teachers/me").then((r) => r.data);
export const updateTeacherProfile = (body: Partial<{ full_name: string; phone: string; bio: string; email: string; current_password?: string }>) =>
  api.patch("/teachers/me", body).then((r) => r.data);
export const changeTeacherPassword = (body: { current_password: string; new_password: string; confirm_password: string }) =>
  api.post("/teachers/me/password", body).then((r) => r.data);

// --- Unified User Profile (Students & Teachers) ---
export const getMyUnifiedProfile = () => api.get<UserProfileOut>("/profile/me").then((r) => r.data);
export const updateMyUnifiedProfile = (body: UserProfileUpdate) => api.patch<UserProfileOut>("/profile/me", body).then((r) => r.data);
export const uploadMyAvatar = (file: File) => {
  const formData = new FormData();
  formData.append("file", file);
  return api.post<UserProfileOut>("/profile/me/avatar", formData).then((r) => r.data);
};
export const removeMyAvatar = () => api.delete<UserProfileOut>("/profile/me/avatar").then((r) => r.data);

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

export const addSubmissionCorrection = (
  id: string,
  body: { selected_text: string; correction: string; comment?: string; error_type?: string }
) => api.post<SubmissionCorrectionOut>(`/submissions/${id}/corrections`, body).then((r) => r.data);

export const deleteSubmissionCorrection = (submissionId: string, correctionId: string) =>
  api.delete(`/submissions/${submissionId}/corrections/${correctionId}`).then((r) => r.data);

export const addSubmissionComment = (id: string, body: { comment: string }) =>
  api.post<SubmissionCommentOut>(`/submissions/${id}/comments`, body).then((r) => r.data);

export const deleteSubmissionComment = (submissionId: string, commentId: string) =>
  api.delete(`/submissions/${submissionId}/comments/${commentId}`).then((r) => r.data);

// --- Gamification & Sequential Tasks ---
import {
  StudentGamificationSummary,
  WeeklyLeaderboardOut,
  TeacherGroupReport,
} from "@/types";

export const getGamificationSummary = () =>
  api.get<StudentGamificationSummary>("/gamification/summary").then((r) => r.data);

export const useFreePass = (assignment_id: string) =>
  api.post<{ status: string; message: string }>("/gamification/free-pass/use", null, {
    params: { assignment_id },
  }).then((r) => r.data);

export const getWeeklyLeaderboard = (group_id?: string) =>
  api.get<WeeklyLeaderboardOut>("/gamification/leaderboard", { params: { group_id } }).then((r) => r.data);

export const recordVocabPractice = (body: { assignment_id?: string; total_words: number; correct_words: number }) =>
  api.post<{ status: string; xp_earned: number; stars_earned: number; accuracy: number }>("/gamification/vocabulary/practice", body).then((r) => r.data);

export const overrideTaskLock = (body: { student_id: string; assignment_id: string; is_unlocked: boolean }) =>
  api.post<{ status: string; is_unlocked: boolean }>("/gamification/teacher/override-lock", body).then((r) => r.data);

export const nominateStudentOfTheWeek = (group_id: string, body: { student_id: string; stars_awarded: number; reason?: string }) =>
  api.post(`/gamification/teacher/student-of-the-week/${group_id}`, body).then((r) => r.data);

export const getTeacherGroupReport = (group_id: string) =>
  api.get<TeacherGroupReport>(`/gamification/teacher/group-report/${group_id}`).then((r) => r.data);
