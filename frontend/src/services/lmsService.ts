import axios from "axios";
import { api, apiCache } from "./api";
import {
  AssignmentComment,
  AssignmentForStudent,
  AssignmentOut,
  Group,
  GroupDetailOut,
  Paginated,
  PaginatedPendingStudents,
  PendingStudentItem,
  PlatformFeedback,
  PlatformFeedbackStats,
  PlatformFeedbackSummary,
  PublicFeedbackItem,
  FeedbackReplyItem,
  StudentDashboard,
  StudentGamificationSummary,
  StudentHistoryOut,
  StudentListItem,
  StudentOut,
  SubmissionCommentOut,
  SubmissionCorrectionOut,
  SubmissionOut,
  TeacherDashboard,
  TeacherGroupReport,
  TeacherProfileOut,
  UserProfileOut,
  UserProfileUpdate,
  WeeklyLeaderboardOut,
} from "@/types";

/**
 * Cached GET helper: returns data from memory if valid, otherwise queries backend
 */
export const cachedGet = <T>(
  url: string,
  params?: Record<string, any>,
  ttlMs: number = 90_000
): Promise<T> => {
  const key = apiCache.makeKey(url, params);
  return apiCache.fetch(key, () => api.get<T>(url, { params }).then((r) => r.data), { ttlMs });
};

// --- Dashboard ---
export const getTeacherDashboard = () => cachedGet<TeacherDashboard>("/dashboard/teacher");
export const getStudentDashboard = () => cachedGet<StudentDashboard>("/dashboard/student");

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
  cachedGet<Paginated<StudentListItem>>("/students", params);
export const listPendingStudents = (params?: { page?: number; page_size?: number }) =>
  cachedGet<PaginatedPendingStudents>("/students/pending", params);
export const approveStudent = (student_id: string) =>
  api.post<{ success: boolean; message: string; student: any }>(`/students/${student_id}/approve`).then((r) => r.data);
export const rejectStudent = (student_id: string) =>
  api.post<{ success: boolean; message: string; student: any }>(`/students/${student_id}/reject`).then((r) => r.data);
export const handleStudentApproval = (student_id: string, action: "approve" | "reject") =>
  action === "approve" ? approveStudent(student_id) : rejectStudent(student_id);
export const getStudent = (id: string) => cachedGet<StudentOut>(`/students/${id}`);
export const getStudentHistory = (student_id: string) =>
  cachedGet<StudentHistoryOut>(`/students/${student_id}/history`);
export const getMyStudentProfile = () => cachedGet<StudentOut>("/students/me");
export const updateStudent = (id: string, body: Partial<{ full_name: string; phone: string; group_id: string | null }>) =>
  api.patch<StudentOut>(`/students/${id}`, body).then((r) => r.data);
export const deleteStudent = (id: string) => api.delete(`/students/${id}`);
export const setStudentStatus = (id: string, is_active: boolean) =>
  api.patch<StudentOut>(`/students/${id}/status`, { is_active }).then((r) => r.data);

export const resetStudentPassword = (student_id: string, new_password: string) =>
  api.post<{ success: boolean; message: string }>(`/students/${student_id}/reset-password`, { new_password }).then((r) => r.data);

// --- Groups ---
export const listGroups = (include_archived: boolean = false) =>
  cachedGet<Group[]>("/groups", { include_archived });
export const getGroupDetail = (group_id: string) =>
  cachedGet<GroupDetailOut>(`/groups/${group_id}/detail`);
export const getMyCohortMatrix = () =>
  cachedGet<GroupDetailOut>("/groups/my/matrix");
export const createGroup = (body: { name: string; english_level: string; schedule?: string; default_homework_time?: string }) =>
  api.post<Group>("/groups", body).then((r) => r.data);
export const updateGroup = (id: string, body: Partial<{ name: string; english_level: string; schedule: string; default_homework_time?: string; is_active: boolean }>) =>
  api.patch<Group>(`/groups/${id}`, body).then((r) => r.data);
export const deleteGroup = (id: string) => api.delete(`/groups/${id}`);
export interface PublishCyclePayload {
  assignment_ids?: string[];
  new_deadline?: string;
  cycle_title?: string;
}

