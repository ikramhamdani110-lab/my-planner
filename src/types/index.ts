export type TaskStatus = 'not_started' | 'in_progress' | 'completed' | 'rescheduled' | 'missed';
export type Priority = 'low' | 'medium' | 'high' | 'urgent';
export type GoalStatus = 'not_started' | 'in_progress' | 'completed' | 'archived';
export type ThemeMode = 'dark-red' | 'baby-pink' | 'dark-blue' | 'baby-blue';

export interface Task {
  id: number;
  title: string;
  description: string;
  start_date: string;
  end_date: string;
  start_time: string;
  end_time: string;
  category_id: number | null;
  priority: Priority;
  status: TaskStatus;
  color: string | null;
  reminder: number | null;
  recurrence_rule: string | null;
  parent_task_id: number | null;
  goal_id: number | null;
  notes: string;
  original_start_date: string | null;
  original_end_date: string | null;
  original_start_time: string | null;
  original_end_time: string | null;
  is_all_day: number;
  created_at: string;
  updated_at: string;
    completed_at: string | null;
    category_name?: string | null;
    category_color?: string | null;
    history?: TaskHistory[];
  }

  /** One materialized date of a recurring task series. */
  export interface TaskOccurrence {
    id: number;
    series_id: number;
    occurrence_date: string;
    start_date: string;
    end_date: string;
    start_time: string | null;
    end_time: string | null;
    status: TaskStatus | 'rescheduled';
    completed_at: string | null;
    original_start_date: string | null;
    original_start_time: string | null;
    reschedule_note: string | null;
    /* joined series fields */
    title: string;
    description: string;
    category_id: number | null;
    category_name: string | null;
    category_color: string | null;
    priority: Priority;
    color: string | null;
    reminder: number | null;
    recurrence_rule: string | null;
    goal_id: number | null;
    notes: string;
    is_all_day: number;
    account_id: number | null;
    is_occurrence: true;
  }

export interface TaskHistory {
  id: number;
  task_id: number;
  previous_schedule: string | null;
  new_schedule: string | null;
  change_type: string;
  reason: string | null;
  changed_at: string;
}

export interface Goal {
  id: number;
  title: string;
  description: string;
  start_date: string;
  target_date: string;
  progress: number;
  status: GoalStatus;
  category: string;
  priority: Priority;
  created_at: string;
  updated_at: string;
  milestones: Milestone[];
}

export interface Milestone {
  id: number;
  goal_id: number;
  title: string;
  target_date: string | null;
  is_completed: number;
}

export interface Habit {
  id: number;
  title: string;
  description: string;
  frequency: 'daily' | 'weekly' | 'custom';
  custom_schedule: string | null;
  color: string | null;
  created_at: string;
  is_active: number;
  streak?: number;
}

export interface Note {
  id: number;
  title: string;
  content: string;
  category?: string;
  is_pinned: number;
  linked_goal_id: number | null;
  linked_task_id: number | null;
  created_at: string;
  updated_at: string;
}

export interface SearchResults {
  tasks: { type: string; id: number; title: string; date?: string; status?: string }[];
  goals: { id: number; title: string; status?: string }[];
  notes: { id: number; title: string }[];
}

export interface IpcResult<T = any> {
  ok: boolean;
  data?: T;
  error?: string;
}

