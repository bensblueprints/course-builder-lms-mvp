import React, { useEffect, useState, useCallback } from 'react';
import { motion } from 'framer-motion';
import {
  GraduationCap, Lock, Plus, Trash2, Pencil, ChevronUp, ChevronDown, ArrowLeft,
  Users, BarChart3, LogOut, Check, X, Video, FileText, Upload, Paperclip, KeyRound
} from 'lucide-react';
import { api, dollars } from '../api.js';

const input = 'w-full bg-stone-950 border border-stone-800 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-amber-500';
const btn = 'inline-flex items-center gap-1.5 bg-amber-500 hover:bg-amber-400 text-stone-950 font-medium text-sm rounded-lg px-3.5 py-2 transition-colors disabled:opacity-50';
const btnGhost = 'inline-flex items-center gap-1.5 border border-stone-700 hover:border-stone-500 text-stone-300 text-sm rounded-lg px-3 py-1.5 transition-colors';
const iconBtn = 'p-1.5 rounded-lg hover:bg-stone-700 text-stone-400 transition-colors';

function AdminLogin({ onLogin, onExit }) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const submit = async (e) => {
    e.preventDefault();
    try { await api.login(password); onLogin(); } catch { setError('Wrong password'); }
  };
  return (
    <div className="min-h-screen grid place-items-center px-4">
      <motion.form initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} onSubmit={submit}
        className="w-full max-w-sm bg-stone-900 border border-stone-800 rounded-2xl p-8 space-y-5">
        <div className="flex items-center gap-2 justify-center text-lg font-semibold">
          <GraduationCap className="w-6 h-6 text-amber-400" /> Instructor sign-in
        </div>
        <label className="block">
          <span className="text-xs text-stone-400 uppercase tracking-wide">Admin password</span>
          <div className="mt-1.5 relative">
            <Lock className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-stone-500" />
            <input type="password" autoFocus value={password} onChange={(e) => setPassword(e.target.value)}
              className={`${input} pl-9`} placeholder="••••••••" />
          </div>
        </label>
        {error && <p className="text-sm text-red-400">{error}</p>}
        <button className={`${btn} w-full justify-center`}>Sign in</button>
        <button type="button" onClick={onExit} className="w-full text-xs text-stone-500 hover:text-stone-300">← back</button>
      </motion.form>
    </div>
  );
}

// ── course editor ────────────────────────────────────────────────────────────
function LessonEditor({ lesson, moduleId, onDone }) {
  const [form, setForm] = useState(lesson || { title: '', type: 'text', content: '' });
  const [error, setError] = useState('');
  const [uploading, setUploading] = useState(false);

  const save = async () => {
    try {
      if (lesson?.id) await api.updateLesson(lesson.id, form);
      else await api.createLesson(moduleId, form);
      onDone(true);
    } catch (e) { setError(e.message); }
  };

  const uploadVideo = async (file) => {
    setUploading(true);
    try {
      const { url } = await api.uploadVideo(file);
      setForm((f) => ({ ...f, content: url }));
    } catch (e) { setError(e.message); }
    finally { setUploading(false); }
  };

  return (
    <div className="bg-stone-950 border border-stone-800 rounded-xl p-4 space-y-3">
      <div className="flex gap-2">
        <input className={input} placeholder="Lesson title" value={form.title}
          onChange={(e) => setForm({ ...form, title: e.target.value })} />
        <select className={`${input} w-32`} value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value, content: '' })}>
          <option value="text">Text</option>
          <option value="video">Video</option>
        </select>
      </div>
      {form.type === 'text' ? (
        <textarea className={`${input} min-h-36 font-mono text-xs`} value={form.content}
          onChange={(e) => setForm({ ...form, content: e.target.value })}
          placeholder="Lesson HTML — <h2>, <p>, <ul>, <img>, <a>… (sanitized server-side)" />
      ) : (
        <div className="space-y-2">
          <input className={input} value={form.content} onChange={(e) => setForm({ ...form, content: e.target.value })}
            placeholder="Video URL — YouTube/Vimeo embed link, or upload below" />
          <label className={`${btnGhost} cursor-pointer`}>
            <Upload className="w-4 h-4" /> {uploading ? 'Uploading…' : 'Upload video file'}
            <input type="file" accept="video/*" className="hidden"
              onChange={(e) => e.target.files[0] && uploadVideo(e.target.files[0])} />
          </label>
        </div>
      )}
      {error && <p className="text-sm text-red-400">{error}</p>}
      <div className="flex gap-2 justify-end">
        <button className={btnGhost} onClick={() => onDone(false)}>Cancel</button>
        <button className={btn} onClick={save}><Check className="w-4 h-4" /> Save lesson</button>
      </div>
    </div>
  );
}

