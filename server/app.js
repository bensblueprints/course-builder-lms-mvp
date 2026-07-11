const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const express = require('express');
const cookieParser = require('cookie-parser');
const multer = require('multer');
const { openDb, genToken, genAccessCode, hashPassword, verifyPassword } = require('./db');
const { sanitizeHtml } = require('./sanitize');
const { streamCertificate } = require('./certificate');

const ADMIN_COOKIE = 'lf_admin';
const STUDENT_COOKIE = 'lf_student';

function createApp({
  dbPath,
  adminPassword,
  autologinToken = null,
  uploadsDir = null,
  stripeSecretKey = process.env.STRIPE_SECRET_KEY || '',
  baseUrl = process.env.BASE_URL || ''
} = {}) {
  const db = openDb(dbPath);
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', true);
  app.use(cookieParser());
  app.use(express.json({ limit: '2mb' }));
  app.locals.db = db;

  const UPLOADS = uploadsDir || path.join(path.dirname(path.resolve(dbPath)), 'uploads');
  fs.mkdirSync(UPLOADS, { recursive: true });
  const upload = multer({
    storage: multer.diskStorage({
      destination: (req, file, cb) => cb(null, UPLOADS),
      filename: (req, file, cb) => cb(null, `${genToken(16)}${path.extname(file.originalname).slice(0, 10)}`)
    }),
    limits: { fileSize: 500 * 1024 * 1024 } // 500MB — self-hosted video lessons
  });

  // ── auth helpers ────────────────────────────────────────────────────────────
  function requireAdmin(req, res, next) {
    const token = req.cookies[ADMIN_COOKIE];
    if (token && db.prepare('SELECT id FROM sessions WHERE token = ?').get(token)) return next();
    res.status(401).json({ error: 'unauthorized' });
  }

  function getStudent(req) {
    const token = req.cookies[STUDENT_COOKIE];
    if (!token) return null;
    const row = db.prepare(`
      SELECT st.* FROM student_sessions ss JOIN students st ON st.id = ss.student_id WHERE ss.token = ?
    `).get(token);
    return row || null;
  }

  function requireStudent(req, res, next) {
    const student = getStudent(req);
    if (!student) return res.status(401).json({ error: 'unauthorized' });
    req.student = student;
    next();
  }

  function requireAnyAuth(req, res, next) {
    const token = req.cookies[ADMIN_COOKIE];
    if (token && db.prepare('SELECT id FROM sessions WHERE token = ?').get(token)) return next();
    if (getStudent(req)) return next();
    res.status(401).json({ error: 'unauthorized' });
  }

  function createAdminSession(res) {
    const token = crypto.randomBytes(32).toString('hex');
    db.prepare('INSERT INTO sessions (token, created_at) VALUES (?, ?)').run(token, Date.now());
    res.cookie(ADMIN_COOKIE, token, { httpOnly: true, sameSite: 'lax' });
  }

  function createStudentSession(res, studentId) {
    const token = crypto.randomBytes(32).toString('hex');
    db.prepare('INSERT INTO student_sessions (token, student_id, created_at) VALUES (?, ?, ?)')
      .run(token, studentId, Date.now());
    res.cookie(STUDENT_COOKIE, token, { httpOnly: true, sameSite: 'lax' });
  }

  // ── shared queries / serializers ────────────────────────────────────────────
  const courseById = db.prepare('SELECT * FROM courses WHERE id = ?');
  const moduleById = db.prepare('SELECT * FROM modules WHERE id = ?');
  const lessonById = db.prepare('SELECT * FROM lessons WHERE id = ?');
  const modulesOf = db.prepare('SELECT * FROM modules WHERE course_id = ? ORDER BY position, id');
  const lessonsOf = db.prepare('SELECT * FROM lessons WHERE module_id = ? ORDER BY position, id');
  const questionsOf = db.prepare('SELECT * FROM quiz_questions WHERE module_id = ? ORDER BY position, id');
  const attachmentsOf = db.prepare('SELECT id, lesson_id, filename, size_bytes FROM attachments WHERE lesson_id = ? ORDER BY id');
  const enrollmentFor = db.prepare('SELECT * FROM enrollments WHERE course_id = ? AND student_email = ?');

  function courseLessonCount(courseId) {
    return db.prepare(`
      SELECT COUNT(*) AS n FROM lessons l JOIN modules m ON m.id = l.module_id WHERE m.course_id = ?
    `).get(courseId).n;
  }

  function completedCount(enrollmentId) {
    return db.prepare('SELECT COUNT(*) AS n FROM progress WHERE enrollment_id = ?').get(enrollmentId).n;
  }

  function completionPct(enrollment, courseId) {
    const total = courseLessonCount(courseId);
    if (!total) return 0;
    return Math.round((completedCount(enrollment.id) / total) * 100);
  }

  // Course tree. forStudent=true strips correct answers from quiz questions.
  function courseTree(course, { forStudent = false } = {}) {
    const modules = modulesOf.all(course.id).map((m) => ({
      ...m,
      lessons: lessonsOf.all(m.id).map((l) => ({ ...l, attachments: attachmentsOf.all(l.id) })),
      quiz_questions: questionsOf.all(m.id).map((q) => {
        const base = {
          id: q.id, module_id: q.module_id, question: q.question, type: q.type,
          options: JSON.parse(q.options_json || '[]'), position: q.position
        };
        return forStudent ? base : { ...base, correct_index: q.correct_index };
      })
    }));
    const out = { ...course, modules, lesson_count: courseLessonCount(course.id) };
    if (forStudent) delete out.access_code;
    return out;
  }

  // ── health + admin auth ─────────────────────────────────────────────────────
  app.get('/api/health', (req, res) => res.json({ ok: true, app: 'lessonforge' }));

  app.post('/api/login', (req, res) => {
    if ((req.body || {}).password !== adminPassword) return res.status(401).json({ error: 'wrong password' });
    createAdminSession(res);
    res.json({ ok: true });
  });

  app.post('/api/logout', (req, res) => {
    const token = req.cookies[ADMIN_COOKIE];
    if (token) db.prepare('DELETE FROM sessions WHERE token = ?').run(token);
    res.clearCookie(ADMIN_COOKIE);
    res.json({ ok: true });
  });

  // Desktop mode auto-login (Electron passes a one-shot token).
  app.get('/auth/auto', (req, res) => {
    if (autologinToken && req.query.token === autologinToken) createAdminSession(res);
    res.redirect('/');
  });

  app.get('/api/me', requireAdmin, (req, res) => res.json({ ok: true, role: 'instructor' }));

  // ── courses (admin) ─────────────────────────────────────────────────────────
  app.get('/api/courses', requireAdmin, (req, res) => {
    const rows = db.prepare('SELECT * FROM courses ORDER BY created_at DESC').all();
    res.json(rows.map((c) => ({
      ...c,
      module_count: db.prepare('SELECT COUNT(*) AS n FROM modules WHERE course_id = ?').get(c.id).n,
      lesson_count: courseLessonCount(c.id),
      enrollment_count: db.prepare('SELECT COUNT(*) AS n FROM enrollments WHERE course_id = ?').get(c.id).n
    })));
  });

  app.post('/api/courses', requireAdmin, (req, res) => {
    const title = String((req.body || {}).title || '').trim();
    if (!title) return res.status(400).json({ error: 'title is required' });
    const price = Math.max(0, Math.floor(Number(req.body.price_cents) || 0));
    const info = db.prepare(`
      INSERT INTO courses (title, description, price_cents, access_code, published, created_at)
      VALUES (?, ?, ?, ?, 1, ?)
    `).run(title, String(req.body.description || ''), price, genAccessCode(), Date.now());
    res.status(201).json(courseTree(courseById.get(info.lastInsertRowid)));
  });

  app.get('/api/courses/:id', requireAdmin, (req, res) => {
    const course = courseById.get(req.params.id);
    if (!course) return res.status(404).json({ error: 'not found' });
    res.json(courseTree(course));
  });

  app.put('/api/courses/:id', requireAdmin, (req, res) => {
    const course = courseById.get(req.params.id);
    if (!course) return res.status(404).json({ error: 'not found' });
    const b = req.body || {};
    const title = b.title !== undefined ? String(b.title).trim() : course.title;
    if (!title) return res.status(400).json({ error: 'title is required' });
    db.prepare('UPDATE courses SET title = ?, description = ?, price_cents = ?, published = ? WHERE id = ?').run(
      title,
      b.description !== undefined ? String(b.description) : course.description,
      b.price_cents !== undefined ? Math.max(0, Math.floor(Number(b.price_cents) || 0)) : course.price_cents,
      b.published !== undefined ? (b.published ? 1 : 0) : course.published,
      course.id
    );
    res.json(courseTree(courseById.get(course.id)));
  });

  app.delete('/api/courses/:id', requireAdmin, (req, res) => {
    const course = courseById.get(req.params.id);
    if (!course) return res.status(404).json({ error: 'not found' });
    const tx = db.transaction(() => {
      for (const m of modulesOf.all(course.id)) deleteModuleCascade(m.id);
      for (const e of db.prepare('SELECT id FROM enrollments WHERE course_id = ?').all(course.id)) {
        db.prepare('DELETE FROM progress WHERE enrollment_id = ?').run(e.id);
        db.prepare('DELETE FROM quiz_attempts WHERE enrollment_id = ?').run(e.id);
      }
      db.prepare('DELETE FROM enrollments WHERE course_id = ?').run(course.id);
      db.prepare('DELETE FROM courses WHERE id = ?').run(course.id);
    });
    tx();
    res.json({ ok: true });
  });

  // ── modules ─────────────────────────────────────────────────────────────────
  function deleteModuleCascade(moduleId) {
    for (const l of lessonsOf.all(moduleId)) deleteLessonCascade(l.id);
    db.prepare('DELETE FROM quiz_questions WHERE module_id = ?').run(moduleId);
    db.prepare('DELETE FROM quiz_attempts WHERE module_id = ?').run(moduleId);
    db.prepare('DELETE FROM modules WHERE id = ?').run(moduleId);
  }

  function deleteLessonCascade(lessonId) {
    for (const a of db.prepare('SELECT * FROM attachments WHERE lesson_id = ?').all(lessonId)) {
      try { fs.unlinkSync(path.join(UPLOADS, a.stored_name)); } catch { /* already gone */ }
    }
    db.prepare('DELETE FROM attachments WHERE lesson_id = ?').run(lessonId);
    db.prepare('DELETE FROM progress WHERE lesson_id = ?').run(lessonId);
    db.prepare('DELETE FROM lessons WHERE id = ?').run(lessonId);
  }

  app.post('/api/courses/:id/modules', requireAdmin, (req, res) => {
    const course = courseById.get(req.params.id);
    if (!course) return res.status(404).json({ error: 'not found' });
    const title = String((req.body || {}).title || '').trim();
    if (!title) return res.status(400).json({ error: 'title is required' });
    const maxPos = db.prepare('SELECT COALESCE(MAX(position), -1) AS p FROM modules WHERE course_id = ?').get(course.id).p;
    const info = db.prepare('INSERT INTO modules (course_id, title, position, quiz_pass_pct, created_at) VALUES (?, ?, ?, ?, ?)')
      .run(course.id, title, maxPos + 1, Math.min(100, Math.max(0, Math.floor(Number(req.body.quiz_pass_pct)) || 70)), Date.now());
    res.status(201).json(moduleById.get(info.lastInsertRowid));
  });

  app.put('/api/modules/:id', requireAdmin, (req, res) => {
    const mod = moduleById.get(req.params.id);
    if (!mod) return res.status(404).json({ error: 'not found' });
    const b = req.body || {};
    const title = b.title !== undefined ? String(b.title).trim() : mod.title;
    if (!title) return res.status(400).json({ error: 'title is required' });
    const pass = b.quiz_pass_pct !== undefined
      ? Math.min(100, Math.max(0, Math.floor(Number(b.quiz_pass_pct)) || 0))
      : mod.quiz_pass_pct;
    db.prepare('UPDATE modules SET title = ?, quiz_pass_pct = ? WHERE id = ?').run(title, pass, mod.id);
    res.json(moduleById.get(mod.id));
  });

  app.delete('/api/modules/:id', requireAdmin, (req, res) => {
    const mod = moduleById.get(req.params.id);
    if (!mod) return res.status(404).json({ error: 'not found' });
    db.transaction(() => deleteModuleCascade(mod.id))();
    res.json({ ok: true });
  });

  // Reorder modules within a course: body { ids: [moduleId, ...] } in new order.
  app.put('/api/courses/:id/modules/reorder', requireAdmin, (req, res) => {
    const course = courseById.get(req.params.id);
    if (!course) return res.status(404).json({ error: 'not found' });
    const ids = (req.body || {}).ids;
    if (!Array.isArray(ids) || !ids.length) return res.status(400).json({ error: 'ids array required' });
    const own = new Set(modulesOf.all(course.id).map((m) => m.id));
    if (!ids.every((id) => own.has(Number(id)))) return res.status(400).json({ error: 'ids must all belong to this course' });
    const tx = db.transaction(() => {
      ids.forEach((id, i) => db.prepare('UPDATE modules SET position = ? WHERE id = ?').run(i, Number(id)));
    });
    tx();
    res.json({ ok: true, modules: modulesOf.all(course.id) });
  });

  // ── lessons ─────────────────────────────────────────────────────────────────
  function cleanLessonInput(b, res) {
    const title = String(b.title || '').trim();
    if (!title) { res.status(400).json({ error: 'title is required' }); return null; }
    const type = b.type === 'video' ? 'video' : 'text';
    let content = String(b.content || '');
    if (type === 'text') content = sanitizeHtml(content);
    else content = content.trim().slice(0, 2000); // video URL
    return { title, type, content };
  }

  app.post('/api/modules/:id/lessons', requireAdmin, (req, res) => {
    const mod = moduleById.get(req.params.id);
    if (!mod) return res.status(404).json({ error: 'not found' });
    const v = cleanLessonInput(req.body || {}, res);
    if (!v) return;
    const maxPos = db.prepare('SELECT COALESCE(MAX(position), -1) AS p FROM lessons WHERE module_id = ?').get(mod.id).p;
    const info = db.prepare('INSERT INTO lessons (module_id, title, type, content, position, created_at) VALUES (?, ?, ?, ?, ?, ?)')
      .run(mod.id, v.title, v.type, v.content, maxPos + 1, Date.now());
    res.status(201).json({ ...lessonById.get(info.lastInsertRowid), attachments: [] });
  });

  app.put('/api/lessons/:id', requireAdmin, (req, res) => {
    const lesson = lessonById.get(req.params.id);
    if (!lesson) return res.status(404).json({ error: 'not found' });
    const v = cleanLessonInput({ ...lesson, ...(req.body || {}) }, res);
    if (!v) return;
    db.prepare('UPDATE lessons SET title = ?, type = ?, content = ? WHERE id = ?').run(v.title, v.type, v.content, lesson.id);
    res.json({ ...lessonById.get(lesson.id), attachments: attachmentsOf.all(lesson.id) });
  });

  app.delete('/api/lessons/:id', requireAdmin, (req, res) => {
    const lesson = lessonById.get(req.params.id);
    if (!lesson) return res.status(404).json({ error: 'not found' });
    db.transaction(() => deleteLessonCascade(lesson.id))();
    res.json({ ok: true });
  });

  // Reorder lessons within a module: body { ids: [lessonId, ...] }.
  app.put('/api/modules/:id/lessons/reorder', requireAdmin, (req, res) => {
    const mod = moduleById.get(req.params.id);
    if (!mod) return res.status(404).json({ error: 'not found' });
    const ids = (req.body || {}).ids;
    if (!Array.isArray(ids) || !ids.length) return res.status(400).json({ error: 'ids array required' });
    const own = new Set(lessonsOf.all(mod.id).map((l) => l.id));
    if (!ids.every((id) => own.has(Number(id)))) return res.status(400).json({ error: 'ids must all belong to this module' });
    const tx = db.transaction(() => {
      ids.forEach((id, i) => db.prepare('UPDATE lessons SET position = ? WHERE id = ?').run(i, Number(id)));
    });
    tx();
    res.json({ ok: true, lessons: lessonsOf.all(mod.id) });
  });

  // ── uploads: self-hosted video + attachments ───────────────────────────────
  app.post('/api/upload/video', requireAdmin, upload.single('file'), (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'file is required' });
    res.status(201).json({ url: `/media/${req.file.filename}`, size_bytes: req.file.size });
  });

  app.post('/api/lessons/:id/attachments', requireAdmin, upload.single('file'), (req, res) => {
    const lesson = lessonById.get(req.params.id);
    if (!lesson) return res.status(404).json({ error: 'not found' });
    if (!req.file) return res.status(400).json({ error: 'file is required' });
    const info = db.prepare('INSERT INTO attachments (lesson_id, filename, stored_name, size_bytes, created_at) VALUES (?, ?, ?, ?, ?)')
      .run(lesson.id, req.file.originalname, req.file.filename, req.file.size, Date.now());
    res.status(201).json(db.prepare('SELECT id, lesson_id, filename, size_bytes FROM attachments WHERE id = ?').get(info.lastInsertRowid));
  });

  app.delete('/api/attachments/:id', requireAdmin, (req, res) => {
    const a = db.prepare('SELECT * FROM attachments WHERE id = ?').get(req.params.id);
    if (!a) return res.status(404).json({ error: 'not found' });
    try { fs.unlinkSync(path.join(UPLOADS, a.stored_name)); } catch { /* already gone */ }
    db.prepare('DELETE FROM attachments WHERE id = ?').run(a.id);
    res.json({ ok: true });
  });

  // Download an attachment by id (original filename preserved) — any logged-in user.
  app.get('/api/attachments/:id/download', requireAnyAuth, (req, res) => {
    const a = db.prepare('SELECT * FROM attachments WHERE id = ?').get(req.params.id);
    if (!a) return res.status(404).json({ error: 'not found' });
    res.download(path.join(UPLOADS, a.stored_name), a.filename);
  });

  // Uploaded media (self-hosted videos) — any logged-in user.
  app.get('/media/:name', requireAnyAuth, (req, res) => {
    const name = path.basename(req.params.name); // no traversal
    const file = path.join(UPLOADS, name);
    if (!fs.existsSync(file)) return res.status(404).send('not found');
    res.sendFile(file);
  });

  // ── quiz questions (admin) ──────────────────────────────────────────────────
  function cleanQuestionInput(b, res) {
    const question = String(b.question || '').trim();
    if (!question) { res.status(400).json({ error: 'question is required' }); return null; }
    const type = b.type === 'tf' ? 'tf' : 'mc';
    let options = type === 'tf' ? ['True', 'False'] : (Array.isArray(b.options) ? b.options.map((o) => String(o)) : []);
    if (type === 'mc' && options.length < 2) { res.status(400).json({ error: 'mc questions need at least 2 options' }); return null; }
    const correct = Math.floor(Number(b.correct_index) || 0);
    if (correct < 0 || correct >= options.length) { res.status(400).json({ error: 'correct_index out of range' }); return null; }
    return { question, type, options, correct };
  }

  app.post('/api/modules/:id/questions', requireAdmin, (req, res) => {
    const mod = moduleById.get(req.params.id);
    if (!mod) return res.status(404).json({ error: 'not found' });
    const v = cleanQuestionInput(req.body || {}, res);
    if (!v) return;
    const maxPos = db.prepare('SELECT COALESCE(MAX(position), -1) AS p FROM quiz_questions WHERE module_id = ?').get(mod.id).p;
    const info = db.prepare('INSERT INTO quiz_questions (module_id, question, type, options_json, correct_index, position, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .run(mod.id, v.question, v.type, JSON.stringify(v.options), v.correct, maxPos + 1, Date.now());
    const q = db.prepare('SELECT * FROM quiz_questions WHERE id = ?').get(info.lastInsertRowid);
    res.status(201).json({ ...q, options: JSON.parse(q.options_json) });
  });

  app.put('/api/questions/:id', requireAdmin, (req, res) => {
    const q = db.prepare('SELECT * FROM quiz_questions WHERE id = ?').get(req.params.id);
    if (!q) return res.status(404).json({ error: 'not found' });
    const merged = { question: q.question, type: q.type, options: JSON.parse(q.options_json), correct_index: q.correct_index, ...(req.body || {}) };
    const v = cleanQuestionInput(merged, res);
    if (!v) return;
    db.prepare('UPDATE quiz_questions SET question = ?, type = ?, options_json = ?, correct_index = ? WHERE id = ?')
      .run(v.question, v.type, JSON.stringify(v.options), v.correct, q.id);
    const updated = db.prepare('SELECT * FROM quiz_questions WHERE id = ?').get(q.id);
    res.json({ ...updated, options: JSON.parse(updated.options_json) });
  });

  app.delete('/api/questions/:id', requireAdmin, (req, res) => {
    const q = db.prepare('SELECT * FROM quiz_questions WHERE id = ?').get(req.params.id);
    if (!q) return res.status(404).json({ error: 'not found' });
    db.prepare('DELETE FROM quiz_questions WHERE id = ?').run(q.id);
    res.json({ ok: true });
  });

  // ── enrollments (admin) ─────────────────────────────────────────────────────
  app.get('/api/courses/:id/enrollments', requireAdmin, (req, res) => {
    const course = courseById.get(req.params.id);
    if (!course) return res.status(404).json({ error: 'not found' });
    const rows = db.prepare('SELECT * FROM enrollments WHERE course_id = ? ORDER BY enrolled_at DESC').all(course.id);
    res.json(rows.map((e) => ({ ...e, completion_pct: completionPct(e, course.id) })));
  });

  app.post('/api/courses/:id/enrollments', requireAdmin, (req, res) => {
    const course = courseById.get(req.params.id);
    if (!course) return res.status(404).json({ error: 'not found' });
    const email = String((req.body || {}).student_email || '').trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ error: 'valid student_email required' });
    if (enrollmentFor.get(course.id, email)) return res.status(409).json({ error: 'already enrolled' });
    const info = db.prepare('INSERT INTO enrollments (course_id, student_email, source, enrolled_at) VALUES (?, ?, ?, ?)')
      .run(course.id, email, 'manual', Date.now());
    res.status(201).json(db.prepare('SELECT * FROM enrollments WHERE id = ?').get(info.lastInsertRowid));
  });

  app.delete('/api/enrollments/:id', requireAdmin, (req, res) => {
    const e = db.prepare('SELECT * FROM enrollments WHERE id = ?').get(req.params.id);
    if (!e) return res.status(404).json({ error: 'not found' });
    db.transaction(() => {
      db.prepare('DELETE FROM progress WHERE enrollment_id = ?').run(e.id);
      db.prepare('DELETE FROM quiz_attempts WHERE enrollment_id = ?').run(e.id);
      db.prepare('DELETE FROM enrollments WHERE id = ?').run(e.id);
    })();
    res.json({ ok: true });
  });

  // ── instructor stats ────────────────────────────────────────────────────────
  app.get('/api/stats', requireAdmin, (req, res) => {
    const courses = db.prepare('SELECT * FROM courses ORDER BY created_at DESC').all();
    const out = courses.map((c) => {
      const enrollments = db.prepare('SELECT * FROM enrollments WHERE course_id = ?').all(c.id);
      const pcts = enrollments.map((e) => completionPct(e, c.id));
      const revenue = db.prepare(
        "SELECT COALESCE(SUM(amount_cents), 0) AS s FROM payments WHERE course_id = ? AND status = 'paid'"
      ).get(c.id).s;
      return {
        course_id: c.id,
        title: c.title,
        price_cents: c.price_cents,
        enrollment_count: enrollments.length,
        avg_completion_pct: pcts.length ? Math.round(pcts.reduce((a, b) => a + b, 0) / pcts.length) : 0,
        completed_count: pcts.filter((p) => p === 100).length,
        completion_rate_pct: pcts.length ? Math.round((pcts.filter((p) => p === 100).length / pcts.length) * 100) : 0,
        revenue_cents: revenue
      };
    });
    res.json(out);
  });

  // ── student auth ────────────────────────────────────────────────────────────
  app.post('/api/student/signup', (req, res) => {
    const b = req.body || {};
    const email = String(b.email || '').trim().toLowerCase();
    const password = String(b.password || '');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ error: 'valid email required' });
    if (password.length < 6) return res.status(400).json({ error: 'password must be at least 6 characters' });
    if (db.prepare('SELECT id FROM students WHERE email = ?').get(email)) {
      return res.status(409).json({ error: 'account already exists — log in instead' });
    }
    const info = db.prepare('INSERT INTO students (email, name, password_hash, created_at) VALUES (?, ?, ?, ?)')
      .run(email, String(b.name || '').trim(), hashPassword(password), Date.now());
    createStudentSession(res, info.lastInsertRowid);
    res.status(201).json({ ok: true, email });
  });

  app.post('/api/student/login', (req, res) => {
    const email = String((req.body || {}).email || '').trim().toLowerCase();
    const student = db.prepare('SELECT * FROM students WHERE email = ?').get(email);
    if (!student || !verifyPassword((req.body || {}).password, student.password_hash)) {
      return res.status(401).json({ error: 'wrong email or password' });
    }
    createStudentSession(res, student.id);
    res.json({ ok: true, email: student.email, name: student.name });
  });

  app.post('/api/student/logout', (req, res) => {
    const token = req.cookies[STUDENT_COOKIE];
    if (token) db.prepare('DELETE FROM student_sessions WHERE token = ?').run(token);
    res.clearCookie(STUDENT_COOKIE);
    res.json({ ok: true });
  });

  app.get('/api/student/me', requireStudent, (req, res) => {
    res.json({ ok: true, role: 'student', email: req.student.email, name: req.student.name });
  });

  // ── public catalog (published courses, no content) ─────────────────────────
  app.get('/api/catalog', (req, res) => {
    const rows = db.prepare('SELECT id, title, description, price_cents FROM courses WHERE published = 1 ORDER BY created_at DESC').all();
    const student = getStudent(req);
    res.json(rows.map((c) => ({
      ...c,
      lesson_count: courseLessonCount(c.id),
      enrolled: student ? !!enrollmentFor.get(c.id, student.email) : false
    })));
  });

  // ── student enrollment ──────────────────────────────────────────────────────
  app.post('/api/student/enroll', requireStudent, (req, res) => {
    const code = String((req.body || {}).access_code || '').trim().toUpperCase();
    if (!code) return res.status(400).json({ error: 'access_code required' });
    const course = db.prepare('SELECT * FROM courses WHERE access_code = ?').get(code);
    if (!course) return res.status(404).json({ error: 'invalid access code' });
    if (enrollmentFor.get(course.id, req.student.email)) return res.status(409).json({ error: 'already enrolled' });
    const info = db.prepare('INSERT INTO enrollments (course_id, student_email, source, enrolled_at) VALUES (?, ?, ?, ?)')
      .run(course.id, req.student.email, 'code', Date.now());
    res.status(201).json({
      ...db.prepare('SELECT * FROM enrollments WHERE id = ?').get(info.lastInsertRowid),
      course_title: course.title
    });
  });

  // ── Stripe Checkout (BYO key, link-out pattern; disabled without a key) ────
  const stripeForm = (obj) => new URLSearchParams(obj).toString();

  app.post('/api/student/checkout', requireStudent, async (req, res) => {
    const course = courseById.get((req.body || {}).course_id);
    if (!course) return res.status(404).json({ error: 'course not found' });
    if (!course.price_cents) return res.status(400).json({ error: 'course is free — enroll with an access code' });
    if (enrollmentFor.get(course.id, req.student.email)) return res.status(409).json({ error: 'already enrolled' });
    if (!stripeSecretKey) {
      return res.status(503).json({ error: 'payments not configured — set STRIPE_SECRET_KEY in .env, or share the access code instead' });
    }
    try {
      const origin = baseUrl || `${req.protocol}://${req.get('host')}`;
      const r = await fetch('https://api.stripe.com/v1/checkout/sessions', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${stripeSecretKey}`,
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: stripeForm({
          mode: 'payment',
          'line_items[0][price_data][currency]': 'usd',
          'line_items[0][price_data][unit_amount]': String(course.price_cents),
          'line_items[0][price_data][product_data][name]': course.title,
          'line_items[0][quantity]': '1',
          customer_email: req.student.email,
          success_url: `${origin}/api/student/checkout/confirm?session_id={CHECKOUT_SESSION_ID}`,
          cancel_url: `${origin}/`
        })
      });
      const session = await r.json();
      if (!r.ok) return res.status(502).json({ error: session.error?.message || 'stripe error' });
      db.prepare('INSERT INTO payments (course_id, student_email, stripe_session_id, amount_cents, status, created_at) VALUES (?, ?, ?, ?, ?, ?)')
        .run(course.id, req.student.email, session.id, course.price_cents, 'pending', Date.now());
      res.json({ url: session.url }); // client link-outs to Stripe-hosted Checkout
    } catch (e) {
      res.status(502).json({ error: `stripe unreachable: ${e.message}` });
    }
  });

  // Stripe redirects back here; verify the session server-side, then enroll.
  app.get('/api/student/checkout/confirm', async (req, res) => {
    const sessionId = String(req.query.session_id || '');
    const payment = db.prepare('SELECT * FROM payments WHERE stripe_session_id = ?').get(sessionId);
    if (!payment || !stripeSecretKey) return res.redirect('/');
    try {
      const r = await fetch(`https://api.stripe.com/v1/checkout/sessions/${encodeURIComponent(sessionId)}`, {
        headers: { Authorization: `Bearer ${stripeSecretKey}` }
      });
      const session = await r.json();
      if (r.ok && session.payment_status === 'paid' && payment.status !== 'paid') {
        db.transaction(() => {
          db.prepare("UPDATE payments SET status = 'paid' WHERE id = ?").run(payment.id);
          if (!enrollmentFor.get(payment.course_id, payment.student_email)) {
            db.prepare('INSERT INTO enrollments (course_id, student_email, source, enrolled_at) VALUES (?, ?, ?, ?)')
              .run(payment.course_id, payment.student_email, 'paid', Date.now());
          }
        })();
      }
    } catch { /* leave pending; student can retry */ }
    res.redirect('/');
  });

  // ── student courses + progress ──────────────────────────────────────────────
  function studentEnrollment(req, res, courseId) {
    const course = courseById.get(courseId);
    if (!course) { res.status(404).json({ error: 'course not found' }); return null; }
    const e = enrollmentFor.get(course.id, req.student.email);
    if (!e) { res.status(403).json({ error: 'not enrolled in this course' }); return null; }
    return { course, enrollment: e };
  }

  app.get('/api/student/courses', requireStudent, (req, res) => {
    const rows = db.prepare('SELECT * FROM enrollments WHERE student_email = ? ORDER BY enrolled_at DESC').all(req.student.email);
    res.json(rows.map((e) => {
      const c = courseById.get(e.course_id);
      return {
        enrollment_id: e.id,
        course_id: c.id,
        title: c.title,
        description: c.description,
        lesson_count: courseLessonCount(c.id),
        completed_count: completedCount(e.id),
        completion_pct: completionPct(e, c.id),
        enrolled_at: e.enrolled_at
      };
    }));
  });

  app.get('/api/student/courses/:id', requireStudent, (req, res) => {
    const ctx = studentEnrollment(req, res, req.params.id);
    if (!ctx) return;
    const tree = courseTree(ctx.course, { forStudent: true });
    const done = db.prepare('SELECT lesson_id, completed_at FROM progress WHERE enrollment_id = ?').all(ctx.enrollment.id);
    const attempts = db.prepare('SELECT module_id, score, passed, at FROM quiz_attempts WHERE enrollment_id = ? ORDER BY at DESC').all(ctx.enrollment.id);
    res.json({
      ...tree,
      enrollment_id: ctx.enrollment.id,
      completed_lessons: done,
      completion_pct: completionPct(ctx.enrollment, ctx.course.id),
      quiz_attempts: attempts
    });
  });

  app.post('/api/student/lessons/:id/complete', requireStudent, (req, res) => {
    const lesson = lessonById.get(req.params.id);
    if (!lesson) return res.status(404).json({ error: 'lesson not found' });
    const mod = moduleById.get(lesson.module_id);
    const ctx = studentEnrollment(req, res, mod.course_id);
    if (!ctx) return;
    db.prepare('INSERT OR IGNORE INTO progress (enrollment_id, lesson_id, completed_at) VALUES (?, ?, ?)')
      .run(ctx.enrollment.id, lesson.id, Date.now());
    res.json({ ok: true, completion_pct: completionPct(ctx.enrollment, ctx.course.id) });
  });

  app.delete('/api/student/lessons/:id/complete', requireStudent, (req, res) => {
    const lesson = lessonById.get(req.params.id);
    if (!lesson) return res.status(404).json({ error: 'lesson not found' });
    const mod = moduleById.get(lesson.module_id);
    const ctx = studentEnrollment(req, res, mod.course_id);
    if (!ctx) return;
    db.prepare('DELETE FROM progress WHERE enrollment_id = ? AND lesson_id = ?').run(ctx.enrollment.id, lesson.id);
    res.json({ ok: true, completion_pct: completionPct(ctx.enrollment, ctx.course.id) });
  });

  // ── quiz taking ─────────────────────────────────────────────────────────────
  app.post('/api/student/modules/:id/quiz', requireStudent, (req, res) => {
    const mod = moduleById.get(req.params.id);
    if (!mod) return res.status(404).json({ error: 'module not found' });
    const ctx = studentEnrollment(req, res, mod.course_id);
    if (!ctx) return;
    const questions = questionsOf.all(mod.id);
    if (!questions.length) return res.status(400).json({ error: 'this module has no quiz' });
    const answers = (req.body || {}).answers;
    if (!Array.isArray(answers) || answers.length !== questions.length) {
      return res.status(400).json({ error: `answers must be an array of ${questions.length} option indexes` });
    }
    let correct = 0;
    const results = questions.map((q, i) => {
      const ok = Number(answers[i]) === q.correct_index;
      if (ok) correct++;
      return { question_id: q.id, correct: ok, correct_index: q.correct_index };
    });
    const score = Math.round((correct / questions.length) * 100);
    const passed = score >= mod.quiz_pass_pct ? 1 : 0;
    db.prepare('INSERT INTO quiz_attempts (enrollment_id, module_id, score, passed, at) VALUES (?, ?, ?, ?, ?)')
      .run(ctx.enrollment.id, mod.id, score, passed, Date.now());
    const attemptCount = db.prepare('SELECT COUNT(*) AS n FROM quiz_attempts WHERE enrollment_id = ? AND module_id = ?')
      .get(ctx.enrollment.id, mod.id).n;
    res.json({ score, passed: !!passed, pass_threshold: mod.quiz_pass_pct, correct, total: questions.length, attempt: attemptCount, results });
  });

  // ── certificate (PDF, only at 100%) ─────────────────────────────────────────
  app.get('/api/student/courses/:id/certificate', requireStudent, (req, res) => {
    const ctx = studentEnrollment(req, res, req.params.id);
    if (!ctx) return;
    const pct = completionPct(ctx.enrollment, ctx.course.id);
    if (pct < 100) return res.status(403).json({ error: `course is ${pct}% complete — finish all lessons to earn your certificate` });
    const lastDone = db.prepare('SELECT MAX(completed_at) AS t FROM progress WHERE enrollment_id = ?').get(ctx.enrollment.id).t;
    streamCertificate(res, {
      studentName: req.student.name,
      studentEmail: req.student.email,
      courseTitle: ctx.course.title,
      completedAt: lastDone
    });
  });

  // ── static frontend ─────────────────────────────────────────────────────────
  const dist = path.join(__dirname, '..', 'dist');
  if (fs.existsSync(dist)) {
    app.use(express.static(dist));
    app.get('*', (req, res, next) => {
      if (req.path.startsWith('/api') || req.path.startsWith('/media') || req.path.startsWith('/auth')) return next();
      res.sendFile(path.join(dist, 'index.html'));
    });
  }

  return app;
}

module.exports = { createApp };