export interface PublishCycleResult {
  success: boolean;
  group_id: string;
  new_cycle: number;
  active_tasks_count: number;
  archived_tasks_count: number;
  message: string;
}

export const publishGroupCycle = (group_id: string, body?: PublishCyclePayload) =>
  api.post<PublishCycleResult>(`/groups/${group_id}/publish-cycle`, body || {}).then((r) => r.data);

export const startGroupCycle = (group_id: string) =>
  api.post<{ message: string; group_id: string; previous_cycle: number; current_cycle: number }>(`/groups/${group_id}/start-cycle`).then((r) => r.data);

export const updateStudentPlacement = (student_id: string, group_id: string | null) =>
  api.put<StudentOut>(`/teacher/students/${student_id}/placement`, { group_id }).then((r) => r.data);

// --- Teacher Profile ---
export const getMyTeacherProfile = () => cachedGet<TeacherProfileOut>("/teachers/me");
export const updateTeacherProfile = (body: Partial<{ full_name: string; phone: string; bio: string; email: string; current_password?: string }>) =>
  api.patch("/teachers/me", body).then((r) => r.data);
export const changeTeacherPassword = (body: { current_password: string; new_password: string; confirm_password: string }) =>
  api.post("/teachers/me/password", body).then((r) => r.data);

// --- Unified User Profile (Students & Teachers) ---
export const getMyUnifiedProfile = () => cachedGet<UserProfileOut>("/profile/me");
export const updateMyUnifiedProfile = (body: UserProfileUpdate) => api.patch<UserProfileOut>("/profile/me", body).then((r) => r.data);
export const changeUserPassword = (body: { old_password: string; new_password: string }) =>
  api.put<{ success: boolean; message: string }>("/users/me/password", body).then((r) => r.data);
export const uploadMyAvatar = (file: File) => {
  const formData = new FormData();
  formData.append("file", file);
  return api.post<UserProfileOut>("/profile/me/avatar", formData).then((r) => r.data);
};
export const removeMyAvatar = () => api.delete<UserProfileOut>("/profile/me/avatar").then((r) => r.data);


// --- Assignments ---
export const listAssignments = (group_id?: string) =>
  cachedGet<AssignmentOut[]>("/assignments", { group_id });
export const createAssignment = (formData: FormData) =>
  api.post<AssignmentOut>("/assignments", formData, { timeout: 120000 }).then((r) => r.data);
export const updateAssignmentInPlace = (id: string, formData: FormData) =>
  api.put<AssignmentOut>(`/assignments/${id}`, formData, { timeout: 120000 }).then((r) => r.data);
export const updateAssignment = (id: string, body: Partial<{ title: string; description: string; deadline: string; group_id: string; status: string }>) =>
  api.patch<AssignmentOut>(`/assignments/${id}`, body).then((r) => r.data);
export const deleteAssignment = (id: string) => api.delete(`/assignments/${id}`);
export const getAssignment = (id: string) =>
  cachedGet<AssignmentForStudent>(`/assignments/${id}`);
export const listMyAssignments = () => cachedGet<AssignmentForStudent[]>("/assignments/mine");
export const listPastDeadlineAssignments = () =>
  cachedGet<AssignmentForStudent[]>("/assignments/past-deadlines");


// --- Submissions ---
export interface SubmissionQuery {
  group_id?: string;
  student_id?: string;
  status?: string;
  page?: number;
  page_size?: number;
}
export const listSubmissions = (params: SubmissionQuery) =>
  cachedGet<Paginated<SubmissionOut>>("/submissions", params);
export const listMySubmissions = () => cachedGet<SubmissionOut[]>("/submissions/mine");
export const getSubmission = (id: string) => cachedGet<SubmissionOut>(`/submissions/${id}`);

export interface PresignedUploadResult {
  upload_url: string;
  public_url: string;
  object_key: string;
}

