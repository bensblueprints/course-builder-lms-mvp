# Launch strategy — Lessonforge

## Target communities

- **r/CourseCreators** — direct fit; "I built a self-hosted Teachable alternative, AMA about the economics" post with the fee math table. Disclose it's your product.
- **r/selfhosted** — tool announcement post; lead with SQLite/Docker/MIT, mention BYO Stripe. This sub converts on ownership.
- **r/Entrepreneur / r/sidehustle** — story angle: "platform fees are the silent tax on course creators"; tool linked in comments per sub rules.
- **r/juststart** — case-study framing once there's a real user; no bare product drops.
- **Indie Hackers** — build-in-public post on the "no per-sale cut" positioning and why BYO Stripe beats marketplace rails for solo creators.

## Show HN draft

**Title:** Show HN: Lessonforge – self-hosted course platform (Teachable takes a monthly fee and a sales cut)

Course platforms are structurally simple — ordered lessons, a quiz, a progress table — but the incumbents charge $39–119/mo plus up to 5% of each sale.

Lessonforge is that core, self-hosted: Node/Express/better-sqlite3 backend, React front-end, Electron wrapper for desktop authoring. Things HN might find interesting:

- Payments are BYO Stripe Checkout: the server creates a session with your key and verifies `payment_status` server-side on the redirect back before enrolling — no webhooks required for the single-server case, no platform in the money path.
- Lesson HTML goes through a dependency-free allowlist sanitizer (tags, attributes, and URL schemes); the smoke test asserts script bodies, event handlers, and javascript: URLs are all inert.
- Quiz correct-answers are stripped from every student-facing payload; grading is server-side with exact-percentage thresholds per module.
- Certificates are generated PDFs (pdfkit) streamed on the fly once progress hits 100%.

MIT licensed. The paid product is just a packaged installer.

## SEO keywords

1. teachable alternative no transaction fee
2. self hosted course platform
3. thinkific alternative
4. lms software one time purchase
5. sell online courses without monthly fee
6. self hosted lms open source
7. course platform own stripe account
8. kajabi alternative cheap
9. create online course software one time
10. lms with quiz and certificate self hosted

## AppSumo / PitchGround pitch

Lessonforge hands course creators the thing every platform rents them: the platform itself. Modules, video and rich-text lessons, quizzes with pass thresholds, progress tracking, PDF certificates, student accounts, and paid enrollment through the creator's own Stripe account — 0% platform cut, forever. Self-hosted via Docker or run as a desktop app; data in one SQLite file. LTD buyers are creators who already resent the monthly-fee-plus-revenue-share model, and "own your platform, keep 100% of sales" is the cleanest lifetime-deal story there is. Comfortable margin at a $69–99 LTD tier with installer + updates.

## Pricing math

**$49 one-time.** Teachable Basic is $39/mo + 5% of sales → Lessonforge pays for itself in **under 6 weeks on the subscription alone**, before counting the sales cut. Against Thinkific Start ($49/mo): one month. A creator doing $10k/yr in course sales on a 5%-fee plan saves ~$970 in year one.
