require('dotenv').config();
const path = require('path');
const { createApp } = require('./app');

const PORT = Number(process.env.PORT) || 5364;
const DB_PATH = process.env.DB_PATH || path.join(__dirname, '..', 'data', 'lessonforge.db');
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin';

const app = createApp({ dbPath: DB_PATH, adminPassword: ADMIN_PASSWORD });

app.listen(PORT, () => {
  console.log(`Lessonforge listening on http://localhost:${PORT}`);
  if (ADMIN_PASSWORD === 'admin') {
    console.log('⚠ Using default admin password — set ADMIN_PASSWORD in .env for production.');
  }
  if (!process.env.STRIPE_SECRET_KEY) {
    console.log('ℹ Stripe checkout disabled (optional — set STRIPE_SECRET_KEY to sell courses).');
  }
});
