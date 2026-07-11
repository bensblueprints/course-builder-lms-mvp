import React, { useEffect, useState } from 'react';
import { GraduationCap, Presentation, BookOpen } from 'lucide-react';
import { api } from './api.js';
import Instructor from './components/Instructor.jsx';
import StudentPortal from './components/StudentPortal.jsx';

export default function App() {
  // role: null=checking, 'pick', 'instructor', 'student'
  const [role, setRole] = useState(null);

  useEffect(() => {
    (async () => {
      try { await api.me(); setRole('instructor'); return; } catch { /* not admin */ }
      try { await api.studentMe(); setRole('student'); return; } catch { /* not student */ }
      setRole('pick');
    })();
  }, []);

  if (role === null) return <div className="min-h-screen grid place-items-center text-stone-500">Loading…</div>;
  if (role === 'instructor') return <Instructor onExit={() => setRole('pick')} />;
  if (role === 'student') return <StudentPortal onExit={() => setRole('pick')} />;

  return (
    <div className="min-h-screen grid place-items-center px-4">
      <div className="w-full max-w-md text-center space-y-8">
        <div>
          <div className="flex items-center justify-center gap-2 text-2xl font-semibold tracking-tight">
            <GraduationCap className="w-8 h-8 text-amber-400" /> Lessonforge
          </div>
          <p className="text-sm text-stone-500 mt-2">Your courses, your platform. Pay once, own it forever.</p>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <button onClick={() => setRole('student')}
            className="bg-stone-900 border border-stone-800 hover:border-amber-500/50 rounded-2xl p-6 space-y-2 transition-colors">
            <BookOpen className="w-7 h-7 text-amber-400 mx-auto" />
            <p className="font-medium">I'm a student</p>
            <p className="text-xs text-stone-500">Take courses, track progress, earn certificates</p>
          </button>
          <button onClick={() => setRole('instructor')}
            className="bg-stone-900 border border-stone-800 hover:border-amber-500/50 rounded-2xl p-6 space-y-2 transition-colors">
            <Presentation className="w-7 h-7 text-amber-400 mx-auto" />
            <p className="font-medium">I'm the instructor</p>
            <p className="text-xs text-stone-500">Build courses, manage students, see stats</p>
          </button>
        </div>
      </div>
    </div>
  );
}
