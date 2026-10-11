import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import {
  ArrowDown,
  ArrowRight,
  ArrowUpRight,
  Bell,
  CalendarDays,
  Check,
  CheckCheck,
  ChevronLeft,
  ChevronRight,
  CircleCheck,
  CircleHelp,
  Clock3,
  FolderKanban,
  History,
  LayoutDashboard,
  ListTodo,
  LogOut,
  Menu,
  MessageCircle,
  MoreHorizontal,
  Pause,
  Plus,
  Search,
  Settings,
  SlidersHorizontal,
  Sparkles,
  Tag as TagIcon,
  Trash2,
  Users,
  X,
  type LucideIcon,
} from "lucide-react";
import {
  api,
  ApiError,
  datetimeInput,
  formatTime,
  localDate,
  setCSRF,
  shiftDate,
  weekStart,
} from "./api";
import {
  priorities,
  statuses,
  type Activity,
  type Overview,
  type Page,
  type Project,
  type Status,
  type Tag,
  type Task,
  type User,
} from "./types";

type View =
  | "dashboard"
  | "tasks"
  | "projects"
  | "waiting"
  | "calendar"
  | "tags"
  | "history"
  | "settings";
type Filters = {
  status: string;
  priority: string;
  assignee: string;
  project: string;
  tag: string;
  view: string;
  sort: string;
  deleted: string;
};
const initialFilters: Filters = {
  status: "",
  priority: "",
  assignee: "",
  project: "",
  tag: "",
  view: "",
  sort: "-updated_at",
  deleted: "",
};
const nav: { id: View; title: string; icon: LucideIcon }[] = [
  { id: "dashboard", title: "工作总览", icon: LayoutDashboard },
  { id: "tasks", title: "任务管理", icon: ListTodo },
  { id: "projects", title: "项目进度", icon: FolderKanban },
  { id: "waiting", title: "等待回复", icon: MessageCircle },
  { id: "calendar", title: "日程安排", icon: CalendarDays },
  { id: "tags", title: "标签分类", icon: TagIcon },
  { id: "history", title: "操作历史", icon: History },
];
const emptyPage: Page<Task> = { items: [], total: 0, pages: 1, page: 1 };
const emptyOverview: Overview = {
  counts: {},
  today: [],
  waiting: [],
  blocked: [],
  upcoming: [],
  overdue: [],
  focus: [],
  recent: [],
  date: "",
  week: "",
};
const message = (error: unknown) =>
  error instanceof Error ? error.message : "操作失败，请重试";
const StatusBadge = ({ status }: { status: Status }) => (
  <span className={`badge status-${status}`}>
    <i />
    {statuses[status]}
  </span>
);
const Priority = ({ value }: { value: Task["priority"] }) => (
  <span className={`priority priority-${value}`}>
    <span>{value === "high" ? "↑" : value === "medium" ? "−" : "↓"}</span>
    {priorities[value]}
  </span>
);
const Avatar = ({ name, small = false }: { name: string; small?: boolean }) => (
  <span className={`avatar ${small ? "small" : ""}`} aria-hidden="true">
    {name.slice(0, 1).toUpperCase()}
  </span>
);

function Modal({
  title,
  children,
  onClose,
  wide = false,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
  wide?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    ref.current?.showModal();
    ref.current
      ?.querySelector<HTMLInputElement>("input, textarea, select")
      ?.focus();
  }, []);
  return (
    <dialog
      ref={ref}
      className={wide ? "modal wide" : "modal"}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      aria-labelledby="dialog-title"
    >
      <div className="modal-head">
        <div>
          <span className="eyebrow">TEAM WORKBENCH</span>
          <h2 id="dialog-title">{title}</h2>
        </div>
        <button className="icon-button" aria-label="关闭弹窗" onClick={onClose}>
          <X size={20} />
        </button>
      </div>
      {children}
    </dialog>
  );
}
function Empty({
  text = "这里还很安静",
  detail = "创建第一项任务，让团队的工作清晰起来。",
}: {
  text?: string;
  detail?: string;
}) {
  return (
    <div className="empty">
      <CircleCheck size={30} />
      <strong>{text}</strong>
      <span>{detail}</span>
    </div>
  );
}
function Pager({
  page,
  pages,
  total,
  onChange,
}: {
  page: number;
  pages: number;
  total: number;
  onChange: (p: number) => void;
}) {
  return (
    <div className="pager">
      <span>
        共 {total} 项 · 第 {page} / {pages} 页
      </span>
      <div>
        <button
          className="icon-button"
          aria-label="上一页"
          disabled={page <= 1}
          onClick={() => onChange(page - 1)}
        >
          <ChevronLeft size={16} />
        </button>
        <button
          className="icon-button"
          aria-label="下一页"
          disabled={page >= pages}
          onClick={() => onChange(page + 1)}
        >
          <ChevronRight size={16} />
        </button>
      </div>
    </div>
  );
}

function Login({ onLogin }: { onLogin: (u: User) => void }) {
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const data = new FormData(e.currentTarget);
    try {
      const result = await api<{ user: User; csrf: string }>(
        "login/",
        "POST",
        Object.fromEntries(data),
      );
      setCSRF(result.csrf);
      onLogin(result.user);
    } catch (err) {
      setError(message(err));
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="login-page">
      <div className="login-art">
        <div className="brand">
          <span className="brand-icon">
            <LayoutDashboard />
          </span>
          <span>
            协序<span className="brand-en">WORKSPACE</span>
          </span>
        </div>
        <div className="login-pitch">
          <span className="eyebrow">LESS CHAOS. MORE CLARITY.</span>
          <h1>
            把每一件事，
            <br />
            安排得刚刚好。
          </h1>
          <p>
            从今天的第一项任务，到团队的下一个里程碑。
            <br />
            让工作有序，让协作轻松。
          </p>
          <div className="login-preview">
            <div>
              <span className="preview-dot" />
              本周工作计划<span className="preview-count">TEAM</span>
            </div>
            {[
              "明确目标，专注重要的事",
              "保持同步，一起推进",
              "完成任务，收获新进展",
            ].map((x, i) => (
              <p key={x}>
                <span
                  className={i === 0 ? "preview-check done" : "preview-check"}
                >
                  {i === 0 && <Check size={14} />}
                </span>
                {x}
                <span className="preview-line" />
              </p>
            ))}
          </div>
        </div>
        <span className="login-footer">让团队的每一步，都清晰可见。</span>
      </div>
      <section className="login-form">
        <span className="pill">
          <span className="online-dot" />
          你的团队空间
        </span>
        <h2>欢迎回来</h2>
        <p>登录协序，开启有条理的一天。</p>
        <form onSubmit={submit}>
          <label>
            用户名
            <input
              name="username"
              autoComplete="username"
              required
              maxLength={150}
              placeholder="输入你的用户名"
            />
          </label>
          <label>
            密码
            <input
              name="password"
              type="password"
              autoComplete="current-password"
              required
              placeholder="输入你的密码"
            />
          </label>
          {error && (
            <div className="form-error" role="alert">
              {error}
            </div>
          )}
          <button className="primary full" disabled={busy}>
            {busy ? "正在登录…" : "登录工作台"}
            <ArrowRight size={17} />
          </button>
        </form>
        <p className="login-hint">
          <CircleHelp size={16} />
          账号由团队管理员创建。首次部署请按 README 初始化管理员。
        </p>
      </section>
    </main>
  );
}

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [ready, setReady] = useState(false);
  const [sessionError, setSessionError] = useState("");
  useEffect(() => {
    let active = true;
    api<{ user: User | null; csrf: string }>("session/")
      .then((r) => {
        if (active) {
          setUser(r.user);
          setCSRF(r.csrf);
          setReady(true);
        }
      })
      .catch((e) => {
        if (active) {
          setSessionError(message(e));
          setReady(true);
        }
      });
    const expire = () => {
      setUser(null);
      api<{ csrf: string }>("session/")
        .then((r) => setCSRF(r.csrf))
        .catch(() => {});
    };
    window.addEventListener("session-expired", expire);
    return () => {
      active = false;
      window.removeEventListener("session-expired", expire);
    };
  }, []);
  if (!ready)
    return (
      <div className="boot">
        <span className="brand-icon">
          <LayoutDashboard />
        </span>
        <p>正在打开你的工作台…</p>
      </div>
    );
  if (sessionError)
    return (
      <div className="boot">
        <p role="alert">{sessionError}</p>
        <button className="primary" onClick={() => location.reload()}>
          重新连接
        </button>
      </div>
    );
  if (!user) return <Login onLogin={setUser} />;
  return <Workbench user={user} onLogout={() => setUser(null)} />;
}

