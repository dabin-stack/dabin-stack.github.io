# 기능 계획서 — 짧은 방명록 (Guestbook)

최종 업데이트: 2026-11-06
확정 사항: **기능 = 짧은 방명록**, **배포 = Netlify**, **위치 = 홈페이지 맨 아래**

이 문서는 기능 명세와 검사 방법을 기록한다. (구현·커밋·push는 아직 하지 않음)

---

## 1. 기능 개요

포트폴리오를 본 방문자가 짧은 응원 글을 남긴다. 화면에 `별명`, `한 줄 메시지`,
`등록` 버튼과 `최근 글 목록`을 둔다.
예: `파란별: 애니메이션 제작 과정이 궁금해요.`

메인 기능은 방명록 하나(가장 작은 완성 버전)로 확정했다. 주제 투표(막대그래프)는
같은 패턴(테이블 1개 + INSERT + 집계 SELECT)으로 이후 확장 후보로만 남겨둔다.

## 2. 화면 설계 (index.html 맨 아래 `#guestbook` 섹션)

입력 영역
- 별명 입력란: `<input type="text" maxlength="12">`, placeholder "별명 (2~12자)"
- 메시지 입력란: `<input type="text" maxlength="100">`, placeholder "응원 한 줄 (1~100자)"
- 등록 버튼: `<button>등록</button>`
- 상태/에러 안내: `role="status"` + `aria-live="polite"`

결과 영역
- 최근 글 목록(최신순, 최대 20개). 각 항목: 별명 · 메시지 · 시각
- 로딩 상태 텍스트, 글이 없을 때 안내 문구

## 3. 저장할 데이터 (Supabase 테이블 `guestbook`)

| 컬럼 | 타입 | 설명 |
| --- | --- | --- |
| id | bigint (generated always as identity, PK) | 글 고유 번호 |
| nickname | text | 별명 (2~12자) |
| message | text | 메시지 (1~100자) |
| created_at | timestamptz default now() | 저장 시각 |

- 실명·연락처·이메일·IP 등은 저장하지 않는다.
- 조회: `select id, nickname, message, created_at order by created_at desc limit 20`

### Supabase 스키마 (적용 예정 SQL)

```sql
create table if not exists public.guestbook (
  id bigint generated always as identity primary key,
  nickname text not null check (char_length(nickname) between 2 and 12),
  message  text not null check (char_length(message) between 1 and 100),
  created_at timestamptz not null default now()
);

alter table public.guestbook enable row level security;

-- 읽기: 누구나 허용
create policy "guestbook_select_all"
  on public.guestbook for select
  using (true);

-- (참고) 쓰기는 서버 함수가 service role 키로 수행한다.
-- 익명(anon) 클라이언트에는 insert/update/delete 정책을 주지 않는다.
-- → anon 키로는 남의 글을 쓰거나 고치거나 지울 수 없다.
```

## 4. 성공 / 실패 동작

성공
- 검증 통과 → 서버 함수가 INSERT → 입력란 비우고 목록을 새로고침해 새 글을 맨 위에 표시 → "등록됐어요" 안내.

실패 (구분 처리)
- 빈 값 / 길이 초과 → 요청 전에 막고 입력란 옆에 사유 표시
  (예: "메시지는 1~100자로 입력해 주세요").
- 서버 검증 실패 → 서버가 400과 사유 반환, 화면에 그대로 표시.
- 네트워크·서버 오류 → "잠시 후 다시 시도해 주세요" 안내, 입력 내용은 지우지 않음.

## 5. 이중 검증 (브라우저 + 서버)

- 브라우저: trim 후 길이 검사(별명 2~12, 메시지 1~100), 공백만 입력 거부 → 즉시 피드백.
- 서버(Netlify 함수): 동일 규칙 재검사 + DB CHECK 제약으로 최종 강제.
- 이유: 브라우저 검사는 편의용이고, 실제 방어선은 서버와 DB다.

## 6. XSS 방지 (방문자 문장을 HTML로 실행하지 않음)

- 목록 렌더링 시 `innerHTML` 금지 → `textContent`(또는 createElement + textContent)만 사용.
- 그 결과 `<b>안녕</b>` 입력은 굵은 글씨로 실행되지 않고 입력한 문자 그대로 보인다.

## 7. 접근 제한 (자유 입력이므로 필수)

- Supabase anon 키는 공개되어도 되는 키지만, 그래서 RLS로 범위를 좁힌다.
- 쓰기(INSERT)는 **서버 함수만** service role 키로 수행 → 키는 브라우저에 노출하지 않는다.
- UPDATE / DELETE 엔드포인트는 만들지 않는다 → 남의 글 수정·삭제 API 없음.
- 공개 운영 전 보완 예정: 신고, 관리자 숨김(`hidden` 플래그), 반복 등록 제한(레이트 리밋).
- 수업 중에는 시험용 글만 사용한다.

