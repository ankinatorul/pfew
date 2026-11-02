begin;
create table if not exists public.trip_members(id uuid primary key default gen_random_uuid(),trip_id uuid not null references public.trips on delete cascade,user_id uuid not null references auth.users on delete cascade,role text not null check(role in ('editor','viewer')),created_at timestamptz not null default now(),unique(trip_id,user_id));
create index if not exists trip_members_user on public.trip_members(user_id,trip_id);
create table if not exists public.trip_invitations(id uuid primary key default gen_random_uuid(),trip_id uuid not null references public.trips on delete cascade,email text not null check(length(email) between 3 and 254),role text not null check(role in ('editor','viewer')),token_hash text not null unique check(token_hash ~ '^[a-f0-9]{64}$'),expires_at timestamptz not null,accepted_at timestamptz,accepted_by uuid references auth.users on delete set null,created_at timestamptz not null default now());
create table if not exists public.audit_events(id uuid primary key default gen_random_uuid(),trip_id uuid not null,actor_id uuid references auth.users on delete set null,entity_table text not null,entity_id uuid not null,action text not null check(action in ('INSERT','UPDATE','DELETE')),created_at timestamptz not null default now());
create index if not exists audit_trip_created on public.audit_events(trip_id,created_at desc);
create or replace function public.owns_trip(target uuid) returns boolean language sql stable security definer set search_path='' as $$select exists(select 1 from public.trips t where t.id=target and t.owner_id=auth.uid())$$;
create or replace function public.can_read_trip(target uuid) returns boolean language sql stable security definer set search_path='' as $$select public.owns_trip(target) or exists(select 1 from public.trip_members m where m.trip_id=target and m.user_id=auth.uid())$$;
create or replace function public.can_edit_trip(target uuid) returns boolean language sql stable security definer set search_path='' as $$select public.owns_trip(target) or exists(select 1 from public.trip_members m where m.trip_id=target and m.user_id=auth.uid() and m.role='editor')$$;
revoke all on function public.owns_trip(uuid),public.can_read_trip(uuid),public.can_edit_trip(uuid) from public;
grant execute on function public.owns_trip(uuid),public.can_read_trip(uuid),public.can_edit_trip(uuid) to authenticated;
alter table public.trip_members enable row level security;alter table public.trip_invitations enable row level security;alter table public.audit_events enable row level security;
do $$ begin
 if not exists(select 1 from pg_catalog.pg_policies where schemaname='public' and tablename='trip_members' and policyname='members_read') then
 create policy members_read on public.trip_members for select to authenticated using(public.can_read_trip(trip_id));
 create policy members_manage on public.trip_members for all to authenticated using(public.owns_trip(trip_id)) with check(public.owns_trip(trip_id));
 create policy invitations_private on public.trip_invitations for all to authenticated using(public.owns_trip(trip_id)) with check(public.owns_trip(trip_id));
 create policy audit_read on public.audit_events for select to authenticated using(public.can_read_trip(trip_id));end if;
end $$;
grant select,insert,update,delete on public.trip_members,public.trip_invitations to authenticated;grant select on public.audit_events to authenticated;
drop policy if exists trips_private on public.trips;
drop policy if exists trip_read on public.trips;drop policy if exists trip_insert on public.trips;drop policy if exists trip_update on public.trips;drop policy if exists trip_delete on public.trips;
create policy trip_read on public.trips for select to authenticated using(owner_id=auth.uid() or public.can_read_trip(id));
create policy trip_insert on public.trips for insert to authenticated with check(owner_id=auth.uid());
create policy trip_update on public.trips for update to authenticated using(owner_id=auth.uid()) with check(owner_id=auth.uid());
create policy trip_delete on public.trips for delete to authenticated using(owner_id=auth.uid());
do $$ declare tab text;begin
 foreach tab in array array['trip_segments','trip_hub_preferences','bookings','prep_tasks','packing_lists','packing_items','budget_settings','budget_allocations','expenses'] loop
 execute format('drop policy if exists segments_private on public.%I',tab);execute format('drop policy if exists preferences_private on public.%I',tab);execute format('drop policy if exists owner_only on public.%I',tab);
 execute format('drop policy if exists shared_read on public.%I',tab);execute format('drop policy if exists shared_edit on public.%I',tab);
 execute format('create policy shared_read on public.%I for select to authenticated using(public.can_read_trip(trip_id))',tab);
 execute format('create policy shared_edit on public.%I for all to authenticated using(public.can_edit_trip(trip_id)) with check(public.can_edit_trip(trip_id))',tab);
 end loop;
