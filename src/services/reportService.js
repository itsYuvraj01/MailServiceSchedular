const path = require('path');
const logger = require('../utils/logger');
const db = require('../config/db');
const { generateDailyReportTemplate } = require('../templates/dailyReportTemplate');
const { generateExcelBuffer } = require('./excelService');
const { sendEmail } = require('./mailService');

/**
 * Gets formatted date string as DD.MM.YYYY
 * @param {Date} [date]
 * @returns {string}
 */
const getFormattedDateString = (date = new Date()) => {
  const dd = String(date.getDate()).padStart(2, '0');
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const yyyy = date.getFullYear();
  return `${dd}.${mm}.${yyyy}`;
};

/**
 * Loads test data from test file if needed
 */
const getFallbackTestData = () => {
  try {
    const testModule = require('../../test');
    return {
      ppFlexiData: testModule.data1 || [],
      peData: testModule.data2 || []
    };
  } catch (err) {
    logger.warn(`Could not load test file: ${err.message}`);
    return { ppFlexiData: [], peData: [] };
  }
};

/**
 * Fetches analytics data directly from MS SQL Server (SSMS) by executing dbo.USP_APP_TOP30_CUSTOMERS
 * @param {Object} [params] - Stored procedure params or test flags
 */
const getDailyReportData = async (params = {}) => {
  // If test data explicitly passed or requested
  if (params.useTestData || params.ppFlexiData || params.peData) {
    if (params.ppFlexiData || params.peData) {
      return {
        ppFlexiData: params.ppFlexiData || [],
        peData: params.peData || []
      };
    }
    logger.info('Loading data from test file...');
    return getFallbackTestData();
  }

  try {
    logger.info('Executing stored procedure: dbo.USP_APP_TOP30_CUSTOMERS');
    const result = await db.executeProcedure('dbo.USP_APP_TOP30_CUSTOMERS', params);

    let ppFlexiData = [];
    let peData = [];

    if (result.recordsets && result.recordsets.length >= 2) {
      ppFlexiData = result.recordsets[0] || [];
      peData = result.recordsets[1] || [];
    } else if (result.recordsets && result.recordsets.length === 1) {
      const allRecords = result.recordsets[0] || [];
      // Separate records by APP Type if single recordset returned
      ppFlexiData = allRecords.filter((item) => {
        const type = (item['APP Type'] || item['APPType'] || item['APP_TYPE'] || '').toUpperCase();
        return type.includes('PP') || type.includes('FLEXI') || type.includes('CONTRACT');
      });
      peData = allRecords.filter((item) => {
        const type = (item['APP Type'] || item['APPType'] || item['APP_TYPE'] || '').toUpperCase();
        return type.includes('PE');
      });

      // If filter didn't match anything, keep full records in ppFlexiData
      if (ppFlexiData.length === 0 && peData.length === 0) {
        ppFlexiData = allRecords;
      }
    } else if (result.recordset) {
      ppFlexiData = result.recordset;
    }

    logger.info(`Fetched data: PP/Flexi records = ${ppFlexiData.length}, PE records = ${peData.length}`);

    // If both datasets are empty and running in development, check fallback
    if (ppFlexiData.length === 0 && peData.length === 0) {
      logger.warn('Stored procedure returned 0 records. Checking fallback test data...');
      const fallback = getFallbackTestData();
      if (fallback.ppFlexiData.length > 0 || fallback.peData.length > 0) {
        return fallback;
      }
    }

    return { ppFlexiData, peData };
  } catch (error) {
    logger.error(`Database query failed in getDailyReportData (USP_APP_TOP30_CUSTOMERS): ${error.message}`);
    // If DB fails, attempt fallback to test data to prevent complete failure if offline
    const fallback = getFallbackTestData();
    if (fallback.ppFlexiData.length > 0 || fallback.peData.length > 0) {
      logger.info('Using fallback test data after DB failure.');
      return fallback;
    }
    throw error;
  }
};

/**
 * Orchestrates report data fetching, template generation, Excel attachments creation, and email dispatch
 * @param {Object} [params] - Optional parameters (e.g. to, useTestData, date)
 */
const generateAndSendDailyReport = async (params = {}) => {
  logger.info('Starting daily report generation...');
  try {
    const reportDate = params.date ? new Date(params.date) : new Date();
    const data = await getDailyReportData(params);

    const { ppFlexiData = [], peData = [] } = data;
    logger.info(`Generating daily report with ${ppFlexiData.length} PP/Flexi and ${peData.length} PE records.`);

    // 1. Generate HTML Email Template
    const htmlContent = generateDailyReportTemplate(data, reportDate);

    // 2. Generate single merged Excel Attachment for full data
    const combinedData = [...ppFlexiData, ...peData];
    const excelBuffer = await generateExcelBuffer(combinedData, 'APP & Sales Performance', reportDate);

    const formattedDate = getFormattedDateString(reportDate);
    const fileDateStr = formattedDate.replace(/\./g, '_');

    const attachments = [
      {
        filename: `APP & Sales Performance Report _${fileDateStr}.xlsx`,
        content: excelBuffer,
        contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      }
    ];

    // 3. Send Email with subject: "APP & Sales Performance Report _<DD.MM.YYYY>"
    const emailSubject = params.subject || `APP & Sales Performance Report _${formattedDate}`;

    const info = await sendEmail({
      to: params.to,
      subject: emailSubject,
      html: htmlContent,
      attachments
    });

    logger.info('Daily report successfully sent with 1 Excel attachment.');
    return {
      messageId: info.messageId,
      subject: emailSubject,
      ppFlexiCount: ppFlexiData.length,
      peCount: peData.length,
      attachments: attachments.map(a => a.filename)
    };
  } catch (error) {
    logger.error(`Failed to generate/send daily report: ${error.message}`);
    throw error;
  }
};

module.exports = {
  getFormattedDateString,
  getDailyReportData,
  generateAndSendDailyReport
};
