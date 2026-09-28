const ExcelJS = require('exceljs');

/**
 * Gets formatted Month'YY string, e.g. "Sept'26"
 * @param {Date} [date]
 * @returns {string}
 */
const getMonthYearLabel = (date = new Date()) => {
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sept', 'Oct', 'Nov', 'Dec'];
  const monthName = months[date.getMonth()];
  const year2Digit = String(date.getFullYear()).slice(-2);
  return `${monthName}'${year2Digit}`;
};

/**
 * Normalizes an item from DB or test data into standard fields
 * @param {Object} item
 * @param {number} index
 * @returns {Object}
 */
const normalizeItem = (item, index) => {
  const srNo = index !== undefined ? index + 1 : (item['Sr. No.'] || item['SrNo'] || item['sr_no'] || 1);
  const customerName = item['Customer Name with Group key'] || item['Customer Name'] || item['CustomerName'] || item['CUSTOMER_NAME'] || '';
  const appType = item['APP Type'] || item['APPType'] || item['APP_TYPE'] || '';
  const customerType = item['Customer Type'] || item['CustomerType'] || item['CUSTOMER_TYPE'] || '';

  // Extract APP value
  let appVal = 0;
  for (const key of Object.keys(item)) {
    if (/app/i.test(key) && !/type/i.test(key)) {
      appVal = Number(item[key]) || 0;
      break;
    }
  }

  // Extract Sale value
  let saleVal = 0;
  for (const key of Object.keys(item)) {
    if (/sale|lifting/i.test(key)) {
      saleVal = Number(item[key]) || 0;
      break;
    }
  }

  // Calculate Ach%
  let achPercent = 0;
  if (appVal > 0) {
    achPercent = Math.round((saleVal / appVal) * 100);
  } else if (item['Ach%'] !== undefined || item['Ach'] !== undefined) {
    const rawAch = item['Ach%'] !== undefined ? item['Ach%'] : item['Ach'];
    achPercent = Math.round(Number(rawAch) || 0);
  }

  return {
    srNo,
    customerName,
    appType,
    customerType,
    appVal,
    saleVal,
    achPercent
  };
};

/**
 * Generates an Excel workbook Buffer for a dataset with custom styling
 * @param {Array<Object>} items - Array of data records
 * @param {string} sheetName - Sheet name
 * @param {Date} [date] - Report date
 * @returns {Promise<Buffer>}
 */
const generateExcelBuffer = async (items = [], sheetName = 'APP & Sales Performance', date = new Date()) => {
  const monthYear = getMonthYearLabel(date);
  const appColHeader = `${monthYear} APP (MTM)`;
  const saleColHeader = `${monthYear} Sale (MTM)`;

  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'IOCL Customer Analytics Daily Mail Scheduler';
  workbook.created = new Date();

  const worksheet = workbook.addWorksheet(sheetName.substring(0, 31), {
    views: [{ showGridLines: true }]
  });

  // Define Columns
  worksheet.columns = [
    { header: 'Sr. No.', key: 'srNo', width: 10 },
    { header: 'Customer Name with Group key', key: 'customerName', width: 35 },
    { header: 'APP Type', key: 'appType', width: 14 },
    { header: 'Customer Type', key: 'customerType', width: 18 },
    { header: appColHeader, key: 'appVal', width: 20 },
    { header: saleColHeader, key: 'saleVal', width: 20 },
    { header: 'Ach%', key: 'achPercent', width: 14 }
  ];

  // Thin gray border style matching mail template (#7f7f7f)
  const cellBorder = {
    top: { style: 'thin', color: { argb: 'FF7F7F7F' } },
    left: { style: 'thin', color: { argb: 'FF7F7F7F' } },
    bottom: { style: 'thin', color: { argb: 'FF7F7F7F' } },
    right: { style: 'thin', color: { argb: 'FF7F7F7F' } }
  };

  // 1. Style Header Row (Row 1)
  const headerRow = worksheet.getRow(1);
  headerRow.height = 28;
  headerRow.eachCell((cell) => {
    cell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFBDD7EE' } // Mail table header color (#bdd7ee)
    };
    cell.font = {
      name: 'Calibri',
      size: 12, // Bolder and larger than records
      bold: true,
      color: { argb: 'FF000000' }
    };
    cell.alignment = {
      vertical: 'middle',
      horizontal: 'center',
      wrapText: true
    };
    cell.border = cellBorder;
  });

  let totalApp = 0;
  let totalSale = 0;

  // 2. Add Data Rows
  items.forEach((rawItem, idx) => {
    const norm = normalizeItem(rawItem, idx);
    totalApp += norm.appVal;
    totalSale += norm.saleVal;

    const row = worksheet.addRow({
      srNo: norm.srNo,
      customerName: norm.customerName,
      appType: norm.appType,
      customerType: norm.customerType,
      appVal: norm.appVal,
      saleVal: norm.saleVal,
      achPercent: `${norm.achPercent}%`
    });

    row.height = 20;

    // Apply borders and fonts to each cell
    row.getCell(1).alignment = { vertical: 'middle', horizontal: 'center' };
    row.getCell(2).alignment = { vertical: 'middle', horizontal: 'left' };
    row.getCell(3).alignment = { vertical: 'middle', horizontal: 'center' };
    row.getCell(4).alignment = { vertical: 'middle', horizontal: 'center' };
    row.getCell(5).alignment = { vertical: 'middle', horizontal: 'right' };
    row.getCell(6).alignment = { vertical: 'middle', horizontal: 'right' };
    row.getCell(7).alignment = { vertical: 'middle', horizontal: 'right' };

    row.eachCell({ includeEmpty: true }, (cell) => {
      cell.font = {
        name: 'Calibri',
        size: 11,
        color: { argb: 'FF000000' }
      };
      cell.border = cellBorder;
    });
  });

  // 3. Add Total Row
  const totalAch = totalApp > 0 ? `${Math.round((totalSale / totalApp) * 100)}%` : '0%';
  const totalRow = worksheet.addRow({
    srNo: '',
    customerName: 'Total',
    appType: '',
    customerType: '',
    appVal: parseFloat(totalApp.toFixed(0)),
    saleVal: parseFloat(totalSale.toFixed(0)),
    achPercent: totalAch
  });

  totalRow.height = 22;
  totalRow.eachCell({ includeEmpty: true }, (cell) => {
    cell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFD9D9D9' } // Mail table total row color (#d9d9d9)
    };
    cell.font = {
      name: 'Calibri',
      size: 11,
      bold: true,
      color: { argb: 'FF000000' }
    };
    cell.border = cellBorder;
  });

  totalRow.getCell(2).alignment = { vertical: 'middle', horizontal: 'left' };
  totalRow.getCell(5).alignment = { vertical: 'middle', horizontal: 'right' };
  totalRow.getCell(6).alignment = { vertical: 'middle', horizontal: 'right' };
  totalRow.getCell(7).alignment = { vertical: 'middle', horizontal: 'right' };

  // Write to Buffer
  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
};

module.exports = {
  getMonthYearLabel,
  normalizeItem,
  generateExcelBuffer
};
