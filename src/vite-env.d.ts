/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL?: string;
  readonly VITE_SUPABASE_ANON_KEY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

declare module "../vendor/frappe-gantt.js" {
  const Gantt: new (
    wrapper: string | HTMLElement,
    tasks: Array<Record<string, unknown>>,
    options?: Record<string, unknown>,
  ) => {
    refresh(tasks: Array<Record<string, unknown>>): void;
    change_view_mode(mode: string): void;
  };
  export default Gantt;
}
