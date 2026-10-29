// All database access goes through Supabase (PostgreSQL). Column names come back
// lowercase from Postgres (the DDL uses unquoted names), so each row is mapped back
// to the CamelCase names the screens use, e.g. employeeid -> EmployeeID.
import { supabase } from './supabase.js'
import { NOW, defaultDue } from './lib.js'

export const COLS = {
  Department: ['DepartmentID', 'DepartmentName', 'GracePlaceTerm'],
  Employee: ['EmployeeID', 'Name', 'DepartmentID', 'RoleTitle', 'EmploymentType', 'HireDate', 'OrientationCompleteDate', 'Email'],
  // PasswordHash is never requested by the browser.
  Account: ['AccountID', 'EmployeeID', 'Username', 'AccountType', 'IsHR'],
  Task: ['TaskID', 'TaskName', 'Description', 'AudienceType', 'TaskCategory', 'DepartmentID', 'RoleTitle', 'Checkpoint', 'PerformedBy', 'SourceDocument'],
  TaskAssignment: ['AssignmentID', 'EmployeeID', 'TaskID', 'AssignedByEmployeeID', 'Status', 'DueDate', 'DateCompleted'],
  Attachment: ['AttachmentID', 'AssignmentID', 'UploadedByEmployeeID', 'FileName', 'FileURL', 'TextNote', 'UploadedAt'],
  TaskComment: ['CommentID', 'AssignmentID', 'AuthorEmployeeID', 'CommentText', 'CreatedAt'],
  Committee: ['CommitteeID', 'CommitteeName', 'Description'],
  EmployeeCommittee: ['EmployeeID', 'CommitteeID', 'StartDate', 'EndDate'],
  MeetAndGreet: ['MeetAndGreetID', 'EmployeeID', 'HostEmployeeID', 'ScheduledDate', 'ScheduledTime', 'Location', 'Notes'],
}
export const TABLES = Object.keys(COLS)

const camel = (table, row) => {
  const out = {}
  for (const c of COLS[table]) out[c] = row[c.toLowerCase()] ?? null
  return out
}

const fail = (error, what) => {
  if (error) throw new Error(`${what}: ${error.message}`)
}

export async function fetchTable(table) {
  const { data, error } = await supabase.from(table.toLowerCase()).select(COLS[table].map((c) => c.toLowerCase()).join(','))
  fail(error, 'Could not load ' + table)
  return data.map((r) => camel(table, r))
}

export async function fetchTables(tables) {
  const parts = await Promise.all(tables.map(fetchTable))
  return Object.fromEntries(tables.map((t, i) => [t, parts[i]]))
}

/* ---------- sign in / out ---------- */
export async function signInWithUsername(username, password) {
  // Supabase Auth signs in with email, so look up the email for this username first.
  const { data: email, error } = await supabase.rpc('login_email', { p_username: username.trim() })
  if (error) {
    throw new Error(
      'Could not look up that username (' + error.message + '). Run sql/Team-3-Supabase-Security.sql in the Supabase SQL Editor and check the key in .env.local.',
    )
  }
  if (!email) throw new Error('No account has that username.')
  const { error: authError } = await supabase.auth.signInWithPassword({ email, password })
  if (authError) {
    if (/invalid login credentials/i.test(authError.message)) {
      throw new Error('Wrong password, or this login has not been created in Supabase yet. Run npm run seed:auth (or add the users under Authentication > Users).')
    }
    throw new Error(authError.message)
  }
}
export const signOut = () => supabase.auth.signOut()

/* ---------- writes ---------- */
// Which tables to reload after each kind of change.
export const TOUCHES = {
  status: ['TaskAssignment'],
  comment: ['TaskComment'],
  attachment: ['Attachment'],
  assign: ['TaskAssignment'],
  assignMany: ['TaskAssignment'],
  createAndAssign: ['Task', 'TaskAssignment'],
  createTask: ['Task', 'TaskAssignment'],
  remove: ['TaskAssignment', 'Attachment', 'TaskComment'],
  deleteTask: ['Task', 'TaskAssignment', 'Attachment', 'TaskComment'],
  meet: ['MeetAndGreet'],
  addHire: ['Employee', 'Account'],
}

const asgRow = (employeeId, taskId, byId, due) => ({
  employeeid: employeeId,
  taskid: taskId,
  assignedbyemployeeid: byId,
  status: 'Not started',
  duedate: due || null,
})

