-- Run in the Supabase SQL Editor to enable course CRUD and student assignments.
-- Existing IDs are preserved; new course and student IDs are generated automatically.
create sequence if not exists public.course_course_id_seq;

select setval(
  'public.course_course_id_seq',
  greatest(
    coalesce((select max(course_id) from public.course), 0) + 1,
    (select last_value + is_called::integer from public.course_course_id_seq)
  ),
  false
);

alter table public.course
  alter column course_id set default nextval('public.course_course_id_seq');

alter sequence public.course_course_id_seq owned by public.course.course_id;

create sequence if not exists public.student_student_id_seq;

select setval(
  'public.student_student_id_seq',
  greatest(
    coalesce((select max(student_id) from public.student), 0) + 1,
    (select last_value + is_called::integer from public.student_student_id_seq)
  ),
  false
);

alter table public.student
  alter column student_id set default nextval('public.student_student_id_seq');

alter sequence public.student_student_id_seq owned by public.student.student_id;

alter table public.student
  add column if not exists course_id integer;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'student_course_id_fkey'
      and conrelid = 'public.student'::regclass
  ) then
    alter table public.student
      add constraint student_course_id_fkey
      foreign key (course_id) references public.course(course_id);
  end if;
end $$;

drop policy if exists course_admin_all on public.course;
create policy course_admin_all
  on public.course
  for all
  to authenticated
  using (public.app_role() = 'Admin')
  with check (public.app_role() = 'Admin');

drop policy if exists student_select_admin on public.student;
create policy student_select_admin
  on public.student
  for select
  to authenticated
  using (public.app_role() = 'Admin');

drop policy if exists student_insert_admin on public.student;
create policy student_insert_admin
  on public.student
  for insert
  to authenticated
  with check (public.app_role() = 'Admin');

drop policy if exists student_update_admin on public.student;
create policy student_update_admin
  on public.student
  for update
  to authenticated
  using (public.app_role() = 'Admin')
  with check (public.app_role() = 'Admin');