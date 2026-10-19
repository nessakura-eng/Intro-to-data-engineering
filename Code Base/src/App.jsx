import React, { useState, useMemo, useEffect, useRef, useCallback, createContext, useContext } from 'react'
import logo from './logo.jpg'
import {
  NOW, CHECKPOINTS, CHECKPOINT_LABEL, STATUSES,
  makeSelectors, defaultDue, fmtDate, fmtShort, fmtTime, fmtStamp, daysBetween,
} from './lib.js'
import { supabase, isConfigured } from './supabase.js'
import { TABLES, fetchTables, perform, TOUCHES, signInWithUsername, signOut as apiSignOut } from './api.js'
import { DEMO_ACCOUNTS, DEMO_PASSWORD } from './demoAccounts.js'

const Ctx = createContext(null)
const useApp = () => useContext(Ctx)

/* ---------- small pieces ---------- */
const Icon = ({ n }) => {
  const p = {
    check: 'M5 12.5l4.5 4.5L19 7.5',
    chat: 'M4 5h16v11H9l-5 4V5z',
    clip: 'M8 12.5l6-6a3 3 0 014.2 4.2l-8 8a5 5 0 01-7-7l7.5-7.5',
    chev: 'M9 6l6 6-6 6',
    search: 'M11 4a7 7 0 105 12l4 4M11 4a7 7 0 010 14',
    db: 'M5 6c0-1.7 3.1-3 7-3s7 1.3 7 3-3.1 3-7 3-7-1.3-7-3zM5 6v6c0 1.7 3.1 3 7 3s7-1.3 7-3V6M5 12v6c0 1.7 3.1 3 7 3s7-1.3 7-3v-6',
    plus: 'M12 5v14M5 12h14',
    x: 'M6 6l12 12M18 6L6 18',
    warn: 'M12 4l9 16H3L12 4zM12 10v4M12 17v.5',
  }[n]
  return (
    <svg className="ic" viewBox="0 0 24 24" aria-hidden="true">
      <path d={p} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

const initials = (name) => name.split(' ').map((p) => p[0]).slice(0, 2).join('')
const Avatar = ({ emp, size = 36 }) => (
  <span className={'avatar av' + (emp.EmployeeID % 4)} style={{ width: size, height: size, fontSize: size * 0.38 }}>
    {initials(emp.Name)}
  </span>
)

const StatusChip = ({ s }) => (
  <span className={'chip st-' + s.replace(' ', '-').toLowerCase()}>{s}</span>
)

const Bar = ({ pct, label }) => (
  <div className="bar" role="progressbar" aria-valuenow={pct} aria-valuemin="0" aria-valuemax="100" aria-label={label}>
    <span style={{ width: pct + '%' }} />
  </div>
)

function Ring({ pct, size = 112 }) {
  const r = (size - 14) / 2
  const c = 2 * Math.PI * r
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="ring" role="img" aria-label={`${pct}% complete`}>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--line)" strokeWidth="10" />
      <circle
        cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--ok)" strokeWidth="10" strokeLinecap="round"
        strokeDasharray={`${(c * pct) / 100} ${c}`} transform={`rotate(-90 ${size / 2} ${size / 2})`}
      />
      <text x="50%" y="50%" textAnchor="middle" dominantBaseline="central" className="ring-t">{pct}%</text>
    </svg>
  )
}

/* ---------- app shell ---------- */
export default function App() {
  const [toast, setToast] = useState(null)
  const [session, setSession] = useState(undefined) // undefined = still checking
  const [db, setDb] = useState(null)
  const [loadError, setLoadError] = useState('')
  const [route, setRoute] = useState({ page: 'home' })
  const dbRef = useRef(null)
  dbRef.current = db

  useEffect(() => {
    if (!toast) return undefined
    const t = setTimeout(() => setToast(null), 6000)
    return () => clearTimeout(t)
  }, [toast])

  // Supabase keeps the sign-in between visits; follow it.
  useEffect(() => {
    if (!isConfigured) return undefined
    supabase.auth.getSession().then(({ data }) => setSession(data.session ?? null))
    const { data } = supabase.auth.onAuthStateChange((_event, next) => setSession(next ?? null))
    return () => data.subscription.unsubscribe()
  }, [])

  // Load every table the signed-in person is allowed to see (row-level security filters them).
  const sessionUser = session?.user?.id
  useEffect(() => {
    if (!sessionUser) {
      setDb(null)
      return
    }
    let live = true
    setLoadError('')
    fetchTables(TABLES)
      .then((all) => live && setDb(all))
      .catch((e) => live && setLoadError(e.message))
    return () => { live = false }
  }, [sessionUser])

  const dispatch = useCallback(async (action) => {
    const current = dbRef.current
    const me = current.Employee.find((e) => e.Email?.toLowerCase() === session.user.email.toLowerCase())
    // Show a status change right away; the reload below confirms it.
    if (action.type === 'status') {
      setDb((prev) => ({
        ...prev,
        TaskAssignment: prev.TaskAssignment.map((r) =>
          r.AssignmentID === action.id ? { ...r, Status: action.status, DateCompleted: action.status === 'Completed' ? NOW : null } : r),
      }))
    }
    try {
      await perform(action, { userId: me.EmployeeID, db: current })
    } catch (e) {
      setToast(e.message)
    }
    try {
      const fresh = await fetchTables(TOUCHES[action.type] || TABLES)
      setDb((prev) => ({ ...prev, ...fresh }))
    } catch (e) {
      setToast(e.message)
    }
  }, [session])

  const S = useMemo(() => (db ? makeSelectors(db) : null), [db])
  const go = (page, params = {}) => {
    setRoute({ page, ...params })
    window.scrollTo(0, 0)
  }
  const signOut = async () => {
    await apiSignOut()
    setRoute({ page: 'home' })
  }

  if (!isConfigured) return <SetupNeeded />
  if (session === undefined) return <Splash text="Loading" />
  if (!session) return <Login onSignedIn={() => setRoute({ page: 'home' })} />
  if (loadError) return <Splash text={loadError} action={<button className="btn" onClick={signOut}>Sign out</button>} />
  if (!db) return <Splash text="Loading your passport" />

  const meRow = db.Employee.find((e) => e.Email?.toLowerCase() === session.user.email.toLowerCase())
  if (!meRow)
    return <Splash text="This login is not linked to an employee record. Ask an administrator to check the Employee email." action={<button className="btn" onClick={signOut}>Sign out</button>} />
  const userId = meRow.EmployeeID
  const ctx = { db, dispatch, S, userId, go, route, notify: setToast }
  const me = S.emp.get(userId)
  const isMgr = S.roleOf(userId) === 'Manager'

  return (
    <Ctx.Provider value={ctx}>
      <div className="shell">
        <div className="main-col">
          <div className="strip"><b>Education changes everything.</b><span>Staff portal</span></div>
          <div className="tri" />
          <Header me={me} isMgr={isMgr} onSignOut={signOut} />
          <main className="page">
            {isMgr ? <ManagerRoutes /> : <HireRoutes />}
          </main>
        </div>
      </div>
      {toast && <div className="toast" role="status">{toast}<button className="link" onClick={() => setToast(null)}>Dismiss</button></div>}
    </Ctx.Provider>
  )
}

function Splash({ text, action }) {
  return (
    <div className="login-wrap">
      <div className="strip"><b>Education changes everything.</b><span>Staff portal</span></div>
      <div className="splash"><img className="logo-img" src={logo} alt="Grace Place for Children and Families" /><p>{text}</p>{action}</div>
    </div>
  )
}

