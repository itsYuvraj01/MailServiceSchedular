const path = require('path');
const logger = require('../utils/logger');
const db = require('../config/db');
const { generateDailyReportTemplate } = require('../templates/dailyReportTemplate');
const { generateExcelBuffer, generateGradeWiseExcelBuffer } = require('./excelService');
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
 * Gets formatted SQL date string as YYYY-MM-DD
 * @param {Date|string} [date]
 * @returns {string}
 */
const getSqlDateString = (date = new Date()) => {
  const d = date instanceof Date ? date : new Date(date);
  if (isNaN(d.getTime())) return new Date().toISOString().split('T')[0];
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
};

/**
 * Loads test data from test file if needed
 */
const getFallbackTestData = () => {
  try {
    const testModule = require('../../test');
    return {
      ppFlexiData: testModule.data1 || [],
      peData: testModule.data2 || [],
      gradeWiseData: testModule.data3 || []
    };
  } catch (err) {
    logger.warn(`Could not load test file: ${err.message}`);
    return { ppFlexiData: [], peData: [], gradeWiseData: [] };
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
    const fallback = getFallbackTestData();
    return {
      ppFlexiData: fallback.ppFlexiData,
      peData: fallback.peData
    };
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
        return {
          ppFlexiData: fallback.ppFlexiData,
          peData: fallback.peData
        };
      }
    }

    return { ppFlexiData, peData };
  } catch (error) {
    logger.error(`Database query failed in getDailyReportData (USP_APP_TOP30_CUSTOMERS): ${error.message}`);
    // If DB fails, attempt fallback to test data to prevent complete failure if offline
    const fallback = getFallbackTestData();
    if (fallback.ppFlexiData.length > 0 || fallback.peData.length > 0) {
      logger.info('Using fallback test data after DB failure.');
      return {
        ppFlexiData: fallback.ppFlexiData,
        peData: fallback.peData
      };
    }
    throw error;
  }
};

/**
 * Fetches Grade-Wise APP performance data by executing dbo.usp_APP_vs_Sales_Monthly_Pivot
 * @param {Object} [params] - Query parameters (e.g. date, strDate, InputDate, zoneCode)
 * @returns {Promise<Array<Object>>}
 */
const getGradeWiseReportData = async (params = {}) => {
  if (params.useTestData || params.gradeWiseData) {
    if (params.gradeWiseData) return params.gradeWiseData;
    const fallback = getFallbackTestData();
    return fallback.gradeWiseData || [];
  }

  try {
    const rawDate = params.date || params.strDate || params.InputDate || new Date();
    const sqlDate = getSqlDateString(rawDate);

    logger.info(`Executing stored procedure: dbo.usp_APP_vs_Sales_Monthly_Pivot with @InputDate = ${sqlDate}`);
    const result = await db.executeProcedure('dbo.usp_APP_vs_Sales_Monthly_Pivot', {
      InputDate: sqlDate
    });

    const records = result.recordset || (result.recordsets && result.recordsets[0]) || [];
    logger.info(`Fetched Grade-Wise APP performance records: ${records.length}`);

    if (records.length === 0) {
      logger.warn('usp_APP_vs_Sales_Monthly_Pivot returned 0 records. Checking fallback test data...');
      const fallback = getFallbackTestData();
      if (fallback.gradeWiseData && fallback.gradeWiseData.length > 0) {
        return fallback.gradeWiseData;
      }
    }

    return records;
  } catch (error) {
    logger.error(`Database query failed in getGradeWiseReportData (usp_APP_vs_Sales_Monthly_Pivot): ${error.message}`);
    const fallback = getFallbackTestData();
    if (fallback.gradeWiseData && fallback.gradeWiseData.length > 0) {
      logger.info('Using fallback test data for Grade-Wise report after DB failure.');
      return fallback.gradeWiseData;
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
    const formattedDate = getFormattedDateString(reportDate);
    const fileDateStr = formattedDate.replace(/\./g, '_');

    // 1. Fetch Top 30 Customers data for email body & 1st Excel attachment
    const data = await getDailyReportData(params);
    const { ppFlexiData = [], peData = [] } = data;
    logger.info(`Generating daily report with ${ppFlexiData.length} PP/Flexi and ${peData.length} PE records.`);

    // 2. Fetch Grade-Wise monthly pivot data for 2nd Excel attachment
    const gradeWiseData = await getGradeWiseReportData({ ...params, date: reportDate });
    logger.info(`Grade-wise report data count: ${gradeWiseData.length}`);

    // 3. Generate HTML Email Template
    const htmlContent = generateDailyReportTemplate(data, reportDate);

    // 4. Generate first Excel Attachment (APP & Sales Performance)
    const combinedData = [...ppFlexiData, ...peData];
    const excelBuffer1 = await generateExcelBuffer(combinedData, 'APP & Sales Performance', reportDate);

    // 5. Generate second Excel Attachment (Grade-Wise APP Performance)
    const excelBuffer2 = await generateGradeWiseExcelBuffer(gradeWiseData, formattedDate, params.zoneCode || 'CO');

    const attachments = [
      {
        filename: `APP & Sales Performance Report _${fileDateStr}.xlsx`,
        content: excelBuffer1,
        contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      },
      {
        filename: `GW APP Vs Sales_Date_${fileDateStr}.xlsx`,
        content: excelBuffer2,
        contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      }
    ];

    // 6. Send Email with subject: "APP & Sales Performance Report _<DD.MM.YYYY>"
    const emailSubject = params.subject || `APP & Sales Performance Report _${formattedDate}`;

    const info = await sendEmail({
      to: params.to,
      subject: emailSubject,
      html: htmlContent,
      attachments
    });

    logger.info(`Daily report successfully sent with ${attachments.length} Excel attachments.`);
    return {
      messageId: info.messageId,
      subject: emailSubject,
      ppFlexiCount: ppFlexiData.length,
      peCount: peData.length,
      gradeWiseCount: gradeWiseData.length,
      attachments: attachments.map((a) => a.filename)
    };
  } catch (error) {
    logger.error(`Failed to generate/send daily report: ${error.message}`);
    throw error;
  }
};

module.exports = {
  getFormattedDateString,
  getSqlDateString,
  getDailyReportData,
  getGradeWiseReportData,
  generateAndSendDailyReport
};