## 8. 배포 구성 (Netlify) — 현재 폴더 기준

도구 확인 결과
- Node.js v24.22.1 설치됨
- npm 11.19.1 설치됨 (PowerShell 실행정책 때문에 `cmd /c npm ...` 로 실행)
- Netlify CLI 미설치 (이번 작업에 필수 아님 — Git 연동 자동 배포 방식)
- git 설치됨

추가/생성한 파일
- `package.json` — `build` 스크립트와 `@supabase/supabase-js` 의존성
- `scripts/build.mjs` — 공개 자산만 `dist/`로 복사(비공개 항목 전면 제외)
- `netlify.toml` — publish=`dist`, functions=`netlify/functions`, `/api/guestbook` 리다이렉트
- `netlify/functions/guestbook.mjs` — 서버 함수(GET 목록 / POST 등록, service role 키 사용)
- `.gitignore` — `node_modules`, `.env*`, `dist/`, `.netlify/` 제외
- `.env.example` — 필요한 환경변수 예시(실값 없음)

공개 출력(dist/) 원칙
- 포함: HTML/CSS/브라우저 JS/이미지 (현재는 자체 완결형 `index.html` 1개)
- 제외(확인 완료): `.git`, `.github`, `.gitignore`, `.kiro`, `.env*`, `.netlify`,
  `node_modules`, `netlify`(서버 함수), `scripts`, `docs`, `index-code.txt`,
  `package.json`, `netlify.toml`, `README.md`
- 서버 함수는 `netlify/functions`에 있고 `dist/`로 복사되지 않는다.

기존 배포 보존
- 루트 `index.html`은 그대로 두어 GitHub Pages(`dabin-stack.github.io`)가 계속 동작한다.
- GitHub Pages 설정은 건드리지 않는다.

## 9. Netlify 대시보드 입력값 (연동 시)

사이트 생성 → "Import an existing project" → GitHub → `dabin-stack/dabin-stack.github.io`

빌드 설정
- Branch to deploy(배포 브랜치): `main`
- Build command: `npm run build`
- Publish directory: `dist`
- Functions directory: `netlify/functions` (netlify.toml에 이미 지정됨)

환경변수 (Site settings → Environment variables)
- `SUPABASE_URL` = Supabase 프로젝트 URL
- `SUPABASE_SERVICE_ROLE_KEY` = Supabase service role 키 (브라우저에 절대 노출 금지)

## 10. 검사 방법 (Test)

빌드 검사 (완료)
- `node scripts/build.mjs` 실행 → `dist/`에 `index.html`만 생성됨 확인.
- `.kiro`, `.git`, `.env`, `docs`, `netlify`, `node_modules`, `index-code.txt`,
  `package.json`, `scripts`가 `dist/`에 없음을 확인.

기능 검사 (배포 후 또는 netlify dev 로컬)
1. 정상 등록: 별명 + "안녕하세요" 등록 → 목록 맨 위에 표시.
2. 다른 기기 확인: 휴대폰 브라우저로 같은 글이 보이는지 확인.
3. 빈 메시지: 저장되지 않고 사유 안내가 보이는지 확인.
4. 길이 초과: 별명 1자/13자, 메시지 101자 거부 확인.
5. XSS: `<b>안녕</b>` 등록 → 굵은 글씨 명령으로 실행되지 않고 문자 그대로 표시 확인.
6. 재배포 유지: 다시 배포한 뒤에도 기존 글이 그대로 남아 있는지 확인(데이터는 Supabase에 저장).
7. 집계 누락 방지: 글이 20개를 넘으면 목록 위에 "전체 N개 중 최근 20개"가
   표시되고, N이 실제 전체 개수(count)와 일치하는지 확인(배열 길이 아님).

## 12. 조회 건수 제한(누락 방지) 처리

- GET 응답은 `items`(최근 20개) + `total`(전체 개수)을 함께 반환한다.
- 전체 개수는 Supabase `count: "exact"`로 세며, limit로 받은 배열 길이가 아니라
  이 count 값을 집계/표시에 사용한다 → per-request row limit로 인한 누락 방지.

## 13. 인증(해당 없음, 조건부 설계)

- 이번 방명록은 익명 입력이라 세션/본인 행 권한 검증이 없다.
- 로그인 기능을 추가할 경우에만: 서버가 Supabase Auth JWT를 검증하고,
  `auth.uid() = user_id` RLS 정책으로 본인 데이터만 쓰기/수정 허용.

## 11. 아직 하지 않은 것 (의도적으로 보류)

- 방명록 UI(`#guestbook` 섹션)와 브라우저 JS를 `index.html`에 아직 추가하지 않음.
- Supabase 테이블/정책 실제 생성 아직 안 함.
- 의존성 설치(`npm install`) 및 커밋·push 아직 안 함.
- 다음 단계에서 사용자 확인 후 구현한다.
