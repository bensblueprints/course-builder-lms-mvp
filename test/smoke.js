// Lessonforge smoke test — boots the real server on a temp DB and exercises
// course → module → lesson authoring (with XSS sanitization asserted),
// student signup → access-code enrollment → progress → quiz scoring with
// exact-number assertions → certificate PDF at 100%. Stripe is NEVER called:
// no key is configured, so checkout must 503 before any network request.
// Kills ONLY the spawned server child.
const { spawn } = require('node:child_process');
const path = require('node:path');
const fs = require('node:fs');
const assert = require('node:assert');

const ROOT = path.join(__dirname, '..');
const TEST_PORT = 5465; // offset port — other build agents run concurrently
const ADMIN_PASSWORD = 'smoke-test-password';
const DB_PATH = path.join(__dirname, 'smoke.db');
const BASE = `http://127.0.0.1:${TEST_PORT}`;

for (const f of [DB_PATH, DB_PATH + '-wal', DB_PATH + '-shm']) {
  if (fs.existsSync(f)) fs.unlinkSync(f);
}
const UPLOADS = path.join(__dirname, 'uploads');

let serverProc = null;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function waitFor(fn, label, tries = 40, delay = 250) {
  for (let i = 0; i < tries; i++) {
    try { const v = await fn(); if (v) return v; } catch { /* retry */ }
    await sleep(delay);
  }
  throw new Error(`Timed out waiting for: ${label}`);
}

// Two independent cookie jars: instructor + student.
function makeClient() {
  let cookie = '';
  return async function api(pathname, options = {}) {
    const res = await fetch(BASE + pathname, {
      ...options,
      headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}), ...options.headers },
      body: options.body ? JSON.stringify(options.body) : undefined
    });
    const setCookie = res.headers.get('set-cookie');
    if (setCookie) cookie = setCookie.split(';')[0];
    const ct = res.headers.get('content-type') || '';
    const data = ct.includes('json') ? await res.json().catch(() => ({})) : await res.arrayBuffer();
    return { status: res.status, data, headers: res.headers };
  };
}

