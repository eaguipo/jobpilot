-- Resume file uploads (story 11).
--
-- A private Storage bucket holding each user's original resume file. The browser uploads
-- straight to Storage (a 5 MB file is too big to pass through a Vercel function), then
-- the server reads it back with the user's own session to extract the text.
--
-- Each user may keep exactly one file per type, at <user id>/resume.pdf or
-- <user id>/resume.docx, so nobody can fill the bucket with other files or write into
-- someone else's folder. Size and type are also enforced by the bucket itself.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'resumes', 'resumes', false, 5 * 1024 * 1024,
  array['application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document']
)
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- True when `name` is one of the signed-in user's two allowed resume paths.
create function public.is_own_resume_path(name text) returns boolean
language sql stable set search_path = '' as $$
  select auth.uid() is not null
     and name in (auth.uid()::text || '/resume.pdf', auth.uid()::text || '/resume.docx')
$$;
revoke all on function public.is_own_resume_path(text) from public, anon;
grant execute on function public.is_own_resume_path(text) to authenticated;

create policy "resumes: read own" on storage.objects
  for select to authenticated
  using (bucket_id = 'resumes' and public.is_own_resume_path(name));
create policy "resumes: upload own" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'resumes' and public.is_own_resume_path(name));
create policy "resumes: replace own" on storage.objects
  for update to authenticated
  using (bucket_id = 'resumes' and public.is_own_resume_path(name))
  with check (bucket_id = 'resumes' and public.is_own_resume_path(name));
create policy "resumes: delete own" on storage.objects
  for delete to authenticated
  using (bucket_id = 'resumes' and public.is_own_resume_path(name));