function QuestionEditor({ question, moduleId, onDone }) {
  const [form, setForm] = useState(question
    ? { ...question, options: question.options }
    : { question: '', type: 'mc', options: ['', ''], correct_index: 0 });
  const [error, setError] = useState('');

  const save = async () => {
    try {
      const body = { ...form, options: form.type === 'tf' ? ['True', 'False'] : form.options };
      if (question?.id) await api.updateQuestion(question.id, body);
      else await api.createQuestion(moduleId, body);
      onDone(true);
    } catch (e) { setError(e.message); }
  };

  return (
    <div className="bg-stone-950 border border-stone-800 rounded-xl p-4 space-y-3">
      <div className="flex gap-2">
        <input className={input} placeholder="Question" value={form.question}
          onChange={(e) => setForm({ ...form, question: e.target.value })} />
        <select className={`${input} w-40`} value={form.type}
          onChange={(e) => setForm({ ...form, type: e.target.value, correct_index: 0 })}>
          <option value="mc">Multiple choice</option>
          <option value="tf">True / False</option>
        </select>
      </div>
      {form.type === 'mc' ? (
        <div className="space-y-1.5">
          {form.options.map((o, i) => (
            <div key={i} className="flex items-center gap-2">
              <input type="radio" checked={form.correct_index === i} onChange={() => setForm({ ...form, correct_index: i })}
                className="accent-amber-500" title="Correct answer" />
              <input className={input} value={o} placeholder={`Option ${i + 1}`}
                onChange={(e) => setForm({ ...form, options: form.options.map((x, j) => (j === i ? e.target.value : x)) })} />
              {form.options.length > 2 && (
                <button className={iconBtn} onClick={() => setForm({
                  ...form,
                  options: form.options.filter((_, j) => j !== i),
                  correct_index: form.correct_index >= i && form.correct_index > 0 ? form.correct_index - 1 : form.correct_index
                })}><X className="w-3.5 h-3.5" /></button>
              )}
            </div>
          ))}
          <button className="text-xs text-stone-400 hover:text-stone-200"
            onClick={() => setForm({ ...form, options: [...form.options, ''] })}>+ add option</button>
        </div>
      ) : (
        <div className="flex gap-4 text-sm">
          {['True', 'False'].map((label, i) => (
            <label key={label} className="flex items-center gap-2">
              <input type="radio" checked={form.correct_index === i} onChange={() => setForm({ ...form, correct_index: i })}
                className="accent-amber-500" /> {label} is correct
            </label>
          ))}
        </div>
      )}
      {error && <p className="text-sm text-red-400">{error}</p>}
      <div className="flex gap-2 justify-end">
        <button className={btnGhost} onClick={() => onDone(false)}>Cancel</button>
        <button className={btn} onClick={save}><Check className="w-4 h-4" /> Save question</button>
      </div>
    </div>
  );
}

