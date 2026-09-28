const { getMonthYearLabel, normalizeItem } = require('../services/excelService');

/**
 * Format numbers cleanly (no unnecessary decimals or trailing zeros, up to 3 decimal places)
 * @param {number|string} num
 * @returns {string}
 */
const formatNumber = (num) => {
  if (num === null || num === undefined || isNaN(num)) return '0';
  const val = Number(num);
  if (Number.isInteger(val)) return val.toString();
  return parseFloat(val.toFixed(3)).toString();
};

/**
 * Renders a single HTML table for top 30 records
 * @param {Array<Object>} items
 * @param {string} title
 * @param {Date} date
 * @returns {string}
 */
const renderTable = (items = [], title = 'PP/Flexi/Contract', date = new Date()) => {
  const top30 = items.slice(0, 30);
  const monthYear = getMonthYearLabel(date);
  const appColHeader = `${monthYear} APP<br>(MTM)`;
  const saleColHeader = `${monthYear} Sale<br>(MTM)`;

  let totalApp = 0;
  let totalSale = 0;

  let bodyHtml = '';
  if (top30.length > 0) {
    bodyHtml = top30
      .map((rawItem, idx) => {
        const norm = normalizeItem(rawItem, idx);
        totalApp += norm.appVal;
        totalSale += norm.saleVal;

        return `
        <tr>
          <td style="border: 1px solid #7f7f7f; padding: 4px 6px; text-align: center; font-size: 12px; color: #000000;">${norm.srNo}</td>
          <td style="border: 1px solid #7f7f7f; padding: 4px 8px; text-align: left; font-size: 12px; color: #000000;">${norm.customerName}</td>
          <td style="border: 1px solid #7f7f7f; padding: 4px 6px; text-align: center; font-size: 12px; color: #000000;">${norm.appType}</td>
          <td style="border: 1px solid #7f7f7f; padding: 4px 6px; text-align: center; font-size: 12px; color: #000000;">${norm.customerType}</td>
          <td style="border: 1px solid #7f7f7f; padding: 4px 8px; text-align: right; font-size: 12px; color: #000000;">${formatNumber(norm.appVal)}</td>
          <td style="border: 1px solid #7f7f7f; padding: 4px 8px; text-align: right; font-size: 12px; color: #000000;">${formatNumber(norm.saleVal)}</td>
          <td style="border: 1px solid #7f7f7f; padding: 4px 6px; text-align: right; font-size: 12px; color: #000000;">${norm.achPercent}%</td>
        </tr>`;
      })
      .join('');

    const totalAch = totalApp > 0 ? `${Math.round((totalSale / totalApp) * 100)}%` : '0%';

    bodyHtml += `
      <tr style="background-color: #d9d9d9; font-weight: bold;">
        <td colspan="4" style="border: 1px solid #7f7f7f; padding: 4px 8px; text-align: center; font-size: 12px; font-weight: bold; color: #000000;">Top 30 Total</td>
        <td style="border: 1px solid #7f7f7f; padding: 4px 8px; text-align: right; font-size: 12px; font-weight: bold; color: #000000;">${formatNumber(totalApp)}</td>
        <td style="border: 1px solid #7f7f7f; padding: 4px 8px; text-align: right; font-size: 12px; font-weight: bold; color: #000000;">${formatNumber(totalSale)}</td>
        <td style="border: 1px solid #7f7f7f; padding: 4px 6px; text-align: right; font-size: 12px; font-weight: bold; color: #000000;">${totalAch}</td>
      </tr>`;
  } else {
    bodyHtml = `<tr><td colspan="7" style="border: 1px solid #7f7f7f; padding: 12px; text-align: center; font-size: 12px; color: #666666;">No records found.</td></tr>`;
  }

  return `
    <div style="margin-top: 15px; margin-bottom: 20px;">
      <div style="font-weight: bold; font-size: 15px; margin-bottom: 6px; color: #000000; font-family: Arial, Calibri, sans-serif;">
        ${title}:
      </div>
      <table style="border-collapse: collapse; width: 100%; max-width: 950px; font-family: Arial, Calibri, 'Segoe UI', sans-serif; border: 1px solid #7f7f7f;">
        <thead>
          <tr style="background-color: #bdd7ee; color: #000000; font-weight: bold;">
            <th style="border: 1px solid #7f7f7f; padding: 6px 4px; text-align: center; font-size: 12px; font-weight: bold; width: 45px;">Sr. No.</th>
            <th style="border: 1px solid #7f7f7f; padding: 6px 8px; text-align: center; font-size: 12px; font-weight: bold;">Customer Name with Group key</th>
            <th style="border: 1px solid #7f7f7f; padding: 6px 4px; text-align: center; font-size: 12px; font-weight: bold; width: 75px;">APP Type</th>
            <th style="border: 1px solid #7f7f7f; padding: 6px 4px; text-align: center; font-size: 12px; font-weight: bold; width: 105px;">Customer Type</th>
            <th style="border: 1px solid #7f7f7f; padding: 6px 8px; text-align: center; font-size: 12px; font-weight: bold; width: 140px;">${appColHeader}</th>
            <th style="border: 1px solid #7f7f7f; padding: 6px 8px; text-align: center; font-size: 12px; font-weight: bold; width: 140px;">${saleColHeader}</th>
            <th style="border: 1px solid #7f7f7f; padding: 6px 4px; text-align: center; font-size: 12px; font-weight: bold; width: 60px;">Ach%</th>
          </tr>
        </thead>
        <tbody>
          ${bodyHtml}
        </tbody>
      </table>
    </div>
  `;
};