end $$;
create or replace function public.preserve_trip_owner() returns trigger language plpgsql set search_path='' as $$begin if new.owner_id<>old.owner_id then raise exception 'Trip ownership cannot be changed directly';end if;return new;end $$;
create or replace trigger preserve_owner before update on public.trips for each row execute function public.preserve_trip_owner();
-- Synchronizing a reference time zone is the one narrow parent update editors may cause.
create or replace function public.sync_trip_timezone() returns trigger language plpgsql security definer set search_path='' as $$declare target uuid;zone text;begin
 target=case when tg_op='DELETE' then old.trip_id else new.trip_id end;
 if auth.uid() is not null and not public.can_edit_trip(target) then return null;end if;
 select s.timezone into zone from public.trip_segments s where s.trip_id=target and s.kind='destination' and s.status<>'idea' order by s.start_date,s.position,s.id limit 1;
 if zone is not null then update public.trips set timezone=zone where id=target and timezone<>zone;end if;
 return null;end $$;
create or replace function public.preview_trip_invitation(invite_hash text) returns jsonb language plpgsql security definer set search_path='' as $$declare invitation public.trip_invitations;account_email text;trip_name text;begin
 select lower(u.email) into account_email from auth.users u where u.id=auth.uid() and u.email_confirmed_at is not null;
 if account_email is null then return null;end if;
 select * into invitation from public.trip_invitations i where i.token_hash=invite_hash and lower(i.email)=account_email and i.expires_at>now() and (i.accepted_at is null or i.accepted_by=auth.uid());
 if invitation.id is null then return null;end if;
 select name into trip_name from public.trips where id=invitation.trip_id;
 return jsonb_build_object('trip_name',trip_name,'role',invitation.role,'expires_at',invitation.expires_at,'accepted',invitation.accepted_at is not null);
end $$;
create or replace function public.accept_trip_invitation(invite_hash text) returns uuid language plpgsql security definer set search_path='' as $$declare invitation public.trip_invitations;account_email text;begin
 select lower(u.email) into account_email from auth.users u where u.id=auth.uid() and u.email_confirmed_at is not null;
 if account_email is null then raise exception 'Verified account required';end if;
 select * into invitation from public.trip_invitations i where i.token_hash=invite_hash and lower(i.email)=account_email for update;
 if invitation.id is null or invitation.expires_at<=now() then raise exception 'Invitation unavailable or expired';end if;
 if invitation.accepted_at is not null then if invitation.accepted_by=auth.uid() then return invitation.trip_id;else raise exception 'Invitation already used';end if;end if;
 if not public.owns_trip(invitation.trip_id) then insert into public.trip_members(trip_id,user_id,role) values(invitation.trip_id,auth.uid(),invitation.role) on conflict(trip_id,user_id) do update set role=excluded.role;end if;
 update public.trip_invitations set accepted_at=now(),accepted_by=auth.uid() where id=invitation.id;
 return invitation.trip_id;
end $$;
revoke all on function public.preview_trip_invitation(text),public.accept_trip_invitation(text) from public;
grant execute on function public.preview_trip_invitation(text),public.accept_trip_invitation(text) to authenticated;
create or replace function public.record_trip_audit() returns trigger language plpgsql security definer set search_path='' as $$declare item jsonb;target uuid;entity uuid;begin
 item=case when tg_op='DELETE' then to_jsonb(old) else to_jsonb(new) end;
 target=case when tg_table_name='trips' then (item->>'id')::uuid else (item->>'trip_id')::uuid end;
 entity=coalesce(item->>'id',item->>'finding_id',item->>'trip_id')::uuid;
 insert into public.audit_events(trip_id,actor_id,entity_table,entity_id,action) values(target,auth.uid(),tg_table_name,entity,tg_op);return null;
end $$;
do $$ declare tab text;begin
 foreach tab in array array['trips','trip_members','trip_invitations','trip_segments','trip_hub_preferences','bookings','prep_tasks','packing_lists','packing_items','budget_settings','budget_allocations','expenses','saved_places','finding_decisions'] loop
 execute format('create or replace trigger record_audit after insert or update or delete on public.%I for each row execute function public.record_trip_audit()',tab);end loop;
end $$;
-- This returns only a boolean during destructive actions, never document contents or names.
create or replace function public.has_other_private_files(target uuid,booking uuid default null) returns boolean language plpgsql security definer set search_path='' as $$begin
 if not public.can_edit_trip(target) then raise exception 'Editing permission required';end if;
 return exists(select 1 from public.booking_attachments a where a.trip_id=target and (booking is null or a.booking_id=booking) and a.owner_id<>auth.uid());end $$;
revoke all on function public.has_other_private_files(uuid,uuid) from public;grant execute on function public.has_other_private_files(uuid,uuid) to authenticated;
create or replace function public.set_trip_budget(target uuid,total numeric,tier text) returns void language plpgsql security definer set search_path='' as $$begin
 if not public.can_edit_trip(target) then raise exception 'Editing permission required';end if;
 if total<0 or total>9999999999 or tier not in ('Budget','Comfort','Luxury') then raise exception 'Invalid budget';end if;
 update public.trips set budget=total,style=tier where id=target;
end $$;
revoke all on function public.set_trip_budget(uuid,numeric,text) from public;grant execute on function public.set_trip_budget(uuid,numeric,text) to authenticated;
commit;