export const getPresignedUploadUrl = async (
  fileName: string,
  fileType: string = "application/octet-stream"
): Promise<PresignedUploadResult> => {
  const BACKEND_BASE = (
    import.meta.env.VITE_API_URL ||
    import.meta.env.VITE_API_BASE_URL ||
    "https://englishlifesupport.onrender.com"
  ).toString().trim().replace(/\/api\/?$/, "");

  const url = `${BACKEND_BASE}/api/storage/presigned-upload-url`;
  const fallbackUrl = `${BACKEND_BASE}/storage/presigned-upload-url`;

  try {
    const r = await api.get<PresignedUploadResult>(url, {
      params: { file_name: fileName, file_type: fileType },
    });
    return r.data;
  } catch (err: any) {
    if (err?.response?.status === 404) {
      const r = await api.get<PresignedUploadResult>(fallbackUrl, {
        params: { file_name: fileName, file_type: fileType },
      });
      return r.data;
    }
    throw err;
  }
};

export const uploadDirectToB2 = async (
  file: File | Blob,
  fileName: string,
  fileType: string = "application/octet-stream"
): Promise<string> => {
  const { upload_url, public_url } = await getPresignedUploadUrl(fileName, fileType);
  await axios.put(upload_url, file, {
    headers: {
      "Content-Type": fileType || "application/octet-stream",
    },
    timeout: 120000,
  });
  return public_url;
};

