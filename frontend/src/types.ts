export type User = {
  id: number;
  username: string;
  name: string;
  admin: boolean;
  active: boolean;
};
export type Project = {
  id: number;
  name: string;
  description: string;
  color: string;
  total?: number;
  done?: number;
};
export type Tag = { id: number; name: string; color: string; total?: number };
export type Status = "pending" | "in_progress" | "waiting" | "blocked" | "done";
export type Task = {
  id: number;
  title: string;
  status: Status;
  priority: "high" | "medium" | "low";
  assignee: number | null;
  project: number | null;
  tags: number[];
  due_at: string | null;
  planned_date: string | null;
  focus_week: string | null;
  next_action: string;
  notes: string;
  version: number;
  created_at: string;
  updated_at: string;
  status_since: string;
  completed_at: string | null;
  deleted_at: string | null;
};
export type Overview = {
  counts: Record<string, number>;
  today: Task[];
  waiting: Task[];
  blocked: Task[];
  upcoming: Task[];
  overdue: Task[];
  focus: Task[];
  recent: Task[];
  date: string;
  week: string;
};
export type Page<T> = {
  items: T[];
  total: number;
  page: number;
  pages: number;
};
export type Activity = {
  id: number;
  actor: string;
  action: string;
  task: number | null;
  summary: string;
  changes: Record<string, { from: unknown; to: unknown }>;
  created_at: string;
};
export const statuses: Record<Status, string> = {
  pending: "待处理",
  in_progress: "进行中",
  waiting: "等待回复",
  blocked: "已拖住",
  done: "已完成",
};
export const priorities = { high: "高", medium: "中", low: "低" };
