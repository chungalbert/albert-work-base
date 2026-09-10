import GanttLib from "../vendor/frappe-gantt.js";

export type GanttCtor = new (
  wrapper: string | HTMLElement,
  tasks: Array<Record<string, unknown>>,
  options?: Record<string, unknown>,
) => {
  refresh(tasks: Array<Record<string, unknown>>): void;
  change_view_mode(mode: string): void;
};

export const Gantt = GanttLib as unknown as GanttCtor;
