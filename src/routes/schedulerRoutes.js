const express = require('express');
const router = express.Router();
const { generateAndSendDailyReport } = require('../services/reportService');
const { cleanOldLogs } = require('../services/logCleanupService');
const config = require('../config/config');

// Health check endpoint
router.get('/health', (req, res) => {
  res.status(200).json({
    status: 'UP',
    message: 'IOCL Customer Analytics Daily Mail Scheduler is active'
  });
});

// Manual trigger endpoint for testing or on-demand report sending
router.post('/trigger-daily-report', async (req, res) => {
  try {
    const info = await generateAndSendDailyReport(req.body || {});
    res.status(200).json({
      success: true,
      message: 'Daily report triggered and sent successfully',
      info
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to send daily report',
      error: error.message
    });
  }
});

// Manual trigger endpoint for log cleanup
router.post('/cleanup-logs', async (req, res) => {
  try {
    const days = req.body?.days || config.logRetentionDays;
    const result = await cleanOldLogs(days);
    res.status(200).json({
      success: true,
      result
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to clean logs',
      error: error.message
    });
  }
});

module.exports = router;
