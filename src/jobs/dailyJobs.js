const cron = require('node-cron');
const config = require('../config/config');
const logger = require('../utils/logger');
const { generateAndSendDailyReport } = require('../services/reportService');

/**
 * Initializes and schedules the daily report cron job
 */
const initDailyJob = () => {
  logger.info(`Registering Daily Cron Job with schedule: "${config.cronSchedule}" (Timezone: ${config.timezone})`);

  // Default is "0 9 * * *" -> 9:00 AM daily
  cron.schedule(
    config.cronSchedule,
    async () => {
      logger.info('⏰ Cron trigger fired: Executing scheduled daily report job...');
      try {
        await generateAndSendDailyReport();
      } catch (err) {
        logger.error(`Error during scheduled report execution: ${err.message}`);
      }
    },
    {
      scheduled: true,
      timezone: config.timezone
    }
  );
};

module.exports = { initDailyJob };
