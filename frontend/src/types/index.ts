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
  average_score: number | null;
  total_assignments: number;
  completed_assignments: number;
  upcoming_deadlines: { id: string; title: string; deadline: string; submitted: boolean }[];
  recent_grades: { assignment_title: string; score: number; stars: number; graded_at: string }[];
}
