-- 방명록(guestbook) 스키마 + 접근 제한(RLS)
-- 적용 방법: Supabase 대시보드 → SQL Editor → New query → 아래 전체 붙여넣기 → Run
--
-- 설계 요약 (docs/feature-plan.md 참고)
-- - 저장 항목: id(고유번호), nickname(별명), message(메시지), created_at(저장 시각)
-- - 길이 규칙: 별명 2~12자, 메시지 1~100자 (DB CHECK 제약으로 최종 강제)
-- - 쓰기는 Netlify 서버 함수가 service role 키로만 수행한다.
--   익명(anon) 클라이언트에는 insert/update/delete 정책을 주지 않는다.
--   → 누구도 anon 키로 남의 글을 쓰거나 고치거나 지울 수 없다.

create table if not exists public.guestbook (
  id         bigint generated always as identity primary key,
  nickname   text not null check (char_length(nickname) between 2 and 12),
  message    text not null check (char_length(message)  between 1 and 100),
  created_at timestamptz not null default now()
);

-- 최근 글 조회 성능용 인덱스 (created_at 내림차순)
create index if not exists guestbook_created_at_idx
  on public.guestbook (created_at desc);

-- 행 수준 보안 켜기
alter table public.guestbook enable row level security;

-- 읽기: 누구나 허용 (방명록은 공개 목록)
drop policy if exists "guestbook_select_all" on public.guestbook;
create policy "guestbook_select_all"
  on public.guestbook
  for select
  using (true);

-- 쓰기(insert) / 수정(update) / 삭제(delete) 정책은 만들지 않는다.
-- service role 키는 RLS를 우회하므로 서버 함수의 insert는 정상 동작하고,
-- 공개된 anon 키로는 어떤 쓰기도 할 수 없다.

-- 확인용 조회 (선택)
-- select id, nickname, message, created_at
-- from public.guestbook
-- order by created_at desc
-- limit 20;