function Workbench({ user, onLogout }: { user: User; onLogout: () => void }) {
  const [view, setView] = useState<View>("dashboard");
  const [menu, setMenu] = useState(false);
  const [profile, setProfile] = useState(false);
  const [selectedDate, setSelectedDate] = useState(localDate());
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const [filters, setFilters] = useState<Filters>(initialFilters);
  const [page, setPage] = useState(1);
  const [users, setUsers] = useState<User[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [tags, setTags] = useState<Tag[]>([]);
  const [overview, setOverview] = useState<Overview>(emptyOverview);
  const [taskPage, setTaskPage] = useState<Page<Task>>(emptyPage);
  const [projectRows, setProjectRows] = useState<Project[]>([]);
  const [tagRows, setTagRows] = useState<Tag[]>([]);
  const [history, setHistory] = useState<Page<Activity>>({
    items: [],
    total: 0,
    pages: 1,
    page: 1,
  });
  const [editing, setEditing] = useState<Task | "new" | null>(null);
  const [catalog, setCatalog] = useState<{
    type: "projects" | "tags";
    item?: Project | Tag;
  } | null>(null);
  const [toast, setToast] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [refresh, setRefresh] = useState(0);
  const [checked, setChecked] = useState<number[]>([]);
  const [bulkBusy, setBulkBusy] = useState(false);
  const userName = (id: number | null) =>
    users.find((u) => u.id === id)?.name || "未分配";
  const projectName = (id: number | null) =>
    projects.find((p) => p.id === id)?.name || "未归属";
  const changed = useCallback((text = "已保存，团队数据已更新") => {
    setRefresh((v) => v + 1);
    setToast(text);
  }, []);
  useEffect(() => {
    const id = window.setTimeout(() => {
      setQuery(search);
      setPage(1);
    }, 250);
    return () => clearTimeout(id);
  }, [search]);
  useEffect(() => {
    if (toast) {
      const id = setTimeout(() => setToast(""), 4000);
      return () => clearTimeout(id);
    }
  }, [toast]);
  useEffect(() => {
    const id = setInterval(() => {
      if (document.visibilityState === "visible") setRefresh((v) => v + 1);
    }, 30000);
    return () => clearInterval(id);
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    const params = new URLSearchParams({
      date: selectedDate,
      page: String(page),
      q: query,
      ...filters,
    });
    setLoading(true);
    Promise.all([
      api<{ users: User[]; projects: Project[]; tags: Tag[] }>(
        "bootstrap/",
        "GET",
        undefined,
        controller.signal,
      ),
      api<Overview>(
        `overview/?date=${selectedDate}`,
        "GET",
        undefined,
        controller.signal,
      ),
      api<Page<Task>>(`tasks/?${params}`, "GET", undefined, controller.signal),
      view === "projects"
        ? api<{ items: Project[] }>(
            "projects/",
            "GET",
            undefined,
            controller.signal,
          )
        : Promise.resolve(null),
      view === "tags"
        ? api<{ items: Tag[] }>("tags/", "GET", undefined, controller.signal)
        : Promise.resolve(null),
      view === "history"
        ? api<Page<Activity>>(
            `history/?page=${page}`,
            "GET",
            undefined,
            controller.signal,
          )
        : Promise.resolve(null),
    ])
      .then(([b, o, t, p, g, h]) => {
        if (active) {
          setUsers(b.users);
          setProjects(b.projects);
          setTags(b.tags);
          setOverview(o);
          setTaskPage(t);
          if (p) setProjectRows(p.items);
          if (g) setTagRows(g.items);
          if (h) setHistory(h);
          setError("");
          setChecked([]);
        }
      })
      .catch((e) => {
        if (active) setError(message(e));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
      controller.abort();
    };
  }, [view, selectedDate, page, query, filters, refresh]);
  function navigate(next: View, extra: Partial<Filters> = {}) {
    setView(next);
    setFilters({
      ...initialFilters,
      ...(next === "waiting" ? { status: "waiting" } : {}),
      ...(next === "calendar" ? { view: "calendar" } : {}),
      ...extra,
    });
    setPage(1);
    setSearch("");
    setMenu(false);
  }
  function filter(key: keyof Filters, value: string) {
    setFilters((f) => ({ ...f, [key]: value }));
    setPage(1);
  }
  async function logoutUser() {
    try {
      await api("logout/", "POST");
      const s = await api<{ csrf: string }>("session/");
      setCSRF(s.csrf);
      onLogout();
    } catch (e) {
      setError(message(e));
    }
  }
  async function bulkComplete() {
    setBulkBusy(true);
    try {
      for (const task of taskPage.items.filter((t) => checked.includes(t.id)))
        await api(`tasks/${task.id}/`, "PATCH", {
          version: task.version,
          status: "done",
        });
      changed("所选任务已完成");
    } catch (e) {
      setError(message(e));
      setRefresh((r) => r + 1);
    } finally {
      setBulkBusy(false);
    }
  }
  const currentTitle =
    view === "dashboard"
      ? "任务安排工作台"
      : [...nav, { id: "settings", title: "团队设置" }].find(
          (n) => n.id === view,
        )?.title;
  const monday = weekStart(selectedDate);
  const dayLabels = ["一", "二", "三", "四", "五", "六", "日"];
  const count = overview.counts;
  const stats: {
    label: string;
    number: number;
    sub: string;
    icon: LucideIcon;
    tone: string;
    target: Partial<Filters>;
  }[] = [
    {
      label: "全部任务",
      number: count.total || 0,
      sub: `进行中 ${count.in_progress || 0} 项`,
      icon: ListTodo,
      tone: "blue",
      target: {},
    },
    {
      label: "今天先做",
      number: count.today || 0,
      sub: `高优先级 ${count.high_today || 0} 项`,
      icon: ArrowUpRight,
      tone: "green",
      target: { view: "today" },
    },
    {
      label: "等待回复",
      number: count.waiting || 0,
      sub: "保持联系，及时推进",
      icon: MessageCircle,
      tone: "purple",
      target: { status: "waiting" },
    },
    {
      label: "已拖住",
      number: count.blocked || 0,
      sub: "找到卡点，继续向前",
      icon: Pause,
      tone: "orange",
      target: { status: "blocked" },
    },
    {
      label: "已完成",
      number: count.done || 0,
      sub: `本周完成 ${count.week_done || 0} 项`,
      icon: CheckCheck,
      tone: "teal",
      target: { status: "done", sort: "-completed_at" },
    },
  ];
  function TaskTable({ compact = false }: { compact?: boolean }) {
    return (
      <section className={`panel task-panel ${compact ? "compact" : ""}`}>
        <div className="panel-header">
          <h2>
            任务管理 <span className="count">{taskPage.total}</span>
          </h2>
          <div className="header-actions">
            <button
              className="primary small-button"
              onClick={() => setEditing("new")}
            >
              <Plus size={16} />
              新建任务
            </button>
            {compact && (
              <button className="text-button" onClick={() => navigate("tasks")}>
                查看全部
                <ChevronRight size={14} />
              </button>
            )}
          </div>
        </div>
        <div className="tabs" role="group" aria-label="任务状态筛选">
          <button
            className={!filters.status ? "active" : ""}
            onClick={() => filter("status", "")}
          >
            全部 <span>{count.total || 0}</span>
          </button>
          {(Object.entries(statuses) as [Status, string][]).map(
            ([s, label]) => (
              <button
                key={s}
                className={filters.status === s ? "active" : ""}
                onClick={() => filter("status", s)}
              >
                {label}
                <span>{count[s] || 0}</span>
              </button>
            ),
          )}
        </div>
        {!compact && (
          <div className="filters">
            <SlidersHorizontal size={16} />
            <select
              aria-label="优先级筛选"
              value={filters.priority}
              onChange={(e) => filter("priority", e.target.value)}
            >
              <option value="">全部优先级</option>
              {Object.entries(priorities).map(([v, l]) => (
                <option key={v} value={v}>
                  {l}优先级
                </option>
              ))}
            </select>
            <select
              aria-label="负责人筛选"
              value={filters.assignee}
              onChange={(e) => filter("assignee", e.target.value)}
            >
              <option value="">全部负责人</option>
              {users.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name}
                </option>
              ))}
            </select>
            <select
              aria-label="项目筛选"
              value={filters.project}
              onChange={(e) => filter("project", e.target.value)}
            >
              <option value="">全部项目</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
            <select
              aria-label="标签筛选"
              value={filters.tag}
              onChange={(e) => filter("tag", e.target.value)}
            >
              <option value="">全部标签</option>
              {tags.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
            <select
              aria-label="任务排序"
              value={filters.sort}
              onChange={(e) => filter("sort", e.target.value)}
            >
              <option value="-updated_at">最近更新</option>
              <option value="due_at">截止时间</option>
              <option value="title">任务名称</option>
              <option value="-completed_at">最近完成</option>
            </select>
            {user.admin && (
              <button
                className={
                  filters.deleted ? "text-button danger" : "text-button"
                }
                onClick={() => filter("deleted", filters.deleted ? "" : "true")}
              >
                <Trash2 size={14} />
                {filters.deleted ? "返回任务" : "回收站"}
              </button>
            )}
            {filters.view && (
              <button
                className="text-button"
                onClick={() => filter("view", "")}
              >
                清除分区筛选
                <X size={13} />
              </button>
            )}
          </div>
        )}
        {checked.length > 0 && (
          <div className="bulk">
            <span>已选择 {checked.length} 项</span>
            <button
              className="text-button"
              disabled={bulkBusy}
              onClick={bulkComplete}
            >
              <CheckCheck size={15} />
              {bulkBusy ? "正在更新…" : "标记完成"}
            </button>
          </div>
        )}
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th className="checkbox-cell">
                  {!filters.deleted && (
                    <input
                      type="checkbox"
                      aria-label="选择本页全部任务"
                      checked={
                        taskPage.items.length > 0 &&
                        checked.length === taskPage.items.length
                      }
                      onChange={(e) =>
                        setChecked(
                          e.target.checked
                            ? taskPage.items.map((t) => t.id)
                            : [],
                        )
                      }
                    />
                  )}
                </th>
                <th>任务名称</th>
                <th>优先级</th>
                <th>
                  <button
                    className="sort-button"
                    onClick={() =>
                      filter(
                        "sort",
                        filters.sort === "due_at" ? "-due_at" : "due_at",
                      )
                    }
                  >
                    截止时间
                    <ArrowDown size={12} />
                  </button>
                </th>
                <th>当前状态</th>
                <th>负责人</th>
                <th>下一步操作</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {taskPage.items.map((task) => (
                <tr key={task.id}>
                  <td>
                    {!filters.deleted && (
                      <input
                        type="checkbox"
                        aria-label={`选择${task.title}`}
                        checked={checked.includes(task.id)}
                        onChange={(e) =>
                          setChecked((c) =>
                            e.target.checked
                              ? [...c, task.id]
                              : c.filter((id) => id !== task.id),
                          )
                        }
                      />
                    )}
                  </td>
                  <td>
                    <button
                      className="task-title"
                      onClick={() => setEditing(task)}
                    >
                      {task.title}
                    </button>
                    <span className="task-project">
                      {projectName(task.project)}
                    </span>
                  </td>
                  <td>
                    <Priority value={task.priority} />
                  </td>
                  <td
                    className={
                      task.due_at &&
                      new Date(task.due_at).getTime() < Date.now() &&
                      task.status !== "done"
                        ? "overdue-text"
                        : "date-text"
                    }
                  >
                    {formatTime(task.due_at)}
                    {task.due_at && (
                      <small>
                        {new Intl.DateTimeFormat("zh-CN", {
                          timeZone: "Asia/Shanghai",
                          hour: "2-digit",
                          minute: "2-digit",
                        }).format(new Date(task.due_at))}
                      </small>
                    )}
                  </td>
                  <td>
                    <StatusBadge status={task.status} />
                  </td>
                  <td>
                    <span className="assignee">
                      <Avatar name={userName(task.assignee)} small />
                      {userName(task.assignee)}
                    </span>
                  </td>
                  <td className="next-action">{task.next_action || "—"}</td>
                  <td>
                    <button
                      className="icon-button"
                      aria-label={`编辑${task.title}`}
                      onClick={() => setEditing(task)}
                    >
                      <MoreHorizontal size={17} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!taskPage.items.length && (
          <Empty
            text={
              loading
                ? "正在载入任务…"
                : filters.deleted
                  ? "回收站为空"
                  : "暂无匹配的任务"
            }
            detail={
              filters.deleted
                ? "删除的任务会保留在这里，可随时恢复。"
                : "试试调整筛选条件，或创建一项新任务。"
            }
          />
        )}
        <Pager
          page={taskPage.page}
          pages={taskPage.pages}
          total={taskPage.total}
          onChange={setPage}
        />
      </section>
    );
  }
  function MiniList({
    title,
    tasks,
    mode,
    target,
    icon: Icon,
  }: {
    title: string;
    tasks: Task[];
    mode: "today" | "waiting" | "due" | "blocked" | "focus";
    target: Partial<Filters>;
    icon: LucideIcon;
  }) {
    return (
      <section className={`panel mini-panel mini-${mode}`}>
        <div className="panel-header">
          <h2>
            <Icon size={17} />
            {title}
            <span className="count">
              {mode === "today"
                ? count.today || 0
                : mode === "waiting"
                  ? count.waiting || 0
                  : mode === "blocked"
                    ? count.blocked || 0
                    : mode === "due"
                      ? count.upcoming || 0
                      : count.focus || 0}
            </span>
          </h2>
          <button
            className="text-button"
            aria-label={`查看全部${title}`}
            onClick={() => navigate("tasks", target)}
          >
            <ArrowUpRight size={15} />
          </button>
        </div>
        <div className="mini-list">
          {tasks.map((task, i) => {
            const days = task.due_at
              ? Math.round(
                  (Date.parse(localDate(new Date(task.due_at))) -
                    Date.parse(localDate())) /
                    86400000,
                )
              : null;
            const isOverdue =
              !!task.due_at && new Date(task.due_at).getTime() < Date.now();
            const elapsed = Math.floor(
              (Date.now() - new Date(task.status_since).getTime()) / 86400000,
            );
            return (
              <button
                className="mini-row"
                key={task.id}
                onClick={() => setEditing(task)}
              >
                <span className={`rank rank-${i + 1}`}>{i + 1}</span>
                <span className="mini-info">
                  <strong>{task.title}</strong>
                  {mode !== "focus" && (
                    <small>
                      {mode === "today" || mode === "waiting"
                        ? userName(task.assignee)
                        : formatTime(task.due_at, true)}
                    </small>
                  )}
                </span>
                {mode === "today" ? (
                  <>
                    <Priority value={task.priority} />
                    <span className="mini-time">
                      {task.due_at
                        ? formatTime(task.due_at, true).split(" ")[1]
                        : "待安排"}
                    </span>
                  </>
                ) : mode === "focus" ? (
                  <StatusBadge status={task.status} />
                ) : (
                  <span
                    className={`tiny-label ${mode === "blocked" ? "amber" : mode === "waiting" ? "violet" : "red"}`}
                  >
                    {mode === "blocked"
                      ? `卡住 ${elapsed} 天`
                      : mode === "waiting"
                        ? `等待 ${elapsed} 天`
                        : days === null
                          ? "未设置"
                          : isOverdue
                            ? days === 0
                              ? "已逾期"
                              : `逾期 ${Math.abs(days)} 天`
                            : days === 0
                              ? "今天到期"
                              : `剩余 ${days} 天`}
                  </span>
                )}
              </button>
            );
          })}
          {!tasks.length && (
            <div className="mini-empty">
              <Check size={18} />
              {mode === "blocked"
                ? "一切顺畅，暂无卡点"
                : mode === "waiting"
                  ? "暂无等待回复的任务"
                  : mode === "today"
                    ? "今天的安排由你开始"
                    : "暂无任务，继续保持从容"}
            </div>
          )}
        </div>
      </section>
    );
  }
  return (
    <div className="app-shell">
      <aside className={`sidebar ${menu ? "open" : ""}`}>
        <a
          className="brand"
          href="#"
          onClick={(e) => {
            e.preventDefault();
            navigate("dashboard");
          }}
        >
          <span className="brand-icon">
            <LayoutDashboard size={23} />
          </span>
          <span>
            协序<span className="brand-en">WORKSPACE</span>
          </span>
        </a>
        <span className="nav-label">团队工作空间</span>
        <nav>
          {nav.map(({ id, title, icon: Icon }) => (
            <button
              key={id}
              className={view === id ? "active" : ""}
              onClick={() => navigate(id)}
            >
              <Icon size={19} />
              {title}
              {id === "waiting" && !!count.waiting && (
                <span className="nav-badge">{count.waiting}</span>
              )}
              {view === id && <span className="nav-active-dot" />}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="team-card">
            <span className="team-icon">
              <Users size={19} />
            </span>
            <div>
              <strong>我们的团队</strong>
              <small>
                {users.filter((u) => u.active).length} 位成员 · 共同协作
              </small>
            </div>
            <span className="online-dot" />
          </div>
          <button
            className={
              view === "settings" ? "settings-link active" : "settings-link"
            }
            onClick={() => navigate("settings")}
          >
            <Settings size={18} />
            团队设置
          </button>
          <div className="sidebar-note">
            让工作有序，让协作轻松。<span>协序 · TEAM WORKBENCH</span>
          </div>
        </div>
      </aside>
      {menu && (
        <button
          className="sidebar-backdrop"
          aria-label="收起导航"
          onClick={() => setMenu(false)}
        />
      )}
      <div className="main-shell">
        <header className="topbar">
          <button
            className="icon-button mobile-menu"
            aria-label="打开导航"
            onClick={() => setMenu(true)}
          >
            <Menu size={21} />
          </button>
          <div className="breadcrumb">
            团队空间
            <ChevronRight size={13} />
            <strong>{currentTitle}</strong>
          </div>
          <div className="topbar-right">
            <div className="search-box">
              <Search size={17} />
              <input
                aria-label="搜索任务"
                placeholder="搜索任务、项目或负责人…"
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  if (
                    !["dashboard", "tasks", "waiting", "calendar"].includes(
                      view,
                    )
                  ) {
                    setView("tasks");
                    setFilters(initialFilters);
                  }
                }}
              />
              {search && (
                <button
                  className="icon-button"
                  aria-label="清除搜索"
                  onClick={() => setSearch("")}
                >
                  <X size={13} />
                </button>
              )}
            </div>
            <button
              className="notification icon-button"
              aria-label={`逾期提醒，共${count.overdue || 0}项`}
              onClick={() =>
                navigate("tasks", { view: "overdue", sort: "due_at" })
              }
            >
              <Bell size={20} />
              {!!count.overdue && <span />}
            </button>
            <div className="profile-wrap">
              <button
                className="profile"
                onClick={() => setProfile((p) => !p)}
                aria-expanded={profile}
              >
                <Avatar name={user.name} />
                <span>
                  {user.name}
                  <small>{user.admin ? "管理员" : "团队成员"}</small>
                </span>
                <ChevronRight size={13} className="profile-chevron" />
              </button>
              {profile && (
                <div className="profile-dropdown">
                  <button
                    onClick={() => {
                      navigate("settings");
                      setProfile(false);
                    }}
                  >
                    <Settings size={15} />
                    个人与团队设置
                  </button>
                  <button onClick={logoutUser}>
                    <LogOut size={15} />
                    退出登录
                  </button>
                </div>
              )}
            </div>
          </div>
        </header>
        <main className="workspace">
          <div className="heading-row">
            <div>
              <span className="eyebrow">
                {view === "dashboard"
                  ? "YOUR DAY, IN FOCUS"
                  : "WORK BETTER, TOGETHER"}
              </span>
              <h1>
                {currentTitle}
                <span className="heading-dot">.</span>
              </h1>
              <p>
                {view === "dashboard"
                  ? `你好，${user.name}。把重要的事放在眼前，让每一步都有进展。`
                  : view === "projects"
                    ? "从任务到里程碑，看见团队的每一步进展。"
                    : view === "settings"
                      ? "管理你的账号，让团队协作更加顺畅。"
                      : "所有安排清晰可见，团队始终保持同步。"}
              </p>
            </div>
            <button
              className="outline date-today"
              onClick={() => setSelectedDate(localDate())}
            >
              <CalendarDays size={15} />
              {new Intl.DateTimeFormat("zh-CN", {
                timeZone: "Asia/Shanghai",
                month: "long",
                day: "numeric",
                weekday: "long",
              }).format(new Date())}
            </button>
          </div>
          {error && (
            <div className="error-banner" role="alert">
              {error}
              <button
                className="text-button"
                onClick={() => setRefresh((r) => r + 1)}
              >
                重试
              </button>
            </div>
          )}
          {view === "dashboard" && (
            <>
              <div className="overview-intro">
                <span>
                  <span className="online-dot" />
                  团队概览<small>每 30 秒同步</small>
                </span>
                <span className="overview-date">
                  {selectedDate.replaceAll("-", ".")}
                </span>
              </div>
              <div className="stats-grid">
                {stats.map(
                  ({ label, number, sub, icon: Icon, tone, target }) => (
                    <button
                      className={`stat-card tone-${tone}`}
                      key={label}
                      onClick={() => navigate("tasks", target)}
                    >
                      <div className="stat-top">
                        <span className="stat-icon">
                          <Icon size={21} />
                        </span>
                        <ArrowUpRight size={16} className="stat-link" />
                      </div>
                      <div className="stat-main">
                        <span>{label}</span>
                        <strong>{number.toString().padStart(2, "0")}</strong>
                      </div>
                      <small>{sub}</small>
                    </button>
                  ),
                )}
              </div>
            </>
          )}
          {["dashboard", "calendar", "tasks", "waiting"].includes(view) && (
            <div className="week-strip">
              <div className="week-caption">
                <CalendarDays size={18} />
                <div>
                  <strong>
                    {selectedDate.slice(0, 4)} 年{" "}
                    {Number(selectedDate.slice(5, 7))} 月
                  </strong>
                  <small>把时间留给重要的事</small>
                </div>
              </div>
              <button
                className="icon-button"
                aria-label="上一周"
                onClick={() => setSelectedDate(shiftDate(selectedDate, -7))}
              >
                <ChevronLeft size={17} />
              </button>
              <div className="week-days">
                {dayLabels.map((label, i) => {
                  const date = shiftDate(monday, i);
                  return (
                    <button
                      key={date}
                      className={
                        date === selectedDate
                          ? "selected"
                          : date === localDate()
                            ? "is-today"
                            : ""
                      }
                      onClick={() => {
                        setSelectedDate(date);
                        setPage(1);
                      }}
                      aria-label={`选择${date}`}
                      aria-pressed={date === selectedDate}
                    >
                      <span>周{label}</span>
                      <strong>{Number(date.slice(8))}</strong>
                      <i />
                    </button>
                  );
                })}
              </div>
              <button
                className="icon-button"
                aria-label="下一周"
                onClick={() => setSelectedDate(shiftDate(selectedDate, 7))}
              >
                <ChevronRight size={17} />
              </button>
              <button
                className="outline small-button"
                onClick={() => setSelectedDate(localDate())}
              >
                今天
              </button>
              <label className="date-picker">
                <CalendarDays size={17} />
                <input
                  type="date"
                  aria-label="选择日期"
                  value={selectedDate}
                  onChange={(e) => {
                    if (e.target.value) {
                      setSelectedDate(e.target.value);
                      setPage(1);
                    }
                  }}
                />
              </label>
            </div>
          )}
          {view === "dashboard" && (
            <>
              <div className="dashboard-grid">
                <div className="dashboard-main">
                  {TaskTable({ compact: true })}
                  <div className="two-column">
                    {MiniList({
                      title: "今天先做",
                      tasks: overview.today,
                      mode: "today",
                      target: { view: "today" },
                      icon: Sparkles,
                    })}
                    {MiniList({
                      title: "等待回复",
                      tasks: overview.waiting,
                      mode: "waiting",
                      target: { status: "waiting" },
                      icon: MessageCircle,
                    })}
                  </div>
                </div>
                <div className="dashboard-aside">
                  {MiniList({
                    title: "即将到期",
                    tasks: overview.upcoming,
                    mode: "due",
                    target: { view: "upcoming", sort: "due_at" },
                    icon: Clock3,
                  })}
                  {MiniList({
                    title: "已拖住的事项",
                    tasks: overview.blocked,
                    mode: "blocked",
                    target: { status: "blocked" },
                    icon: Pause,
                  })}
                  {MiniList({
                    title: "本周重点",
                    tasks: overview.focus,
                    mode: "focus",
                    target: { view: "focus" },
                    icon: FolderKanban,
                  })}
                </div>
              </div>
              <section className="panel recent-panel">
                <div className="panel-header">
                  <h2>
                    <CircleCheck size={18} />
                    最近完成的任务
                    <span className="count">{count.done || 0}</span>
                  </h2>
                  <button
                    className="text-button"
                    onClick={() =>
                      navigate("tasks", {
                        status: "done",
                        sort: "-completed_at",
                      })
                    }
                  >
                    查看全部
                    <ArrowUpRight size={15} />
                  </button>
                </div>
                {overview.recent.length ? (
                  <div className="table-scroll">
                    <table>
                      <thead>
                        <tr>
                          <th />
                          <th>任务名称</th>
                          <th>所属项目</th>
                          <th>完成时间</th>
                          <th>负责人</th>
                          <th>状态</th>
                          <th />
                        </tr>
                      </thead>
                      <tbody>
                        {overview.recent.map((t) => (
                          <tr key={t.id}>
                            <td>
                              <span className="completed-icon">
                                <Check size={13} />
                              </span>
                            </td>
                            <td>
                              <button
                                className="task-title"
                                onClick={() => setEditing(t)}
                              >
                                {t.title}
                              </button>
                            </td>
                            <td className="muted">{projectName(t.project)}</td>
                            <td className="muted">
                              {formatTime(t.completed_at, true)}
                            </td>
                            <td>
                              <span className="assignee">
                                <Avatar name={userName(t.assignee)} small />
                                {userName(t.assignee)}
                              </span>
                            </td>
                            <td>
                              <StatusBadge status={t.status} />
                            </td>
                            <td>
                              <button
                                className="icon-button"
                                aria-label={`查看${t.title}`}
                                onClick={() => setEditing(t)}
                              >
                                <MoreHorizontal size={17} />
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <Empty
                    text="每一次完成，都值得记录"
                    detail="完成的任务会展示在这里。"
                  />
                )}
              </section>
            </>
          )}
          {["tasks", "waiting", "calendar"].includes(view) && (
            <>
              <div className="view-caption">
                <span>
                  {filters.deleted
                    ? "任务回收站"
                    : view === "calendar"
                      ? `${selectedDate} 的计划与截止任务`
                      : filters.view
                        ? (
                            {
                              today: "当天计划任务",
                              upcoming: "未来七天到期",
                              overdue: "已逾期任务",
                              focus: "本周重点任务",
                              recent: "最近完成",
                            } as Record<string, string>
                          )[filters.view]
                        : "团队共享任务"}
                </span>
                {!!count.overdue && !filters.deleted && (
                  <button
                    className="text-button overdue-text"
                    onClick={() => filter("view", "overdue")}
                  >
                    <Clock3 size={14} />
                    {count.overdue} 项已逾期
                  </button>
                )}
              </div>
              {TaskTable({})}
            </>
          )}
          {view === "projects" && (
            <>
              <div className="section-bar">
                <span>{projectRows.length} 个项目 · 进度由任务自动计算</span>
                <button
                  className="primary"
                  onClick={() => setCatalog({ type: "projects" })}
                >
                  <Plus size={16} />
                  新建项目
                </button>
              </div>
              <div className="project-grid">
                {projectRows.map((p) => (
                  <section className="panel project-card" key={p.id}>
                    <div className="project-card-head">
                      <span
                        className="project-icon"
                        style={{ color: p.color, background: `${p.color}15` }}
                      >
                        <FolderKanban size={24} />
                      </span>
                      <button
                        className="icon-button"
                        aria-label={`编辑项目${p.name}`}
                        onClick={() =>
                          setCatalog({ type: "projects", item: p })
                        }
                      >
                        <MoreHorizontal size={19} />
                      </button>
                    </div>
                    <h2>{p.name}</h2>
                    <p>{p.description || "为团队的下一个目标，一起向前。"}</p>
                    <div className="progress-label">
                      <span>任务完成进度</span>
                      <strong>
                        {p.total
                          ? Math.round(((p.done || 0) / p.total) * 100)
                          : 0}
                        %
                      </strong>
                    </div>
                    <div className="progress-track">
                      <span
                        style={{
                          width: `${p.total ? ((p.done || 0) / p.total) * 100 : 0}%`,
                          background: p.color,
                        }}
                      />
                    </div>
                    <div className="project-foot">
                      <span>
                        {p.done || 0} / {p.total || 0} 项已完成
                      </span>
                      <button
                        className="text-button"
                        onClick={() =>
                          navigate("tasks", { project: String(p.id) })
                        }
                      >
                        查看任务
                        <ArrowRight size={14} />
                      </button>
                    </div>
                  </section>
                ))}
              </div>
              {!projectRows.length && (
                <section className="panel">
                  <Empty
                    text="从一个项目开始"
                    detail="建立项目，再把相关任务归在一起。"
                  />
                </section>
              )}
            </>
          )}
          {view === "tags" && (
            <>
              <div className="section-bar">
                <span>用标签把相关的事放在一起</span>
                <button
                  className="primary"
                  onClick={() => setCatalog({ type: "tags" })}
                >
                  <Plus size={16} />
                  新建标签
                </button>
              </div>
              <div className="tag-grid">
                {tagRows.map((t) => (
                  <section className="panel tag-card" key={t.id}>
                    <span
                      className="tag-swatch"
                      style={{ background: `${t.color}15`, color: t.color }}
                    >
                      <TagIcon size={19} />
                      {t.name}
                    </span>
                    <button
                      className="icon-button"
                      aria-label={`编辑标签${t.name}`}
                      onClick={() => setCatalog({ type: "tags", item: t })}
                    >
                      <MoreHorizontal size={16} />
                    </button>
                    <p>{t.total || 0} 项任务</p>
                    <button
                      className="text-button"
                      onClick={() => navigate("tasks", { tag: String(t.id) })}
                    >
                      查看任务
                      <ArrowRight size={14} />
                    </button>
                  </section>
                ))}
              </div>
              {!tagRows.length && (
                <section className="panel">
                  <Empty
                    text="给任务一点分类"
                    detail="建立标签，快速找到同类工作。"
                  />
                </section>
              )}
            </>
          )}
          {view === "history" && (
            <section className="panel history-panel">
              <div className="panel-header">
                <h2>
                  团队动态<span className="count">{history.total}</span>
                </h2>
                <span className="muted">每一步变化，都有迹可循</span>
              </div>
              {history.items.map((a) => (
                <div className="activity" key={a.id}>
                  <Avatar name={a.actor} />
                  <div>
                    <strong>{a.actor}</strong>
                    <p>{a.summary}</p>
                    {Object.keys(a.changes).length > 0 && (
                      <details>
                        <summary>查看变更内容</summary>
                        <dl>
                          {Object.entries(a.changes).map(([key, value]) => (
                            <div key={key}>
                              <dt>
                                {(
                                  {
                                    title: "任务名称",
                                    status: "状态",
                                    priority: "优先级",
                                    assignee: "负责人",
                                    project: "项目",
                                    tags: "标签",
                                    notes: "备注",
                                    next_action: "下一步操作",
                                    due_at: "截止时间",
                                    planned_date: "计划日期",
                                    focus_week: "重点周",
                                    deleted_at: "删除时间",
                                    completed_at: "完成时间",
                                  } as Record<string, string>
                                )[key] || key}
                              </dt>
                              <dd>
                                {historyValue(
                                  key,
                                  value.from,
                                  users,
                                  projects,
                                  tags,
                                )}{" "}
                                →{" "}
                                {historyValue(
                                  key,
                                  value.to,
                                  users,
                                  projects,
                                  tags,
                                )}
                              </dd>
                            </div>
                          ))}
                        </dl>
                      </details>
                    )}
                  </div>
                  <time>{formatTime(a.created_at, true)}</time>
                </div>
              ))}
              {!history.items.length && (
                <Empty
                  text="团队动态将在这里留下足迹"
                  detail="创建任务或项目后即可看到记录。"
                />
              )}
              <Pager
                page={history.page}
                pages={history.pages}
                total={history.total}
                onChange={setPage}
              />
            </section>
          )}
          {view === "settings" && (
            <SettingsView user={user} users={users} onChange={changed} />
          )}
          <footer className="workspace-footer">
            <span>
              协序<span className="footer-sep">/</span>
              让团队的每一步，都清晰可见。
            </span>
            <span>
              <span className="online-dot" />
              共享空间 · 上海时间
            </span>
          </footer>
        </main>
      </div>
      {editing && (
        <TaskEditor
          task={editing}
          selectedDate={selectedDate}
          users={users}
          projects={projects}
          tags={tags}
          admin={user.admin}
          onClose={() => setEditing(null)}
          onSaved={(text) => {
            setEditing(null);
            changed(text);
          }}
        />
      )}
      {catalog && (
        <CatalogEditor
          {...catalog}
          onClose={() => setCatalog(null)}
          onSaved={() => {
            setCatalog(null);
            changed();
          }}
        />
      )}
      {toast && (
        <div className="toast" role="status">
          <CircleCheck size={18} />
          {toast}
        </div>
      )}
    </div>
  );
}

function historyValue(
  key: string,
  value: unknown,
  users: User[],
  projects: Project[],
  tags: Tag[],
) {
  if (value === null || value === "") return "未设置";
  if (key === "status") return statuses[value as Status];
  if (key === "priority") return priorities[value as Task["priority"]];
  if (key === "assignee")
    return users.find((u) => u.id === value)?.name || "未分配";
  if (key === "project")
    return projects.find((p) => p.id === value)?.name || "未归属";
  if (key === "tags" && Array.isArray(value))
    return (
      value.map((id) => tags.find((t) => t.id === id)?.name).join("、") ||
      "无标签"
    );
  return String(value);
}

function TaskEditor({
  task,
  selectedDate,
  users,
  projects,
  tags,
  admin,
  onClose,
  onSaved,
}: {
  task: Task | "new";
  selectedDate: string;
  users: User[];
  projects: Project[];
  tags: Tag[];
  admin: boolean;
  onClose: () => void;
  onSaved: (text: string) => void;
}) {
  const [form, setForm] = useState(() =>
    task === "new"
      ? {
          title: "",
          status: "pending" as Status,
          priority: "medium" as Task["priority"],
          assignee: "",
          project: "",
          tags: [] as number[],
          due_at: "",
          planned_date: selectedDate,
          focus_week: "",
          next_action: "",
          notes: "",
        }
      : {
          ...task,
          assignee: task.assignee === null ? "" : String(task.assignee),
          project: task.project === null ? "" : String(task.project),
          due_at: datetimeInput(task.due_at),
          planned_date: task.planned_date || "",
          focus_week: task.focus_week || "",
        },
  );
  const [version, setVersion] = useState(task === "new" ? 0 : task.version);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [latest, setLatest] = useState<Task | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const deleted = task !== "new" && !!task.deleted_at;
  async function save(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const data = {
        ...form,
        assignee: form.assignee ? Number(form.assignee) : null,
        project: form.project ? Number(form.project) : null,
        due_at: form.due_at ? `${form.due_at}:00+08:00` : null,
        planned_date: form.planned_date || null,
        focus_week: form.focus_week || null,
      };
      const payload = {
        title: data.title,
        status: data.status,
        priority: data.priority,
        assignee: data.assignee,
        project: data.project,
        tags: data.tags,
        due_at: data.due_at,
        planned_date: data.planned_date,
        focus_week: data.focus_week,
        next_action: data.next_action,
        notes: data.notes,
        ...(task === "new" ? {} : { version }),
      };
      await api(
        task === "new" ? "tasks/" : `tasks/${task.id}/`,
        task === "new" ? "POST" : "PATCH",
        payload,
      );
      onSaved(task === "new" ? "新任务已创建" : "任务已更新");
    } catch (e) {
      setError(message(e));
      if (e instanceof ApiError && e.status === 409 && task !== "new") {
        try {
          setLatest(await api<Task>(`tasks/${task.id}/`));
        } catch {
          /* Keep the draft when the task was deleted during editing. */
        }
      }
    } finally {
      setBusy(false);
    }
  }
  async function removeOrRestore() {
    if (task === "new") return;
    setBusy(true);
    setError("");
    try {
      await api(
        deleted ? `tasks/${task.id}/restore/` : `tasks/${task.id}/`,
        deleted ? "POST" : "DELETE",
        { version },
      );
      onSaved(deleted ? "任务已恢复" : "任务已移至回收站");
    } catch (e) {
      setError(message(e));
    } finally {
      setBusy(false);
    }
  }
  function adoptLatest() {
    if (!latest) return;
    setForm({
      ...latest,
      assignee: latest.assignee === null ? "" : String(latest.assignee),
      project: latest.project === null ? "" : String(latest.project),
      due_at: datetimeInput(latest.due_at),
      planned_date: latest.planned_date || "",
      focus_week: latest.focus_week || "",
    });
    setVersion(latest.version);
    setLatest(null);
    setError("");
  }
  return (
    <Modal
      title={
        task === "new" ? "新建任务" : deleted ? "已删除的任务" : "任务详情"
      }
      onClose={onClose}
      wide
    >
      <form onSubmit={save}>
        <div className="form-grid">
          <label className="span-2">
            任务名称
            <input
              autoFocus
              value={form.title}
              onChange={(e) =>
                setForm((f) => ({ ...f, title: e.target.value }))
              }
              required
              maxLength={200}
              placeholder="这件事需要完成什么？"
              disabled={deleted}
            />
          </label>
          <label>
            当前状态
            <select
              aria-label="当前状态"
              value={form.status}
              onChange={(e) =>
                setForm((f) => ({ ...f, status: e.target.value as Status }))
              }
              disabled={deleted}
            >
              {Object.entries(statuses).map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </select>
          </label>
          <label>
            优先级
            <select
              aria-label="优先级"
              value={form.priority}
              onChange={(e) =>
                setForm((f) => ({
                  ...f,
                  priority: e.target.value as Task["priority"],
                }))
              }
              disabled={deleted}
            >
              {Object.entries(priorities).map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </select>
          </label>
          <label>
            负责人
            <select
              aria-label="负责人"
              value={form.assignee}
              onChange={(e) =>
                setForm((f) => ({ ...f, assignee: e.target.value }))
              }
              disabled={deleted}
            >
              <option value="">暂不分配</option>
              {users
                .filter((u) => u.active || String(u.id) === form.assignee)
                .map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name}
                    {!u.active && "（已停用）"}
                  </option>
                ))}
            </select>
          </label>
          <label>
            所属项目
            <select
              aria-label="所属项目"
              value={form.project}
              onChange={(e) =>
                setForm((f) => ({ ...f, project: e.target.value }))
              }
              disabled={deleted}
            >
              <option value="">不归属项目</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            截止时间 <small>上海时间</small>
            <input
              type="datetime-local"
              value={form.due_at}
              onChange={(e) =>
                setForm((f) => ({ ...f, due_at: e.target.value }))
              }
              disabled={deleted}
            />
          </label>
          <label>
            计划日期
            <input
              type="date"
              value={form.planned_date}
              onChange={(e) =>
                setForm((f) => ({ ...f, planned_date: e.target.value }))
              }
              disabled={deleted}
            />
          </label>
          <label className="span-2">
            下一步操作
            <input
              value={form.next_action}
              maxLength={300}
              placeholder="让下一步行动清晰可见"
              onChange={(e) =>
                setForm((f) => ({ ...f, next_action: e.target.value }))
              }
              disabled={deleted}
            />
          </label>
          <fieldset className="span-2 tag-choices">
            <legend>任务标签</legend>
            {tags.length ? (
              tags.map((t) => (
                <label key={t.id} style={{ color: t.color }}>
                  <input
                    type="checkbox"
                    checked={form.tags.includes(t.id)}
                    onChange={(e) =>
                      setForm((f) => ({
                        ...f,
                        tags: e.target.checked
                          ? [...f.tags, t.id]
                          : f.tags.filter((id) => id !== t.id),
                      }))
                    }
                    disabled={deleted}
                  />
                  {t.name}
                </label>
              ))
            ) : (
              <span className="muted">可以先到标签分类中创建标签。</span>
            )}
          </fieldset>
          <label className="span-2 check-label">
            <input
              type="checkbox"
              checked={form.focus_week === weekStart(selectedDate)}
              onChange={(e) =>
                setForm((f) => ({
                  ...f,
                  focus_week: e.target.checked ? weekStart(selectedDate) : "",
                }))
              }
              disabled={deleted}
            />
            设为本周重点 <small>当前选择周：{weekStart(selectedDate)}</small>
          </label>
          <label className="span-2">
            备注
            <textarea
              value={form.notes}
              maxLength={10000}
              rows={4}
              placeholder="记录背景、资料链接或会议要点…"
              onChange={(e) =>
                setForm((f) => ({ ...f, notes: e.target.value }))
              }
              disabled={deleted}
            />
          </label>
        </div>
        {error && (
          <div className="form-error" role="alert">
            {error}
          </div>
        )}
        {latest && (
          <div className="conflict">
            <strong>其他成员保存的最新内容</strong>
            <p>
              {latest.title} · {statuses[latest.status]} ·{" "}
              {priorities[latest.priority]}优先级
            </p>
            <p>
              负责人：
              {users.find((u) => u.id === latest.assignee)?.name || "未分配"} ·
              截止：{formatTime(latest.due_at, true)}
            </p>
            <p>下一步：{latest.next_action || "未设置"}</p>
            <details>
              <summary>查看完整最新内容</summary>
              <pre>
                {JSON.stringify(
                  {
                    任务名称: latest.title,
                    状态: statuses[latest.status],
                    优先级: priorities[latest.priority],
                    负责人:
                      users.find((u) => u.id === latest.assignee)?.name ||
                      "未分配",
                    项目:
                      projects.find((p) => p.id === latest.project)?.name ||
                      "未归属",
                    标签: latest.tags.map(
                      (id) => tags.find((t) => t.id === id)?.name,
                    ),
                    截止时间: latest.due_at,
                    计划日期: latest.planned_date,
                    重点周: latest.focus_week,
                    下一步操作: latest.next_action,
                    备注: latest.notes,
                  },
                  null,
                  2,
                )}
              </pre>
            </details>
            <button type="button" className="outline" onClick={adoptLatest}>
              采用最新内容（替换当前输入）
            </button>
          </div>
        )}
        {deleteConfirm && (
          <div className="form-error">
            任务将移至回收站，管理员可以恢复。
            <button
              type="button"
              className="text-button danger"
              disabled={busy}
              onClick={removeOrRestore}
            >
              确认删除
            </button>
            <button
              type="button"
              className="text-button"
              onClick={() => setDeleteConfirm(false)}
            >
              取消
            </button>
          </div>
        )}
        <div className="modal-footer">
          <div>
            {admin && task !== "new" && (
              <button
                type="button"
                className="text-button danger"
                disabled={busy}
                onClick={() =>
                  deleted ? removeOrRestore() : setDeleteConfirm(true)
                }
              >
                <Trash2 size={15} />
                {deleted ? "恢复任务" : "删除任务"}
              </button>
            )}
          </div>
          <div>
            <button type="button" className="outline" onClick={onClose}>
              关闭
            </button>
            {!deleted && (
              <button className="primary" disabled={busy || !!latest}>
                {busy ? "正在保存…" : task === "new" ? "创建任务" : "保存更改"}
              </button>
            )}
          </div>
        </div>
      </form>
    </Modal>
  );
}

function CatalogEditor({
  type,
  item,
  onClose,
  onSaved,
}: {
  type: "projects" | "tags";
  item?: Project | Tag;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const data = Object.fromEntries(new FormData(e.currentTarget));
    try {
      await api(
        `${type}/${item ? `${item.id}/` : ""}`,
        item ? "PATCH" : "POST",
        data,
      );
      onSaved();
    } catch (err) {
      setError(message(err));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal
      title={`${item ? "编辑" : "新建"}${type === "projects" ? "项目" : "标签"}`}
      onClose={onClose}
    >
      <form onSubmit={submit}>
        <label>
          名称
          <input
            name="name"
            autoFocus
            required
            maxLength={type === "projects" ? 100 : 40}
            defaultValue={item?.name}
          />
        </label>
        <label>
          标识颜色
          <input
            name="color"
            type="color"
            defaultValue={item?.color || "#2d6cdf"}
          />
        </label>
        {type === "projects" && (
          <label>
            项目说明
            <textarea
              name="description"
              rows={3}
              maxLength={2000}
              defaultValue={
                item && "description" in item ? item.description : ""
              }
            />
          </label>
        )}
        {error && (
          <div className="form-error" role="alert">
            {error}
          </div>
        )}
        <div className="modal-footer">
          <span />
          <div>
            <button type="button" className="outline" onClick={onClose}>
              取消
            </button>
            <button className="primary" disabled={busy}>
              {busy ? "正在保存…" : "保存"}
            </button>
          </div>
        </div>
      </form>
    </Modal>
  );
}

function SettingsView({
  user,
  users,
  onChange,
}: {
  user: User;
  users: User[];
  onChange: (text?: string) => void;
}) {
  const [memberModal, setMemberModal] = useState<User | "new" | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [memberError, setMemberError] = useState("");
  async function password(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const data = Object.fromEntries(new FormData(form));
    setBusy(true);
    setError("");
    try {
      await api("password/", "POST", data);
      form.reset();
      onChange("密码已更新，其他设备的登录已退出");
    } catch (err) {
      setError(message(err));
    } finally {
      setBusy(false);
    }
  }
  async function saveMember(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(e.currentTarget));
    setBusy(true);
    setMemberError("");
    try {
      if (memberModal === "new") await api("members/", "POST", data);
      else if (memberModal)
        await api(`members/${memberModal.id}/`, "PATCH", {
          name: data.name,
          active: data.active === "true",
          ...(data.password ? { password: data.password } : {}),
        });
      setMemberModal(null);
      onChange("成员账号已更新");
    } catch (err) {
      setMemberError(message(err));
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="settings-grid">
      <section className="panel settings-panel">
        <div className="panel-header">
          <h2>个人账号</h2>
          <Avatar name={user.name} />
        </div>
        <div className="account-summary">
          <strong>{user.name}</strong>
          <span>
            @{user.username} · {user.admin ? "管理员" : "团队成员"}
          </span>
        </div>
        <h3>修改密码</h3>
        <form onSubmit={password}>
          <label>
            当前密码
            <input
              name="current_password"
              type="password"
              autoComplete="current-password"
              required
            />
          </label>
          <label>
            新密码
            <input
              name="password"
              type="password"
              autoComplete="new-password"
              required
              minLength={10}
              maxLength={1000}
              placeholder="至少 10 位，避免使用常见密码"
            />
          </label>
          {error && (
            <div className="form-error" role="alert">
              {error}
            </div>
          )}
          <button className="primary" disabled={busy}>
            更新密码
          </button>
        </form>
      </section>
      <section className="panel settings-panel">
        <div className="panel-header">
          <h2>
            团队成员<span className="count">{users.length}</span>
          </h2>
          {user.admin && (
            <button
              className="primary small-button"
              onClick={() => {
                setMemberError("");
                setMemberModal("new");
              }}
            >
              <Plus size={15} />
              添加成员
            </button>
          )}
        </div>
        <p className="muted">成员共同编辑团队任务，管理员管理账号及回收站。</p>
        {users.map((u) => (
          <div className="member-row" key={u.id}>
            <Avatar name={u.name} />
            <div>
              <strong>{u.name}</strong>
              <small>
                @{u.username} · {u.admin ? "管理员" : "成员"}
              </small>
            </div>
            <span className={`tiny-label ${u.active ? "green" : "red"}`}>
              {u.active ? "已启用" : "已停用"}
            </span>
            {user.admin && (
              <button
                className="text-button"
                onClick={() => {
                  setMemberError("");
                  setMemberModal(u);
                }}
              >
                管理
              </button>
            )}
          </div>
        ))}
      </section>
      {memberModal && (
        <Modal
          title={
            memberModal === "new" ? "添加团队成员" : `管理 ${memberModal.name}`
          }
          onClose={() => setMemberModal(null)}
        >
          <form onSubmit={saveMember}>
            {memberModal === "new" && (
              <label>
                用户名
                <input
                  name="username"
                  autoComplete="off"
                  required
                  maxLength={150}
                />
              </label>
            )}
            <label>
              显示名称
              <input
                name="name"
                required
                maxLength={150}
                defaultValue={memberModal === "new" ? "" : memberModal.name}
              />
            </label>
            <label>
              {memberModal === "new"
                ? "初始密码"
                : "重置密码（留空保持当前密码）"}
              <input
                name="password"
                type="password"
                autoComplete="new-password"
                required={memberModal === "new"}
                minLength={10}
                maxLength={1000}
              />
            </label>
            {memberModal !== "new" && (
              <label>
                账号状态
                <select name="active" defaultValue={String(memberModal.active)}>
                  <option value="true">启用</option>
                  <option value="false">停用（撤销所有登录）</option>
                </select>
              </label>
            )}
            {memberError && (
              <div className="form-error" role="alert">
                {memberError}
              </div>
            )}
            <div className="modal-footer">
              <span />
              <div>
                <button
                  className="outline"
                  type="button"
                  onClick={() => setMemberModal(null)}
                >
                  取消
                </button>
                <button className="primary" disabled={busy}>
                  保存账号
                </button>
              </div>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
