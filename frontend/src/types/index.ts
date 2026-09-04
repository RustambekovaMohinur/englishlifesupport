export type UserRole = "teacher" | "student";

export interface CurrentUser {
  id: string;
  email: string;
  username?: string;
  role: UserRole;
  is_active: boolean;
}

export interface GroupBrief {
  id: string;
  name: string;
  english_level: string;
}

export interface Group {
  id: string;
  name: string;
  english_level: string;
  schedule: string | null;
  is_active: boolean;
  student_count: number;
  created_at: string;
}

export interface StudentListItem {
  id: string;
  user_id?: string;
  full_name: string;
  email: string;
  username?: string;
  phone: string | null;
  telegram_username?: string | null;
  is_active: boolean;
  approval_status?: string;
  total_stars: number;
  total_lightning?: number;
  group_id?: string | null;
  group_name: string | null;
  level?: string | null;
  created_at?: string | null;
}

export interface AssignmentItemOverview {
  assignment_id: string;
  title: string;
  deadline: string;
  status: string;
  completion_percentage: number;
  score: number | null;
  stars: number | null;
  has_submission: boolean;
  submitted_at: string | null;
}

export interface GroupStudentDetail {
  student_id: string;
  user_id: string;
  full_name: string;
  username: string;
  telegram_username: string | null;
  avatar_url?: string | null;
  bio?: string | null;
  total_stars: number;
  total_lightning: number;
  completed_assignments_count?: number;
  total_assignments_count?: number;
  overall_completion_percentage: number;
  assignments: AssignmentItemOverview[];
}

export interface GroupAssignmentHeader {
  id: string;
  title: string;
  deadline: string;
  status: string;
}

export interface GroupDetailOut {
  id: string;
  name: string;
  english_level: string;
  schedule: string | null;
  is_active: boolean;
  student_count: number;
  assignments: GroupAssignmentHeader[];
  students: GroupStudentDetail[];
}

export interface StudentHistoryItem {
  assignment_id: string;
  title: string;
  assignment_type: string;
  assigned_date: string;
  deadline: string;
  completion_percentage: number;
  submission_id: string | null;
  submission_status: string | null;
  submitted_at: string | null;
  score: number | null;
  feedback: string | null;
  stars_earned: number;
  text_answer: string | null;
  file_original_name: string | null;
}

export interface StudentHistoryOut {
  student_id: string;
  full_name: string;
  username: string;
  telegram_username: string | null;
  level: string | null;
  group_name: string | null;
  total_stars: number;
  total_lightning: number;
  history: StudentHistoryItem[];
}

export interface StudentOut {
  id: string;
  user_id: string;
  email: string;
  username?: string;
  full_name: string;
  phone: string | null;
  bio?: string | null;
  avatar_url?: string | null;
  is_active: boolean;
  total_stars: number;
  group: GroupBrief | null;
  created_at: string;
}

export interface UserProfileOut {
  id: string;
  user_id: string;
  role: "teacher" | "student";
  username: string;
  email: string;
  full_name: string;
  first_name: string;
  last_name: string;
  phone: string | null;
  telegram_username: string | null;
  bio: string | null;
  avatar_url: string | null;
  stats: Record<string, any>;
  group_name?: string | null;
  english_level?: string | null;
}

export interface UserProfileUpdate {
  first_name?: string;
  last_name?: string;
  full_name?: string;
  telegram_username?: string;
  phone?: string;
  bio?: string;
}

export interface Paginated<T> {
  items: T[];
  total: number;
  page: number;
  page_size: number;
  total_pages?: number;
}

export interface PendingStudentItem {
  id: string;
  first_name: string;
  last_name: string;
  username: string;
  telegram_username?: string | null;
  group_id?: string | null;
  group_name?: string | null;
  english_level?: string | null;
  approval_status: string;
  created_at?: string | null;
}

export interface PaginatedPendingStudents {
  items: PendingStudentItem[];
  page: number;
  page_size: number;
  total: number;
  total_pages: number;
}

export interface VocabWordItem {
  id: string;
  english_word: string;
  translation: string;
  example_sentence: string | null;
}

export interface TeacherProfileOut {
  id: string;
  user_id: string;
  email: string;
  username?: string;
  full_name: string;
  phone: string | null;
  bio?: string | null;
  avatar_url?: string | null;
  created_at: string;
}

