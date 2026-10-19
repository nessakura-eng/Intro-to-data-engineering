// "Today" for the sample data. Due dates in Team-3-Data.sql are relative to this day.
export const NOW = import.meta.env.VITE_DEMO_TODAY || '2026-10-19'
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
