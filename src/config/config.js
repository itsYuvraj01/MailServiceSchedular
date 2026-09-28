const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });


module.exports = {
  port: process.env.PORT || 3000,
  cronSchedule: process.env.CRON_SCHEDULE || '0 9 * * *',
  timezone: process.env.TIMEZONE || 'Asia/Kolkata',

  // Mail settings
  mail: {
    host: process.env.SMTP_HOST,
    port: parseInt(process.env.SMTP_PORT || '587', 10),
    secure: process.env.SMTP_SECURE === 'true',
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
    from: process.env.MAIL_FROM,
    recipients: process.env.REPORT_RECIPIENTS
  },

  // MS SQL Server / SSMS Database & Connection Pool Settings
  db: {
    server: process.env.DB_SERVER || 'localhost',
    port: parseInt(process.env.DB_PORT || '1433', 10),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    options: {
      encrypt: process.env.DB_ENCRYPT === 'true', // true for Azure, false for local/on-prem
      trustServerCertificate: process.env.DB_TRUST_SERVER_CERTIFICATE === 'true', // true for local self-signed dev certs
      enableArithAbort: true
    },
    pool: {
      max: parseInt(process.env.DB_POOL_MAX || '10', 10),
      min: parseInt(process.env.DB_POOL_MIN || '0', 10),
      idleTimeoutMillis: parseInt(process.env.DB_POOL_IDLE_TIMEOUT || '30000', 10)
    }
  }
};
