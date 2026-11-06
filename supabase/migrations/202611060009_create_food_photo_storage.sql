alter table public.food_entries add column photo_path text;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('food-photos', 'food-photos', false, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update set public = excluded.public, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

create policy "food_photos_select_own" on storage.objects for select to authenticated
using (bucket_id = 'food-photos' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "food_photos_insert_own" on storage.objects for insert to authenticated
with check (bucket_id = 'food-photos' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "food_photos_update_own" on storage.objects for update to authenticated
using (bucket_id = 'food-photos' and (storage.foldername(name))[1] = (select auth.uid())::text)
with check (bucket_id = 'food-photos' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "food_photos_delete_own" on storage.objects for delete to authenticated
using (bucket_id = 'food-photos' and (storage.foldername(name))[1] = (select auth.uid())::text);
