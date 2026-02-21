/**
 * export-reports.gs
 *
 * PDF and Excel (XLSX) export functions.
 *
 * PDF exports: Use Google's built-in Sheets-to-PDF URL parameter API.
 *   Generated PDFs are saved to a "Reimbursement Reports" folder in Google Drive
 *   and optionally emailed to the requester.
 *
 * Excel export: Converts the spreadsheet to XLSX and saves to Drive.
 */

var REPORT_FOLDER_NAME = "Reimbursement Reports";

// ─── PDF: EMPLOYEE CLAIM STATEMENT ────────────────────────────────────────────

/**
 * Exports a single employee's claim history as a PDF.
 * Creates a filtered temporary sheet, exports it, then deletes the temp sheet.
 *
 * @param {string} employeeID  - e.g. "EMP001". If null, exports all employees.
 * @param {boolean} emailToEmp - If true, emails the PDF to the employee.
 */
function exportEmployeePDF(employeeID, emailToEmp) {
  var ss       = SpreadsheetApp.getActive();
  var tempName = "_TempExport_" + Utilities.getUuid().substr(0, 8);
  var tempSh   = ss.insertSheet(tempName);

  try {
    var emp = employeeID ? getEmployeeByID(employeeID) : null;
    var title = emp
      ? "Expense Statement — " + emp.name
      : "Expense Statement — All Employees";

    // Build report header
    var companyName = getSetting("COMPANY_NAME") || "Your Company";
    var reportDate  = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "MMMM dd, yyyy");

    var headerRows = [
      [companyName, "", "", "", "", "", "", ""],
      ["Expense Reimbursement Statement", "", "", "", "", "", "", ""],
      [title, "", "", "", "", "", "", ""],
      ["Generated: " + reportDate, "", "", "", "", "", "", ""],
      ["", "", "", "", "", "", "", ""],
    ];

    // Column headers
    var colHeaders = [
      "Claim ID", "Date", "Category", "Description",
      "Amount", "Status", "Approved", "Net Payable",
    ];
    headerRows.push(colHeaders);

    // Data rows
    var claimsSheet = ss.getSheetByName(CONFIG.SHEETS.CLAIMS);
    var claimsData  = claimsSheet.getDataRange().getValues().slice(1);

    var dataRows = claimsData
      .filter(function(row) {
        if (!row[0]) return false;
        return !employeeID || row[1] === employeeID;
      })
      .map(function(row) {
        return [
          row[0],   // ClaimID
          row[4] ? Utilities.formatDate(new Date(row[4]), Session.getScriptTimeZone(), "yyyy-MM-dd") : "",
          row[5],   // Category
          row[6],   // Description
          CONFIG.CURRENCY + " " + (parseFloat(row[7]) || 0).toFixed(2),
          row[10],  // Status
          CONFIG.CURRENCY + " " + (parseFloat(row[14]) || 0).toFixed(2),
          CONFIG.CURRENCY + " " + (parseFloat(row[16]) || 0).toFixed(2),
        ];
      });

    // Summary row
    var totals = dataRows.reduce(function(acc, r) {
      acc.claimed  += parseFloat(r[4].replace(/[^0-9.-]/g,"")) || 0;
      acc.approved += parseFloat(r[6].replace(/[^0-9.-]/g,"")) || 0;
      acc.net      += parseFloat(r[7].replace(/[^0-9.-]/g,"")) || 0;
      return acc;
    }, { claimed: 0, approved: 0, net: 0 });

    var summaryRows = [
      ["", "", "", "", "", "", "", ""],
      ["TOTALS", "", "", "",
       CONFIG.CURRENCY + " " + totals.claimed.toFixed(2),
       "",
       CONFIG.CURRENCY + " " + totals.approved.toFixed(2),
       CONFIG.CURRENCY + " " + totals.net.toFixed(2),
      ],
    ];

    if (emp) {
      var ledger = getEmployeeLedgerSummary(employeeID);
      summaryRows.push(["Outstanding Advances", "", "", "",
        CONFIG.CURRENCY + " " + ledger.totalAdvances.toFixed(2),
        "", "", ""]);
      summaryRows.push(["Net Balance Owed", "", "", "",
        CONFIG.CURRENCY + " " + ledger.netBalance.toFixed(2),
        "", "", ""]);
    }

    // Write all to temp sheet
    var allRows = headerRows.concat(dataRows).concat(summaryRows);
    tempSh.getRange(1, 1, allRows.length, 8).setValues(allRows);

    // Style
    styleReportSheet(tempSh, dataRows.length, allRows.length);

    // Flush, then export
    SpreadsheetApp.flush();
    var pdfBlob = exportSheetAsPDF(ss, tempSh);
    pdfBlob.setName(title + " — " + reportDate + ".pdf");

    // Save to Drive
    var folder = getOrCreateDriveFolder(REPORT_FOLDER_NAME);
    var file = folder.createFile(pdfBlob);

    // Email the PDF if requested
    if (emailToEmp && emp && emp.email) {
      GmailApp.sendEmail(emp.email,
        "Your Expense Statement — " + reportDate,
        "Please find your expense statement attached.",
        {
          htmlBody: buildEmailWrapper(companyName, [
            "<h2>Your Expense Statement</h2>",
            "<p>Hi " + emp.name + ", please find your expense reimbursement statement attached for your records.</p>",
          ]),
          attachments: [pdfBlob],
          name: companyName + " Reimbursements",
        }
      );
    }

    Logger.log("PDF created: " + file.getUrl());
    return file.getUrl();

  } finally {
    // Always clean up temp sheet
    ss.deleteSheet(tempSh);
  }
}