function SetupNeeded() {
  return (
    <div className="login-wrap">
      <div className="strip"><b>Education changes everything.</b><span>Staff portal</span></div>
      <div className="splash setup">
        <img className="logo-img" src={logo} alt="Grace Place for Children and Families" />
        <h1>Connect Supabase</h1>
        <p>This app reads its data from your Supabase project. Create a file named <code>.env.local</code> next to <code>package.json</code> with:</p>
        <pre className="envbox">{'VITE_SUPABASE_URL=https://YOUR-PROJECT.supabase.co\nVITE_SUPABASE_ANON_KEY=YOUR-ANON-PUBLIC-KEY'}</pre>
        <p>Then restart <code>npm run dev</code>. The README lists every setup step.</p>
      </div>
    </div>
  )
}

function Header({ me, isMgr, onSignOut }) {
  const { S, go, route, db } = useApp()
  const [term, setTerm] = useState('')
  const nav = isMgr
    ? [['home', 'Home'], ['directory', 'Directory'], ['library', 'Task library']]
    : [['home', 'Home'], ['passport', 'My passport'], ['profile', 'My profile']]
  const active = route.page === 'hire' ? 'home' : route.page
  const hits = term.trim().length > 1
    ? db.Employee.filter((e) => e.Name.toLowerCase().includes(term.trim().toLowerCase())).slice(0, 6)
    : []
  return (
    <header className="top">
      <div className="top-row">
        <button className="brand" onClick={() => go('home')} aria-label="Home">
          <img className="logo-img" src={logo} alt="Grace Place for Children and Families" />
          <span className="brand-t">Onboarding<br />Passport</span>
        </button>
        {isMgr && (
          <div className="search">
            <Icon n="search" />
            <input id="global-search" value={term} onChange={(e) => setTerm(e.target.value)} placeholder="Search people" aria-label="Search people" />
            {hits.length > 0 && (
              <ul className="hits">
                {hits.map((e) => (
                  <li key={e.EmployeeID}>
                    <button
                      onClick={() => {
                        setTerm('')
                        S.roleOf(e.EmployeeID) === 'Manager' ? go('directory') : go('hire', { id: e.EmployeeID })
                      }}
                    >
                      <Avatar emp={e} size={26} /> <span>{e.Name}<small>{e.RoleTitle}, {S.dept.get(e.DepartmentID).DepartmentName}</small></span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
        <div className="top-actions">
          <div className="who">
            <Avatar emp={me} size={32} />
            <span className="who-t"><b>{me.Name}</b><small>{isMgr ? 'Manager' : 'New hire'}</small></span>
          </div>
          <button className="btn ghost" onClick={onSignOut}>Sign out</button>
        </div>
      </div>
      <nav className="tabs" aria-label="Main">
        {nav.map(([k, l]) => (
          <button key={k} className={active === k ? 'on' : ''} onClick={() => go(k)} aria-current={active === k ? 'page' : undefined}>{l}</button>
        ))}
      </nav>
    </header>
  )
}

/* ---------- login ---------- */
function Login({ onSignedIn }) {
  const [user, setUser] = useState('')
  const [pw, setPw] = useState('')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const showDemo = import.meta.env.VITE_SHOW_DEMO_ACCOUNTS !== 'false'
  const submit = async (e) => {
    e.preventDefault()
    setBusy(true)
    setErr('')
    try {
      await signInWithUsername(user, pw)
      onSignedIn()
    } catch (ex) {
      setErr(ex.message)
    }
    setBusy(false)
  }
  const pick = (a) => {
    setUser(a.username)
    setPw(DEMO_PASSWORD)
    setErr('')
  }
  const group = (type) => DEMO_ACCOUNTS.filter((a) => a.role === type)
  return (
    <div className="login-wrap">
    <div className="strip"><b>Education changes everything.</b><span>Staff portal</span></div>
    <div className="login">
      <section className="login-card">
        <div className="brand static"><img className="logo-img" src={logo} alt="Grace Place for Children and Families" /><span className="brand-t">Onboarding<br />Passport</span></div>
        <h1>Sign in</h1>
        <p className="muted">One system for new hires and managers. Your account type decides what you see.</p>
        <form onSubmit={submit}>
          <label htmlFor="user">Username</label>
          <input id="user" value={user} onChange={(e) => setUser(e.target.value)} autoComplete="username" placeholder="first.last" />
          <label htmlFor="pw">Password</label>
          <input id="pw" type="password" value={pw} onChange={(e) => setPw(e.target.value)} autoComplete="current-password" />
          {err && <p className="error" role="alert">{err}</p>}
          <button className="btn primary wide" type="submit" disabled={busy}>{busy ? 'Signing in' : 'Sign in'}</button>
        </form>
        {showDemo && <p className="tiny muted">Sample accounts from Team-3-Data.sql all use the password <code>{DEMO_PASSWORD}</code>.</p>}
      </section>
      {showDemo && (
      <section className="login-side" aria-label="Sample accounts">
        <h2>Sample accounts</h2>
        {['Manager', 'New Hire'].map((type) => (
          <div key={type} className="acct-group">
            <h3>{type === 'Manager' ? 'Managers' : 'New hires'}</h3>
            <ul>
              {group(type).map((a, i) => (
                <li key={a.username}>
                  <button onClick={() => pick(a)} className="acct">
                    <span className={'avatar av' + (i % 4)} style={{ width: 34, height: 34, fontSize: 13 }}>{a.name.split(' ').map((p) => p[0]).join('')}</span>
                    <span><b>{a.name}</b><small>{a.title}, {a.dept}</small></span>
                    <code>{a.username}</code>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </section>
      )}
    </div>
    </div>
  )
}

/* ---------- task list (shared by new hire and manager) ---------- */
function TaskList({ items, viewer, canRemove, emptyText }) {
  const { S } = useApp()
  const [open, setOpen] = useState(null)
  const [collapsed, setCollapsed] = useState({})
  if (!items.length) return <p className="empty">{emptyText}</p>
  return (
    <div className="checkpoints">
      {CHECKPOINTS.map((cp) => {
        const rows = items.filter((a) => a.task.Checkpoint === cp)
        if (!rows.length) return null
        const p = S.progress(rows)
        const isCol = collapsed[cp]
        return (
          <section key={cp} className="cp">
            <button className="cp-head" onClick={() => setCollapsed({ ...collapsed, [cp]: !isCol })} aria-expanded={!isCol}>
              <span className={'chev' + (isCol ? '' : ' down')}><Icon n="chev" /></span>
              <h3>{CHECKPOINT_LABEL[cp]}</h3>
              <span className="cp-count">{p.done} of {p.total} complete</span>
              {p.overdue > 0 && <span className="chip st-overdue">{p.overdue} overdue</span>}
              <Bar pct={p.pct} label={CHECKPOINT_LABEL[cp] + ' progress'} />
            </button>
            {!isCol && (
              <ul className="rows">
                {rows.map((a) => (
                  <TaskRow key={a.AssignmentID} a={a} viewer={viewer} open={open === a.AssignmentID}
                    toggle={() => setOpen(open === a.AssignmentID ? null : a.AssignmentID)} canRemove={canRemove} />
                ))}
              </ul>
            )}
          </section>
        )
      })}
    </div>
  )
}

function TaskRow({ a, viewer, open, toggle, canRemove }) {
  const { db, dispatch, S } = useApp()
  const t = a.task
  const comments = db.TaskComment.filter((c) => c.AssignmentID === a.AssignmentID)
  const files = db.Attachment.filter((c) => c.AssignmentID === a.AssignmentID)
  const overdue = S.isOverdue(a)
  return (
    <li className={'row' + (open ? ' open' : '')}>
      <div className="row-main">
        <button className="row-title" onClick={toggle} aria-expanded={open}>
          <span className={'chev' + (open ? ' down' : '')}><Icon n="chev" /></span>
          <span className="rt">
            <b>{t.TaskName}</b>
            <small>
              {t.TaskCategory === 'Standardized' ? 'All new hires' : t.TaskCategory === 'RoleSpecific' ? t.RoleTitle : t.TaskCategory === 'AdHoc' ? 'Added by manager' : S.dept.get(t.DepartmentID)?.DepartmentName}
            </small>
          </span>
        </button>
        <span className="meta">
          {comments.length > 0 && <span className="count" title="Comments"><Icon n="chat" />{comments.length}</span>}
          {files.length > 0 && <span className="count" title="Proof uploaded"><Icon n="clip" />{files.length}</span>}
          <span className={'due' + (overdue ? ' late' : '')}>
            {a.Status === 'Completed' ? `Done ${fmtShort(a.DateCompleted)}` : a.DueDate ? `${overdue ? 'Overdue, ' : 'Due '}${fmtShort(a.DueDate)}` : ''}
          </span>
        </span>
        <StatusPicker a={a} />
      </div>
      {open && (
        <div className="row-detail">
          <TaskDetail a={a} viewer={viewer} canRemove={canRemove} />
        </div>
      )}
    </li>
  )
}

function TaskDetail({ a, viewer, canRemove }) {
  const { db, S } = useApp()
  const t = a.task
  const comments = db.TaskComment.filter((c) => c.AssignmentID === a.AssignmentID)
  const files = db.Attachment.filter((c) => c.AssignmentID === a.AssignmentID)
  const by = a.AssignedByEmployeeID ? S.emp.get(a.AssignedByEmployeeID) : null
  return (
      <div className="detail-grid">
        <div>
          {t.Description && <p>{t.Description}</p>}
          <dl className="facts">
            <div><dt>Performed by</dt><dd>{t.PerformedBy}</dd></div>
            <div><dt>Assigned</dt><dd>{by ? `By ${by.Name}` : 'Automatically (standardized)'}</dd></div>
            {t.SourceDocument && <div><dt>Source</dt><dd>{t.SourceDocument}</dd></div>}
          </dl>
          <h4>Proof of completion</h4>
          <ul className="files">
            {files.length === 0 && <li className="muted">Nothing uploaded yet.</li>}
            {files.map((f) => (
              <li key={f.AttachmentID}>
                <Icon n="clip" />
                <span>
                  <b>{f.FileName || 'Text note'}</b>
                  {f.TextNote && <em>{f.TextNote}</em>}
                  <small>{S.emp.get(f.UploadedByEmployeeID).Name}, {fmtStamp(f.UploadedAt)}</small>
                </span>
              </li>
            ))}
          </ul>
          <ProofForm a={a} viewer={viewer} />
          {canRemove && <RemoveButton id={a.AssignmentID} />}
        </div>
        <div>
          <h4>Comments</h4>
          <ul className="thread">
            {comments.length === 0 && <li className="muted">No comments yet.</li>}
            {comments.map((c) => {
              const au = S.emp.get(c.AuthorEmployeeID)
              return (
                <li key={c.CommentID} className={c.AuthorEmployeeID === viewer.EmployeeID ? 'mine' : ''}>
                  <Avatar emp={au} size={28} />
                  <div>
                    <p><b>{au.Name}</b> <span className="chip role">{S.roleOf(au.EmployeeID)}</span></p>
                    <p>{c.CommentText}</p>
                    <small>{fmtStamp(c.CreatedAt)}</small>
                  </div>
                </li>
              )
            })}
          </ul>
          <CommentForm a={a} viewer={viewer} />
        </div>
      </div>
  )
}

function TaskModal({ a, viewer, onClose }) {
  const { S } = useApp()
  const overdue = S.isOverdue(a)
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose()
    document.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = prev
    }
  }, [onClose])
  return (
    <div className="modal-back" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby="modal-title">
        <div className="modal-head">
          <div>
            <h2 id="modal-title">{a.task.TaskName}</h2>
            <p className="muted tiny">
              {CHECKPOINT_LABEL[a.task.Checkpoint]} · {a.Status === 'Completed' ? 'Done ' + fmtShort(a.DateCompleted) : (overdue ? 'Overdue, ' : 'Due ') + fmtShort(a.DueDate)}
            </p>
          </div>
          <button className="btn ghost" onClick={onClose} aria-label="Close" autoFocus><Icon n="x" /></button>
        </div>
        <div className="modal-status"><StatusPicker a={a} /></div>
        <TaskDetail a={a} viewer={viewer} canRemove={false} />
      </div>
    </div>
  )
}

function StatusPicker({ a }) {
  const { dispatch, userId, S } = useApp()
  const isMgr = S.roleOf(userId) === 'Manager'
  if (!isMgr) {
    if (a.Status === 'Not started')
      return (
        <button className="btn primary start" onClick={() => dispatch({ type: 'status', id: a.AssignmentID, status: 'In progress', actorRole: 'New Hire' })}>
          Get Started
        </button>
      )
    return (
      <span className="status-ro" title={a.Status === 'In progress' ? 'Your manager marks tasks complete' : undefined}>
        <StatusChip s={a.Status} />
        {a.Status === 'In progress' && <small>Manager marks complete</small>}
      </span>
    )
  }
  return (
    <div className="seg" role="group" aria-label="Status">
      {STATUSES.map((s) => (
        <button
          key={s}
          className={a.Status === s ? 'on st-' + s.replace(' ', '-').toLowerCase() : ''}
          aria-pressed={a.Status === s}
          onClick={() => a.Status !== s && dispatch({ type: 'status', id: a.AssignmentID, status: s })}
        >
          {s}
        </button>
      ))}
    </div>
  )
}

function CommentForm({ a, viewer }) {
  const { dispatch } = useApp()
  const [text, setText] = useState('')
  const id = 'c' + a.AssignmentID
  return (
    <form
      className="inline-form"
      onSubmit={(e) => {
        e.preventDefault()
        if (!text.trim()) return
        dispatch({ type: 'comment', assignmentId: a.AssignmentID, authorId: viewer.EmployeeID, text: text.trim() })
        setText('')
      }}
    >
      <label htmlFor={id} className="sr">Add a comment</label>
      <textarea id={id} rows="2" value={text} onChange={(e) => setText(e.target.value)} placeholder="Add a comment" />
      <button className="btn primary" type="submit" disabled={!text.trim()}>Post comment</button>
    </form>
  )
}

function ProofForm({ a, viewer }) {
  const { dispatch } = useApp()
  const [note, setNote] = useState('')
  const [file, setFile] = useState(null)
  const id = 'p' + a.AssignmentID
  return (
    <form
      className="inline-form"
      onSubmit={(e) => {
        e.preventDefault()
        if (!note.trim() && !file) return
        dispatch({ type: 'attachment', assignmentId: a.AssignmentID, uploaderId: viewer.EmployeeID, fileName: file?.name, note: note.trim() })
        setNote('')
        setFile(null)
        e.target.reset()
      }}
    >
      <label htmlFor={id + 'f'} className="sr">Choose a file</label>
      <input id={id + 'f'} type="file" onChange={(e) => setFile(e.target.files[0] || null)} />
      <label htmlFor={id + 'n'} className="sr">Note</label>
      <input id={id + 'n'} type="text" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Text note (optional)" />
      <button className="btn" type="submit" disabled={!note.trim() && !file}>Add proof</button>
    </form>
  )
}

function RemoveButton({ id }) {
  const { dispatch } = useApp()
  const [sure, setSure] = useState(false)
  if (!sure) return <button className="btn danger-ghost" onClick={() => setSure(true)}>Remove task from this person</button>
  return (
    <div className="confirm">
      <span>This also deletes its comments and proof. Remove?</span>
      <button className="btn danger" onClick={() => dispatch({ type: 'remove', id })}>Yes, remove</button>
      <button className="btn" onClick={() => setSure(false)}>Cancel</button>
    </div>
  )
}

/* ---------- new hire screens ---------- */
function HireRoutes() {
  const { route } = useApp()
  if (route.page === 'passport') return <MyPassport />
  if (route.page === 'profile') return <MyProfile />
  return <HireHome />
}

function useHire(id) {
  const { S } = useApp()
  const all = S.joined(id)
  return {
    mine: all.filter((a) => a.task.PerformedBy === 'New Hire'),
    mgmt: all.filter((a) => a.task.PerformedBy === 'Management'),
  }
}

function HireHome() {
  const { S, userId, db, go } = useApp()
  const me = S.emp.get(userId)
  const { mine } = useHire(userId)
  const [openId, setOpenId] = useState(null)
  const [showAll, setShowAll] = useState(false)
  const p = S.progress(mine)
  const upAll = mine
    .filter((a) => a.Status !== 'Completed')
    .sort((a, b) => (a.Status === b.Status ? (a.DueDate || '').localeCompare(b.DueDate || '') : a.Status === 'In progress' ? -1 : 1))
  const up = showAll ? upAll : upAll.slice(0, 5)
  const openTask = mine.find((a) => a.AssignmentID === openId)
  const myAssignIds = new Set(mine.map((a) => a.AssignmentID))
  const fromMgr = db.TaskComment
    .filter((c) => myAssignIds.has(c.AssignmentID) && c.AuthorEmployeeID !== userId)
    .sort((a, b) => b.CreatedAt.localeCompare(a.CreatedAt))
    .slice(0, 3)
  const meets = db.MeetAndGreet.filter((m) => m.EmployeeID === userId)
  const next = meets.filter((m) => m.ScheduledDate >= NOW).sort((a, b) => a.ScheduledDate.localeCompare(b.ScheduledDate))[0]
  const day = Math.max(daysBetween(me.HireDate, NOW), 0)
  return (
    <>
      <div className="greet">
        <h1>Welcome, {me.Name.split(' ')[0]}</h1>
        <p className="muted">{me.RoleTitle}, {S.dept.get(me.DepartmentID).DepartmentName} · Day {day} · Started {fmtDate(me.HireDate)}</p>
      </div>
      <div className="worklets">
        <section className="card wk-progress">
          <h2>Your passport</h2>
          <div className="wk-prog">
            <Ring pct={p.pct} />
            <ul className="legend">
              <li><i className="dot ok" />{p.done} completed</li>
              <li><i className="dot doing" />{p.doing} in progress</li>
              <li><i className="dot todo" />{p.todo} not started</li>
              {p.overdue > 0 && <li className="late"><Icon n="warn" />{p.overdue} overdue</li>}
            </ul>
          </div>
          <button className="btn primary" onClick={() => go('passport')}>Open my passport</button>
        </section>
        <section className="card wk-up">
          <h2>Up next</h2>
          <ul className={'plain' + (showAll ? ' scroll-list' : '')}>
            {up.map((a) => (
              <li key={a.AssignmentID}>
                <button onClick={() => setOpenId(a.AssignmentID)}>
                  <span><b>{a.task.TaskName}</b><small>{CHECKPOINT_LABEL[a.task.Checkpoint]}</small></span>
                  <span className={'due' + (S.isOverdue(a) ? ' late' : '')}>{S.isOverdue(a) ? 'Overdue, ' : 'Due '}{fmtShort(a.DueDate)}</span>
                </button>
              </li>
            ))}
            {up.length === 0 && <li className="muted">Everything is complete.</li>}
          </ul>
          {upAll.length > 5 && (
            <button className="btn small view-more" onClick={() => setShowAll(!showAll)} aria-expanded={showAll}>
              {showAll ? 'Show fewer' : 'View more (' + (upAll.length - 5) + ' more)'}
            </button>
          )}
        </section>
        <section className="card wk-meet">
          <h2>Next meet and greet</h2>
          {next ? (
            <>
              <p className="big">{fmtDate(next.ScheduledDate)}</p>
              <p>{fmtTime(next.ScheduledTime)} with {S.emp.get(next.HostEmployeeID).Name}</p>
              <p className="muted">{next.Location}</p>
            </>
          ) : <p className="muted">None scheduled. All your meet and greets are done.</p>}
        </section>
        <section className="card wk-inbox">
          <h2>Comments from your team</h2>
          <ul className="plain">
            {fromMgr.map((c) => (
              <li key={c.CommentID}>
                <div><b>{S.emp.get(c.AuthorEmployeeID).Name}</b> <small>{fmtStamp(c.CreatedAt)}</small></div>
                <p>{c.CommentText}</p>
              </li>
            ))}
            {fromMgr.length === 0 && <li className="muted">No comments yet.</li>}
          </ul>
        </section>
      </div>
      {openTask && <TaskModal a={openTask} viewer={me} onClose={() => setOpenId(null)} />}
    </>
  )
}

function MyPassport() {
  const { S, userId } = useApp()
  const me = S.emp.get(userId)
  const { mine } = useHire(userId)
  const p = S.progress(mine)
  return (
    <>
      <div className="page-head">
        <div><h1>My passport</h1><p className="muted">Tasks for your first 90 days, grouped by checkpoint. Open a task to add proof or leave a comment.</p></div>
        <div className="head-prog"><b>{p.pct}%</b><Bar pct={p.pct} label="Overall progress" /><small>{p.done} of {p.total} complete</small></div>
      </div>
      <TaskList items={mine} viewer={me} canRemove={false} emptyText="No tasks assigned yet." />
    </>
  )
}

function MyProfile() {
  const { S, userId, db } = useApp()
  const me = S.emp.get(userId)
  const meets = db.MeetAndGreet.filter((m) => m.EmployeeID === userId).sort((a, b) => a.ScheduledDate.localeCompare(b.ScheduledDate))
  return (
    <>
      <PersonHeader emp={me} />
      <div className="two-col">
        <PersonFacts emp={me} />
        <MeetList meets={meets} />
      </div>
    </>
  )
}

/* ---------- shared person pieces ---------- */
function PersonHeader({ emp, extra }) {
  const { S } = useApp()
  return (
    <div className="person-head card">
      <Avatar emp={emp} size={64} />
      <div className="ph-t">
        <h1>{emp.Name}</h1>
        <p>{emp.RoleTitle} · {S.dept.get(emp.DepartmentID).DepartmentName}</p>
        <p className="muted">{emp.EmploymentType} · Hired {fmtDate(emp.HireDate)}{S.roleOf(emp.EmployeeID) === 'New Hire' && ` · Day ${Math.max(daysBetween(emp.HireDate, NOW), 0)}`}</p>
      </div>
      {extra}
    </div>
  )
}

function PersonFacts({ emp }) {
  const { S, db } = useApp()
  const groups = db.EmployeeCommittee.filter((c) => c.EmployeeID === emp.EmployeeID)
  const cm = new Map(db.Committee.map((c) => [c.CommitteeID, c]))
  return (
    <section className="card">
      <h2>Details</h2>
      <dl className="facts stack">
        <div><dt>Email</dt><dd>{emp.Email}</dd></div>
        <div><dt>Department</dt><dd>{S.dept.get(emp.DepartmentID).DepartmentName}</dd></div>
        <div><dt>Role</dt><dd>{emp.RoleTitle}</dd></div>
        <div><dt>Employment type</dt><dd>{emp.EmploymentType}</dd></div>
        <div><dt>Orientation completed</dt><dd>{emp.OrientationCompleteDate ? fmtDate(emp.OrientationCompleteDate) : 'Not yet'}</dd></div>
        <div><dt>Account</dt><dd>{S.acct.get(emp.EmployeeID)?.Username} ({S.roleOf(emp.EmployeeID)})</dd></div>
        <div>
          <dt>Committees</dt>
          <dd>{groups.length ? groups.map((g) => cm.get(g.CommitteeID).CommitteeName).join(', ') : 'None'}</dd>
        </div>
      </dl>
    </section>
  )
}

function MeetList({ meets, canAdd, hire }) {
  const { S } = useApp()
  return (
    <section className="card">
      <h2>Meet and greets</h2>
      <ul className="plain meets">
        {meets.map((m) => (
          <li key={m.MeetAndGreetID}>
            <span><b>{S.emp.get(m.HostEmployeeID).Name}</b><small>{S.dept.get(S.emp.get(m.HostEmployeeID).DepartmentID).DepartmentName} · {m.Location}</small></span>
            <span className="right">{fmtShort(m.ScheduledDate)}, {fmtTime(m.ScheduledTime)}<span className={'chip ' + (m.ScheduledDate < NOW ? 'st-completed' : 'st-in-progress')}>{m.ScheduledDate < NOW ? 'Held' : 'Upcoming'}</span></span>
          </li>
        ))}
        {meets.length === 0 && <li className="muted">None scheduled.</li>}
      </ul>
      {canAdd && <MeetForm hire={hire} />}
    </section>
  )
}

function MeetForm({ hire }) {
  const { db, S, dispatch } = useApp()
  const [open, setOpen] = useState(false)
  const [f, setF] = useState({ hostId: '', date: '', time: '10:00', location: '' })
  const hosts = db.Employee.filter((e) => e.EmployeeID !== hire.EmployeeID)
  if (!open) return <button className="btn" onClick={() => setOpen(true)}><Icon n="plus" /> Schedule meet and greet</button>
  return (
    <form
      className="stack-form"
      onSubmit={(e) => {
        e.preventDefault()
        dispatch({ type: 'meet', employeeId: hire.EmployeeID, hostId: Number(f.hostId), date: f.date, time: f.time, location: f.location })
        setOpen(false)
        setF({ hostId: '', date: '', time: '10:00', location: '' })
      }}
    >
      <label htmlFor="mg-host">Host</label>
      <select id="mg-host" required value={f.hostId} onChange={(e) => setF({ ...f, hostId: e.target.value })}>
        <option value="">Choose a staff member</option>
        {hosts.map((e) => <option key={e.EmployeeID} value={e.EmployeeID}>{e.Name} ({S.dept.get(e.DepartmentID).DepartmentName})</option>)}
      </select>
      <div className="two">
        <div><label htmlFor="mg-date">Date</label><input id="mg-date" type="date" required value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} /></div>
        <div><label htmlFor="mg-time">Time</label><input id="mg-time" type="time" required value={f.time} onChange={(e) => setF({ ...f, time: e.target.value })} /></div>
      </div>
      <label htmlFor="mg-loc">Location</label>
      <input id="mg-loc" value={f.location} onChange={(e) => setF({ ...f, location: e.target.value })} placeholder="Where" />
      <div className="actions"><button className="btn primary" type="submit">Schedule</button><button type="button" className="btn" onClick={() => setOpen(false)}>Cancel</button></div>
    </form>
  )
}

/* ---------- manager screens ---------- */
function ManagerRoutes() {
  const { route } = useApp()
  if (route.page === 'hire') return <HireProfile id={route.id} />
  if (route.page === 'directory') return <Directory />
  if (route.page === 'library') return <Library />
  return <ManagerHome />
}

function ManagerHome() {
  const { S, userId, db, go, dispatch } = useApp()
  const me = S.emp.get(userId)
  const dept = S.dept.get(me.DepartmentID)
  const hires = db.Employee.filter((e) => e.DepartmentID === me.DepartmentID && S.roleOf(e.EmployeeID) === 'New Hire')
  const rows = hires.map((h) => {
    const all = S.joined(h.EmployeeID)
    return { h, mine: S.progress(all.filter((a) => a.task.PerformedBy === 'New Hire')), mgmt: all.filter((a) => a.task.PerformedBy === 'Management') }
  })
  const todos = rows
    .flatMap((r) => r.mgmt.filter((a) => a.Status !== 'Completed').map((a) => ({ ...a, hire: r.h })))
    .sort((a, b) => (a.DueDate || '').localeCompare(b.DueDate || ''))
  const hireIds = new Set(hires.map((h) => h.EmployeeID))
  const assignHire = new Map(db.TaskAssignment.map((a) => [a.AssignmentID, a.EmployeeID]))
  const recent = db.TaskComment
    .filter((c) => hireIds.has(assignHire.get(c.AssignmentID)) && c.AuthorEmployeeID !== userId)
    .sort((a, b) => b.CreatedAt.localeCompare(a.CreatedAt)).slice(0, 4)
  const asg = new Map(db.TaskAssignment.map((a) => [a.AssignmentID, a]))
  const overdueTotal = rows.reduce((n, r) => n + r.mine.overdue, 0)
  return (
    <>
      <div className="greet">
        <h1>{dept.DepartmentName}</h1>
        <p className="muted">Welcome, {me.Name.split(' ')[0]}. {hires.length} new hire{hires.length === 1 ? '' : 's'} in your department{overdueTotal ? `, ${overdueTotal} overdue passport task${overdueTotal === 1 ? '' : 's'}` : ''}.</p>
      </div>
      <div className="mgr-grid">
        <section>
          <h2 className="sec">New hires</h2>
          <div className="hire-cards">
            {rows.map(({ h, mine, mgmt }) => {
              const open = mgmt.filter((a) => a.Status !== 'Completed').length
              return (
                <button key={h.EmployeeID} className="card hire-card" onClick={() => go('hire', { id: h.EmployeeID })}>
                  <div className="hc-top"><Avatar emp={h} size={44} /><span><b>{h.Name}</b><small>{h.RoleTitle}</small></span></div>
                  <div className="hc-prog"><b>{mine.pct}%</b><Bar pct={mine.pct} label={h.Name + ' progress'} /></div>
                  <p className="hc-s">{mine.done} of {mine.total} passport tasks complete</p>
                  <div className="chips">
                    {mine.overdue > 0 && <span className="chip st-overdue">{mine.overdue} overdue</span>}
                    {open > 0 && <span className="chip st-mgmt">{open} to-do{open === 1 ? '' : 's'} for you</span>}
                    <span className="chip">Day {Math.max(daysBetween(h.HireDate, NOW), 0)}</span>
                  </div>
                </button>
              )
            })}
            {rows.length === 0 && <p className="empty">No new hires in this department right now. Use the Directory to look at other departments.</p>}
          </div>
        </section>
        <aside>
          <section className="card">
            <h2>Your to-dos for new hires</h2>
            <p className="muted tiny">Management-side tasks that are not done yet.</p>
            <ul className="plain todo">
              {todos.slice(0, 12).map((a) => (
                <li key={a.AssignmentID}>
                  <span>
                    <b>{a.task.TaskName}</b>
                    <small><button className="link" onClick={() => go('hire', { id: a.hire.EmployeeID })}>{a.hire.Name}</button> · <span className={S.isOverdue(a) ? 'late' : ''}>{S.isOverdue(a) ? 'Overdue, ' : 'Due '}{fmtShort(a.DueDate)}</span></small>
                  </span>
                  <button className="btn small" onClick={() => dispatch({ type: 'status', id: a.AssignmentID, status: 'Completed' })} aria-label={`Mark ${a.task.TaskName} for ${a.hire.Name} complete`}>
                    <Icon n="check" /> Done
                  </button>
                </li>
              ))}
              {todos.length === 0 && <li className="muted">You are all caught up.</li>}
            </ul>
          </section>
          <section className="card">
            <h2>Recent comments</h2>
            <ul className="plain">
              {recent.map((c) => {
                const a = asg.get(c.AssignmentID)
                return (
                  <li key={c.CommentID}>
                    <div><b>{S.emp.get(c.AuthorEmployeeID).Name}</b> <small>on {S.task.get(a.TaskID).TaskName}</small></div>
                    <p>{c.CommentText}</p>
                  </li>
                )
              })}
              {recent.length === 0 && <li className="muted">No comments yet.</li>}
            </ul>
          </section>
        </aside>
      </div>
    </>
  )
}

function HireProfile({ id }) {
  const { S, userId, go, db } = useApp()
  const hire = S.emp.get(id)
  const me = S.emp.get(userId)
  const [tab, setTab] = useState('passport')
  const [adding, setAdding] = useState(false)
  const all = S.joined(id)
  const mine = all.filter((a) => a.task.PerformedBy === 'New Hire')
  const mgmt = all.filter((a) => a.task.PerformedBy === 'Management')
  const pm = S.progress(mine)
  const pg = S.progress(mgmt)
  const meets = db.MeetAndGreet.filter((m) => m.EmployeeID === id).sort((a, b) => a.ScheduledDate.localeCompare(b.ScheduledDate))
  const outside = hire.DepartmentID !== me.DepartmentID
  return (
    <>
      <nav className="crumbs" aria-label="Breadcrumb">
        <button className="link" onClick={() => go('home')}>Home</button> / <button className="link" onClick={() => go('directory')}>Directory</button> / <span>{hire.Name}</span>
      </nav>
      <PersonHeader emp={hire} extra={
        <div className="ph-prog">
          <div><b>{pm.pct}%</b> passport<Bar pct={pm.pct} label="Passport progress" /><small>{pm.done}/{pm.total} done{pm.overdue ? `, ${pm.overdue} overdue` : ''}</small></div>
          <div><b>{pg.pct}%</b> manager checklist<Bar pct={pg.pct} label="Manager checklist progress" /><small>{pg.done}/{pg.total} done</small></div>
        </div>
      } />
      {outside && <p className="notice">{hire.Name} is in {S.dept.get(hire.DepartmentID).DepartmentName}. Managers can view and edit any department.</p>}
      <div className="subtabs" role="tablist">
        {[['passport', `Passport tasks (${mine.length})`], ['mgmt', `Manager checklist (${mgmt.length})`], ['meet', 'Meet and greets'], ['details', 'Details']].map(([k, l]) => (
          <button key={k} role="tab" aria-selected={tab === k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>{l}</button>
        ))}
        {(tab === 'passport' || tab === 'mgmt') && (
          <button className="btn primary add" onClick={() => setAdding(!adding)}><Icon n={adding ? 'x' : 'plus'} /> {adding ? 'Close' : 'Add task'}</button>
        )}
      </div>
      {adding && (tab === 'passport' || tab === 'mgmt') && (
        <AddTask hire={hire} me={me} defaultBy={tab === 'mgmt' ? 'Management' : 'New Hire'} onDone={(side) => { setAdding(false); setTab(side === 'Management' ? 'mgmt' : 'passport') }} />
      )}
      {tab === 'passport' && <TaskList items={mine} viewer={me} canRemove emptyText="No passport tasks yet." />}
      {tab === 'mgmt' && <TaskList items={mgmt} viewer={me} canRemove emptyText="No manager tasks for this person." />}
      {tab === 'meet' && <MeetList meets={meets} canAdd hire={hire} />}
      {tab === 'details' && <PersonFacts emp={hire} />}
    </>
  )
}

function AddTask({ hire, me, defaultBy, onDone }) {
  const { db, S, dispatch, notify } = useApp()
  const [side, setSide] = useState(defaultBy)
  const have = new Set(db.TaskAssignment.filter((a) => a.EmployeeID === hire.EmployeeID).map((a) => a.TaskID))
  const avail = db.Task.filter((t) => !have.has(t.TaskID) && t.PerformedBy === side)
  const [mode, setMode] = useState(avail.length ? 'library' : 'custom')
  useEffect(() => { setMode(avail.length ? 'library' : 'custom') }, [side]) // eslint-disable-line
  const where = side === 'Management' ? 'the manager checklist' : 'the passport tasks'
  const first = hire.Name.split(' ')[0]
  const [taskId, setTaskId] = useState('')
  const [due, setDue] = useState('')
  const [c, setC] = useState({ name: '', description: '', checkpoint: '30-Day', due: defaultDue(hire.HireDate, '30-Day') })
  const byDept = new Map()
  avail.forEach((t) => {
    const k = t.DepartmentID ? S.dept.get(t.DepartmentID).DepartmentName : 'All departments'
    byDept.set(k, [...(byDept.get(k) || []), t])
  })
  const pick = (v) => {
    setTaskId(v)
    const t = S.task.get(Number(v))
    if (t) setDue(defaultDue(hire.HireDate, t.Checkpoint))
  }
  return (
    <section className="card add-task">
      <div className="seg two-btn" role="group" aria-label="Who does this task">
        <button className={side === 'New Hire' ? 'on' : ''} onClick={() => { setSide('New Hire'); setTaskId('') }} aria-pressed={side === 'New Hire'}>New hire does it</button>
        <button className={side === 'Management' ? 'on' : ''} onClick={() => { setSide('Management'); setTaskId('') }} aria-pressed={side === 'Management'}>Management does it</button>
      </div>
      <p className="tiny muted">{side === 'Management' ? 'Appears on the manager checklist. ' + first + ' will not see it.' : 'Appears in ' + first + "'s passport when they sign in."}</p>
      <div className="seg two-btn" role="group" aria-label="Add from">
        <button className={mode === 'library' ? 'on' : ''} onClick={() => setMode('library')} aria-pressed={mode === 'library'}>From task library</button>
        <button className={mode === 'custom' ? 'on' : ''} onClick={() => setMode('custom')} aria-pressed={mode === 'custom'}>Write a new task</button>
      </div>
      {mode === 'library' ? (
        <form
          className="stack-form"
          onSubmit={(e) => {
            e.preventDefault()
            dispatch({ type: 'assign', employeeId: hire.EmployeeID, taskId: Number(taskId), byId: me.EmployeeID, due })
            notify('Assigned "' + S.task.get(Number(taskId)).TaskName + '" to ' + hire.Name + '. It is on ' + where + '.')
            onDone(side)
          }}
        >
          <label htmlFor="at-task">Task</label>
          <select id="at-task" required value={taskId} onChange={(e) => pick(e.target.value)}>
            <option value="">Choose a task</option>
            {[...byDept].map(([k, list]) => (
              <optgroup key={k} label={k}>
                {list.map((t) => <option key={t.TaskID} value={t.TaskID}>{t.TaskName} ({CHECKPOINT_LABEL[t.Checkpoint]})</option>)}
              </optgroup>
            ))}
          </select>
          <label htmlFor="at-due">Due date</label>
          <input id="at-due" type="date" required value={due} onChange={(e) => setDue(e.target.value)} />
          <div className="actions"><button className="btn primary" type="submit">Assign to {hire.Name.split(' ')[0]}</button></div>
          {avail.length === 0 && <p className="muted">Every library task of this type is already assigned.</p>}
        </form>
      ) : (
        <form
          className="stack-form"
          onSubmit={(e) => {
            e.preventDefault()
            dispatch({ type: 'createAndAssign', employeeId: hire.EmployeeID, byId: me.EmployeeID, departmentId: hire.DepartmentID, task: { ...c, performedBy: side } })
            notify('Created "' + c.name + '" and assigned it to ' + hire.Name + '. It is on ' + where + '.')
            onDone(side)
          }}
        >
          <label htmlFor="ct-name">Task name</label>
          <input id="ct-name" required value={c.name} onChange={(e) => setC({ ...c, name: e.target.value })} placeholder={side === 'Management' ? 'Order name tag' : 'Schedule CPR/First Aid certification'} />
          <label htmlFor="ct-desc">Description</label>
          <textarea id="ct-desc" rows="2" value={c.description} onChange={(e) => setC({ ...c, description: e.target.value })} />
          <div className="two">
            <div>
              <label htmlFor="ct-cp">Checkpoint</label>
              <select id="ct-cp" value={c.checkpoint} onChange={(e) => setC({ ...c, checkpoint: e.target.value, due: defaultDue(hire.HireDate, e.target.value) })}>
                {CHECKPOINTS.map((k) => <option key={k} value={k}>{CHECKPOINT_LABEL[k]}</option>)}
              </select>
            </div>
            <div><label htmlFor="ct-due">Due date</label><input id="ct-due" type="date" required value={c.due} onChange={(e) => setC({ ...c, due: e.target.value })} /></div>
          </div>
          <p className="tiny muted">Performed by: {side}. Saved as an ad hoc task for {S.dept.get(hire.DepartmentID).DepartmentName}.</p>
          <div className="actions"><button className="btn primary" type="submit">Create and assign</button></div>
        </form>
      )}
    </section>
  )
}

function Directory() {
  const { db, S, go } = useApp()
  const [term, setTerm] = useState('')
  const match = (e) => !term.trim() || e.Name.toLowerCase().includes(term.trim().toLowerCase()) || e.RoleTitle.toLowerCase().includes(term.trim().toLowerCase())
  return (
    <>
      <div className="page-head">
        <div><h1>Directory</h1><p className="muted">Everyone at Grace Place, grouped by department. Every manager can open any department.</p></div>
        <div className="filter"><label htmlFor="dir-q" className="sr">Filter people</label><input id="dir-q" value={term} onChange={(e) => setTerm(e.target.value)} placeholder="Filter by name or role" /></div>
      </div>
      <div className="dept-list">
        {db.Department.map((d) => {
          const people = db.Employee.filter((e) => e.DepartmentID === d.DepartmentID)
          const mg = people.filter((e) => S.roleOf(e.EmployeeID) === 'Manager' && match(e))
          const nh = people.filter((e) => S.roleOf(e.EmployeeID) === 'New Hire' && match(e))
          if (term && !mg.length && !nh.length) return null
          return (
            <section key={d.DepartmentID} className="card dept">
              <h2>{d.DepartmentName}<span className="muted">{people.filter((e) => S.roleOf(e.EmployeeID) === 'New Hire').length} new hire(s)</span></h2>
              <ul className="people">
                {mg.map((e) => (
                  <li key={e.EmployeeID}>
                    <div className="person static"><Avatar emp={e} size={36} /><span><b>{e.Name}</b><small>{e.RoleTitle} · {e.Email}</small></span><span className="chip role">Manager</span></div>
                  </li>
                ))}
                {nh.map((e) => {
                  const p = S.progress(S.joined(e.EmployeeID).filter((a) => a.task.PerformedBy === 'New Hire'))
                  return (
                    <li key={e.EmployeeID}>
                      <button className="person" onClick={() => go('hire', { id: e.EmployeeID })}>
                        <Avatar emp={e} size={36} /><span><b>{e.Name}</b><small>{e.RoleTitle} · Hired {fmtShort(e.HireDate)}</small></span>
                        <span className="mini"><Bar pct={p.pct} label={e.Name + ' progress'} /><small>{p.pct}%</small></span>
                      </button>
                    </li>
                  )
                })}
              </ul>
            </section>
          )
        })}
      </div>
    </>
  )
}

function AssignPicker({ task, hires, onDone }) {
  const { S, userId, dispatch, notify } = useApp()
  const [term, setTerm] = useState('')
  const [dept, setDept] = useState('all')
  const [picked, setPicked] = useState(new Set())
  const shown = hires.filter(
    (h) =>
      (dept === 'all' || String(h.DepartmentID) === dept) &&
      (!term.trim() || h.Name.toLowerCase().includes(term.trim().toLowerCase()) || h.RoleTitle.toLowerCase().includes(term.trim().toLowerCase())),
  )
  const toggle = (id) => {
    const n = new Set(picked)
    n.has(id) ? n.delete(id) : n.add(id)
    setPicked(n)
  }
  const allShown = shown.length > 0 && shown.every((h) => picked.has(h.EmployeeID))
  const toggleAll = () => {
    const n = new Set(picked)
    shown.forEach((h) => (allShown ? n.delete(h.EmployeeID) : n.add(h.EmployeeID)))
    setPicked(n)
  }
  const depts = [...new Set(hires.map((h) => h.DepartmentID))]
  const submit = () => {
    const ids = [...picked]
    const dues = Object.fromEntries(ids.map((id) => [id, defaultDue(S.emp.get(id).HireDate, task.Checkpoint)]))
    dispatch({ type: 'assignMany', employeeIds: ids, taskId: task.TaskID, byId: userId, dues })
    notify('Assigned "' + task.TaskName + '" to ' + ids.length + (ids.length === 1 ? ' person' : ' people') + '. ' + (task.PerformedBy === 'Management' ? 'It is on each manager checklist.' : 'It is in each passport.'))
    onDone()
  }
  if (hires.length === 0) return <p className="muted">Already assigned to every new hire.</p>
  return (
    <div className="picker">
      <div className="picker-filters">
        <div><label htmlFor={'pk-q' + task.TaskID}>Find a new hire</label><input id={'pk-q' + task.TaskID} value={term} onChange={(e) => setTerm(e.target.value)} placeholder="Name or role" /></div>
        <div><label htmlFor={'pk-d' + task.TaskID}>Department</label>
          <select id={'pk-d' + task.TaskID} value={dept} onChange={(e) => setDept(e.target.value)}>
            <option value="all">All departments</option>
            {depts.map((d) => <option key={d} value={d}>{S.dept.get(d).DepartmentName}</option>)}
          </select></div>
      </div>
      <div className="picker-list" role="group" aria-label="New hires">
        {shown.length > 0 && (
          <label className="pick all"><input type="checkbox" checked={allShown} onChange={toggleAll} /> Select all {shown.length} shown</label>
        )}
        {shown.map((h) => (
          <label key={h.EmployeeID} className="pick">
            <input type="checkbox" checked={picked.has(h.EmployeeID)} onChange={() => toggle(h.EmployeeID)} />
            <Avatar emp={h} size={24} />
            <span>{h.Name}<small>{h.RoleTitle}, {S.dept.get(h.DepartmentID).DepartmentName}</small></span>
          </label>
        ))}
        {shown.length === 0 && <p className="muted">No new hires match.</p>}
      </div>
      <div className="actions">
        <button className="btn primary" disabled={picked.size === 0} onClick={submit}>Assign to {picked.size || ''} {picked.size === 1 ? 'person' : 'people'}</button>
        <button className="btn" onClick={onDone}>Cancel</button>
      </div>
    </div>
  )
}

function NewTask({ onDone }) {
  const { db, S, userId, dispatch, notify } = useApp()
  const me = S.emp.get(userId)
  const [f, setF] = useState({
    name: '', description: '', category: 'Department', departmentId: me.DepartmentID, roleTitle: '',
    checkpoint: '30-Day', performedBy: 'New Hire', assignAll: false,
  })
  const set = (k, v) => setF({ ...f, [k]: v })
  const roles = [...new Set(db.Employee.filter((e) => e.DepartmentID === Number(f.departmentId)).map((e) => e.RoleTitle))]
  return (
    <section className="card">
      <h2>New task</h2>
      <form
        className="stack-form wide-form"
        onSubmit={(e) => {
          e.preventDefault()
          dispatch({ type: 'createTask', byId: userId, task: { ...f, departmentId: Number(f.departmentId) } })
          notify('Created "' + f.name + '".' + (f.assignAll ? ' Assigned to every current new hire.' : ' Use Assign on its row to give it to people.'))
          onDone()
        }}
      >
        <label htmlFor="nt-name">Task name</label>
        <input id="nt-name" required value={f.name} onChange={(e) => set('name', e.target.value)} placeholder="Order name tag" />
        <label htmlFor="nt-desc">Description</label>
        <textarea id="nt-desc" rows="2" value={f.description} onChange={(e) => set('description', e.target.value)} />
        <div className="two">
          <div><label htmlFor="nt-cat">Task type</label>
            <select id="nt-cat" value={f.category} onChange={(e) => set('category', e.target.value)}>
              <option value="Standardized">Standardized (every department)</option>
              <option value="Department">Department</option>
              <option value="RoleSpecific">Role specific</option>
              <option value="AdHoc">Ad hoc</option>
            </select></div>
          <div><label htmlFor="nt-by">Performed by</label>
            <select id="nt-by" value={f.performedBy} onChange={(e) => set('performedBy', e.target.value)}>
              <option>New Hire</option><option>Management</option>
            </select></div>
        </div>
        <div className="two">
          <div><label htmlFor="nt-cp">Checkpoint</label>
            <select id="nt-cp" value={f.checkpoint} onChange={(e) => set('checkpoint', e.target.value)}>
              {CHECKPOINTS.map((k) => <option key={k} value={k}>{CHECKPOINT_LABEL[k]}</option>)}
            </select></div>
          {f.category !== 'Standardized' && (
            <div><label htmlFor="nt-dept">Department</label>
              <select id="nt-dept" value={f.departmentId} onChange={(e) => set('departmentId', e.target.value)}>
                {db.Department.map((d) => <option key={d.DepartmentID} value={d.DepartmentID}>{d.DepartmentName}</option>)}
              </select></div>
          )}
        </div>
        {f.category === 'RoleSpecific' && (
          <>
            <label htmlFor="nt-role">Role title</label>
            <input id="nt-role" list="nt-roles" required value={f.roleTitle} onChange={(e) => set('roleTitle', e.target.value)} placeholder="Curriculum Specialist" />
            <datalist id="nt-roles">{roles.map((r) => <option key={r} value={r} />)}</datalist>
          </>
        )}
        {f.category === 'Standardized' && (
          <label className="check" htmlFor="nt-all"><input id="nt-all" type="checkbox" checked={f.assignAll} onChange={(e) => set('assignAll', e.target.checked)} /> Also assign to every current new hire</label>
        )}
        <p className="tiny muted">Saved to the Task table. Use Assign on the new row to give it to specific people.</p>
        <div className="actions"><button className="btn primary" type="submit">Create task</button><button type="button" className="btn" onClick={onDone}>Cancel</button></div>
      </form>
    </section>
  )
}

function Library() {
  const { db, S, userId, dispatch } = useApp()
  const [dept, setDept] = useState('all')
  const [cp, setCp] = useState('all')
  const [who, setWho] = useState('all')
  const [term, setTerm] = useState('')
  const [assigning, setAssigning] = useState(null)
  const [creating, setCreating] = useState(false)
  const [deleting, setDeleting] = useState(null)
  const { notify } = useApp()
  const hires = db.Employee.filter((e) => S.roleOf(e.EmployeeID) === 'New Hire')
  const stats = (taskId) => {
    const list = db.TaskAssignment.filter((a) => a.TaskID === taskId)
    return { n: list.length, done: list.filter((a) => a.Status === 'Completed').length }
  }
  const list = db.Task.filter(
    (t) =>
      (dept === 'all' || String(t.DepartmentID ?? 0) === dept) &&
      (cp === 'all' || t.Checkpoint === cp) &&
      (who === 'all' || t.PerformedBy === who) &&
      (!term.trim() || t.TaskName.toLowerCase().includes(term.trim().toLowerCase())),
  )
  const groups = [{ id: 0, name: 'All departments (standardized)' }, ...db.Department.map((d) => ({ id: d.DepartmentID, name: d.DepartmentName }))]
  return (
    <>
      <div className="page-head">
        <div><h1>Task library</h1><p className="muted">The full task base, grouped by department. Open to every manager.</p></div>
        <button className="btn primary" onClick={() => setCreating(!creating)}><Icon n={creating ? 'x' : 'plus'} /> {creating ? 'Close' : 'New task'}</button>
      </div>
      {creating && <NewTask onDone={() => setCreating(false)} />}
      <div className="filters">
        <div><label htmlFor="f-q">Search</label><input id="f-q" value={term} onChange={(e) => setTerm(e.target.value)} placeholder="Task name" /></div>
        <div><label htmlFor="f-d">Department</label>
          <select id="f-d" value={dept} onChange={(e) => setDept(e.target.value)}>
            <option value="all">All</option><option value="0">Standardized (all departments)</option>
            {db.Department.map((d) => <option key={d.DepartmentID} value={d.DepartmentID}>{d.DepartmentName}</option>)}
          </select></div>
        <div><label htmlFor="f-c">Checkpoint</label>
          <select id="f-c" value={cp} onChange={(e) => setCp(e.target.value)}>
            <option value="all">All</option>{CHECKPOINTS.map((k) => <option key={k} value={k}>{CHECKPOINT_LABEL[k]}</option>)}
          </select></div>
        <div><label htmlFor="f-w">Performed by</label>
          <select id="f-w" value={who} onChange={(e) => setWho(e.target.value)}>
            <option value="all">Anyone</option><option>New Hire</option><option>Management</option>
          </select></div>
      </div>
      {groups.map((g) => {
        const rows = list.filter((t) => (t.DepartmentID ?? 0) === g.id)
        if (!rows.length) return null
        return (
          <section key={g.id} className="card lib-group">
            <h2>{g.name}<span className="muted">{rows.length} task{rows.length === 1 ? '' : 's'}</span></h2>
            <div className="scroll-x">
              <table className="tbl">
                <thead><tr><th>Task</th><th>Type</th><th>Checkpoint</th><th>Performed by</th><th>Assigned</th><th></th></tr></thead>
                <tbody>
                  {rows.map((t) => {
                    const s = stats(t.TaskID)
                    const assigned = new Set(db.TaskAssignment.filter((a) => a.TaskID === t.TaskID).map((a) => a.EmployeeID))
                    return (
                      <React.Fragment key={t.TaskID}>
                        <tr>
                          <td><b>{t.TaskName}</b>{t.RoleTitle && <small className="block">{t.RoleTitle} only</small>}</td>
                          <td>{t.TaskCategory === 'RoleSpecific' ? 'Role specific' : t.TaskCategory === 'AdHoc' ? 'Ad hoc' : t.TaskCategory}</td>
                          <td>{CHECKPOINT_LABEL[t.Checkpoint]}</td>
                          <td>{t.PerformedBy}</td>
                          <td className="num">{s.done}/{s.n} done</td>
                          <td className="acts">
                            <button className="btn small" onClick={() => { setDeleting(null); setAssigning(assigning === t.TaskID ? null : t.TaskID) }}>Assign</button>
                            <button className="btn small danger-ghost-s" onClick={() => { setAssigning(null); setDeleting(deleting === t.TaskID ? null : t.TaskID) }} aria-label={'Delete ' + t.TaskName}>Delete</button>
                          </td>
                        </tr>
                        {deleting === t.TaskID && (
                          <tr className="assign-row"><td colSpan="6">
                            <div className="confirm">
                              <span>
                                {s.n === 0
                                  ? 'Delete this task? Nobody has it assigned.'
                                  : 'Delete this task? It is assigned to ' + s.n + (s.n === 1 ? ' person' : ' people') + '. Their copies, comments and uploaded proof are deleted too.'}
                              </span>
                              <button className="btn danger" onClick={() => { dispatch({ type: 'deleteTask', id: t.TaskID }); notify('Deleted "' + t.TaskName + '".'); setDeleting(null) }}>Yes, delete task</button>
                              <button className="btn" onClick={() => setDeleting(null)}>Cancel</button>
                            </div>
                          </td></tr>
                        )}
                        {assigning === t.TaskID && (
                          <tr className="assign-row"><td colSpan="6">
                            <AssignPicker task={t} hires={hires.filter((h) => !assigned.has(h.EmployeeID))} onDone={() => setAssigning(null)} />
                          </td></tr>
                        )}
                      </React.Fragment>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </section>
        )
      })}
      {list.length === 0 && <p className="empty">No tasks match these filters.</p>}
    </>
  )
}
