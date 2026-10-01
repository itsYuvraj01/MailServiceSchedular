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



/**
 * Gets formatted date string as DD.MM.YYYY
 * @param {Date} [date]
 * @returns {string}
 */
const getFormattedDateString = (date = new Date()) => {
  const d = date instanceof Date ? date : new Date(date);
  const validDate = isNaN(d.getTime()) ? new Date() : d;
  const dd = String(validDate.getDate()).padStart(2, '0');
  const mm = String(validDate.getMonth() + 1).padStart(2, '0');
  const yyyy = validDate.getFullYear();
  return `${dd}.${mm}.${yyyy}`;
};

/**
 * Generates an Excel workbook Buffer for Grade-Wise APP Performance dataset with custom styling and frozen panes
 * (Backend version of ExportExcel3)
 * @param {Array<Object>} data - Array of records returned from usp_APP_vs_Sales_Monthly_Pivot
 * @param {string|Date} [selectedDate] - Date string or Date object for title (defaults to today's date: DD.MM.YYYY)
 * @param {string} [zoneCode] - Optional zone filter (e.g. 'CO', 'NZ', etc.)
 * @returns {Promise<Buffer>}
 */
const generateGradeWiseExcelBuffer = async (data = [], selectedDate = getFormattedDateString(new Date()), zoneCode = 'CO') => {
  let finalData = Array.isArray(data) ? data : [];

  if (zoneCode && zoneCode !== 'CO') {
    finalData = finalData.filter((i) => (i['Zone Name'] || i['ZONE_NAME']) === zoneCode);
  }

  if (!selectedDate) {
    selectedDate = getFormattedDateString(new Date());
  } else if (selectedDate instanceof Date) {
    selectedDate = getFormattedDateString(selectedDate);
  }

  if (finalData.length === 0) {
    const emptyWb = new ExcelJS.Workbook();
    emptyWb.creator = 'IOCL Petrochemicals';
    const ws = emptyWb.addWorksheet('APP Performance');
    ws.addRow(['No data available for export']);
    const emptyBuf = await emptyWb.xlsx.writeBuffer();
    return Buffer.from(emptyBuf);
  }

  // ── Detect month labels dynamically ──────────────────────────────────────
  const sampleKeys = Object.keys(finalData[0] || {});
  const monthPattern = /^([A-Za-z]+'?\d{2}) APP Qty$/;
  const months = sampleKeys
    .filter((k) => monthPattern.test(k))
    .map((k) => k.match(monthPattern)[1]);

  const fixedCols = [
    'Group Name',
    'Zone Name',
    'Field Officer Name',
    'AU/T',
    'Name of the Customer',
    'Sold to Party',
    'APP Type',
    'Grade'
  ];

  // Total columns count
  const totalCols = fixedCols.length + months.length * 3 + 3;

  // ── Colors ────────────────────────────────────────────────────────────────
  const COLOR = {
    titleBg: 'FF0D2137',
    headerBg: 'FF1F4E79',
    monthBg: 'FF2E75B6',
    summaryBg: 'FF375623',
    subBg: 'FFD6E4F0',
    summSubBg: 'FFE2EFDA',
    altRow: 'FFEBF3FB',
    altSumRow: 'FFD9EAD3',
    white: 'FFFFFFFF',
    borderGray: 'FF7F7F7F'
  };

  const border = {
    top: { style: 'thin', color: { argb: COLOR.borderGray } },
    left: { style: 'thin', color: { argb: COLOR.borderGray } },
    bottom: { style: 'thin', color: { argb: COLOR.borderGray } },
    right: { style: 'thin', color: { argb: COLOR.borderGray } }
  };

  const centerAlign = { horizontal: 'center', vertical: 'middle', wrapText: true };
  const leftAlign = { horizontal: 'left', vertical: 'middle', wrapText: true };
  const rightAlign = { horizontal: 'right', vertical: 'middle', wrapText: true };

  const makeHeaderFont = (size = 9) => ({
    name: 'Arial',
    size,
    bold: true,
    color: { argb: COLOR.white }
  });
  const makeSubFont = () => ({ name: 'Arial', size: 9, bold: true, color: { argb: 'FF000000' } });
  const makeDataFont = () => ({ name: 'Arial', size: 9, color: { argb: 'FF000000' } });

  const applyFill = (cell, argb) => {
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb } };
  };

  // ── Create workbook ───────────────────────────────────────────────────────
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'IOCL Petrochemicals';
  workbook.created = new Date();

  const ws = workbook.addWorksheet('APP Performance', {
    views: [{ state: 'frozen', xSplit: fixedCols.length, ySplit: 3, showGridLines: true }]
  });

  // ── ROW 1: Title ──────────────────────────────────────────────────────────
  ws.addRow([]); // row 1
  ws.mergeCells(1, 1, 1, totalCols);
  const titleCell = ws.getRow(1).getCell(1);
  titleCell.value = `IOCL Petrochemicals — Grade-Wise APP Performance  |  Date: ${selectedDate}`;
  titleCell.font = makeHeaderFont(11);
  applyFill(titleCell, COLOR.titleBg);
  titleCell.alignment = centerAlign;
  titleCell.border = border;
  ws.getRow(1).height = 24;

  // ── ROW 2: Group headers ──────────────────────────────────────────────────
  ws.addRow([]); // row 2

  let col = 1;

  // Fixed cols — merge rows 2 & 3 vertically
  fixedCols.forEach((fc) => {
    ws.mergeCells(2, col, 3, col);
    const cell = ws.getRow(2).getCell(col);
    cell.value = fc;
    applyFill(cell, COLOR.headerBg);
    cell.font = makeHeaderFont();
    cell.alignment = centerAlign;
    cell.border = border;
    col++;
  });

  // Month group headers — each spans 3 columns
  const monthStartCols = {};
  months.forEach((month) => {
    monthStartCols[month] = col;
    ws.mergeCells(2, col, 2, col + 2);
    const cell = ws.getRow(2).getCell(col);
    cell.value = month;
    applyFill(cell, COLOR.monthBg);
    cell.font = makeHeaderFont();
    cell.alignment = centerAlign;
    cell.border = border;
    col += 3;
  });

  // Summary group header — spans 3 columns
  const summaryStartCol = col;
  ws.mergeCells(2, col, 2, col + 2);
  const summCell = ws.getRow(2).getCell(col);
  summCell.value = 'Total till Prev Month';
  applyFill(summCell, COLOR.summaryBg);
  summCell.font = makeHeaderFont();
  summCell.alignment = centerAlign;
  summCell.border = border;

  ws.getRow(2).height = 22;

  // ── ROW 3: Sub-headers ────────────────────────────────────────────────────
  ws.addRow([]); // row 3

  // Month sub-headers
  months.forEach((month) => {
    const sc = monthStartCols[month];
    ['APP Qty', 'Sales', 'APP %'].forEach((label, i) => {
      const cell = ws.getRow(3).getCell(sc + i);
      cell.value = label;
      applyFill(cell, COLOR.subBg);
      cell.font = makeSubFont();
      cell.alignment = centerAlign;
      cell.border = border;
    });
  });

  // Summary sub-headers
  ['APP Qty', 'Sales', 'APP %'].forEach((label, i) => {
    const cell = ws.getRow(3).getCell(summaryStartCol + i);
    cell.value = label;
    applyFill(cell, COLOR.summSubBg);
    cell.font = makeSubFont();
    cell.alignment = centerAlign;
    cell.border = border;
  });

  ws.getRow(3).height = 18;

  // ── DATA ROWS ─────────────────────────────────────────────────────────────
  finalData.forEach((item, rowIdx) => {
    const rowValues = [];

    fixedCols.forEach((fc) => rowValues.push(item[fc] ?? ''));

    months.forEach((month) => {
      const appQty = item[`${month} APP Qty`];
      const sales = item[`${month} Sales`];
      const appPct = item[`${month} APP %`];

      rowValues.push(appQty != null && appQty !== '' ? Number(appQty) : 0);
      rowValues.push(sales != null && sales !== '' ? Number(sales) : 0);
      rowValues.push(appPct != null && appPct !== '' ? Number(appPct) : 0);
    });

    const cumQty = item['Total till Prev Month APP Qty'];
    const cumSales = item['Total till Prev Month Sales'];
    const cumPct = item['Total till Prev Month APP %'];

    rowValues.push(cumQty != null && cumQty !== '' ? Number(cumQty) : 0);
    rowValues.push(cumSales != null && cumSales !== '' ? Number(cumSales) : 0);
    rowValues.push(cumPct != null && cumPct !== '' ? Number(cumPct) : 0);

    const excelRow = ws.addRow(rowValues);
    excelRow.height = 16;

    const isAlt = rowIdx % 2 === 1;

    excelRow.eachCell({ includeEmpty: true }, (cell, colNum) => {
      cell.font = makeDataFont();
      cell.border = border;

      const isSummaryCol = colNum >= summaryStartCol;

      if (isSummaryCol) {
        applyFill(cell, isAlt ? COLOR.altSumRow : COLOR.summSubBg);
      } else if (isAlt) {
        applyFill(cell, COLOR.altRow);
      }

      if (colNum <= fixedCols.length) {
        cell.alignment = leftAlign;
      } else {
        cell.alignment = rightAlign;
        // Position within group (1=Qty, 2=Sales, 3=%)
        const posInGroup = ((colNum - fixedCols.length - 1) % 3) + 1;
        if (posInGroup === 3) {
          cell.numFmt = '0.00'; // APP %
        } else {
          cell.numFmt = '#,##0.000';
        }
      }
    });
  });

  // ── Column widths ─────────────────────────────────────────────────────────
  const colWidths = [18, 12, 22, 10, 32, 14, 12, 16]; // 8 fixedCols
  months.forEach(() => colWidths.push(14, 14, 12));
  colWidths.push(16, 14, 12); // summary 3 cols

  colWidths.forEach((w, i) => {
    ws.getColumn(i + 1).width = w;
  });

  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
};

module.exports = {
  getMonthYearLabel,
  getFormattedDateString,
  normalizeItem,
  generateExcelBuffer,
  generateGradeWiseExcelBuffer
};
