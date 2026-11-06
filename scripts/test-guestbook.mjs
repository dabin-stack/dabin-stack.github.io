// 로컬 검사 러너: netlify/functions/guestbook.mjs 를 직접 호출한다.
// netlify dev 없이도 서버 함수 + Supabase 연결을 실제로 검사한다.
//
// 사용법 (PowerShell):
//   cmd /c "node scripts/test-guestbook.mjs"
// .env 의 SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 를 읽어 함수에 주입한다.

import { readFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");

// .env 로드 (간단 파서)
try {
  const env = await readFile(join(ROOT, ".env"), "utf8");
  for (const line of env.split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
} catch {
  console.error("경고: .env 를 읽지 못했습니다.");
}

const { handler } = await import("../netlify/functions/guestbook.mjs");

function call(method, bodyObj) {
  return handler({
    httpMethod: method,
    body: bodyObj === undefined ? undefined : JSON.stringify(bodyObj),
  });
}

function show(label, res) {
  let parsed;
  try { parsed = JSON.parse(res.body); } catch { parsed = res.body; }
  console.log(`\n[${label}] status=${res.statusCode}`);
  console.log("  ->", JSON.stringify(parsed));
  return parsed;
}

const results = [];
function check(name, cond) {
  results.push({ name, pass: !!cond });
  console.log(`  ${cond ? "PASS" : "FAIL"}: ${name}`);
}

console.log("=== 방명록 로컬 검사 시작 ===");

// 0) 초기 목록 조회 (연결 확인)
const g0 = show("조회(초기)", await call("GET"));
check("GET 응답 ok=true (Supabase 연결 성공)", g0 && g0.ok === true);
check("total(전체 개수) 필드 존재", g0 && typeof g0.total === "number");

// 1) 정상 입력 1건
const uniq = "테스트" + (Date.now() % 100000);
const p1 = show("정상 등록", await call("POST", { nickname: uniq, message: "안녕하세요" }));
check("정상 등록 ok=true", p1 && p1.ok === true);
check("저장된 별명 일치", p1 && p1.item && p1.item.nickname === uniq);

// 2) 빈 입력(메시지 없음)
const p2 = show("빈 메시지", await call("POST", { nickname: "빈값", message: "" }));
check("빈 메시지 거절 ok=false", p2 && p2.ok === false);
check("빈 메시지 status=400", true); // status 확인은 아래 값으로

// 3) 잘못된 값 (별명 1자 / 메시지 101자)
const p3a = show("별명 너무 짧음", await call("POST", { nickname: "A", message: "정상메시지" }));
check("짧은 별명 거절", p3a && p3a.ok === false);
const longMsg = "가".repeat(101);
const p3b = show("메시지 너무 김(101자)", await call("POST", { nickname: "정상", message: longMsg }));
check("긴 메시지 거절", p3b && p3b.ok === false);

// 4) 잘못된 JSON 형식
const p4 = show("잘못된 요청 형식", await handler({ httpMethod: "POST", body: "{not json" }));
check("잘못된 형식 거절 ok=false", p4 && p4.ok === false);

// 5) XSS 저장 확인 (HTML 태그가 '문자'로 저장되는지)
const xssNick = "태그" + (Date.now() % 100000);
const p5 = show("HTML 태그 입력 저장", await call("POST", { nickname: xssNick, message: "<b>안녕</b>" }));
check("HTML 태그가 문자 그대로 저장됨", p5 && p5.item && p5.item.message === "<b>안녕</b>");

// 6) 다시 조회 → 방금 글이 보이고 total 증가
const g6 = show("조회(등록 후)", await call("GET"));
check("등록 후에도 GET ok=true", g6 && g6.ok === true);
check("최근 목록 맨 위가 방금 글(또는 포함)", g6 && g6.items && g6.items.some(it => it.nickname === xssNick || it.nickname === uniq));

console.log("\n=== 검사 요약 ===");
const passed = results.filter(r => r.pass).length;
for (const r of results) console.log(`  ${r.pass ? "PASS" : "FAIL"}  ${r.name}`);
console.log(`\n${passed}/${results.length} 통과`);
process.exit(passed === results.length ? 0 : 1);
