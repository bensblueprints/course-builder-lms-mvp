# 🎓 Lessonforge

**Your courses, your platform, your revenue. Pay once — no monthly fee, no per-sale cut.**

[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)

Lessonforge is a self-hosted course platform (LMS). Build courses out of modules and lessons — video, rich text, downloadable attachments — add quizzes with pass thresholds, enroll students by access code or Stripe Checkout, track progress, and issue PDF certificates on completion.

Teachable charges **$39+/month *and* takes a transaction fee on your sales**. Thinkific is the same story. Lessonforge takes neither: it's $49 once, runs on your $5 VPS (or your desktop), and payments go through **your own Stripe account** at Stripe's standard rates.

![screenshot](docs/screenshot.png)

## Features

- 📚 **Courses → modules → lessons** — video (YouTube/Vimeo embed or self-hosted upload up to 500MB), rich-text lessons (server-side sanitized HTML), downloadable attachments, reorder everything.
- 🧑‍🎓 **Three enrollment paths** — instructor adds a student manually; student self-serves with a per-course access code (`FORGE-XXXXXX`); or paid enrollment via **BYO Stripe Checkout** (your key, your money, zero platform cut).
- ✅ **Progress tracking** — mark-complete per lesson, live completion %, and a generated **PDF certificate** the moment a student hits 100%.
- 📝 **Quizzes** — multiple-choice + true/false per module, configurable pass threshold, unlimited retakes, every attempt logged. Correct answers are never sent to the student's browser.
- 📊 **Instructor dashboard** — enrollment counts, average completion, completion rate, and revenue per course.
- 🔒 **Two auth realms** — instructor password (env) + student email/password accounts (scrypt-hashed). Student and admin sessions are fully separate.

## Quick start

```bash
npm i
npm run build
cp .env.example .env   # set ADMIN_PASSWORD (+ STRIPE_SECRET_KEY to sell)
npm start              # → http://localhost:5364
```

**Run it as a desktop app, or deploy to a $5 VPS when you need it public:**

```bash
npm run desktop        # Electron window, auto-logged-in as instructor
# or
docker compose up -d   # VPS mode, SQLite + uploads persisted in a volume
```

## Lessonforge vs Teachable

| | **Lessonforge** | **Teachable** |
|---|---|---|
| Price | **$49 once** | $39–$119/mo ($468–1,428/yr) |
| Transaction fee | **0%** (Stripe direct) | 5% on Basic, 0% only on higher tiers |
| Courses / modules / lessons | ✅ unlimited | plan-limited |
| Quizzes + certificates | ✅ | ✅ (certificates = Pro plan) |
| Students | unlimited | plan-limited on some tiers |
| Video | embed or self-host | hosted (their limits) |
| Your data | your SQLite file + disk | their cloud |
| Custom domain | ✅ it's your server | paid plans |

*Selling one $49 course to 10 students on Teachable Basic costs you ~$25/mo + 5% of every sale, forever. Lessonforge costs less than one month of that.*

## ☕ Skip the setup — get the 1-click installer

Grab the packaged Windows installer on Whop: **https://whop.com/benjisaiempire/lessonforge

## Tech stack

Node 20 + Express + better-sqlite3 · React 18 + Vite + Tailwind 4 + Framer Motion + Lucide · pdfkit (certificates) · multer (uploads) · Stripe Checkout (BYO key, optional) · Electron desktop wrapper · Docker

## Tests

```bash
npm test   # boots the real server; asserts sanitization, exact quiz scores,
           # progress math, PDF certificate — Stripe is never called
```

## License

MIT © 2026 Ben (bensblueprints)

## macOS build

See [MAC-BUILD.md](MAC-BUILD.md). Quickest path: GitHub **Actions** tab -> run the **Mac Build** (`mac-build.yml`) workflow to get a downloadable `.dmg` (unsigned - right-click -> Open on first launch).
