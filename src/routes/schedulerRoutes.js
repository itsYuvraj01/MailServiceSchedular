const express = require('express');
const router = express.Router();
const { generateAndSendDailyReport } = require('../services/reportService');

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

module.exports = router;
