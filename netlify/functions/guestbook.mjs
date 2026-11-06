// Netlify serverless function: guestbook API.
//
// SECURITY / DESIGN (see docs/feature-plan.md):
// - This file runs on the server only. It is in netlify/functions, which is
//   OUTSIDE the static publish folder (dist/), so it is never served as a
//   static asset and its secrets never reach the browser.
// - Supabase is accessed with the SERVICE ROLE key from an environment
//   variable. The service key is NEVER embedded in browser JS.
// - Only two actions are exposed: GET recent messages, POST a new message.
//   There is intentionally NO update and NO delete endpoint, so no one can
//   edit or remove other people's posts through this API.
// - Server-side validation mirrors the browser checks (defense in depth):
//   nickname 2–12 chars, message 1–100 chars, trimmed, non-empty.
// - Values are stored as plain text. The browser renders them with
//   textContent (never innerHTML), so "<b>…</b>" shows as literal characters.
// - The GET response includes an exact total count so aggregates are not
//   silently truncated by the per-request row limit.
// - AUTH: this guestbook is intentionally anonymous (no login). There is no
//   user session to verify and no per-user row ownership. If login is added
//   later, the server must verify the Supabase Auth session (JWT) and enforce
//   `auth.uid() = user_id` row policies before any write. (See feature-plan.md)

import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const NICK_MIN = 2;
const NICK_MAX = 12;
const MSG_MIN = 1;
const MSG_MAX = 100;
const LIST_LIMIT = 20;

const JSON_HEADERS = {
  "Content-Type": "application/json; charset=utf-8",
  "Cache-Control": "no-store",
};

function json(statusCode, body) {
  return { statusCode, headers: JSON_HEADERS, body: JSON.stringify(body) };
}

function getClient() {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error("Supabase env vars are not configured.");
  }
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });
}

export async function handler(event) {
  try {
    const supabase = getClient();

    if (event.httpMethod === "GET") {
      // 최근 LIST_LIMIT개를 보여주되, 전체 개수(count)도 함께 반환한다.
      // Supabase/PostgREST는 기본 조회 건수 제한이 있으므로, 전체를 세어야 하는
      // 집계는 limit로 받은 배열 길이가 아니라 count 값을 사용해 누락을 막는다.
      const { data, error, count } = await supabase
        .from("guestbook")
        .select("id, nickname, message, created_at", { count: "exact" })
        .order("created_at", { ascending: false })
        .range(0, LIST_LIMIT - 1);
      if (error) return json(500, { ok: false, error: "목록을 불러오지 못했습니다." });
      return json(200, { ok: true, items: data ?? [], total: count ?? (data ? data.length : 0) });
    }

    if (event.httpMethod === "POST") {
      let payload;
      try {
        payload = JSON.parse(event.body || "{}");
      } catch {
        return json(400, { ok: false, error: "잘못된 요청 형식입니다." });
      }

      const nickname = String(payload.nickname ?? "").trim();
      const message = String(payload.message ?? "").trim();

      // Server-side validation (mirrors the browser checks).
      if (nickname.length < NICK_MIN || nickname.length > NICK_MAX) {
        return json(400, { ok: false, error: `별명은 ${NICK_MIN}~${NICK_MAX}자로 입력해 주세요.` });
      }
      if (message.length < MSG_MIN || message.length > MSG_MAX) {
        return json(400, { ok: false, error: `메시지는 ${MSG_MIN}~${MSG_MAX}자로 입력해 주세요.` });
      }

      const { data, error } = await supabase
        .from("guestbook")
        .insert({ nickname, message })
        .select("id, nickname, message, created_at")
        .single();

      if (error) return json(500, { ok: false, error: "저장에 실패했습니다. 잠시 후 다시 시도해 주세요." });
      return json(201, { ok: true, item: data });
    }

    return json(405, { ok: false, error: "지원하지 않는 메서드입니다." });
  } catch (err) {
    return json(500, { ok: false, error: "서버 설정 오류입니다." });
  }
}
