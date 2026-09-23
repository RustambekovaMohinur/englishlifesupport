import { Suspense, lazy } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { Toaster } from "react-hot-toast";
import { AuthProvider, useAuth } from "@/hooks/useAuth";
import ProtectedRoute from "@/components/ProtectedRoute";
import { PageLoadingFallback } from "@/components/common/PageLoadingFallback";

// Eager layouts for instant shell rendering
import TeacherLayout from "@/layouts/TeacherLayout";
import StudentLayout from "@/layouts/StudentLayout";

// Lazy-loaded auth pages
const LoginPage = lazy(() => import("@/pages/Login"));
const RegisterPage = lazy(() => import("@/pages/Register"));

// Lazy-loaded teacher pages
const TeacherDashboardPage = lazy(() => import("@/pages/teacher/Dashboard"));
const StudentsPage = lazy(() => import("@/pages/teacher/Students"));
const GroupsPage = lazy(() => import("@/pages/teacher/Groups"));
const GroupDetailPage = lazy(() => import("@/pages/teacher/GroupDetail"));
const AssignmentsPage = lazy(() => import("@/pages/teacher/Assignments"));
const SubmissionsPage = lazy(() => import("@/pages/teacher/Submissions"));
const TeacherProfilePage = lazy(() => import("@/pages/teacher/Profile"));
const TeacherWordlistsPage = lazy(() => import("@/pages/teacher/Wordlists"));

// Lazy-loaded student pages
const StudentDashboardPage = lazy(() => import("@/pages/student/Dashboard"));
const StudentAssignmentsPage = lazy(() => import("@/pages/student/Assignments"));
const StudentAssignmentSubmitPage = lazy(() => import("@/pages/student/AssignmentSubmit"));
const StudentWordlistsPage = lazy(() => import("@/pages/student/Wordlists"));
const StudentSubmissionsPage = lazy(() => import("@/pages/student/Submissions"));
const StudentResultsPage = lazy(() => import("@/pages/student/Results"));
const StudentProgressPage = lazy(() => import("@/pages/student/Progress"));
const StudentProfilePage = lazy(() => import("@/pages/student/Profile"));
const StudentPastDeadlinesPage = lazy(() => import("@/pages/student/PastDeadlines"));

function RootRedirect() {
  const { user, isLoading } = useAuth();
  if (isLoading) return null;
  if (!user) return <Navigate to="/login" replace />;
  return <Navigate to={user.role === "teacher" ? "/teacher" : "/student"} replace />;
}

export default function App() {
  return (
    <AuthProvider>
      <div className="w-full max-w-full overflow-x-hidden min-h-screen">
        <Toaster position="top-right" toastOptions={{ duration: 3500 }} />
        <Suspense fallback={<PageLoadingFallback />}>
          <Routes>
          <Route path="/" element={<RootRedirect />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />

          <Route element={<ProtectedRoute allowedRole="teacher" />}>
            <Route path="/teacher" element={<TeacherLayout />}>
              <Route index element={<TeacherDashboardPage />} />
              <Route path="students" element={<StudentsPage />} />
              <Route path="groups" element={<GroupsPage />} />
              <Route path="groups/:groupId" element={<GroupDetailPage />} />
              <Route path="assignments" element={<AssignmentsPage />} />
              <Route path="wordlists" element={<TeacherWordlistsPage />} />
              <Route path="submissions" element={<SubmissionsPage />} />
              <Route path="profile" element={<TeacherProfilePage />} />
            </Route>
          </Route>

          <Route element={<ProtectedRoute allowedRole="student" />}>
            <Route path="/student" element={<StudentLayout />}>
              <Route index element={<StudentDashboardPage />} />
              <Route path="assignments" element={<StudentAssignmentsPage />} />
              <Route path="past-deadlines" element={<StudentPastDeadlinesPage />} />
              <Route path="assignments/:assignmentId/submit" element={<StudentAssignmentSubmitPage />} />
              <Route path="vocabulary" element={<StudentWordlistsPage />} />
              <Route path="submissions" element={<StudentSubmissionsPage />} />
              <Route path="results" element={<StudentResultsPage />} />
              <Route path="leaderboard" element={<StudentDashboardPage />} />
              <Route path="progress" element={<StudentProgressPage />} />
              <Route path="profile" element={<StudentProfilePage />} />
            </Route>
          </Route>

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
        </Suspense>
      </div>
    </AuthProvider>
  );
}
