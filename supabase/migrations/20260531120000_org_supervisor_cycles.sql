-- Org K8s supervisor cycle snapshots (issue / pr / review) for dashboards and cross-process visibility.
create table if not exists public.org_supervisor_cycles (
  supervisor_kind text primary key check (supervisor_kind in ('issue', 'pr', 'review')),
  open_count integer not null default 0,
  desired_workers integer not null default 0,
  active_claims jsonb not null default '[]'::jsonb,
  last_cycle_at timestamptz,
  last_error text,
  updated_at timestamptz not null default now()
);

alter table public.org_supervisor_cycles enable row level security;
create policy "service_all_org_supervisor_cycles" on public.org_supervisor_cycles
  for all using (true) with check (true);
