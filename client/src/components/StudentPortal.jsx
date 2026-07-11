import React, { useEffect, useState, useCallback } from 'react';
import { motion } from 'framer-motion';
import {
  GraduationCap, LogOut, BookOpen, CheckCircle2, Circle, Video, FileText,
  Award, Paperclip, ChevronRight, ArrowLeft, KeyRound, CreditCard
} from 'lucide-react';
import { api, dollars } from '../api.js';

const input = 'w-full bg-stone-950 border border-stone-800 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-amber-500';
const btn = 'inline-flex items-center gap-1.5 bg-amber-500 hover:bg-amber-400 text-stone-950 font-medium text-sm rounded-lg px-3.5 py-2 transition-colors disabled:opacity-50';

function StudentAuth({ onAuthed, onExit }) {
  const [mode, setMode] = useState('login');
  const [form, setForm] = useState({ name: '', email: '', password: '' });
  const [error, setError] = useState('');
  const submit = async (e) => {
    e.preventDefault();
    setError('');
    try {
      if (mode === 'signup') await api.studentSignup(form);
      else await api.studentLogin(form);
      onAuthed();
    } catch (err) { setError(err.message); }
  };
  return (
    <div className="min-h-screen grid place-items-center px-4">
      <motion.form initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} onSubmit={submit}
        className="w-full max-w-sm bg-stone-900 border border-stone-800 rounded-2xl p-8 space-y-4">
        <div className="flex items-center gap-2 justify-center text-lg font-semibold">
          <BookOpen className="w-6 h-6 text-amber-400" /> {mode === 'signup' ? 'Create account' : 'Student sign-in'}
        </div>
        {mode === 'signup' && (
          <input className={input} placeholder="Your name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        )}
        <input className={input} type="email" placeholder="you@email.com" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
        <input className={input} type="password" placeholder="Password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
        {error && <p className="text-sm text-red-400">{error}</p>}
        <button className={`${btn} w-full justify-center`}>{mode === 'signup' ? 'Sign up' : 'Sign in'}</button>
        <button type="button" className="w-full text-xs text-stone-500 hover:text-stone-300"
          onClick={() => setMode(mode === 'signup' ? 'login' : 'signup')}>
          {mode === 'signup' ? 'Have an account? Sign in' : "New here? Create an account"}
        </button>
        <button type="button" onClick={onExit} className="w-full text-xs text-stone-600 hover:text-stone-400">← back</button>
      </motion.form>
    </div>
  );
}

function Quiz({ module, onSubmitted }) {
  const [answers, setAnswers] = useState({});
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const qs = module.quiz_questions;

  const submit = async () => {
    setError('');
    try {
      const arr = qs.map((q, i) => Number(answers[i] ?? -1));
      const r = await api.submitQuiz(module.id, arr);
      setResult(r);
      onSubmitted();
    } catch (e) { setError(e.message); }
  };

  if (result) {
    return (
      <div className={`rounded-xl border p-5 ${result.passed ? 'border-emerald-500/40 bg-emerald-500/5' : 'border-red-500/40 bg-red-500/5'}`}>
        <p className="font-semibold">{result.passed ? '🎉 Passed!' : 'Not quite.'} Score: {result.score}% ({result.correct}/{result.total} correct, need ≥{result.pass_threshold}%)</p>
        <p className="text-xs text-stone-500 mt-1">Attempt #{result.attempt}. {!result.passed && 'Retakes are allowed — review the lessons and try again.'}</p>
        {!result.passed && (
          <button className={`${btn} mt-3`} onClick={() => { setResult(null); setAnswers({}); }}>Retake quiz</button>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {qs.map((q, i) => (
        <div key={q.id} className="bg-stone-950/60 border border-stone-800 rounded-xl p-4">
          <p className="text-sm font-medium">{i + 1}. {q.question}</p>
          <div className="mt-2 space-y-1.5">
            {q.options.map((o, j) => (
              <label key={j} className="flex items-center gap-2 text-sm text-stone-300 cursor-pointer">
                <input type="radio" name={`q${q.id}`} className="accent-amber-500"
                  checked={answers[i] === j} onChange={() => setAnswers({ ...answers, [i]: j })} />
                {o}
              </label>
            ))}
          </div>
        </div>
      ))}
      {error && <p className="text-sm text-red-400">{error}</p>}
      <button className={btn} disabled={Object.keys(answers).length !== qs.length} onClick={submit}>
        Submit quiz
      </button>
    </div>
  );
}

function VideoEmbed({ url }) {
  // YouTube / Vimeo links → iframe embeds; anything else → native <video>
  const yt = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([\w-]{6,})/);
  if (yt) return <iframe className="w-full aspect-video rounded-xl" src={`https://www.youtube.com/embed/${yt[1]}`} allowFullScreen title="video" />;
  const vm = url.match(/vimeo\.com\/(?:video\/)?(\d+)/);
  if (vm) return <iframe className="w-full aspect-video rounded-xl" src={`https://player.vimeo.com/video/${vm[1]}`} allowFullScreen title="video" />;
  return <video className="w-full rounded-xl" src={url} controls />;
}

function CoursePlayer({ courseId, onBack }) {
  const [course, setCourse] = useState(null);
  const [sel, setSel] = useState(null); // { type:'lesson'|'quiz', id }
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    const c = await api.myCourse(courseId);
    setCourse(c);
    return c;
  }, [courseId]);

  useEffect(() => {
    load().then((c) => {
      const first = c.modules.find((m) => m.lessons.length)?.lessons[0];
      if (first) setSel({ type: 'lesson', id: first.id });
    }).catch((e) => setError(e.message));
  }, [load]);

  if (!course) return <p className="text-stone-500 text-sm p-8">{error || 'Loading…'}</p>;

  const doneSet = new Set(course.completed_lessons.map((p) => p.lesson_id));
  const lesson = sel?.type === 'lesson'
    ? course.modules.flatMap((m) => m.lessons).find((l) => l.id === sel.id)
    : null;
  const quizModule = sel?.type === 'quiz' ? course.modules.find((m) => m.id === sel.id) : null;
  const bestAttempt = (mid) => {
    const at = course.quiz_attempts.filter((a) => a.module_id === mid);
    if (!at.length) return null;
    return at.reduce((a, b) => (b.score > a.score ? b : a));
  };

  const toggleComplete = async (l) => {
    if (doneSet.has(l.id)) await api.uncompleteLesson(l.id);
    else await api.completeLesson(l.id);
    load();
  };

  return (
    <div className="min-h-screen flex">
      <aside className="w-80 shrink-0 border-r border-stone-800 p-5 overflow-y-auto">
        <button onClick={onBack} className="flex items-center gap-1.5 text-sm text-stone-400 hover:text-stone-200 mb-4">
          <ArrowLeft className="w-4 h-4" /> My courses
        </button>
        <h2 className="font-semibold">{course.title}</h2>
        <div className="mt-2 flex items-center gap-2">
          <div className="flex-1 h-2 bg-stone-800 rounded-full overflow-hidden">
            <div className="h-full bg-amber-500 rounded-full transition-all" style={{ width: `${course.completion_pct}%` }} />
          </div>
          <span className="text-xs text-stone-400">{course.completion_pct}%</span>
        </div>
        {course.completion_pct === 100 && (
          <a href={`/api/student/courses/${courseId}/certificate`} target="_blank" rel="noreferrer"
            className={`${btn} w-full justify-center mt-3`}>
            <Award className="w-4 h-4" /> Download certificate
          </a>
        )}
        <div className="mt-5 space-y-4">
          {course.modules.map((m, mi) => (
            <div key={m.id}>
              <p className="text-xs text-stone-500 uppercase tracking-wide mb-1.5">{mi + 1}. {m.title}</p>
              <div className="space-y-0.5">
                {m.lessons.map((l) => (
                  <button key={l.id} onClick={() => setSel({ type: 'lesson', id: l.id })}
                    className={`w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-sm text-left transition-colors ${sel?.type === 'lesson' && sel.id === l.id ? 'bg-stone-800 text-stone-100' : 'text-stone-400 hover:bg-stone-900'}`}>
                    {doneSet.has(l.id)
                      ? <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                      : <Circle className="w-4 h-4 text-stone-600 shrink-0" />}
                    <span className="flex-1 truncate">{l.title}</span>
                    {l.type === 'video' && <Video className="w-3.5 h-3.5 text-stone-600" />}
                  </button>
                ))}
                {m.quiz_questions.length > 0 && (
                  <button onClick={() => setSel({ type: 'quiz', id: m.id })}
                    className={`w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-sm text-left transition-colors ${sel?.type === 'quiz' && sel.id === m.id ? 'bg-stone-800 text-stone-100' : 'text-stone-400 hover:bg-stone-900'}`}>
                    {bestAttempt(m.id)?.passed
                      ? <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                      : <FileText className="w-4 h-4 text-amber-400/70 shrink-0" />}
                    <span className="flex-1">Quiz ({m.quiz_questions.length} questions)</span>
                    {bestAttempt(m.id) && <span className="text-xs text-stone-500">{bestAttempt(m.id).score}%</span>}
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      </aside>
      <main className="flex-1 p-8 overflow-y-auto max-w-4xl">
        {lesson && (
          <div className="space-y-5">
            <div className="flex items-center justify-between gap-4">
              <h1 className="text-xl font-semibold">{lesson.title}</h1>
              <button onClick={() => toggleComplete(lesson)}
                className={doneSet.has(lesson.id)
                  ? 'inline-flex items-center gap-1.5 text-sm text-emerald-400 border border-emerald-500/40 rounded-lg px-3 py-1.5'
                  : btn}>
                <CheckCircle2 className="w-4 h-4" /> {doneSet.has(lesson.id) ? 'Completed' : 'Mark complete'}
              </button>
            </div>
            {lesson.type === 'video'
              ? (lesson.content ? <VideoEmbed url={lesson.content} /> : <p className="text-stone-500 text-sm">No video URL set.</p>)
              : <div className="lesson-content" dangerouslySetInnerHTML={{ __html: lesson.content }} />}
            {lesson.attachments?.length > 0 && (
              <div className="border-t border-stone-800 pt-4 space-y-1.5">
                <p className="text-xs text-stone-500 uppercase tracking-wide">Downloads</p>
                {lesson.attachments.map((a) => (
                  <a key={a.id} href={`/api/attachments/${a.id}/download`}
                    className="flex items-center gap-2 text-sm text-amber-400 hover:text-amber-300">
                    <Paperclip className="w-4 h-4" /> {a.filename}
                    <span className="text-xs text-stone-600">({Math.round(a.size_bytes / 1024)} KB)</span>
                  </a>
                ))}
              </div>
            )}
          </div>
        )}
        {quizModule && (
          <div className="space-y-5">
            <h1 className="text-xl font-semibold">Quiz — {quizModule.title}</h1>
            <p className="text-sm text-stone-500">Pass threshold: {quizModule.quiz_pass_pct}%. Retakes allowed.</p>
            <Quiz module={quizModule} onSubmitted={load} />
          </div>
        )}
      </main>
    </div>
  );
}

export default function StudentPortal({ onExit }) {
  const [authed, setAuthed] = useState(null);
  const [me, setMe] = useState(null);
  const [mine, setMine] = useState([]);
  const [catalog, setCatalog] = useState([]);
  const [open, setOpen] = useState(null);
  const [code, setCode] = useState('');
  const [msg, setMsg] = useState('');

  const load = useCallback(async () => {
    setMine(await api.myCourses());
    setCatalog(await api.catalog());
  }, []);

  useEffect(() => {
    api.studentMe().then((m) => { setMe(m); setAuthed(true); }).catch(() => setAuthed(false));
  }, []);
  useEffect(() => { if (authed) load().catch(() => {}); }, [authed, load, open]);

  if (authed === null) return null;
  if (!authed) return <StudentAuth onExit={onExit} onAuthed={async () => { setMe(await api.studentMe()); setAuthed(true); }} />;
  if (open) return <CoursePlayer courseId={open} onBack={() => setOpen(null)} />;

  const redeem = async (e) => {
    e.preventDefault();
    setMsg('');
    try {
      const r = await api.enroll(code);
      setMsg(`Enrolled in "${r.course_title}"! 🎉`);
      setCode('');
      load();
    } catch (err) { setMsg(err.message); }
  };

  const buy = async (c) => {
    setMsg('');
    try {
      const { url } = await api.checkout(c.id);
      window.location.href = url; // Stripe-hosted checkout
    } catch (err) { setMsg(err.message); }
  };

  return (
    <div className="min-h-screen">
      <header className="border-b border-stone-800/80 bg-stone-950/80 backdrop-blur sticky top-0 z-40">
        <div className="max-w-4xl mx-auto px-6 h-14 flex items-center gap-3">
          <GraduationCap className="w-5 h-5 text-amber-400" />
          <span className="font-semibold">Lessonforge</span>
          <span className="text-xs text-stone-500">{me?.name || me?.email}</span>
          <div className="flex-1" />
          <button onClick={async () => { await api.studentLogout(); onExit(); }}
            className="p-2 rounded-lg hover:bg-stone-800 text-stone-400" title="Sign out"><LogOut className="w-4 h-4" /></button>
        </div>
      </header>
      <main className="max-w-4xl mx-auto px-6 py-8 space-y-10">
        <section>
          <h2 className="text-sm font-medium text-stone-400 mb-3">My courses</h2>
          <div className="space-y-3">
            {mine.map((c) => (
              <button key={c.enrollment_id} onClick={() => setOpen(c.course_id)}
                className="w-full text-left bg-stone-900 border border-stone-800 hover:border-stone-600 rounded-2xl p-5 transition-colors">
                <div className="flex items-center gap-3">
                  <span className="font-medium flex-1">{c.title}</span>
                  <span className="text-xs text-stone-500">{c.completed_count}/{c.lesson_count} lessons</span>
                  {c.completion_pct === 100 && <Award className="w-4 h-4 text-amber-400" />}
                  <ChevronRight className="w-4 h-4 text-stone-600" />
                </div>
                <div className="mt-3 h-2 bg-stone-800 rounded-full overflow-hidden">
                  <div className="h-full bg-amber-500 rounded-full" style={{ width: `${c.completion_pct}%` }} />
                </div>
              </button>
            ))}
            {mine.length === 0 && <p className="text-sm text-stone-600">Not enrolled in anything yet — redeem an access code or browse the catalog below.</p>}
          </div>
        </section>

        <section className="max-w-md">
          <h2 className="text-sm font-medium text-stone-400 mb-3 flex items-center gap-2"><KeyRound className="w-4 h-4" /> Have an access code?</h2>
          <form className="flex gap-2" onSubmit={redeem}>
            <input className={input} placeholder="FORGE-XXXXXX" value={code} onChange={(e) => setCode(e.target.value)} />
            <button className={btn}>Enroll</button>
          </form>
          {msg && <p className="text-sm text-stone-400 mt-2">{msg}</p>}
        </section>

        <section>
          <h2 className="text-sm font-medium text-stone-400 mb-3">Catalog</h2>
          <div className="grid sm:grid-cols-2 gap-3">
            {catalog.map((c) => (
              <div key={c.id} className="bg-stone-900 border border-stone-800 rounded-2xl p-5">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium">{c.title}</span>
                  <span className="text-xs text-amber-400">{dollars(c.price_cents)}</span>
                </div>
                {c.description && <p className="text-sm text-stone-500 mt-1 line-clamp-2">{c.description}</p>}
                <p className="text-xs text-stone-600 mt-2">{c.lesson_count} lessons</p>
                {c.enrolled ? (
                  <p className="text-xs text-emerald-400 mt-3">✓ Enrolled</p>
                ) : c.price_cents > 0 ? (
                  <button className={`${btn} mt-3`} onClick={() => buy(c)}><CreditCard className="w-4 h-4" /> Buy {dollars(c.price_cents)}</button>
                ) : (
                  <p className="text-xs text-stone-600 mt-3">Free — ask your instructor for the access code.</p>
                )}
              </div>
            ))}
            {catalog.length === 0 && <p className="text-sm text-stone-600">No published courses yet.</p>}
          </div>
        </section>
      </main>
    </div>
  );
}
