const cron = require('node-cron');
const config = require('../config/config');
const logger = require('../utils/logger');
const { generateAndSendDailyReport } = require('../services/reportService');
const { cleanOldLogs } = require('../services/logCleanupService');

/**
 * Initializes and schedules the daily report and log cleanup cron jobs
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

  // Register Log Cleanup Cron Job (Default: "0 0 * * *" -> Daily at midnight)
  logger.info(`Registering Log Cleanup Cron Job with schedule: "${config.logCleanupSchedule}" (Retention: ${config.logRetentionDays} days)`);
  cron.schedule(
    config.logCleanupSchedule,
    async () => {
      logger.info('⏰ Cron trigger fired: Executing log cleanup job...');
      try {
        await cleanOldLogs(config.logRetentionDays);
      } catch (err) {
        logger.error(`Error during log cleanup execution: ${err.message}`);
      }
    },
    {
      scheduled: true,
      timezone: config.timezone
    }
  );

  // Run initial cleanup on startup
  cleanOldLogs(config.logRetentionDays).catch((err) => {
    logger.warn(`Initial log cleanup warning: ${err.message}`);
  });
};

module.exports = { initDailyJob };

