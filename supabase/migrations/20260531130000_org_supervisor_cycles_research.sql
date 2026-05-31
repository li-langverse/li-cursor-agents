-- Extend org_supervisor_cycles to include research supervisor kind.
alter table public.org_supervisor_cycles
  drop constraint if exists org_supervisor_cycles_supervisor_kind_check;

alter table public.org_supervisor_cycles
  add constraint org_supervisor_cycles_supervisor_kind_check
  check (supervisor_kind in ('issue', 'pr', 'review', 'research'));
