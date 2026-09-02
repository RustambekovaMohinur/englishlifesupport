export type UserRole = "teacher" | "student";

export interface CurrentUser {
  id: string;
  email: string;
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
  full_name: string;
  email: string;
  phone: string | null;
  is_active: boolean;
  total_stars: number;
  group_name: string | null;
}

export interface StudentOut {
  id: string;
  user_id: string;
  email: string;
  full_name: string;
  phone: string | null;
  is_active: boolean;
  total_stars: number;
  group: GroupBrief | null;
  created_at: string;
}

export interface Paginated<T> {
  items: T[];
  total: number;
  page: number;
  page_size: number;
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
  full_name: string;
  phone: string | null;
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
