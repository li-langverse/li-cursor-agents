-- Add planner supervisor kind to org_supervisor_cycles check constraint.
alter table public.org_supervisor_cycles drop constraint if exists org_supervisor_cycles_supervisor_kind_check;
alter table public.org_supervisor_cycles add constraint org_supervisor_cycles_supervisor_kind_check
  check (supervisor_kind in ('issue', 'pr', 'review', 'research', 'planner'));

insert into public.org_supervisor_cycles (supervisor_kind, open_count, desired_workers, active_claims)
values ('planner', 0, 0, '[]'::jsonb)
on conflict (supervisor_kind) do nothing;
