import seed from './data.json'

export const NOW = '2026-10-19' // "today" for the sample data
export const DEMO_PASSWORD = 'Passport2026!'
export const CHECKPOINTS = ['Pre-Orientation', 'First Week', '30-Day', '60-Day', '90-Day', 'Next Steps']
export const CHECKPOINT_LABEL = {
  'Pre-Orientation': 'Pre-Orientation',
  'First Week': 'First Week',
  '30-Day': '30 Days',
  '60-Day': '60 Days',
  '90-Day': '90 Days',
  'Next Steps': 'Next Steps',
}
export const STATUSES = ['Not started', 'In progress', 'Completed']
export const DUE_OFFSET = { 'Pre-Orientation': -3, 'First Week': 7, '30-Day': 30, '60-Day': 60, '90-Day': 90, 'Next Steps': 120 }

// Keys as declared in Team-3-DDL.sql, used by the table browser.
export const SCHEMA = {
  Department: { pk: ['DepartmentID'], fk: {} },
  Employee: { pk: ['EmployeeID'], fk: { DepartmentID: 'Department' } },
  Account: { pk: ['AccountID'], fk: { EmployeeID: 'Employee' } },
  Task: { pk: ['TaskID'], fk: { DepartmentID: 'Department' } },
  TaskAssignment: {
    pk: ['AssignmentID'],
    fk: { EmployeeID: 'Employee', TaskID: 'Task', AssignedByEmployeeID: 'Employee' },
  },
  Attachment: { pk: ['AttachmentID'], fk: { AssignmentID: 'TaskAssignment', UploadedByEmployeeID: 'Employee' } },
  TaskComment: { pk: ['CommentID'], fk: { AssignmentID: 'TaskAssignment', AuthorEmployeeID: 'Employee' } },
  Committee: { pk: ['CommitteeID'], fk: {} },
  EmployeeCommittee: { pk: ['EmployeeID', 'CommitteeID'], fk: { EmployeeID: 'Employee', CommitteeID: 'Committee' } },
  MeetAndGreet: { pk: ['MeetAndGreetID'], fk: { EmployeeID: 'Employee', HostEmployeeID: 'Employee' } },
}
export const TABLE_ORDER = Object.keys(SCHEMA)

export const initialState = { db: seed, log: [] }
const KEY = 'gp-passport-demo-v1'
export function loadState() {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) {
      const s = JSON.parse(raw)
      if (s && s.db && s.db.Task && s.db.TaskAssignment) return s
    }
  } catch (e) { /* storage unavailable */ }
  return initialState
}
export function saveState(state) {
  try { localStorage.setItem(KEY, JSON.stringify(state)) } catch (e) { /* ignore */ }
}