export const submitHomework = (
  assignment_id: string,
  text_answer?: string | null,
  file?: File | null,
  images?: File[],
  voice_file?: File | null,
  doc_file?: File | null,
  storage_url?: string | null,
  file_original_name?: string | null
) => {
  const formData = new FormData();
  formData.append("assignment_id", String(assignment_id));

  const textContent = (text_answer || "").trim();
  if (textContent) {
    formData.append("content", textContent);
    formData.append("text_answer", textContent);
  }

  if (storage_url) {
    formData.append("storage_url", storage_url);
    formData.append("file_url", storage_url);
    formData.append("voice_url", storage_url);
    if (file_original_name) {
      formData.append("file_name", file_original_name);
    }
  }

  // Audio: send "audio_file", "voice_file", and "audio"
  const audioBlobOrFile = voice_file || (file && (file.type.startsWith("audio/") || /\.(mp3|wav|ogg|webm|m4a)$/i.test(file.name)) ? file : null);
  if (!storage_url && audioBlobOrFile && audioBlobOrFile instanceof File && audioBlobOrFile.size > 0) {
    formData.append("audio_file", audioBlobOrFile);
    formData.append("voice_file", audioBlobOrFile);
    formData.append("audio", audioBlobOrFile);
  }

  // Documents: send "document_file" and "doc_file"
  const documentFile = doc_file || (file && !audioBlobOrFile && !(file.type.startsWith("image/") || /\.(png|jpe?g|webp|gif)$/i.test(file.name)) ? file : null);
  if (!storage_url && documentFile && documentFile instanceof File && documentFile.size > 0) {
    formData.append("document_file", documentFile);
    formData.append("doc_file", documentFile);
  }

  // Images: append under 'images' and handle legacy primary 'file'
  const attachedPhotos = (images && images.length > 0) ? images : (file && !audioBlobOrFile && !documentFile && (file.type.startsWith("image/") || /\.(png|jpe?g|webp|gif)$/i.test(file.name)) ? [file] : []);
  if (attachedPhotos && attachedPhotos.length > 0) {
    attachedPhotos.forEach((photo) => {
      if (photo instanceof File && photo.size > 0) {
        formData.append("images", photo);
      }
    });
    // If legacy backend expects the first photo as 'file':
    if (attachedPhotos[0] instanceof File && attachedPhotos[0].size > 0) {
      formData.append("file", attachedPhotos[0]);
    }
  } else if (file && file instanceof File && file.size > 0 && !audioBlobOrFile && !documentFile && !storage_url) {
    formData.append("file", file);
  }

  return api.post<SubmissionOut>("/submissions", formData, {
    timeout: 120000, // 2 full minutes for slow mobile connections
    headers: { "Content-Type": undefined },
  }).then((r) => r.data);
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
export const getGamificationSummary = () =>
  cachedGet<StudentGamificationSummary>("/gamification/summary");

export const useFreePass = (assignment_id: string) =>
  api.post<{ status: string; message: string }>("/gamification/free-pass/use", null, {
    params: { assignment_id },
  }).then((r) => r.data);

export const getWeeklyLeaderboard = (group_id?: string) =>
  cachedGet<WeeklyLeaderboardOut>("/gamification/leaderboard", { group_id });

export const recordVocabPractice = (body: { assignment_id?: string; total_words: number; correct_words: number }) =>
  api.post<{ status: string; xp_earned: number; stars_earned: number; accuracy: number }>("/gamification/vocabulary/practice", body).then((r) => r.data);

export const overrideTaskLock = (body: { student_id: string; assignment_id: string; is_unlocked: boolean }) =>
  api.post<{ status: string; is_unlocked: boolean }>("/gamification/teacher/override-lock", body).then((r) => r.data);

export const nominateStudentOfTheWeek = (group_id: string, body: { student_id: string; stars_awarded: number; reason?: string }) =>
  api.post(`/gamification/teacher/student-of-the-week/${group_id}`, body).then((r) => r.data);

export const getTeacherGroupReport = (group_id: string) =>
  api.get<TeacherGroupReport>(`/gamification/teacher/group-report/${group_id}`).then((r) => r.data);

// --- Assignment Q&A Discussion Thread ---
export const getAssignmentComments = (assignmentId: string) =>
  api.get<AssignmentComment[]>(`/assignments/${assignmentId}/comments`).then((r) => r.data);

export const addAssignmentComment = (assignmentId: string, content: string) =>
  api.post<AssignmentComment>(`/assignments/${assignmentId}/comments`, { content }).then((r) => r.data);

export const updateAssignmentComment = (assignmentId: string, commentId: string, content: string) =>
  api.put<AssignmentComment>(`/assignments/${assignmentId}/comments/${commentId}`, { content }).then((r) => r.data);

export const deleteAssignmentComment = (assignmentId: string, commentId: string) =>
  api.delete<{ success: boolean; message: string }>(`/assignments/${assignmentId}/comments/${commentId}`).then((r) => r.data);

export const toggleLikeAssignmentComment = (assignmentId: string, commentId: string) =>
  api.post<AssignmentComment>(`/assignments/${assignmentId}/comments/${commentId}/like`).then((r) => r.data);

// --- Platform Feedback & Reviews ---
export const submitPlatformFeedback = (data: {
  rating: number;
  what_works_well?: string;
  what_to_improve?: string;
  category?: string;
  message?: string;
}) => api.post<PlatformFeedback>("/feedback", data).then((r) => r.data);

export const getPlatformFeedbackSummary = () =>
  cachedGet<PlatformFeedbackSummary>("/feedback/summary");

export const getAllPlatformFeedback = () =>
  cachedGet<PlatformFeedback[]>("/feedback/all");

export const getTeacherPlatformFeedback = (params?: { rating?: number; limit?: number; offset?: number }) =>
  cachedGet<PlatformFeedback[]>("/feedback", params);

export const getTeacherPlatformFeedbackStats = () =>
  cachedGet<PlatformFeedbackStats>("/feedback/stats");

export const getPublicFeedbacks = () =>
  cachedGet<PublicFeedbackItem[]>("/feedback/public");

export const toggleFeedbackLike = (feedbackId: string) =>
  api.post<{ liked: boolean; likes_count: number }>(`/feedback/${feedbackId}/like`).then((r) => r.data);

export const addFeedbackReply = (feedbackId: string, message: string) =>
  api.post<FeedbackReplyItem>(`/feedback/${feedbackId}/replies`, { message }).then((r) => r.data);

// --- Wordlists & Flashcards ---
const BACKEND_URL = (
  import.meta.env.VITE_API_URL ||
  import.meta.env.VITE_API_BASE_URL ||
  "https://englishlifesupport.onrender.com"
).toString().trim();

const BASE_RENDER_URL = BACKEND_URL.replace(/\/api\/?$/, "");
const WORDLISTS_URL = `${BASE_RENDER_URL}/api/wordlists`;
const WORDLISTS_FALLBACK_URL = `${BASE_RENDER_URL}/wordlists`;

export const previewBulkWords = async (words: string[]) => {
  const primaryUrl = `${WORDLISTS_URL}/preview-bulk`;
  const fallbackUrl = `${WORDLISTS_FALLBACK_URL}/preview-bulk`;
  try {
    const r = await api.post<import("@/types").WordDetailPreview[]>(primaryUrl, { words });
    return r.data;
  } catch (err: any) {
    if (err?.response?.status === 404) {
      const r = await api.post<import("@/types").WordDetailPreview[]>(fallbackUrl, { words });
      return r.data;
    }
    throw err;
  }
};

export const createWordlistSet = async (data: {
  title: string;
  group_id?: string | null;
  storage_url?: string | null;
  total_words?: number;
  items: Array<{
    word: string;
    part_of_speech?: string | null;
    phonetic?: string | null;
    definition?: string | null;
    example?: string | null;
    audio_us_url?: string | null;
    audio_gb_url?: string | null;
    order_index?: number;
  }>;
}) => {
  const primaryUrl = WORDLISTS_URL;
  const fallbackUrl = WORDLISTS_FALLBACK_URL;
  try {
    const r = await api.post<import("@/types").WordlistSetDetail>(primaryUrl, data);
    return r.data;
  } catch (err: any) {
    if (err?.response?.status === 404) {
      const r = await api.post<import("@/types").WordlistSetDetail>(fallbackUrl, data);
      return r.data;
    }
    throw err;
  }
};

export const listWordlistSets = async (params?: { group_id?: string }) => {
  const key = apiCache.makeKey(WORDLISTS_URL, params);
  return apiCache.fetch(key, async () => {
    try {
      const r = await api.get<import("@/types").WordlistSetBrief[]>(WORDLISTS_URL, { params });
      return r.data;
    } catch (err: any) {
      if (err?.response?.status === 404) {
        const r = await api.get<import("@/types").WordlistSetBrief[]>(WORDLISTS_FALLBACK_URL, { params });
        return r.data;
      }
      throw err;
    }
  }, { ttlMs: 120_000 });
};

export const getWordlistSet = async (setId: string) => {
  const key = `${WORDLISTS_URL}/${setId}`;
  return apiCache.fetch(key, async () => {
    try {
      const r = await api.get<import("@/types").WordlistSetDetail>(`${WORDLISTS_URL}/${setId}`);
      return r.data;
    } catch (err: any) {
      if (err?.response?.status === 404) {
        const r = await api.get<import("@/types").WordlistSetDetail>(`${WORDLISTS_FALLBACK_URL}/${setId}`);
        return r.data;
      }
      throw err;
    }
  }, { ttlMs: 180_000 });
};

export const deleteWordlistSet = async (setId: string) => {
  const primaryUrl = `${WORDLISTS_URL}/${setId}`;
  const fallbackUrl = `${WORDLISTS_FALLBACK_URL}/${setId}`;
  try {
    const r = await api.delete(primaryUrl);
    return r.data;
  } catch (err: any) {
    if (err?.response?.status === 404) {
      const r = await api.delete(fallbackUrl);
      return r.data;
    }
    throw err;
  }
};

export const submitWordlistQuiz = async (
  setId: string,
  data: {
    mode: string;
    total_questions: number;
    correct_answers: number;
    time_spent_seconds: number;
    terminated_early?: boolean;
    anti_cheat_triggered?: boolean;
    incorrect_word_ids?: string[];
  }
) => {
  const primaryUrl = `${WORDLISTS_URL}/${setId}/submit-quiz`;
  const fallbackUrl = `${WORDLISTS_FALLBACK_URL}/${setId}/submit-quiz`;
  try {
    const r = await api.post<import("@/types").QuizAttempt>(primaryUrl, data);
    return r.data;
  } catch (err: any) {
    if (err?.response?.status === 404) {
      const r = await api.post<import("@/types").QuizAttempt>(fallbackUrl, data);
      return r.data;
    }
    throw err;
  }
};
