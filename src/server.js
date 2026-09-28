const express = require('express');
const config = require('./config/config');
const logger = require('./utils/logger');
const { getPool } = require('./config/db');
const { initDailyJob } = require('./jobs/dailyJobs');
const schedulerRoutes = require('./routes/schedulerRoutes');

const app = express();
app.use(express.json());

// Routes
app.use('/api/scheduler', schedulerRoutes);

// Health route
app.get('/', (req, res) => {
  res.send('Daily Mail Scheduler Service is running');
});

// Start server and initialize scheduler
app.listen(config.port, async () => {
  logger.info(`=========================================`);
  logger.info(`Daily Mail Scheduler Service started`);
  logger.info(`Server running on port ${config.port}`);
  logger.info(`=========================================`);

  // Check Database Connection on startup
  try {
    await getPool();
    logger.info(` Database Connection Status: SUCCESS (Connected to database "${config.db.database}" at ${config.db.server}:${config.db.port})`);
  } catch (err) {
    logger.error(`❌ Database Connection Status: FAILED - ${err.message}`);
  }

  // Initialize the cron scheduler
  initDailyJob();
});