/**
 * Generates email HTML template for Daily APP & Sales Performance Report
 * @param {Object} data - Contains ppFlexiData and peData arrays
 * @param {Date} [date] - Report date
 */
const generateDailyReportTemplate = (data = {}, date = new Date()) => {
  const ppFlexiData = Array.isArray(data.ppFlexiData) ? data.ppFlexiData : [];
  const peData = Array.isArray(data.peData) ? data.peData : [];

  const ppFlexiTableHtml = renderTable(ppFlexiData, 'PP/Flexi/Contract', date);
  const peTableHtml = renderTable(peData, 'PE', date);

  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <style>
        body {
          font-family: Arial, Calibri, 'Segoe UI', sans-serif;
          background-color: #ffffff;
          margin: 0;
          padding: 16px;
          color: #000000;
        }
        .container {
          max-width: 950px;
          background-color: #ffffff;
          margin: 0 auto;
        }
        table {
          border-collapse: collapse;
          width: 100%;
        }
      </style>
    </head>
    <body>
      <div class="container">
        ${ppFlexiTableHtml}
        ${peTableHtml}

        <div style="margin-top: 20px; font-family: Arial, Calibri, sans-serif; font-size: 13px; color: #000000;">
          <p style="margin: 0 0 4px 0; font-weight: bold;">Note:</p>
          <ol style="margin: 0; padding-left: 24px; line-height: 1.6;">
            <li>In case of Group entities, Combines APP and lifting are shown</li>
            <li>APP Contract type is for BOPP/CPP customers</li>
            <li>Open Orders/dispatch planning for today's is not considered in the report</li>
          </ol>
        </div>

        <div style="margin-top: 25px; font-family: Arial, Calibri, sans-serif; font-size: 13px; line-height: 1.45; color: #004080;">
          <p style="margin: 0 0 2px 0; color: #004080;">Regards</p>
          <p style="margin: 0 0 2px 0; font-weight: bold; font-size: 14px; color: #002d62;">IOCL Team</p>
          <p style="margin: 0 0 2px 0; color: #004080;">Planning & Business Development</p>
          <p style="margin: 0 0 2px 0; color: #004080;">Indian Oil Corporation Limited,</p>
          <p style="margin: 0 0 2px 0; color: #004080;">10th Floor, Block-2, NBCC Commercial complex,</p>
          <p style="margin: 0 0 2px 0; color: #004080;">East Kidwai Nagar,</p>
          <p style="margin: 0 0 2px 0; color: #004080;">New Delhi &ndash; 110023</p>
          <div>
            <img src="cid:footerLogo" alt="PROPEL" style="display: block; width: 170px; height: auto;" />
          </div>
        </div>
      </div>
    </body>
    </html>
  `;
};

module.exports = {
  formatNumber,
  renderTable,
  generateDailyReportTemplate
};
