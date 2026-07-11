const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const Database = require('better-sqlite3');

function nativeBindingPath() {
  // Under Electron the Node-ABI binding won't load; use the vendored Electron prebuild.
  if (!process.versions.electron) return null;
  const p = path.join(__dirname, '..', 'vendor', 'better_sqlite3-electron.node');
  return fs.existsSync(p) ? p : null;
}

// URL-safe base62 token (crypto-strong, no ESM dep).
const ALPHABET = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
function genToken(len = 22) {
  const bytes = crypto.randomBytes(len);
  let out = '';
  for (let i = 0; i < len; i++) out += ALPHABET[bytes[i] % ALPHABET.length];
  return out;
}

// Short human-friendly access code like "FORGE-8X2K9Q"
function genAccessCode() {
  const CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; // no lookalikes
  const bytes = crypto.randomBytes(6);
  let out = '';
  for (let i = 0; i < 6; i++) out += CHARS[bytes[i] % CHARS.length];
  return `FORGE-${out}`;
}

function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) {
  const hash = crypto.scryptSync(String(password), salt, 32).toString('hex');
  return `${salt}:${hash}`;
}

function verifyPassword(password, stored) {
  const [salt, hash] = String(stored || '').split(':');
  if (!salt || !hash) return false;
  const check = crypto.scryptSync(String(password), salt, 32).toString('hex');
  return crypto.timingSafeEqual(Buffer.from(hash, 'hex'), Buffer.from(check, 'hex'));
}

function openDb(dbPath) {
  fs.mkdirSync(path.dirname(path.resolve(dbPath)), { recursive: true });
  const nativeBinding = nativeBindingPath();
  const db = new Database(dbPath, nativeBinding ? { nativeBinding } : {});
  db.pragma('journal_mode = WAL');

  db.exec(`
    CREATE TABLE IF NOT EXISTS courses (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      description TEXT DEFAULT '',
      price_cents INTEGER NOT NULL DEFAULT 0,        -- 0 = free / access-code only
      access_code TEXT NOT NULL UNIQUE,
      published INTEGER NOT NULL DEFAULT 1,
      created_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS modules (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      course_id INTEGER NOT NULL,
      title TEXT NOT NULL,
      position INTEGER NOT NULL DEFAULT 0,           -- "order" in the plan; renamed (SQL keyword)
      quiz_pass_pct INTEGER NOT NULL DEFAULT 70,     -- pass threshold for this module's quiz
      created_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS lessons (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      module_id INTEGER NOT NULL,
      title TEXT NOT NULL,
      type TEXT NOT NULL DEFAULT 'text',             -- 'text' | 'video'
      content TEXT DEFAULT '',                       -- sanitized HTML (text) or video URL (video)
      position INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS attachments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      lesson_id INTEGER NOT NULL,
      filename TEXT NOT NULL,                        -- original name shown to students
      stored_name TEXT NOT NULL,                     -- random name on disk
      size_bytes INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS students (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT NOT NULL UNIQUE,
      name TEXT DEFAULT '',
      password_hash TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS enrollments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      course_id INTEGER NOT NULL,
      student_email TEXT NOT NULL,
      source TEXT NOT NULL DEFAULT 'manual',         -- manual | code | paid
      enrolled_at INTEGER NOT NULL,
      UNIQUE (course_id, student_email)
    );
    CREATE TABLE IF NOT EXISTS progress (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      enrollment_id INTEGER NOT NULL,
      lesson_id INTEGER NOT NULL,
      completed_at INTEGER NOT NULL,
      UNIQUE (enrollment_id, lesson_id)
    );
    CREATE TABLE IF NOT EXISTS quiz_questions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      module_id INTEGER NOT NULL,
      question TEXT NOT NULL,
      type TEXT NOT NULL DEFAULT 'mc',               -- 'mc' | 'tf'
      options_json TEXT NOT NULL DEFAULT '[]',       -- mc: ["A","B",...]; tf: ["True","False"]
      correct_index INTEGER NOT NULL DEFAULT 0,
      position INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS quiz_attempts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      enrollment_id INTEGER NOT NULL,
      module_id INTEGER NOT NULL,
      score INTEGER NOT NULL,                        -- percentage 0-100
      passed INTEGER NOT NULL DEFAULT 0,
      at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS payments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      course_id INTEGER NOT NULL,
      student_email TEXT NOT NULL,
      stripe_session_id TEXT,
      amount_cents INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'pending',        -- pending | paid
      created_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      token TEXT NOT NULL UNIQUE,
      created_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS student_sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      token TEXT NOT NULL UNIQUE,
      student_id INTEGER NOT NULL,
      created_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_modules_course ON modules(course_id, position);
    CREATE INDEX IF NOT EXISTS idx_lessons_module ON lessons(module_id, position);
    CREATE INDEX IF NOT EXISTS idx_enroll_course ON enrollments(course_id);
    CREATE INDEX IF NOT EXISTS idx_progress_enroll ON progress(enrollment_id);
    CREATE INDEX IF NOT EXISTS idx_attempts_enroll ON quiz_attempts(enrollment_id, module_id);
    CREATE INDEX IF NOT EXISTS idx_questions_module ON quiz_questions(module_id, position);
  `);

  return db;
}

module.exports = { openDb, genToken, genAccessCode, hashPassword, verifyPassword };