/**
 * Exports a PDF for every active employee. Called from the custom menu.
 */
function exportAllEmployeePDFs() {
  var ss  = SpreadsheetApp.getActive();
  var sh  = ss.getSheetByName(CONFIG.SHEETS.EMPLOYEES);
  var emp = sh.getDataRange().getValues().slice(1);

  var urls = [];
  emp.forEach(function(row) {
    if (row[0] && row[7] === "Yes") {
      var url = exportEmployeePDF(row[0], false);
      urls.push(row[1] + ": " + url);
    }
  });

  SpreadsheetApp.getActive().toast(
    "Exported " + urls.length + " PDFs to Drive folder: " + REPORT_FOLDER_NAME,
    "✅ Export Complete",
    8
  );
}

// ─── PDF: FINANCE DASHBOARD REPORT ───────────────────────────────────────────

/**
 * Exports the full Ledger sheet as a PDF summary for finance.
 */
function exportFinanceSummaryPDF() {
  var ss         = SpreadsheetApp.getActive();
  var ledgerSh   = ss.getSheetByName(CONFIG.SHEETS.LEDGER);
  var companyName = getSetting("COMPANY_NAME") || "Your Company";
  var reportDate  = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "MMMM dd, yyyy");

  SpreadsheetApp.flush();
  var pdfBlob = exportSheetAsPDF(ss, ledgerSh);
  pdfBlob.setName("Finance Reimbursement Ledger — " + reportDate + ".pdf");

  var folder = getOrCreateDriveFolder(REPORT_FOLDER_NAME);
  var file   = folder.createFile(pdfBlob);

  var financeEmail = getSetting("FINANCE_EMAIL");
  GmailApp.sendEmail(financeEmail,
    "Finance Ledger Report — " + reportDate,
    "Please find the consolidated reimbursement ledger attached.",
    {
      attachments: [pdfBlob],
      name: companyName + " Reimbursements",
    }
  );

  SpreadsheetApp.getActive().toast("PDF emailed to " + financeEmail, "✅ Done", 6);
  return file.getUrl();
}

// ─── EXCEL EXPORT ─────────────────────────────────────────────────────────────

/**
 * Exports the entire spreadsheet as an XLSX file to Google Drive
 * and optionally emails it to finance.
 */