async function insertTask(t, departmentId) {
  const category = t.category || 'AdHoc'
  const { data, error } = await supabase
    .from('task')
    .insert({
      taskname: t.name,
      description: t.description || null,
      audiencetype: t.performedBy,
      taskcategory: category,
      departmentid: category === 'Standardized' ? null : departmentId,
      roletitle: category === 'RoleSpecific' ? t.roleTitle || null : null,
      checkpoint: t.checkpoint,
      performedby: t.performedBy,
      sourcedocument: 'Added by manager',
    })
    .select('taskid')
    .single()
  fail(error, 'Could not create the task')
  return data.taskid
}

export async function perform(a, ctx) {
  const { userId, db } = ctx
  switch (a.type) {
    case 'status': {
      const { error } = await supabase
        .from('taskassignment')
        .update({ status: a.status, datecompleted: a.status === 'Completed' ? NOW : null })
        .eq('assignmentid', a.id)
      return fail(error, 'Could not update the task')
    }
    case 'comment': {
      const { error } = await supabase
        .from('taskcomment')
        .insert({ assignmentid: a.assignmentId, authoremployeeid: a.authorId, commenttext: a.text })
      return fail(error, 'Could not post the comment')
    }
    case 'attachment': {
      const { error } = await supabase.from('attachment').insert({
        assignmentid: a.assignmentId,
        uploadedbyemployeeid: a.uploaderId,
        filename: a.fileName || null,
        fileurl: a.fileName ? `/uploads/passport/${a.fileName}` : null,
        textnote: a.note || null,
      })
      return fail(error, 'Could not save the proof')
    }
    case 'assign': {
      const { error } = await supabase.from('taskassignment').insert(asgRow(a.employeeId, a.taskId, a.byId, a.due))
      return fail(error, 'Could not assign the task')
    }
    case 'assignMany': {
      const rows = a.employeeIds.map((id) => asgRow(id, a.taskId, a.byId, a.dues[id]))
      const { error } = await supabase.from('taskassignment').insert(rows)
      return fail(error, 'Could not assign the task')
    }
    case 'createAndAssign': {
      const taskId = await insertTask({ ...a.task, category: 'AdHoc' }, a.departmentId)
      const { error } = await supabase.from('taskassignment').insert(asgRow(a.employeeId, taskId, a.byId, a.task.due))
      return fail(error, 'Could not assign the new task')
    }
    case 'createTask': {
      const t = a.task
      const taskId = await insertTask(t, t.departmentId)
      if (t.assignAll) {
        const hireIds = new Set(db.Account.filter((x) => x.AccountType === 'New Hire').map((x) => x.EmployeeID))
        const rows = db.Employee.filter((e) => hireIds.has(e.EmployeeID)).map((h) =>
          asgRow(h.EmployeeID, taskId, a.byId, defaultDue(h.HireDate, t.checkpoint)),
        )
        const { error } = await supabase.from('taskassignment').insert(rows)
        fail(error, 'Created the task but could not assign it')
      }
      return undefined
    }
    case 'remove': {
      // children first so no foreign key is left pointing at a deleted row
      for (const [table, col] of [['attachment', 'assignmentid'], ['taskcomment', 'assignmentid'], ['taskassignment', 'assignmentid']]) {
        const { error } = await supabase.from(table).delete().eq(col, a.id)
        fail(error, 'Could not remove the task')
      }
      return undefined
    }
    case 'deleteTask': {
      const { data, error } = await supabase.from('taskassignment').select('assignmentid').eq('taskid', a.id)
      fail(error, 'Could not delete the task')
      const ids = data.map((r) => r.assignmentid)
      if (ids.length) {
        for (const table of ['attachment', 'taskcomment']) {
          const { error: e } = await supabase.from(table).delete().in('assignmentid', ids)
          fail(e, 'Could not delete the task')
        }
        const { error: e2 } = await supabase.from('taskassignment').delete().eq('taskid', a.id)
        fail(e2, 'Could not delete the task')
      }
      const { error: e3 } = await supabase.from('task').delete().eq('taskid', a.id)
      return fail(e3, 'Could not delete the task')
    }
    case 'meet': {
      const { error } = await supabase.from('meetandgreet').insert({
        employeeid: a.employeeId,
        hostemployeeid: a.hostId,
        scheduleddate: a.date,
        scheduledtime: a.time + ':00',
        location: a.location || null,
      })
      return fail(error, 'Could not schedule the meet and greet')
    }
    case 'addHire': {
      // Runs on Supabase (Edge Function add-new-hire): creates the login, Employee and Account together.
      const { error } = await supabase.functions.invoke('add-new-hire', { body: a.form })
      if (error) {
        let msg = error.message
        try { msg = (await error.context.json()).error || msg } catch { /* keep the generic message */ }
        if (/failed to send|not found|404/i.test(msg)) msg = 'The add-new-hire function is not set up in Supabase yet. See the handoff guide.'
        throw new Error(msg)
      }
      return undefined
    }
    default:
      return undefined
  }
}
