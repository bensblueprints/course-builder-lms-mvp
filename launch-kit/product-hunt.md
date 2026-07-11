# Product Hunt — Lessonforge

**Name:** Lessonforge

**Tagline (60 chars):** Sell courses without Teachable's monthly fee or sales cut

**Description (260 chars):**
Lessonforge is a self-hosted course platform: modules, video + rich-text lessons, quizzes with pass thresholds, progress tracking, PDF certificates, and paid enrollment via YOUR Stripe account. $49 once — no monthly fee, no per-sale platform cut. MIT source.

**Full description:**
Course platforms double-dip: Teachable charges $39–119/month AND takes up to 5% of every sale. For a creator selling a $200 course, that's real money forever.

Lessonforge is the core LMS as a product you own:

- Build courses from modules and lessons — YouTube/Vimeo embeds or self-hosted video uploads, sanitized rich-text lessons, downloadable attachments, drag-order everything.
- Quizzes per module (multiple choice + true/false) with a pass threshold and unlimited retakes. Answers never reach the student's browser.
- Students sign up with email/password, enroll with a per-course access code — or pay through Stripe Checkout using YOUR Stripe key. Money goes straight to you at Stripe's standard rates. Zero platform cut, because there's no platform.
- Progress tracking with a live completion bar, and a designed PDF certificate generated the moment a student hits 100%.
- Instructor dashboard: enrollments, completion rate, revenue per course.

Runs as a desktop app for authoring, deploys to a $5 VPS with Docker when you're ready to sell. SQLite means backup = copy one file. MIT source.

**Maker first comment:**
Hi PH 👋 I got tired of watching creator friends do the math on Teachable: $468+/yr in fees plus a cut of every sale, to host what is structurally a list of videos, some quiz logic, and a progress bar.

So I built Lessonforge. The opinionated choices: BYO Stripe (your money never touches my code's hands — the server just creates a Checkout session with your key and verifies it server-side), server-side HTML sanitization for lesson content, and quiz correct-answers stripped from every student-facing response. The smoke test asserts exact quiz scores and that Stripe is never called in test mode. Source is MIT; the paid product is the convenience installer. Happy to talk architecture or the economics of course platforms.

**Gallery shots (5):**
1. Instructor course editor — modules, lessons, quiz questions in one tree.
2. Student course player — sidebar progress, video lesson, "mark complete".
3. Quiz-taking view with pass/fail result card ("Score: 67% — need ≥70%").
4. The generated PDF certificate (dark, gold border).
5. Instructor dashboard — enrollments / completion rate / revenue tiles.
