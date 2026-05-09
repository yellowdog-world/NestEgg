-- Storage RLS for snapshots-raw bucket
-- Path convention from app: {user_id}/{account_id}/{timestamp}.{ext}
-- → 첫 번째 폴더가 본인 user_id일 때만 접근 허용

-- 본인 폴더에 업로드 허용
create policy "snapshots-raw: own folder upload"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'snapshots-raw'
  and (storage.foldername(name))[1] = auth.uid()::text
);

-- 본인 폴더 파일 읽기 허용 (서버에서 OCR 호출 시 사용)
create policy "snapshots-raw: own folder read"
on storage.objects for select
to authenticated
using (
  bucket_id = 'snapshots-raw'
  and (storage.foldername(name))[1] = auth.uid()::text
);

-- 본인 파일 삭제 허용 (정리용)
create policy "snapshots-raw: own folder delete"
on storage.objects for delete
to authenticated
using (
  bucket_id = 'snapshots-raw'
  and (storage.foldername(name))[1] = auth.uid()::text
);