export interface ApiBridge {
  tasksCreate(p: Partial<Task> & { title: string; startDate: string; endDate: string; startTime: string; endTime: string }): Promise<IpcResult>;
  tasksUpdate(p: Partial<Task>): Promise<IpcResult>;
  tasksReschedule(p: { id: number; startDate: string; endDate: string; startTime: string; endTime: string; reason?: string }): Promise<IpcResult>;
  tasksSetStatus(p: { id: number; status: TaskStatus; reason?: string }): Promise<IpcResult>;
  tasksDelete(id: number): Promise<IpcResult>;
  tasksGet(id: number): Promise<IpcResult<Task>>;
  tasksByDate(date: string): Promise<IpcResult<Task[]>>;
  tasksByDateRange(from: string, to: string): Promise<IpcResult<Task[]>>;
  tasksOverdue(today: string): Promise<IpcResult<Task[]>>;
  tasksRescheduledList(): Promise<IpcResult<Task[]>>;
  tasksUpcoming(today: string, limit?: number): Promise<IpcResult<Task[]>>;
  tasksFilter(p: any): Promise<IpcResult<Task[]>>;
  tasksSearch(query: string): Promise<IpcResult<Task[]>>;
  tasksHistory(id: number): Promise<IpcResult<TaskHistory[]>>;
  occurrencesRange(from: string, to: string): Promise<IpcResult<TaskOccurrence[]>>;
  occurrencesForSeries(seriesId: number): Promise<IpcResult<TaskOccurrence[]>>;
  occurrencesSetStatus(id: number, status: TaskStatus | 'rescheduled'): Promise<IpcResult>;
  occurrencesReschedule(p: { id: number; startDate: string; endDate: string; startTime: string; endTime: string; reason?: string }): Promise<IpcResult>;
  occurrencesRescheduleSeries(p: { seriesId: number; startDate: string; startTime: string; endTime: string; reason?: string }): Promise<IpcResult>;
  occurrencesDelete(id: number): Promise<IpcResult>;
  occurrencesDeleteSeries(seriesId: number): Promise<IpcResult>;
  tasksOverlaps(p: any): Promise<IpcResult<{ id: number; title: string }[]>>;
  goalsCreate(p: any): Promise<IpcResult<Goal>>;
  goalsList(): Promise<IpcResult<Goal[]>>;
  goalsGet(id: number): Promise<IpcResult<Goal>>;
  goalsUpdate(p: any): Promise<IpcResult<Goal>>;
  goalsDelete(id: number): Promise<IpcResult>;
  goalsAddMilestone(p: { goalId: number; title: string; targetDate?: string }): Promise<IpcResult>;
  goalsToggleMilestone(p: { id: number; done: boolean }): Promise<IpcResult<Goal>>;
  goalsDeleteMilestone(id: number): Promise<IpcResult>;
  goalsRecalc(id: number): Promise<IpcResult<number>>;
  notesCreate(p: any): Promise<IpcResult<Note>>;
  notesList(search?: string): Promise<IpcResult<Note[]>>;
  notesUpdate(p: any): Promise<IpcResult<Note>>;
  notesDelete(id: number): Promise<IpcResult>;
  settingsGetAll(): Promise<IpcResult<Record<string, string>>>;
  settingsSet(key: string, value: string): Promise<IpcResult>;
  statsRange(from: string, to: string): Promise<IpcResult<any>>;
  statsDaily(from: string, to: string): Promise<IpcResult<any[]>>;
  statsGoalCounts(): Promise<IpcResult<any>>;
  statsGoalDistribution(p: { from: string; to: string }): Promise<IpcResult<{ goalId: number | null; name: string; scheduled: number; completed: number }[]>>;
  statsDailyGoalCompletion(p: { from: string; to: string; goalId: number | null }): Promise<IpcResult<{ date: string; total: number; completed: number }[]>>;
  statsDashboard(p: any): Promise<IpcResult<any>>;
  backupExportJson(): Promise<IpcResult>;
  backupImportJson(mode: 'merge' | 'restore'): Promise<IpcResult>;
  backupCopyDb(): Promise<IpcResult>;
  backupResetData(): Promise<IpcResult>;
  appInfo(): Promise<IpcResult<{ version: string; dbPath: string; platform: string }>>;
  searchAll(query: string): Promise<IpcResult<SearchResults>>;
  notificationsList(): Promise<IpcResult<any[]>>;
  notificationsUnreadCount(): Promise<IpcResult<number>>;
}

declare global {
  interface Window { api: ApiBridge }
}
