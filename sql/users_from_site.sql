-- Lets an Admin create logins from the website (Users page > "+ Add user").
-- Run ONCE in Supabase > SQL Editor.  Safe to re-run.
--
-- New logins now start as INACTIVE. That matters because the Users page creates
-- them with the public "anon" key, which anyone could also use to sign up.
-- An inactive account has no access to anything until an Admin activates it.
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.users (user_id, full_name, email, status)
  values (
    new.id,
    coalesce(nullif(new.raw_user_meta_data ->> 'full_name', ''), split_part(new.email, '@', 1)),
    new.email,
    'Inactive'
  )
  on conflict do nothing;
  return new;
end $$;

-- (the trigger itself already exists from roles.sql; this just replaces its function)
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
