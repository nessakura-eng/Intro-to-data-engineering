import React, { useEffect } from 'react'
import logo from './logo.jpg'
import { NOW, CHECKPOINTS, CHECKPOINT_LABEL, fmtDate } from './lib.js'

// A clean, paper-friendly view of one person's passport: every task assigned to them,
// grouped by checkpoint, with its status, due date and completion date.
// `items` is S.joined(hire.EmployeeID) (assignments with their task attached).
// The toolbar (Back / Print) is hidden when printing; see the @media print rules in styles.css.

const SIDES = [
  { key: 'New Hire', title: 'Passport tasks', note: 'Done by the new hire' },
  { key: 'Management', title: 'Manager checklist', note: 'Done by the manager' },
]

function groupByCheckpoint(list) {
  const order = [...CHECKPOINTS, 'Other']
  return order
    .map((cp) => ({
      cp,
      rows: list
        .filter((a) => (CHECKPOINTS.includes(a.task.Checkpoint) ? a.task.Checkpoint : 'Other') === cp)
        .sort((a, b) => (a.DueDate || '9999').localeCompare(b.DueDate || '9999') || a.AssignmentID - b.AssignmentID),
    }))
    .filter((g) => g.rows.length)
}

export default function PrintPassport({ hire, S, items, onBack, backLabel = 'Back' }) {
  useEffect(() => {
    // The browser uses the page title as the suggested file name when saving as PDF.
    const before = document.title
    document.title = `Passport - ${hire.Name}`
    return () => { document.title = before }
  }, [hire.Name])

  const all = items.filter((a) => a.task)
  const total = S.progress(all)
  const dept = S.dept.get(hire.DepartmentID)?.DepartmentName || ''

  return (
    <div className="print-sheet">
      <div className="print-bar no-print">
        <button className="btn" onClick={onBack}>{backLabel}</button>
        <button className="btn primary" onClick={() => window.print()}>Print</button>
        <span className="muted">Opens your browser's print window. Choose "Save as PDF" to keep a digital copy.</span>
      </div>

      <header className="ps-head">
        <img className="ps-logo" src={logo} alt="Grace Place for Children and Families" />
        <div>
          <h1>Onboarding Passport</h1>
          <p className="ps-name">{hire.Name}</p>
          <p>{hire.RoleTitle}{dept ? ` · ${dept}` : ''}{hire.EmploymentType ? ` · ${hire.EmploymentType}` : ''}</p>
          <p>Hired {hire.HireDate ? fmtDate(hire.HireDate) : 'date not set'} · Printed {fmtDate(NOW)}</p>
        </div>
      </header>

      <section className="ps-summary" aria-label="Summary">
        <div><b>{total.pct}%</b><span>overall complete</span></div>
        <div><b>{total.done} of {total.total}</b><span>tasks complete</span></div>
        <div><b>{total.doing}</b><span>in progress</span></div>
        <div><b>{total.todo}</b><span>not started</span></div>
        <div><b>{total.overdue}</b><span>overdue</span></div>
      </section>

      {all.length === 0 && <p className="ps-empty">No tasks have been assigned to {hire.Name.split(' ')[0]} yet.</p>}

      {SIDES.map((side) => {
        const list = all.filter((a) => a.task.PerformedBy === side.key)
        if (!list.length) return null
        const p = S.progress(list)
        return (
          <section className="ps-side" key={side.key}>
            <h2>{side.title} <small>{side.note} · {p.done} of {p.total} complete</small></h2>
            {groupByCheckpoint(list).map((g) => (
              <table className="ps-table" key={g.cp}>
                <caption>{CHECKPOINT_LABEL[g.cp] || g.cp}</caption>
                <thead>
                  <tr>
                    <th className="c-box"><span className="sr-only">Done</span></th>
                    <th>Task</th>
                    <th>Status</th>
                    <th>Due</th>
                    <th>Completed</th>
                    <th>Assigned by</th>
                  </tr>
                </thead>
                <tbody>
                  {g.rows.map((a) => {
                    const done = a.Status === 'Completed'
                    return (
                      <tr key={a.AssignmentID}>
                        <td className="c-box"><span className={'pbox' + (done ? ' on' : '')} aria-hidden="true">{done ? '✓' : ''}</span></td>
                        <td>{a.task.TaskName}</td>
                        <td>{a.Status}{S.isOverdue(a) ? ' (overdue)' : ''}</td>
                        <td>{a.DueDate ? fmtDate(a.DueDate) : ''}</td>
                        <td>{a.DateCompleted ? fmtDate(a.DateCompleted) : ''}</td>
                        <td>{a.AssignedByEmployeeID ? S.emp.get(a.AssignedByEmployeeID)?.Name || '' : 'Standard task'}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            ))}
          </section>
        )
      })}

      <section className="ps-sign" aria-label="Signatures">
        <div><span /><small>New hire signature</small></div>
        <div><span /><small>Manager signature</small></div>
        <div><span /><small>Date</small></div>
      </section>
    </div>
  )
}
