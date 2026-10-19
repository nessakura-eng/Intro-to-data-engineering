-- ============================================================
-- Team 3 -- Grace Place Onboarding Passport
-- Supabase security setup. Run AFTER Team-3-DDL.sql and Team-3-Data.sql,
-- in the Supabase SQL Editor.
--
-- Supabase Auth checks the password at sign-in. These rules decide what
-- each signed-in person may read or change. The signed-in person is matched
-- to an Employee row by email.
--   * Managers: read everything, create/assign/delete tasks, mark complete.
--   * New hires: read only their own passport tasks, comment, add proof,
--     and press "Get Started" (Not started -> In progress). Nothing else.
-- ============================================================

-- ---------- helper functions (run with owner rights so they bypass RLS) ----------
CREATE OR REPLACE FUNCTION current_employee_id() RETURNS INT
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
    SELECT EmployeeID FROM Employee WHERE lower(Email) = lower(auth.jwt() ->> 'email') LIMIT 1
$$;

CREATE OR REPLACE FUNCTION is_manager() RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
    SELECT EXISTS (SELECT 1 FROM Account
                    WHERE EmployeeID = current_employee_id() AND AccountType = 'Manager')
$$;

CREATE OR REPLACE FUNCTION task_performed_by(p_task INT) RETURNS TEXT
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
    SELECT PerformedBy FROM Task WHERE TaskID = p_task
$$;

-- True when the assignment belongs to the signed-in new hire AND is a task the new hire performs.
CREATE OR REPLACE FUNCTION my_passport_assignment(p_assignment INT) RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
    SELECT EXISTS (SELECT 1 FROM TaskAssignment ta JOIN Task t ON t.TaskID = ta.TaskID
                    WHERE ta.AssignmentID = p_assignment
                      AND ta.EmployeeID = current_employee_id()
                      AND t.PerformedBy = 'New Hire')
$$;

-- Login screen: turn a username into the email Supabase Auth signs in with.
CREATE OR REPLACE FUNCTION login_email(p_username TEXT) RETURNS TEXT
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
    SELECT e.Email FROM Account a JOIN Employee e ON e.EmployeeID = a.EmployeeID
     WHERE lower(a.Username) = lower(p_username)
$$;

