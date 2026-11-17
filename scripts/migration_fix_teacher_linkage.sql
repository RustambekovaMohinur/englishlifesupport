-- ============================================================
-- Migration: Re-link groups and assignments to bootstrap teacher
-- Run this in Neon Console SQL Editor on the PRODUCTION database
-- (the one Render is using)
-- ============================================================

-- Step 1: Find the teacher's User ID in the production database
SELECT id, username, email, role
FROM users
WHERE email = 'teacher@englishlife.uz'
   OR username = 'teacher';

-- Step 2: Check current state of groups
SELECT id, name, is_active, created_by FROM groups ORDER BY name;

-- Step 3: Check teacher_profiles
SELECT id, user_id, full_name FROM teacher_profiles;

-- ============================================================
-- ACTUAL FIX: Replace OLD_TEACHER_USER_ID with the id from Step 1
-- and NEW_TEACHER_USER_ID with the same id.
-- If groups.created_by is pointing to a UUID that doesn't exist
-- in the users table, update it to the current teacher's user id.
-- ============================================================

-- Fix groups: set created_by to the current teacher user id
-- for any row where created_by is NULL or points to a missing user
UPDATE groups
SET created_by = (
    SELECT id FROM users WHERE email = 'teacher@englishlife.uz' LIMIT 1
)
WHERE created_by IS NULL
   OR created_by NOT IN (SELECT id FROM users);

-- Fix assignments: same approach
UPDATE assignments
SET created_by = (
    SELECT id FROM users WHERE email = 'teacher@englishlife.uz' LIMIT 1
)
WHERE created_by IS NULL
   OR created_by NOT IN (SELECT id FROM users);

-- Step 4: Verify the fix
SELECT
    (SELECT COUNT(*) FROM groups) as total_groups,
    (SELECT COUNT(*) FROM groups WHERE is_active = true) as active_groups,
    (SELECT COUNT(*) FROM student_profiles) as total_students,
    (SELECT COUNT(*) FROM assignments) as total_assignments,
    (SELECT COUNT(*) FROM submissions) as total_submissions;

-- Expected: total_groups=9, active_groups=9, total_students=231
