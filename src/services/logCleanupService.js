const fs = require('fs');
const path = require('path');
const logger = require('../utils/logger');

const logsDir = path.resolve(__dirname, '../../logs');

/**
 * Cleans up log entries and log files older than the specified retention days (default: 3 days)
 * @param {number} [days=3] - Number of days of logs to keep
 */
const cleanOldLogs = async (days = 3) => {
  const retentionDays = Number(days) || 3;
  const cutoffTime = Date.now() - retentionDays * 24 * 60 * 60 * 1000;
  const cutoffDate = new Date(cutoffTime);

  logger.info(`Starting log cleanup: removing logs older than ${retentionDays} days (before ${cutoffDate.toISOString()})...`);

  try {
    if (!fs.existsSync(logsDir)) {
      logger.info(`Logs directory does not exist: ${logsDir}`);
      return { success: true, message: 'Logs directory does not exist' };
    }

    const files = await fs.promises.readdir(logsDir);
    let totalLinesRemoved = 0;
    let filesDeleted = 0;

    for (const file of files) {
      const filePath = path.join(logsDir, file);
      const stat = await fs.promises.stat(filePath);

      // If it's a rotated or separate log file older than cutoff, delete it
      if (file !== 'combined.log' && file !== 'error.log' && file.endsWith('.log')) {
        if (stat.mtimeMs < cutoffTime) {
          await fs.promises.unlink(filePath);
          filesDeleted++;
          logger.info(`Deleted old log file: ${file}`);
        }
        continue;
      }

      // For active combined.log and error.log: filter lines older than 3 days
      if (file.endsWith('.log')) {
        try {
          const content = await fs.promises.readFile(filePath, 'utf8');
          if (!content.trim()) continue;

          const lines = content.split('\n');
          const retainedLines = [];
          let currentEntryKeep = true;
          let linesRemovedInFile = 0;

          for (const line of lines) {
            // Match timestamp format: [YYYY-MM-DD HH:mm:ss] or [YYYY-MM-DDTHH:mm:ss]
            const match = line.match(/^\[(\d{4}-\d{2}-\d{2}(?:[ T]\d{2}:\d{2}:\d{2})?)\]/);
            if (match) {
              const logDateStr = match[1].replace(' ', 'T');
              const logDate = new Date(logDateStr);
              if (!isNaN(logDate.getTime())) {
                currentEntryKeep = logDate.getTime() >= cutoffTime;
              } else {
                currentEntryKeep = true;
              }
            }

            if (currentEntryKeep) {
              retainedLines.push(line);
            } else {
              linesRemovedInFile++;
            }
          }

          if (linesRemovedInFile > 0) {
            await fs.promises.writeFile(filePath, retainedLines.join('\n'), 'utf8');
            totalLinesRemoved += linesRemovedInFile;
            logger.info(`Cleaned ${linesRemovedInFile} old log lines from ${file}`);
          }
        } catch (fileErr) {
          logger.warn(`Could not process log file ${file}: ${fileErr.message}`);
        }
      }
    }

    const summary = `Log cleanup completed. Deleted ${filesDeleted} old file(s) and pruned ${totalLinesRemoved} old log line(s).`;
    logger.info(summary);
    return {
      success: true,
      retentionDays,
      cutoffDate: cutoffDate.toISOString(),
      filesDeleted,
      totalLinesRemoved,
      message: summary
    };
  } catch (err) {
    logger.error(`Error during log cleanup: ${err.message}`);
    throw err;
  }
};

module.exports = {
  cleanOldLogs
};