async function main() {
  console.log('1. Booting Lessonforge on port', TEST_PORT, '(no Stripe key — payments disabled)');
  serverProc = spawn(process.execPath, ['server/index.js'], {
    cwd: ROOT,
    env: {
      ...process.env,
      PORT: String(TEST_PORT),
      ADMIN_PASSWORD,
      DB_PATH,
      STRIPE_SECRET_KEY: '' // explicit: checkout must fail fast, no API calls
    },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  serverProc.stdout.on('data', (d) => process.stdout.write(`   [server] ${d}`));
  serverProc.stderr.on('data', (d) => process.stderr.write(`   [server] ${d}`));

  const admin = makeClient();
  const student = makeClient();

  await waitFor(async () => (await admin('/api/health')).data.ok, 'server health');

  console.log('   Auth: wrong password → 401, unauthenticated → 401, login → 200');
  assert.strictEqual((await admin('/api/login', { method: 'POST', body: { password: 'nope' } })).status, 401);
  assert.strictEqual((await admin('/api/courses')).status, 401);
  assert.strictEqual((await admin('/api/login', { method: 'POST', body: { password: ADMIN_PASSWORD } })).status, 200);

  console.log('2. Build a course: 2 modules, 3 lessons, quiz with pass threshold 70%');
  const course = (await admin('/api/courses', {
    method: 'POST', body: { title: 'SQLite Mastery', description: 'Own your database.', price_cents: 4900 }
  })).data;
  assert.ok(course.id && /^FORGE-[A-Z2-9]{6}$/.test(course.access_code), 'course must get an access code');

  const mod1 = (await admin(`/api/courses/${course.id}/modules`, { method: 'POST', body: { title: 'Basics', quiz_pass_pct: 70 } })).data;
  const mod2 = (await admin(`/api/courses/${course.id}/modules`, { method: 'POST', body: { title: 'Advanced' } })).data;

  const l1 = (await admin(`/api/modules/${mod1.id}/lessons`, {
    method: 'POST',
    body: { title: 'Intro', type: 'text', content: '<h2>Welcome</h2><p>Hello <b>students</b>!</p>' }
  })).data;
  const l2 = (await admin(`/api/modules/${mod1.id}/lessons`, {
    method: 'POST',
    body: { title: 'Watch this', type: 'video', content: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ' }
  })).data;
  const l3 = (await admin(`/api/modules/${mod2.id}/lessons`, {
    method: 'POST',
    body: { title: 'Deep dive', type: 'text', content: '<p>Advanced stuff.</p>' }
  })).data;

  console.log('3. XSS sanitization: script/onerror/javascript: all stripped server-side');
  const evil = (await admin(`/api/modules/${mod1.id}/lessons`, {
    method: 'POST',
    body: {
      title: 'Evil lesson',
      type: 'text',
      content: `<p>ok</p><script>window.__pwned=1</script><img src="javascript:alert(1)" onerror="alert(2)"><a href="javascript:alert(3)">x</a><iframe src="https://evil.example"></iframe>`
    }
  })).data;
  assert.ok(!evil.content.includes('<script'), 'script tag must be stripped');
  assert.ok(!evil.content.includes('__pwned'), 'script BODY must be stripped too');
  assert.ok(!evil.content.includes('onerror'), 'event handler attribute must be stripped');
  assert.ok(!evil.content.toLowerCase().includes('javascript:'), 'javascript: URLs must be stripped');
  assert.ok(!evil.content.includes('<iframe'), 'iframe must be stripped');
  assert.ok(evil.content.includes('<p>ok</p>'), 'safe markup must survive');
  await admin(`/api/lessons/${evil.id}`, { method: 'DELETE' }); // keep counts clean

  console.log('4. Quiz authoring: 3 questions (2 MC + 1 TF)');
  await admin(`/api/modules/${mod1.id}/questions`, {
    method: 'POST', body: { question: 'What is SQLite?', type: 'mc', options: ['A database', 'A fish', 'A browser'], correct_index: 0 }
  });
  await admin(`/api/modules/${mod1.id}/questions`, {
    method: 'POST', body: { question: 'WAL stands for?', type: 'mc', options: ['Write-Ahead Log', 'Wide Area Link'], correct_index: 0 }
  });
  await admin(`/api/modules/${mod1.id}/questions`, {
    method: 'POST', body: { question: 'SQLite is serverless.', type: 'tf', correct_index: 0 }
  });

  console.log('5. Reorder lessons in module 1 and verify positions');
  await admin(`/api/modules/${mod1.id}/lessons/reorder`, { method: 'PUT', body: { ids: [l2.id, l1.id] } });
  const tree = (await admin(`/api/courses/${course.id}`)).data;
  assert.strictEqual(tree.modules[0].lessons[0].id, l2.id, 'reorder must put video lesson first');
  assert.strictEqual(tree.lesson_count, 3);

  console.log('6. Student signup + access-code enrollment');
  const su = await student('/api/student/signup', {
    method: 'POST', body: { email: 'ada@example.com', name: 'Ada Lovelace', password: 'hunter22' }
  });
  assert.strictEqual(su.status, 201);
  assert.strictEqual((await student('/api/student/enroll', { method: 'POST', body: { access_code: 'FORGE-WRONG1' } })).status, 404);
  const enr = await student('/api/student/enroll', { method: 'POST', body: { access_code: course.access_code } });
  assert.strictEqual(enr.status, 201);
  assert.strictEqual(enr.data.course_title, 'SQLite Mastery');
  assert.strictEqual((await student('/api/student/enroll', { method: 'POST', body: { access_code: course.access_code } })).status, 409, 'double enroll must 409');

  console.log('7. Student course view hides quiz answers');
  const sc = (await student(`/api/student/courses/${course.id}`)).data;
  assert.strictEqual(sc.access_code, undefined, 'students must not see the access code');
  for (const m of sc.modules) for (const q of m.quiz_questions) {
    assert.strictEqual(q.correct_index, undefined, 'correct answers must be hidden from students');
  }
  assert.strictEqual(sc.completion_pct, 0);

  console.log('8. Progress: exact completion percentages (0 → 33 → 67 → 100)');
  let r = (await student(`/api/student/lessons/${l1.id}/complete`, { method: 'POST' })).data;
  assert.strictEqual(r.completion_pct, 33, '1/3 lessons = 33%');
  r = (await student(`/api/student/lessons/${l2.id}/complete`, { method: 'POST' })).data;
  assert.strictEqual(r.completion_pct, 67, '2/3 lessons = 67%');
  // certificate must refuse before 100%
  assert.strictEqual((await student(`/api/student/courses/${course.id}/certificate`)).status, 403);
  r = (await student(`/api/student/lessons/${l3.id}/complete`, { method: 'POST' })).data;
  assert.strictEqual(r.completion_pct, 100, '3/3 lessons = 100%');
  // idempotent complete
  r = (await student(`/api/student/lessons/${l3.id}/complete`, { method: 'POST' })).data;
  assert.strictEqual(r.completion_pct, 100, 'double-complete must stay 100%');

  console.log('9. Quiz scoring: 2/3 correct = 67% < 70% → fail; 3/3 = 100% → pass; retakes logged');
  let quiz = (await student(`/api/student/modules/${mod1.id}/quiz`, { method: 'POST', body: { answers: [0, 0, 1] } })).data;
  assert.strictEqual(quiz.score, 67, '2 of 3 correct must score exactly 67');
  assert.strictEqual(quiz.correct, 2);
  assert.strictEqual(quiz.passed, false, '67 < 70 threshold must fail');
  assert.strictEqual(quiz.attempt, 1);
  quiz = (await student(`/api/student/modules/${mod1.id}/quiz`, { method: 'POST', body: { answers: [0, 0, 0] } })).data;
  assert.strictEqual(quiz.score, 100);
  assert.strictEqual(quiz.passed, true);
  assert.strictEqual(quiz.attempt, 2, 'retake must be attempt #2');
  const badLen = await student(`/api/student/modules/${mod1.id}/quiz`, { method: 'POST', body: { answers: [0] } });
  assert.strictEqual(badLen.status, 400, 'wrong answer count must 400');

  console.log('10. Certificate: real PDF streamed at 100%');
  const cert2 = await student(`/api/student/courses/${course.id}/certificate`);
  assert.strictEqual(cert2.status, 200, 'certificate must 200 at 100%');
  assert.ok((cert2.headers.get('content-type') || '').includes('pdf'), 'must be a PDF');
  const buf = Buffer.from(cert2.data);
  assert.ok(buf.length > 1000, 'PDF must have substance');
  assert.strictEqual(buf.subarray(0, 5).toString(), '%PDF-', 'must start with %PDF-');

  console.log('11. Paid checkout WITHOUT Stripe key → 503, no payment API call, nothing enrolled');
  const paidCourse = (await admin('/api/courses', { method: 'POST', body: { title: 'Paid Course', price_cents: 9900 } })).data;
  const co = await student('/api/student/checkout', { method: 'POST', body: { course_id: paidCourse.id } });
  assert.strictEqual(co.status, 503, 'checkout without a key must 503 before any network call');
  assert.ok(co.data.error.includes('payments not configured'));

  console.log('12. Instructor stats: exact numbers');
  const stats = (await admin('/api/stats')).data;
  const s = stats.find((x) => x.course_id === course.id);
  assert.strictEqual(s.enrollment_count, 1);
  assert.strictEqual(s.avg_completion_pct, 100);
  assert.strictEqual(s.completed_count, 1);
  assert.strictEqual(s.completion_rate_pct, 100);
  assert.strictEqual(s.revenue_cents, 0);

  console.log('13. Rows persisted in SQLite');
  const Database = require('better-sqlite3');
  const db = new Database(DB_PATH, { readonly: true });
  assert.strictEqual(db.prepare('SELECT COUNT(*) AS n FROM progress').get().n, 3);
  assert.strictEqual(db.prepare('SELECT COUNT(*) AS n FROM quiz_attempts').get().n, 2);
  assert.strictEqual(db.prepare('SELECT COUNT(*) AS n FROM enrollments').get().n, 1);
  assert.strictEqual(db.prepare('SELECT COUNT(*) AS n FROM payments').get().n, 0, 'no payment rows — Stripe never touched');
  db.close();

  console.log('\n✅ All Lessonforge smoke tests passed (zero payment API calls)');
}

async function cleanup(code) {
  if (serverProc && !serverProc.killed) serverProc.kill(); // ONLY the spawned child
  await sleep(300);
  for (const f of [DB_PATH, DB_PATH + '-wal', DB_PATH + '-shm']) {
    try { if (fs.existsSync(f)) fs.unlinkSync(f); } catch { /* windows lock */ }
  }
  try { fs.rmSync(UPLOADS, { recursive: true, force: true }); } catch { /* fine */ }
  process.exit(code);
}

main()
  .then(() => cleanup(0))
  .catch(async (err) => {
    console.error('\n❌ Smoke test failed:', err.message);
    await cleanup(1);
  });