export const q = (v) => {
  if (v === null || v === undefined || v === '') return 'NULL'
  if (typeof v === 'number') return String(v)
  return "'" + String(v).replace(/'/g, "''") + "'"
}
const nextId = (rows, key) => rows.reduce((m, r) => Math.max(m, r[key]), 0) + 1
const clock = () => new Date().toTimeString().slice(0, 8)

// Every UI action changes the in-memory tables and records the SQL it stands for.
export function reducer(state, a) {
  const db = { ...state.db }
  let sql = ''
  switch (a.type) {
    case 'status': {
      // New hires may only start a task. Completing or reopening is a manager action.
      if (a.actorRole === 'New Hire') {
        const cur = db.TaskAssignment.find((r) => r.AssignmentID === a.id)
        if (!cur || cur.Status !== 'Not started' || a.status !== 'In progress') return state
      }
      const done = a.status === 'Completed' ? NOW : null
      db.TaskAssignment = db.TaskAssignment.map((r) =>
        r.AssignmentID === a.id ? { ...r, Status: a.status, DateCompleted: done } : r,
      )
      sql = `UPDATE TaskAssignment\n   SET Status = ${q(a.status)}, DateCompleted = ${q(done)}\n WHERE AssignmentID = ${a.id};`
      break
    }
    case 'comment': {
      const id = nextId(db.TaskComment, 'CommentID')
      const at = `${NOW} ${clock()}`
      db.TaskComment = [
        ...db.TaskComment,
        { CommentID: id, AssignmentID: a.assignmentId, AuthorEmployeeID: a.authorId, CommentText: a.text, CreatedAt: at },
      ]
      sql = `INSERT INTO TaskComment (AssignmentID, AuthorEmployeeID, CommentText, CreatedAt)\nVALUES (${a.assignmentId}, ${a.authorId}, ${q(a.text)}, ${q(at)});`
      break
    }
    case 'attachment': {
      const id = nextId(db.Attachment, 'AttachmentID')
      const at = `${NOW} ${clock()}`
      const url = a.fileName ? `/uploads/passport/${a.fileName}` : null
      db.Attachment = [
        ...db.Attachment,
        {
          AttachmentID: id,
          AssignmentID: a.assignmentId,
          UploadedByEmployeeID: a.uploaderId,
          FileName: a.fileName || null,
          FileURL: url,
          TextNote: a.note || null,
          UploadedAt: at,
        },
      ]
      sql = `INSERT INTO Attachment (AssignmentID, UploadedByEmployeeID, FileName, FileURL, TextNote, UploadedAt)\nVALUES (${a.assignmentId}, ${a.uploaderId}, ${q(a.fileName)}, ${q(url)}, ${q(a.note)}, ${q(at)});`
      break
    }
    case 'assign': {
      const id = nextId(db.TaskAssignment, 'AssignmentID')
      db.TaskAssignment = [
        ...db.TaskAssignment,
        {
          AssignmentID: id,
          EmployeeID: a.employeeId,
          TaskID: a.taskId,
          AssignedByEmployeeID: a.byId,
          Status: 'Not started',
          DueDate: a.due || null,
          DateCompleted: null,
        },
      ]
      sql = `INSERT INTO TaskAssignment (EmployeeID, TaskID, AssignedByEmployeeID, Status, DueDate)\nVALUES (${a.employeeId}, ${a.taskId}, ${a.byId}, 'Not started', ${q(a.due)});`
      break
    }
    case 'createAndAssign': {
      const t = a.task
      const taskId = nextId(db.Task, 'TaskID')
      db.Task = [
        ...db.Task,
        {
          TaskID: taskId,
          TaskName: t.name,
          Description: t.description || null,
          AudienceType: t.performedBy,
          TaskCategory: 'AdHoc',
          DepartmentID: a.departmentId,
          RoleTitle: null,
          Checkpoint: t.checkpoint,
          PerformedBy: t.performedBy,
          SourceDocument: 'Added by manager',
        },
      ]
      const id = nextId(db.TaskAssignment, 'AssignmentID')
      db.TaskAssignment = [
        ...db.TaskAssignment,
        {
          AssignmentID: id,
          EmployeeID: a.employeeId,
          TaskID: taskId,
          AssignedByEmployeeID: a.byId,
          Status: 'Not started',
          DueDate: t.due || null,
          DateCompleted: null,
        },
      ]
      sql =
        `INSERT INTO Task (TaskName, Description, AudienceType, TaskCategory, DepartmentID, Checkpoint, PerformedBy, SourceDocument)\n` +
        `VALUES (${q(t.name)}, ${q(t.description)}, ${q(t.performedBy)}, 'AdHoc', ${a.departmentId}, ${q(t.checkpoint)}, ${q(t.performedBy)}, 'Added by manager');\n\n` +
        `INSERT INTO TaskAssignment (EmployeeID, TaskID, AssignedByEmployeeID, Status, DueDate)\n` +
        `VALUES (${a.employeeId}, LAST_INSERT_ID(), ${a.byId}, 'Not started', ${q(t.due)});`
      break
    }
    case 'remove': {
      db.Attachment = db.Attachment.filter((r) => r.AssignmentID !== a.id)
      db.TaskComment = db.TaskComment.filter((r) => r.AssignmentID !== a.id)
      db.TaskAssignment = db.TaskAssignment.filter((r) => r.AssignmentID !== a.id)
      sql =
        `-- child rows first, so the foreign keys stay valid\n` +
        `DELETE FROM Attachment  WHERE AssignmentID = ${a.id};\n` +
        `DELETE FROM TaskComment WHERE AssignmentID = ${a.id};\n` +
        `DELETE FROM TaskAssignment WHERE AssignmentID = ${a.id};`
      break
    }
    case 'createTask': {
      const t = a.task
      const taskId = nextId(db.Task, 'TaskID')
      db.Task = [
        ...db.Task,
        {
          TaskID: taskId,
          TaskName: t.name,
          Description: t.description || null,
          AudienceType: t.performedBy,
          TaskCategory: t.category,
          DepartmentID: t.category === 'Standardized' ? null : t.departmentId,
          RoleTitle: t.category === 'RoleSpecific' ? t.roleTitle || null : null,
          Checkpoint: t.checkpoint,
          PerformedBy: t.performedBy,
          SourceDocument: 'Added by manager',
        },
      ]
      const dep = t.category === 'Standardized' ? null : t.departmentId
      sql =
        `INSERT INTO Task (TaskName, Description, AudienceType, TaskCategory, DepartmentID, RoleTitle, Checkpoint, PerformedBy, SourceDocument)\n` +
        `VALUES (${q(t.name)}, ${q(t.description)}, ${q(t.performedBy)}, ${q(t.category)}, ${q(dep)}, ${q(t.category === 'RoleSpecific' ? t.roleTitle : null)}, ${q(t.checkpoint)}, ${q(t.performedBy)}, 'Added by manager');`
      if (t.assignAll) {
        const hires = db.Employee.filter((e) => db.Account.some((x) => x.EmployeeID === e.EmployeeID && x.AccountType === 'New Hire'))
        let id = nextId(db.TaskAssignment, 'AssignmentID')
        const added = hires.map((h) => ({
          AssignmentID: id++, EmployeeID: h.EmployeeID, TaskID: taskId, AssignedByEmployeeID: a.byId,
          Status: 'Not started', DueDate: defaultDue(h.HireDate, t.checkpoint), DateCompleted: null,
        }))
        db.TaskAssignment = [...db.TaskAssignment, ...added]
        sql +=
          `\n\n-- Standardized task: give it to every new hire\n` +
          `INSERT INTO TaskAssignment (EmployeeID, TaskID, AssignedByEmployeeID, Status, DueDate)\n` +
          `SELECT e.EmployeeID, LAST_INSERT_ID(), ${a.byId}, 'Not started', DATE_ADD(e.HireDate, INTERVAL ${DUE_OFFSET[t.checkpoint]} DAY)\n` +
          `  FROM Employee e JOIN Account ac ON ac.EmployeeID = e.EmployeeID\n WHERE ac.AccountType = 'New Hire';`
      }
      break
    }
    case 'assignMany': {
      let id = nextId(db.TaskAssignment, 'AssignmentID')
      const added = a.employeeIds.map((eid) => ({
        AssignmentID: id++, EmployeeID: eid, TaskID: a.taskId, AssignedByEmployeeID: a.byId,
        Status: 'Not started', DueDate: a.dues[eid] || null, DateCompleted: null,
      }))
      db.TaskAssignment = [...db.TaskAssignment, ...added]
      sql =
        `INSERT INTO TaskAssignment (EmployeeID, TaskID, AssignedByEmployeeID, Status, DueDate) VALUES\n` +
        added.map((r) => `  (${r.EmployeeID}, ${r.TaskID}, ${a.byId}, 'Not started', ${q(r.DueDate)})`).join(',\n') + ';'
      break
    }
    case 'reset':
      return initialState
    case 'deleteTask': {
      const ids = db.TaskAssignment.filter((r) => r.TaskID === a.id).map((r) => r.AssignmentID)
      db.Attachment = db.Attachment.filter((r) => !ids.includes(r.AssignmentID))
      db.TaskComment = db.TaskComment.filter((r) => !ids.includes(r.AssignmentID))
      db.TaskAssignment = db.TaskAssignment.filter((r) => r.TaskID !== a.id)
      db.Task = db.Task.filter((r) => r.TaskID !== a.id)
      const sub = `(SELECT AssignmentID FROM TaskAssignment WHERE TaskID = ${a.id})`
      sql =
        `-- children first, so no foreign key is left pointing at a deleted row\n` +
        `DELETE FROM Attachment  WHERE AssignmentID IN ${sub};\n` +
        `DELETE FROM TaskComment WHERE AssignmentID IN ${sub};\n` +
        `DELETE FROM TaskAssignment WHERE TaskID = ${a.id};\n` +
        `DELETE FROM Task WHERE TaskID = ${a.id};`
      break
    }
    case 'meet': {
      const id = nextId(db.MeetAndGreet, 'MeetAndGreetID')
      db.MeetAndGreet = [
        ...db.MeetAndGreet,
        {
          MeetAndGreetID: id,
          EmployeeID: a.employeeId,
          HostEmployeeID: a.hostId,
          ScheduledDate: a.date,
          ScheduledTime: a.time + ':00',
          Location: a.location || null,
          Notes: null,
        },
      ]
      sql = `INSERT INTO MeetAndGreet (EmployeeID, HostEmployeeID, ScheduledDate, ScheduledTime, Location)\nVALUES (${a.employeeId}, ${a.hostId}, ${q(a.date)}, ${q(a.time + ':00')}, ${q(a.location)});`
      break
    }
    default:
      return state
  }
  return { db, log: [{ sql, t: clock(), n: state.log.length + 1 }, ...state.log] }
}

export function defaultDue(hireDate, checkpoint) {
  const d = new Date(hireDate + 'T00:00:00')
  d.setDate(d.getDate() + (DUE_OFFSET[checkpoint] ?? 30))
  return d.toISOString().slice(0, 10)
}

export const fmtDate = (s) =>
  s ? new Date(s.slice(0, 10) + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : ''
export const fmtShort = (s) =>
  s ? new Date(s.slice(0, 10) + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : ''
export const fmtTime = (t) => {
  if (!t) return ''
  const [h, m] = t.split(':').map(Number)
  return `${((h + 11) % 12) + 1}:${String(m).padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`
}
export const fmtStamp = (s) => (s ? `${fmtShort(s)}, ${fmtTime(s.slice(11, 16))}` : '')
export const daysBetween = (a, b) =>
  Math.round((new Date(b + 'T00:00:00') - new Date(a + 'T00:00:00')) / 86400000)

export function makeSelectors(db) {
  const emp = new Map(db.Employee.map((e) => [e.EmployeeID, e]))
  const dept = new Map(db.Department.map((d) => [d.DepartmentID, d]))
  const task = new Map(db.Task.map((t) => [t.TaskID, t]))
  const acct = new Map(db.Account.map((a) => [a.EmployeeID, a]))
  const roleOf = (id) => acct.get(id)?.AccountType
  const joined = (employeeId) =>
    db.TaskAssignment.filter((a) => a.EmployeeID === employeeId).map((a) => ({ ...a, task: task.get(a.TaskID) }))
  const isOverdue = (a) => a.Status !== 'Completed' && a.DueDate && a.DueDate < NOW
  const progress = (list) => {
    const total = list.length
    const done = list.filter((a) => a.Status === 'Completed').length
    const doing = list.filter((a) => a.Status === 'In progress').length
    const overdue = list.filter(isOverdue).length
    return { total, done, doing, todo: total - done - doing, overdue, pct: total ? Math.round((done / total) * 100) : 0 }
  }
  return { emp, dept, task, acct, roleOf, joined, isOverdue, progress }
}
