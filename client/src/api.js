async function req(path, options = {}) {
  const res = await fetch(path, {
    headers: options.form ? {} : { 'Content-Type': 'application/json' },
    credentials: 'same-origin',
    ...options,
    body: options.form ? options.form : options.body != null ? JSON.stringify(options.body) : undefined
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.error || `HTTP ${res.status}`);
    err.status = res.status;
    throw err;
  }
  return data;
}

export const api = {
  // instructor
  me: () => req('/api/me'),
  login: (password) => req('/api/login', { method: 'POST', body: { password } }),
  logout: () => req('/api/logout', { method: 'POST' }),
  stats: () => req('/api/stats'),
  courses: () => req('/api/courses'),
  course: (id) => req(`/api/courses/${id}`),
  createCourse: (body) => req('/api/courses', { method: 'POST', body }),
  updateCourse: (id, body) => req(`/api/courses/${id}`, { method: 'PUT', body }),
  deleteCourse: (id) => req(`/api/courses/${id}`, { method: 'DELETE' }),
  createModule: (courseId, body) => req(`/api/courses/${courseId}/modules`, { method: 'POST', body }),
  updateModule: (id, body) => req(`/api/modules/${id}`, { method: 'PUT', body }),
  deleteModule: (id) => req(`/api/modules/${id}`, { method: 'DELETE' }),
  reorderModules: (courseId, ids) => req(`/api/courses/${courseId}/modules/reorder`, { method: 'PUT', body: { ids } }),
  createLesson: (moduleId, body) => req(`/api/modules/${moduleId}/lessons`, { method: 'POST', body }),
  updateLesson: (id, body) => req(`/api/lessons/${id}`, { method: 'PUT', body }),
  deleteLesson: (id) => req(`/api/lessons/${id}`, { method: 'DELETE' }),
  reorderLessons: (moduleId, ids) => req(`/api/modules/${moduleId}/lessons/reorder`, { method: 'PUT', body: { ids } }),
  createQuestion: (moduleId, body) => req(`/api/modules/${moduleId}/questions`, { method: 'POST', body }),
  updateQuestion: (id, body) => req(`/api/questions/${id}`, { method: 'PUT', body }),
  deleteQuestion: (id) => req(`/api/questions/${id}`, { method: 'DELETE' }),
  enrollments: (courseId) => req(`/api/courses/${courseId}/enrollments`),
  addEnrollment: (courseId, email) => req(`/api/courses/${courseId}/enrollments`, { method: 'POST', body: { student_email: email } }),
  removeEnrollment: (id) => req(`/api/enrollments/${id}`, { method: 'DELETE' }),
  uploadVideo: (file) => { const f = new FormData(); f.append('file', file); return req('/api/upload/video', { method: 'POST', form: f }); },
  uploadAttachment: (lessonId, file) => { const f = new FormData(); f.append('file', file); return req(`/api/lessons/${lessonId}/attachments`, { method: 'POST', form: f }); },
  deleteAttachment: (id) => req(`/api/attachments/${id}`, { method: 'DELETE' }),
  // student
  studentMe: () => req('/api/student/me'),
  studentSignup: (body) => req('/api/student/signup', { method: 'POST', body }),
  studentLogin: (body) => req('/api/student/login', { method: 'POST', body }),
  studentLogout: () => req('/api/student/logout', { method: 'POST' }),
  catalog: () => req('/api/catalog'),
  enroll: (access_code) => req('/api/student/enroll', { method: 'POST', body: { access_code } }),
  checkout: (course_id) => req('/api/student/checkout', { method: 'POST', body: { course_id } }),
  myCourses: () => req('/api/student/courses'),
  myCourse: (id) => req(`/api/student/courses/${id}`),
  completeLesson: (id) => req(`/api/student/lessons/${id}/complete`, { method: 'POST' }),
  uncompleteLesson: (id) => req(`/api/student/lessons/${id}/complete`, { method: 'DELETE' }),
  submitQuiz: (moduleId, answers) => req(`/api/student/modules/${moduleId}/quiz`, { method: 'POST', body: { answers } })
};

export function dollars(cents) {
  return cents ? `$${(cents / 100).toFixed(2).replace(/\.00$/, '')}` : 'Free';
}