function CourseEditor({ courseId, onBack }) {
  const [course, setCourse] = useState(null);
  const [enrollments, setEnrollments] = useState([]);
  const [tab, setTab] = useState('content');
  const [editing, setEditing] = useState(null); // { kind, moduleId?, item? }
  const [newModule, setNewModule] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [error, setError] = useState('');
  const [meta, setMeta] = useState(null);

  const load = useCallback(async () => {
    const c = await api.course(courseId);
    setCourse(c);
    setMeta({ title: c.title, description: c.description, price_cents: c.price_cents, published: !!c.published });
    setEnrollments(await api.enrollments(courseId));
  }, [courseId]);
  useEffect(() => { load().catch((e) => setError(e.message)); }, [load]);

  if (!course) return <p className="text-stone-500 text-sm">{error || 'Loading…'}</p>;

  const move = async (kind, list, id, dir, parentId) => {
    const ids = list.map((x) => x.id);
    const i = ids.indexOf(id);
    const j = i + dir;
    if (j < 0 || j >= ids.length) return;
    [ids[i], ids[j]] = [ids[j], ids[i]];
    if (kind === 'module') await api.reorderModules(courseId, ids);
    else await api.reorderLessons(parentId, ids);
    load();
  };

  const saveMeta = async () => {
    try { await api.updateCourse(courseId, meta); load(); } catch (e) { setError(e.message); }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <button onClick={onBack} className={iconBtn}><ArrowLeft className="w-4 h-4" /></button>
        <h2 className="text-lg font-semibold flex-1">{course.title}</h2>
        <span className="flex items-center gap-1.5 text-xs text-stone-400 bg-stone-900 border border-stone-800 rounded-lg px-2.5 py-1.5">
          <KeyRound className="w-3.5 h-3.5 text-amber-400" /> access code: <code className="text-amber-400">{course.access_code}</code>
        </span>
      </div>

      <div className="flex gap-1 border-b border-stone-800">
        {['content', 'students', 'settings'].map((t) => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-4 py-2 text-sm capitalize border-b-2 -mb-px transition-colors ${tab === t ? 'border-amber-500 text-stone-100' : 'border-transparent text-stone-500 hover:text-stone-300'}`}>
            {t}
          </button>
        ))}
      </div>
      {error && <p className="text-sm text-red-400">{error}</p>}

      {tab === 'content' && (
        <div className="space-y-4">
          {course.modules.map((m, mi) => (
            <div key={m.id} className="bg-stone-900 border border-stone-800 rounded-2xl p-5 space-y-3">
              <div className="flex items-center gap-2">
                <h3 className="font-medium flex-1">{mi + 1}. {m.title}
                  <span className="ml-2 text-xs text-stone-500">quiz pass ≥ {m.quiz_pass_pct}%</span>
                </h3>
                <button className={iconBtn} onClick={() => move('module', course.modules, m.id, -1)}><ChevronUp className="w-4 h-4" /></button>
                <button className={iconBtn} onClick={() => move('module', course.modules, m.id, +1)}><ChevronDown className="w-4 h-4" /></button>
                <button className={iconBtn} onClick={() => {
                  const title = prompt('Module title', m.title);
                  if (title) api.updateModule(m.id, { title }).then(load);
                }}><Pencil className="w-4 h-4" /></button>
                <button className={`${iconBtn} hover:text-red-400`} onClick={() => {
                  if (confirm(`Delete module "${m.title}" and its lessons?`)) api.deleteModule(m.id).then(load);
                }}><Trash2 className="w-4 h-4" /></button>
              </div>

              {m.lessons.map((l, li) => (
                <div key={l.id} className="flex items-center gap-2 bg-stone-950/60 border border-stone-800/60 rounded-lg px-3 py-2 text-sm">
                  {l.type === 'video' ? <Video className="w-4 h-4 text-sky-400 shrink-0" /> : <FileText className="w-4 h-4 text-stone-500 shrink-0" />}
                  <span className="flex-1">{li + 1}. {l.title}</span>
                  {l.attachments?.length > 0 && <span className="text-xs text-stone-500 flex items-center gap-1"><Paperclip className="w-3 h-3" />{l.attachments.length}</span>}
                  <label className="cursor-pointer text-stone-500 hover:text-stone-300" title="Add attachment">
                    <Paperclip className="w-3.5 h-3.5" />
                    <input type="file" className="hidden" onChange={(e) => e.target.files[0] && api.uploadAttachment(l.id, e.target.files[0]).then(load)} />
                  </label>
                  <button className={iconBtn} onClick={() => move('lesson', m.lessons, l.id, -1, m.id)}><ChevronUp className="w-3.5 h-3.5" /></button>
                  <button className={iconBtn} onClick={() => move('lesson', m.lessons, l.id, +1, m.id)}><ChevronDown className="w-3.5 h-3.5" /></button>
                  <button className={iconBtn} onClick={() => setEditing({ kind: 'lesson', moduleId: m.id, item: l })}><Pencil className="w-3.5 h-3.5" /></button>
                  <button className={`${iconBtn} hover:text-red-400`} onClick={() => confirm(`Delete lesson "${l.title}"?`) && api.deleteLesson(l.id).then(load)}><Trash2 className="w-3.5 h-3.5" /></button>
                </div>
              ))}
              {editing?.kind === 'lesson' && editing.moduleId === m.id && (
                <LessonEditor lesson={editing.item} moduleId={m.id} onDone={(saved) => { setEditing(null); if (saved) load(); }} />
              )}
              {!(editing?.kind === 'lesson' && editing.moduleId === m.id) && (
                <button className="text-xs text-stone-400 hover:text-stone-200" onClick={() => setEditing({ kind: 'lesson', moduleId: m.id, item: null })}>
                  + add lesson
                </button>
              )}

              <div className="border-t border-stone-800/60 pt-3 space-y-2">
                <p className="text-xs text-stone-500 uppercase tracking-wide">Quiz ({m.quiz_questions.length} questions)</p>
                {m.quiz_questions.map((q) => (
                  <div key={q.id} className="flex items-center gap-2 text-sm text-stone-300">
                    <span className="flex-1">{q.question} <span className="text-xs text-stone-600">({q.type === 'tf' ? 'T/F' : 'MC'}, answer: {q.options[q.correct_index]})</span></span>
                    <button className={iconBtn} onClick={() => setEditing({ kind: 'question', moduleId: m.id, item: q })}><Pencil className="w-3.5 h-3.5" /></button>
                    <button className={`${iconBtn} hover:text-red-400`} onClick={() => api.deleteQuestion(q.id).then(load)}><Trash2 className="w-3.5 h-3.5" /></button>
                  </div>
                ))}
                {editing?.kind === 'question' && editing.moduleId === m.id ? (
                  <QuestionEditor question={editing.item} moduleId={m.id} onDone={(saved) => { setEditing(null); if (saved) load(); }} />
                ) : (
                  <button className="text-xs text-stone-400 hover:text-stone-200" onClick={() => setEditing({ kind: 'question', moduleId: m.id, item: null })}>
                    + add question
                  </button>
                )}
              </div>
            </div>
          ))}
          <form className="flex gap-2" onSubmit={async (e) => { e.preventDefault(); if (newModule.trim()) { await api.createModule(courseId, { title: newModule }); setNewModule(''); load(); } }}>
            <input className={input} placeholder="New module title…" value={newModule} onChange={(e) => setNewModule(e.target.value)} />
            <button className={btn}><Plus className="w-4 h-4" /> Module</button>
          </form>
        </div>
      )}

      {tab === 'students' && (
        <div className="space-y-4">
          <form className="flex gap-2 max-w-md" onSubmit={async (e) => {
            e.preventDefault();
            try { await api.addEnrollment(courseId, newEmail); setNewEmail(''); setError(''); load(); }
            catch (err) { setError(err.message); }
          }}>
            <input className={input} placeholder="student@email.com" value={newEmail} onChange={(e) => setNewEmail(e.target.value)} />
            <button className={btn}><Plus className="w-4 h-4" /> Enroll</button>
          </form>
          <div className="bg-stone-900 border border-stone-800 rounded-2xl overflow-hidden">
            <table className="w-full text-sm">
              <thead><tr className="text-left text-xs text-stone-500 uppercase border-b border-stone-800">
                <th className="px-4 py-3">Student</th><th className="px-4 py-3">Source</th><th className="px-4 py-3">Progress</th><th className="px-4 py-3"></th>
              </tr></thead>
              <tbody>
                {enrollments.map((e) => (
                  <tr key={e.id} className="border-b border-stone-800/60">
                    <td className="px-4 py-3">{e.student_email}</td>
                    <td className="px-4 py-3 text-stone-500">{e.source}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div className="w-32 h-2 bg-stone-800 rounded-full overflow-hidden">
                          <div className="h-full bg-amber-500 rounded-full" style={{ width: `${e.completion_pct}%` }} />
                        </div>
                        <span className="text-xs text-stone-400">{e.completion_pct}%</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button className={`${iconBtn} hover:text-red-400`} onClick={() => api.removeEnrollment(e.id).then(load)}><Trash2 className="w-4 h-4" /></button>
                    </td>
                  </tr>
                ))}
                {enrollments.length === 0 && <tr><td colSpan={4} className="px-4 py-8 text-center text-stone-600">No students enrolled yet.</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === 'settings' && meta && (
        <div className="max-w-lg space-y-3">
          <label className="block"><span className="text-xs text-stone-400 uppercase">Title</span>
            <input className={`${input} mt-1`} value={meta.title} onChange={(e) => setMeta({ ...meta, title: e.target.value })} /></label>
          <label className="block"><span className="text-xs text-stone-400 uppercase">Description</span>
            <textarea className={`${input} mt-1 min-h-24`} value={meta.description} onChange={(e) => setMeta({ ...meta, description: e.target.value })} /></label>
          <label className="block"><span className="text-xs text-stone-400 uppercase">Price (cents, 0 = free)</span>
            <input className={`${input} mt-1`} type="number" min="0" value={meta.price_cents} onChange={(e) => setMeta({ ...meta, price_cents: Number(e.target.value) })} /></label>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" className="accent-amber-500" checked={meta.published} onChange={(e) => setMeta({ ...meta, published: e.target.checked })} />
            Published (visible in the catalog)
          </label>
          <div className="flex gap-2">
            <button className={btn} onClick={saveMeta}><Check className="w-4 h-4" /> Save</button>
            <button className={`${btnGhost} hover:border-red-500 hover:text-red-400`} onClick={() => {
              if (confirm(`Delete course "${course.title}" entirely?`)) api.deleteCourse(courseId).then(onBack);
            }}><Trash2 className="w-4 h-4" /> Delete course</button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── instructor shell ─────────────────────────────────────────────────────────
export default function Instructor({ onExit }) {
  const [authed, setAuthed] = useState(null);
  const [courses, setCourses] = useState([]);
  const [stats, setStats] = useState([]);
  const [open, setOpen] = useState(null); // courseId
  const [newTitle, setNewTitle] = useState('');

  const load = useCallback(async () => {
    setCourses(await api.courses());
    setStats(await api.stats());
  }, []);

  useEffect(() => {
    api.me().then(() => setAuthed(true)).catch(() => setAuthed(false));
  }, []);
  useEffect(() => { if (authed) load().catch(() => {}); }, [authed, load, open]);

  if (authed === null) return null;
  if (!authed) return <AdminLogin onLogin={() => setAuthed(true)} onExit={onExit} />;

  return (
    <div className="min-h-screen">
      <header className="border-b border-stone-800/80 bg-stone-950/80 backdrop-blur sticky top-0 z-40">
        <div className="max-w-5xl mx-auto px-6 h-14 flex items-center gap-3">
          <GraduationCap className="w-5 h-5 text-amber-400" />
          <span className="font-semibold">Lessonforge</span>
          <span className="text-xs text-stone-500">instructor</span>
          <div className="flex-1" />
          <button onClick={async () => { await api.logout(); onExit(); }} className={iconBtn} title="Sign out"><LogOut className="w-4 h-4" /></button>
        </div>
      </header>
      <main className="max-w-5xl mx-auto px-6 py-8">
        {open ? (
          <CourseEditor courseId={open} onBack={() => setOpen(null)} />
        ) : (
          <div className="space-y-8">
            <section>
              <h2 className="text-sm font-medium text-stone-400 mb-3 flex items-center gap-2"><BarChart3 className="w-4 h-4" /> Overview</h2>
              <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {stats.map((s) => (
                  <div key={s.course_id} className="bg-stone-900 border border-stone-800 rounded-2xl p-4">
                    <p className="font-medium text-sm truncate">{s.title}</p>
                    <div className="mt-2 grid grid-cols-3 gap-2 text-center">
                      <div><p className="text-lg font-semibold">{s.enrollment_count}</p><p className="text-[10px] text-stone-500 uppercase">students</p></div>
                      <div><p className="text-lg font-semibold">{s.completion_rate_pct}%</p><p className="text-[10px] text-stone-500 uppercase">completed</p></div>
                      <div><p className="text-lg font-semibold">{dollars(s.revenue_cents)}</p><p className="text-[10px] text-stone-500 uppercase">revenue</p></div>
                    </div>
                  </div>
                ))}
                {stats.length === 0 && <p className="text-sm text-stone-600">Create your first course below.</p>}
              </div>
            </section>
            <section className="space-y-3">
              <h2 className="text-sm font-medium text-stone-400 flex items-center gap-2"><Users className="w-4 h-4" /> Courses</h2>
              {courses.map((c) => (
                <button key={c.id} onClick={() => setOpen(c.id)}
                  className="w-full text-left bg-stone-900 border border-stone-800 hover:border-stone-600 rounded-2xl p-5 transition-colors">
                  <div className="flex items-center gap-3">
                    <span className="font-medium flex-1">{c.title}</span>
                    <span className="text-xs text-stone-500">{c.module_count} modules · {c.lesson_count} lessons · {c.enrollment_count} students</span>
                    <span className={`text-xs px-2 py-0.5 rounded-full ${c.published ? 'bg-emerald-500/15 text-emerald-400' : 'bg-stone-800 text-stone-500'}`}>
                      {c.published ? dollars(c.price_cents) : 'draft'}
                    </span>
                  </div>
                  {c.description && <p className="text-sm text-stone-500 mt-1 line-clamp-1">{c.description}</p>}
                </button>
              ))}
              <form className="flex gap-2" onSubmit={async (e) => {
                e.preventDefault();
                if (!newTitle.trim()) return;
                const c = await api.createCourse({ title: newTitle });
                setNewTitle('');
                setOpen(c.id);
              }}>
                <input className={input} placeholder="New course title…" value={newTitle} onChange={(e) => setNewTitle(e.target.value)} />
                <button className={btn}><Plus className="w-4 h-4" /> Create course</button>
              </form>
            </section>
          </div>
        )}
      </main>
    </div>
  );
}
