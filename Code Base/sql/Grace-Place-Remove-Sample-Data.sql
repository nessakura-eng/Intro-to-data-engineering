-- Grace Place Onboarding Passport: remove the sample data
-- ---------------------------------------------------------------------------
-- Run this ONCE, right after loading Grace-Place-Data.sql and BEFORE staff use the site.
-- Run it in the Supabase SQL Editor (or psql) in one go. If anything fails, nothing is changed.
--
-- PART A removes the 14 sample people (EmployeeID 1 to 14) and everything tied to them:
-- their tasks, comments, files, meet and greets, committee seats and logins.
-- The 40 real staff (EmployeeID 15 to 54) are not touched.
--
-- PART B removes ALL tasks (the 20 standardized tasks and the 24 sample department tasks)
-- together with every assignment, comment and file attached to them. All of the starting
-- tasks are sample content. Managers then create Grace Place's real tasks on the Tasks page.
--
-- If you already created logins (npm run seed:auth) BEFORE running this, also delete the
-- 14 sample users in Supabase under Authentication > Users. They are the people with
-- example.org-style sample emails. Running this file before the login step avoids that.
-- ---------------------------------------------------------------------------

BEGIN;

-- ===== PART A: the 14 sample people ========================================

DELETE FROM Attachment
 WHERE AssignmentID IN (SELECT AssignmentID FROM TaskAssignment WHERE EmployeeID <= 14)
    OR UploadedByEmployeeID <= 14;

DELETE FROM TaskComment
 WHERE AssignmentID IN (SELECT AssignmentID FROM TaskAssignment WHERE EmployeeID <= 14)
    OR AuthorEmployeeID <= 14;

DELETE FROM TaskAssignment    WHERE EmployeeID <= 14;
DELETE FROM MeetAndGreet      WHERE EmployeeID <= 14 OR HostEmployeeID <= 14;
DELETE FROM EmployeeCommittee WHERE EmployeeID <= 14;
DELETE FROM Account           WHERE EmployeeID <= 14;
DELETE FROM Employee          WHERE EmployeeID <= 14;

-- ===== PART B: all tasks ====================================================

DELETE FROM Attachment;
DELETE FROM TaskComment;
DELETE FROM TaskAssignment;
DELETE FROM Task;

-- ===== Check: expect 40 people, 0 tasks, 0 assignments =====================
SELECT (SELECT COUNT(*) FROM Employee)       AS people_left,
       (SELECT COUNT(*) FROM Task)           AS tasks_left,
       (SELECT COUNT(*) FROM TaskAssignment) AS assignments_left;

COMMIT;