function exportToExcel() {
  var ss          = SpreadsheetApp.getActive();
  var companyName = getSetting("COMPANY_NAME") || "Your Company";
  var reportDate  = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "yyyy-MM-dd");
  var fileName    = companyName + " — Reimbursements — " + reportDate + ".xlsx";

  // Build the export URL for XLSX
  var ssID    = ss.getId();
  var xlsxURL = "https://docs.google.com/spreadsheets/d/" + ssID + "/export?format=xlsx&id=" + ssID;

  var token   = ScriptApp.getOAuthToken();
  var response = UrlFetchApp.fetch(xlsxURL, {
    headers: { Authorization: "Bearer " + token },
    muteHttpExceptions: true,
  });

  if (response.getResponseCode() !== 200) {
    SpreadsheetApp.getUi().alert("Export failed. HTTP " + response.getResponseCode());
    return;
  }

  var blob   = response.getBlob().setName(fileName);
  var folder = getOrCreateDriveFolder(REPORT_FOLDER_NAME);
  var file   = folder.createFile(blob);

  // Email to finance
  var financeEmail = getSetting("FINANCE_EMAIL");
  GmailApp.sendEmail(financeEmail,
    "Reimbursement Data Export — " + reportDate,
    "Please find the full reimbursement data export attached.",
    {
      attachments: [blob],
      name: companyName + " Reimbursements",
    }
  );

  SpreadsheetApp.getActive().toast(
    "Excel file saved to Drive and emailed to " + financeEmail,
    "✅ Export Complete",
    8
  );
  return file.getUrl();
}

// ─── HELPERS ─────────────────────────────────────────────────────────────────

/**
 * Exports a single sheet as a PDF blob using Google's export URL API.
 */
function exportSheetAsPDF(ss, sheet) {
  var ssID    = ss.getId();
  var sheetID = sheet.getSheetId();

  var params = [
    "format=pdf",
    "size=A4",
    "portrait=true",
    "fitw=true",           // Fit to width
    "sheetnames=false",
    "printtitle=false",
    "pagenumbers=false",
    "gridlines=false",
    "fzr=false",           // Don't repeat frozen rows
    "gid=" + sheetID,
  ].join("&");

  var url   = "https://docs.google.com/spreadsheets/d/" + ssID + "/export?" + params;
  var token = ScriptApp.getOAuthToken();
  var response = UrlFetchApp.fetch(url, {
    headers: { Authorization: "Bearer " + token },
    muteHttpExceptions: true,
  });

  if (response.getResponseCode() !== 200) {
    throw new Error("PDF export failed. HTTP " + response.getResponseCode());
  }

  return response.getBlob().setContentType("application/pdf");
}

function getOrCreateDriveFolder(name) {
  var folders = DriveApp.getFoldersByName(name);
  if (folders.hasNext()) return folders.next();
  return DriveApp.createFolder(name);
}

function styleReportSheet(sheet, dataRowCount, totalRows) {
  // Title rows
  sheet.getRange(1, 1, 1, 8).mergeAcross()
    .setFontWeight("bold").setFontSize(14).setHorizontalAlignment("center");
  sheet.getRange(2, 1, 1, 8).mergeAcross()
    .setFontWeight("bold").setFontSize(12).setHorizontalAlignment("center");
  sheet.getRange(3, 1, 1, 8).mergeAcross()
    .setFontSize(11).setHorizontalAlignment("center");

  // Column headers (row 6)
  sheet.getRange(6, 1, 1, 8)
    .setBackground("#2c3e50").setFontColor("#ffffff").setFontWeight("bold");

  // Data rows
  if (dataRowCount > 0) {
    sheet.getRange(7, 1, dataRowCount, 8)
      .applyRowBanding(SpreadsheetApp.BandingTheme.LIGHT_GREY);
  }

  // Summary rows
  var summaryStart = 6 + dataRowCount + 2;
  sheet.getRange(summaryStart, 1, totalRows - summaryStart + 1, 8)
    .setFontWeight("bold").setBackground("#ecf0f1");
}