REVOKE ALL ON FUNCTION login_email(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION login_email(TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION current_employee_id(), is_manager(), task_performed_by(INT),
      my_passport_assignment(INT) TO authenticated;

-- ---------- table privileges ----------
REVOKE ALL ON Department, Employee, Account, Task, TaskAssignment, Attachment, TaskComment,
              Committee, EmployeeCommittee, MeetAndGreet FROM anon, authenticated;

GRANT SELECT ON Department, Employee, Committee, EmployeeCommittee TO authenticated;
-- PasswordHash is never sent to the browser.
GRANT SELECT (AccountID, EmployeeID, Username, AccountType) ON Account TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON Task, TaskAssignment, Attachment, TaskComment, MeetAndGreet TO authenticated;

-- ---------- row-level security ----------
ALTER TABLE Department        ENABLE ROW LEVEL SECURITY;
ALTER TABLE Employee          ENABLE ROW LEVEL SECURITY;
ALTER TABLE Account           ENABLE ROW LEVEL SECURITY;
ALTER TABLE Task              ENABLE ROW LEVEL SECURITY;
ALTER TABLE TaskAssignment    ENABLE ROW LEVEL SECURITY;
ALTER TABLE Attachment        ENABLE ROW LEVEL SECURITY;
ALTER TABLE TaskComment       ENABLE ROW LEVEL SECURITY;
ALTER TABLE Committee         ENABLE ROW LEVEL SECURITY;
ALTER TABLE EmployeeCommittee ENABLE ROW LEVEL SECURITY;
ALTER TABLE MeetAndGreet      ENABLE ROW LEVEL SECURITY;

-- Clear any earlier version of these policies so this file can be re-run.
DO $$ DECLARE r RECORD; BEGIN
    FOR r IN SELECT policyname, tablename FROM pg_policies WHERE schemaname = 'public' LOOP
        EXECUTE format('DROP POLICY %I ON public.%I', r.policyname, r.tablename);
    END LOOP;
END $$;

-- Directory-style tables: any signed-in person can read.
CREATE POLICY dept_read    ON Department        FOR SELECT TO authenticated USING (true);
CREATE POLICY emp_read     ON Employee          FOR SELECT TO authenticated USING (true);
CREATE POLICY acct_read    ON Account           FOR SELECT TO authenticated USING (true);
CREATE POLICY comm_read    ON Committee         FOR SELECT TO authenticated USING (true);
CREATE POLICY empcomm_read ON EmployeeCommittee FOR SELECT TO authenticated USING (true);

-- Task: managers see and change the whole task base; a new hire sees only tasks assigned to them that they perform.
CREATE POLICY task_read ON Task FOR SELECT TO authenticated
    USING (is_manager() OR (PerformedBy = 'New Hire' AND EXISTS (
        SELECT 1 FROM TaskAssignment ta WHERE ta.TaskID = Task.TaskID AND ta.EmployeeID = current_employee_id())));
CREATE POLICY task_ins ON Task FOR INSERT TO authenticated WITH CHECK (is_manager());
CREATE POLICY task_upd ON Task FOR UPDATE TO authenticated USING (is_manager()) WITH CHECK (is_manager());
CREATE POLICY task_del ON Task FOR DELETE TO authenticated USING (is_manager());

-- TaskAssignment
CREATE POLICY asg_read ON TaskAssignment FOR SELECT TO authenticated
    USING (is_manager() OR (EmployeeID = current_employee_id() AND task_performed_by(TaskID) = 'New Hire'));
CREATE POLICY asg_ins ON TaskAssignment FOR INSERT TO authenticated WITH CHECK (is_manager());
CREATE POLICY asg_upd ON TaskAssignment FOR UPDATE TO authenticated
    USING (is_manager() OR (EmployeeID = current_employee_id() AND task_performed_by(TaskID) = 'New Hire'))
    WITH CHECK (is_manager() OR (EmployeeID = current_employee_id() AND task_performed_by(TaskID) = 'New Hire'));
CREATE POLICY asg_del ON TaskAssignment FOR DELETE TO authenticated USING (is_manager());

-- Attachment (proof)
CREATE POLICY att_read ON Attachment FOR SELECT TO authenticated
    USING (is_manager() OR my_passport_assignment(AssignmentID));
CREATE POLICY att_ins ON Attachment FOR INSERT TO authenticated
    WITH CHECK (UploadedByEmployeeID = current_employee_id() AND (is_manager() OR my_passport_assignment(AssignmentID)));
CREATE POLICY att_del ON Attachment FOR DELETE TO authenticated USING (is_manager());

-- TaskComment: both sides can comment; the author must be the signed-in person.
CREATE POLICY cmt_read ON TaskComment FOR SELECT TO authenticated
    USING (is_manager() OR my_passport_assignment(AssignmentID));
CREATE POLICY cmt_ins ON TaskComment FOR INSERT TO authenticated
    WITH CHECK (AuthorEmployeeID = current_employee_id() AND (is_manager() OR my_passport_assignment(AssignmentID)));
CREATE POLICY cmt_del ON TaskComment FOR DELETE TO authenticated USING (is_manager());

-- MeetAndGreet
CREATE POLICY mg_read ON MeetAndGreet FOR SELECT TO authenticated
    USING (is_manager() OR EmployeeID = current_employee_id() OR HostEmployeeID = current_employee_id());
CREATE POLICY mg_ins ON MeetAndGreet FOR INSERT TO authenticated WITH CHECK (is_manager());
CREATE POLICY mg_upd ON MeetAndGreet FOR UPDATE TO authenticated USING (is_manager()) WITH CHECK (is_manager());
CREATE POLICY mg_del ON MeetAndGreet FOR DELETE TO authenticated USING (is_manager());

-- ---------- new-hire status rule ----------
-- A new hire may only move their own task from 'Not started' to 'In progress'.
-- Completing or reopening a task is a manager action.
CREATE OR REPLACE FUNCTION enforce_hire_status_rule() RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
    IF auth.jwt() ->> 'email' IS NULL OR is_manager() THEN
        RETURN NEW;  -- SQL Editor / service role / managers
    END IF;
    IF OLD.Status = 'Not started' AND NEW.Status = 'In progress'
       AND NEW.EmployeeID = OLD.EmployeeID AND NEW.TaskID = OLD.TaskID
       AND NEW.AssignedByEmployeeID IS NOT DISTINCT FROM OLD.AssignedByEmployeeID
       AND NEW.DueDate IS NOT DISTINCT FROM OLD.DueDate
       AND NEW.DateCompleted IS NOT DISTINCT FROM OLD.DateCompleted THEN
        RETURN NEW;
    END IF;
    RAISE EXCEPTION 'New hires can only start a task. A manager marks it complete.'
        USING ERRCODE = '42501';
END;
$$;

DROP TRIGGER IF EXISTS trg_hire_status_rule ON TaskAssignment;
CREATE TRIGGER trg_hire_status_rule BEFORE UPDATE ON TaskAssignment
    FOR EACH ROW EXECUTE FUNCTION enforce_hire_status_rule();

-- Make the API pick up the new tables and rules right away.
NOTIFY pgrst, 'reload schema';
