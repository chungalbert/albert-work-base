alter table public.tasks drop constraint if exists tasks_status_check;

update public.tasks
set status = case status
  when 'todo' then 'opening'
  when 'doing' then 'working'
  when 'done' then 'verify'
  else status
end
where status in ('todo', 'doing', 'done');

alter table public.tasks
  alter column status set default 'opening';

alter table public.tasks
  add constraint tasks_status_check
  check (status in ('opening', 'working', 'closing', 'verify'));

alter table public.tasks
  add column if not exists analyzed text not null default '';