export interface AssignmentOut {
  id: string;
  group_id: string;
  group_name: string;
  title: string;
  description: string;
  deadline: string;
  status: "draft" | "published";
  file_url: string | null;
  file_original_name: string | null;
  vocab_words: VocabWordItem[];
  created_at: string;
  submission_count: number;
  order_index?: number;
  prerequisite_id?: string | null;
}

export interface AssignmentForStudent {
  id: string;
  title: string;
  description: string;
  deadline: string;
  status: "draft" | "published";
  file_url: string | null;
  file_original_name: string | null;
  vocab_words: VocabWordItem[];
  is_past_deadline: boolean;
  submission_status: "submitted" | "late" | "graded" | null;
  score: number | null;
  submission_id?: string | null;
  order_index?: number;
  prerequisite_id?: string | null;
  is_locked?: boolean;
  lock_reason?: string | null;
}

export interface GradeOut {
  id: string;
  score: number;
  feedback: string | null;
  stars: number;
  graded_at: string;
}

export interface SubmissionCorrectionOut {
  id: string;
  submission_id: string;
  teacher_id: string;
  selected_text: string;
  correction: string;
  comment?: string | null;
  error_type?: string | null;
  created_at: string;
}

export interface SubmissionCommentOut {
  id: string;
  submission_id: string;
  teacher_id: string;
  comment: string;
  created_at: string;
}

export interface SubmissionOut {
  id: string;
  assignment_id: string;
  assignment_title: string;
  student_id: string;
  student_name: string;
  text_answer: string | null;
  file_url: string | null;
  file_original_name: string | null;
  status: "submitted" | "late" | "graded";
  submitted_at: string;
  grade: GradeOut | null;
  corrections?: SubmissionCorrectionOut[];
  comments?: SubmissionCommentOut[];
}

export interface TeacherDashboard {
  total_students: number;
  active_students: number;
  total_groups: number;
  total_assignments: number;
  pending_submissions: number;
  completion_rate?: number;
  late_students?: number;
  locked_students?: number;
  inactive_students?: number;
  recent_submissions: {
    id: string;
    student_name: string;
    assignment_title: string;
    submitted_at: string;
    status: string;
  }[];
}

export interface StudentDashboard {
  full_name: string;
  group_name: string | null;
  teacher_name: string | null;
  total_stars: number;
  streak?: number;
  total_xp?: number;
  level?: number;
  level_title?: string;
  free_pass_available?: boolean;
  average_score: number | null;
  total_assignments: number;
  completed_assignments: number;
  upcoming_deadlines: { id: string; title: string; deadline: string; submitted: boolean }[];
  recent_grades: { assignment_title: string; score: number; stars: number; graded_at: string }[];
}

export interface StarTransactionOut {
  id: string;
  amount: number;
  reason: string;
  description: string | null;
  reference_id: string | null;
  created_at: string;
}

export interface AchievementOut {
  id: string;
  badge_key: string;
  title: string;
  description: string;
  icon: string;
  unlocked_at: string;
}

export interface FreePassStatus {
  month_key: string;
  has_free_pass: boolean;
  is_used: boolean;
  used_at: string | null;
}

export interface StudentGamificationSummary {
  total_stars: number;
  streak: number;
  longest_streak: number;
  last_activity_date: string | null;
  total_xp: number;
  level: number;
  level_title: string;
  next_level_xp: number;
  free_pass: FreePassStatus;
  achievements: AchievementOut[];
  recent_transactions: StarTransactionOut[];
}

export interface LeaderboardEntry {
  rank: number;
  student_id: string;
  student_name: string;
  weekly_xp: number;
  weekly_stars: number;
  streak: number;
  completion_rate: number;
  is_current_user: boolean;
}

export interface WeeklyLeaderboardOut {
  group_name: string | null;
  week_key: string;
  current_student_rank: number | null;
  entries: LeaderboardEntry[];
}

export interface TeacherGroupReport {
  group_id: string;
  group_name: string;
  week_key: string;
  total_students: number;
  total_assignments: number;
  completion_rate: number;
  average_score: number | null;
  late_submissions: number;
  perfect_week_students: number;
  top_performer: string | null;
  locked_students: { id: string; name: string }[];
  student_of_the_week: {
    student_id: string;
    student_name: string;
    stars_awarded: number;
    reason: string | null;
  } | null;
}
