import { Navigate, Route, Routes } from "react-router-dom";
import { Toaster } from "react-hot-toast";
import { AuthProvider, useAuth } from "@/hooks/useAuth";
import ProtectedRoute from "@/components/ProtectedRoute";

import LoginPage from "@/pages/Login";
import RegisterPage from "@/pages/Register";

import TeacherLayout from "@/layouts/TeacherLayout";
import TeacherDashboardPage from "@/pages/teacher/Dashboard";
import StudentsPage from "@/pages/teacher/Students";
import GroupsPage from "@/pages/teacher/Groups";
import AssignmentsPage from "@/pages/teacher/Assignments";
import SubmissionsPage from "@/pages/teacher/Submissions";
import TeacherProfilePage from "@/pages/teacher/Profile";

import StudentLayout from "@/layouts/StudentLayout";
import StudentDashboardPage from "@/pages/student/Dashboard";
import StudentAssignmentsPage from "@/pages/student/Assignments";
import StudentSubmissionsPage from "@/pages/student/Submissions";
import StudentResultsPage from "@/pages/student/Results";
import StudentProgressPage from "@/pages/student/Progress";
import StudentProfilePage from "@/pages/student/Profile";

function RootRedirect() {
  const { user, isLoading } = useAuth();
  if (isLoading) return null;
  if (!user) return <Navigate to="/login" replace />;
  return <Navigate to={user.role === "teacher" ? "/teacher" : "/student"} replace />;
}

export default function App() {
  return (
    <AuthProvider>
      <Toaster position="top-right" toastOptions={{ duration: 3500 }} />
      <Routes>
        <Route path="/" element={<RootRedirect />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />

        <Route element={<ProtectedRoute allowedRole="teacher" />}>
          <Route path="/teacher" element={<TeacherLayout />}>
            <Route index element={<TeacherDashboardPage />} />
            <Route path="students" element={<StudentsPage />} />
            <Route path="groups" element={<GroupsPage />} />
            <Route path="assignments" element={<AssignmentsPage />} />
            <Route path="submissions" element={<SubmissionsPage />} />
            <Route path="profile" element={<TeacherProfilePage />} />
          </Route>
        </Route>

        <Route element={<ProtectedRoute allowedRole="student" />}>
          <Route path="/student" element={<StudentLayout />}>
            <Route index element={<StudentDashboardPage />} />
            <Route path="assignments" element={<StudentAssignmentsPage />} />
            <Route path="submissions" element={<StudentSubmissionsPage />} />
            <Route path="results" element={<StudentResultsPage />} />
            <Route path="progress" element={<StudentProgressPage />} />
            <Route path="profile" element={<StudentProfilePage />} />
          </Route>
        </Route>

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </AuthProvider>
  );
}
