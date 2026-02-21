/**
 * REIMBURSEMENT MANAGEMENT SYSTEM
 * setup.gs — Master setup script
 *
 * HOW TO USE:
 *   1. Open a new Google Sheet.
 *   2. Go to Extensions > Apps Script.
 *   3. Paste all .gs files from this project into the editor (one file per tab).
 *   4. Run setupAll() once to initialize all sheets and formatting.
 *   5. Run installTriggers() once to enable automation.
 */

// ─── CONFIGURATION ────────────────────────────────────────────────────────────

var CONFIG = {
  // Sheet names (do not change after first run — AppSheet references these)
  SHEETS: {
    EMPLOYEES:    "Employees",
    CLAIMS:       "ExpenseClaims",
    ADVANCES:     "Advances",
    LEDGER:       "Ledger",
    CATEGORIES:   "Categories",
    AUDIT:        "AuditLog",
    SETTINGS:     "Settings",
  },

  // Claim status values
  STATUS: {
    PENDING:   "Pending",
    APPROVED:  "Approved",
    REJECTED:  "Rejected",
    PAID:      "Paid",
  },

  // Finance team email (receives new submission notifications)
  FINANCE_EMAIL: "finance@yourcompany.com",

  // Currency symbol
  CURRENCY: "USD",
};

// ─── MAIN ENTRY POINT ─────────────────────────────────────────────────────────

/**
 * Run this once to fully initialize the spreadsheet.
 */
function setupAll() {
  setupSettings();
  setupCategories();
  setupEmployees();
  setupExpenseClaims();
  setupAdvances();
  setupLedger();
  setupAuditLog();
  applyGlobalFormatting();
  Logger.log("✅ Setup complete. Run installTriggers() next.");
  SpreadsheetApp.getActive().toast(
    "Setup complete! Now run installTriggers() from Apps Script.",
    "✅ Reimbursement App Ready",
    10
  );
}

// ─── SHEET BUILDERS ───────────────────────────────────────────────────────────

function setupSettings() {
  var ss = SpreadsheetApp.getActive();
  var sh = getOrCreateSheet(ss, CONFIG.SHEETS.SETTINGS);
  sh.clearContents();

  var data = [
    ["Key",              "Value",                       "Description"],
    ["FINANCE_EMAIL",    CONFIG.FINANCE_EMAIL,          "Finance team email for notifications"],
    ["CURRENCY",         CONFIG.CURRENCY,               "Default currency symbol"],
    ["ADVANCE_POLICY",   "Deduct before payout",        "How advances are handled"],
    ["MAX_CLAIM_DAYS",   "90",                          "Max days after expense to file a claim"],
    ["COMPANY_NAME",     "Your Company Name",           "Used in email templates and PDF headers"],
    ["LOGO_URL",         "",                            "Optional: URL to company logo for PDF exports"],
  ];

  sh.getRange(1, 1, data.length, data[0].length).setValues(data);
  styleHeaderRow(sh, 1, data[0].length);
  sh.setColumnWidth(1, 180);
  sh.setColumnWidth(2, 240);
  sh.setColumnWidth(3, 340);
  Logger.log("Sheet created: " + CONFIG.SHEETS.SETTINGS);
}

function setupCategories() {
  var ss = SpreadsheetApp.getActive();
  var sh = getOrCreateSheet(ss, CONFIG.SHEETS.CATEGORIES);
  sh.clearContents();

  var data = [
    ["CategoryID", "CategoryName",      "Description",                          "RequiresReceipt", "MaxAmount"],
    ["CAT001",     "Air Travel",        "Flights, airport transfers",            "Yes",             "5000"],
    ["CAT002",     "Ground Transport",  "Taxi, rideshare, rental car, fuel",     "Yes",             "500"],
    ["CAT003",     "Accommodation",     "Hotel, serviced apartment",             "Yes",             "300"],
    ["CAT004",     "Meals",             "Business meals and client entertainment","Yes",            "150"],
    ["CAT005",     "Per Diem",          "Daily allowance (no receipt required)", "No",              "75"],
    ["CAT006",     "Communication",     "Phone, internet, roaming charges",      "Yes",             "100"],
    ["CAT007",     "Office Supplies",   "Stationery and work materials",         "Yes",             "200"],
    ["CAT008",     "Training",          "Courses, books, certification fees",    "Yes",             "2000"],
    ["CAT009",     "Miscellaneous",     "Other approved business expenses",      "Yes",             "500"],
  ];

  sh.getRange(1, 1, data.length, data[0].length).setValues(data);
  styleHeaderRow(sh, 1, data[0].length);
  autoResizeAll(sh, data[0].length);
  Logger.log("Sheet created: " + CONFIG.SHEETS.CATEGORIES);
}

function setupEmployees() {
  var ss = SpreadsheetApp.getActive();
  var sh = getOrCreateSheet(ss, CONFIG.SHEETS.EMPLOYEES);
  sh.clearContents();

  var headers = [
    "EmployeeID", "FullName", "Email", "Department",
    "ManagerEmail", "Role", "BankAccount", "Active", "JoinDate",
  ];

  // Sample data — delete before go-live
  var sampleRows = [
    ["EMP001", "Alice Johnson", "alice@yourcompany.com", "Sales",    "manager@yourcompany.com", "Employee", "****1234", "Yes", "2022-01-15"],
    ["EMP002", "Bob Smith",     "bob@yourcompany.com",   "IT",       "manager@yourcompany.com", "Employee", "****5678", "Yes", "2021-06-01"],
    ["EMP003", "Carol Finance", "carol@yourcompany.com", "Finance",  "",                        "Finance",  "****9012", "Yes", "2020-03-10"],
  ];

  sh.getRange(1, 1, 1, headers.length).setValues([headers]);
  sh.getRange(2, 1, sampleRows.length, headers.length).setValues(sampleRows);
  styleHeaderRow(sh, 1, headers.length);
  autoResizeAll(sh, headers.length);

  // Protect BankAccount column from non-finance users (manual step in AppSheet)
  sh.getRange("G:G").setFontColor("#999999"); // Visual hint: sensitive column
  Logger.log("Sheet created: " + CONFIG.SHEETS.EMPLOYEES);
}

function setupExpenseClaims() {
  var ss = SpreadsheetApp.getActive();
  var sh = getOrCreateSheet(ss, CONFIG.SHEETS.CLAIMS);
  sh.clearContents();

  var headers = [
    "ClaimID",        // A — Auto-generated (e.g., CLM-2024-0001)
    "EmployeeID",     // B
    "EmployeeName",   // C — Looked up from Employees
    "SubmissionDate", // D — Auto-filled
    "ExpenseDate",    // E — Date the expense was incurred
    "Category",       // F — Dropdown from Categories sheet
    "Description",    // G
    "Amount",         // H
    "Currency",       // I
    "ReceiptURL",     // J — Google Drive link (uploaded via AppSheet)
    "Status",         // K — Pending / Approved / Rejected / Paid
    "ReviewedBy",     // L — Finance email
    "ReviewDate",     // M
    "ReviewNotes",    // N
    "ApprovedAmount", // O — May differ if partially approved
    "AdvanceDeducted",// P — Auto-calculated
    "NetPayable",     // Q — Auto-calculated: ApprovedAmount - AdvanceDeducted
    "PaymentDate",    // R
    "PaymentRef",     // S — Bank transfer / cheque reference
  ];

  sh.getRange(1, 1, 1, headers.length).setValues([headers]);
  styleHeaderRow(sh, 1, headers.length);

  // Status column dropdown validation
  var statusRule = SpreadsheetApp.newDataValidation()
    .requireValueInList(Object.values(CONFIG.STATUS), true)
    .build();
  sh.getRange("K2:K10000").setDataValidation(statusRule);

  // Currency column dropdown
  var currencyRule = SpreadsheetApp.newDataValidation()
    .requireValueInList(["USD","EUR","GBP","INR","AED","SGD","AUD","CAD"], true)
    .build();
  sh.getRange("I2:I10000").setDataValidation(currencyRule);

  // Freeze header row and key identifier columns
  sh.setFrozenRows(1);
  sh.setFrozenColumns(2);

  // Column widths
  var widths = [120,90,140,110,110,130,220,90,80,220,90,160,110,220,110,110,100,110,130];
  widths.forEach(function(w, i) { sh.setColumnWidth(i + 1, w); });

  // Conditional formatting for Status column
  applyStatusConditionalFormatting(sh, "K");

  Logger.log("Sheet created: " + CONFIG.SHEETS.CLAIMS);
}

function setupAdvances() {
  var ss = SpreadsheetApp.getActive();
  var sh = getOrCreateSheet(ss, CONFIG.SHEETS.ADVANCES);
  sh.clearContents();

  var headers = [
    "AdvanceID",      // A
    "EmployeeID",     // B
    "EmployeeName",   // C
    "IssueDate",      // D
    "Purpose",        // E
    "Amount",         // F
    "Currency",       // G
    "Status",         // H — Outstanding / Settled / Partially Settled
    "SettledAmount",  // I
    "SettledDate",    // J
    "LinkedClaimID",  // K — Claim this advance was deducted against
    "Notes",          // L
  ];

  sh.getRange(1, 1, 1, headers.length).setValues([headers]);
  styleHeaderRow(sh, 1, headers.length);

  var statusRule = SpreadsheetApp.newDataValidation()
    .requireValueInList(["Outstanding","Settled","Partially Settled"], true)
    .build();
  sh.getRange("H2:H10000").setDataValidation(statusRule);

  sh.setFrozenRows(1);
  sh.setFrozenColumns(2);
  autoResizeAll(sh, headers.length);
  Logger.log("Sheet created: " + CONFIG.SHEETS.ADVANCES);
}

function setupLedger() {
  var ss = SpreadsheetApp.getActive();
  var sh = getOrCreateSheet(ss, CONFIG.SHEETS.LEDGER);
  sh.clearContents();

  var headers = [
    "EmployeeID",         // A
    "EmployeeName",       // B
    "Department",         // C
    "TotalClaimed",       // D — SUM of all submitted claims
    "TotalApproved",      // E — SUM of Approved/Paid claims
    "TotalAdvances",      // F — SUM of outstanding advances
    "TotalPaid",          // G — SUM of PaymentDate-filled rows
    "PendingApproval",    // H — SUM of Pending claims
    "NetBalance",         // I — TotalApproved - TotalAdvances - TotalPaid
    "LastUpdated",        // J
  ];

  sh.getRange(1, 1, 1, headers.length).setValues([headers]);
  styleHeaderRow(sh, 1, headers.length);
  sh.setFrozenRows(1);

  // Note: Ledger rows are populated by rebuildLedger() in ledger-calculations.gs
  var noteRange = sh.getRange("A2");
  var note = sh.newChart()
  Logger.log("Sheet created: " + CONFIG.SHEETS.LEDGER);
}

function setupAuditLog() {
  var ss = SpreadsheetApp.getActive();
  var sh = getOrCreateSheet(ss, CONFIG.SHEETS.AUDIT);
  sh.clearContents();

  var headers = [
    "Timestamp", "UserEmail", "Action", "EntityType", "EntityID", "OldValue", "NewValue", "Notes",
  ];

  sh.getRange(1, 1, 1, headers.length).setValues([headers]);
  styleHeaderRow(sh, 1, headers.length);
  sh.setFrozenRows(1);
  autoResizeAll(sh, headers.length);
  Logger.log("Sheet created: " + CONFIG.SHEETS.AUDIT);
}

// ─── FORMATTING HELPERS ───────────────────────────────────────────────────────

function applyGlobalFormatting() {
  var ss = SpreadsheetApp.getActive();

  // Tab colours for easy navigation
  var tabColors = {
    [CONFIG.SHEETS.EMPLOYEES]:  "#4a90d9",
    [CONFIG.SHEETS.CLAIMS]:     "#f5a623",
    [CONFIG.SHEETS.ADVANCES]:   "#7ed321",
    [CONFIG.SHEETS.LEDGER]:     "#9b59b6",
    [CONFIG.SHEETS.CATEGORIES]: "#1abc9c",
    [CONFIG.SHEETS.AUDIT]:      "#95a5a6",
    [CONFIG.SHEETS.SETTINGS]:   "#e74c3c",
  };

  Object.keys(tabColors).forEach(function(name) {
    var sh = ss.getSheetByName(name);
    if (sh) sh.setTabColor(tabColors[name]);
  });
}

function styleHeaderRow(sheet, row, numCols) {
  var range = sheet.getRange(row, 1, 1, numCols);
  range
    .setBackground("#2c3e50")
    .setFontColor("#ffffff")
    .setFontWeight("bold")
    .setFontSize(10)
    .setHorizontalAlignment("center");
  sheet.setRowHeight(row, 32);
}

function applyStatusConditionalFormatting(sheet, col) {
  var range = sheet.getRange(col + "2:" + col + "10000");
  var rules = [
    SpreadsheetApp.newConditionalFormatRule()
      .whenTextEqualTo(CONFIG.STATUS.APPROVED)
      .setBackground("#d4edda").setFontColor("#155724").build(),
    SpreadsheetApp.newConditionalFormatRule()
      .whenTextEqualTo(CONFIG.STATUS.PENDING)
      .setBackground("#fff3cd").setFontColor("#856404").build(),
    SpreadsheetApp.newConditionalFormatRule()
      .whenTextEqualTo(CONFIG.STATUS.REJECTED)
      .setBackground("#f8d7da").setFontColor("#721c24").build(),
    SpreadsheetApp.newConditionalFormatRule()
      .whenTextEqualTo(CONFIG.STATUS.PAID)
      .setBackground("#cce5ff").setFontColor("#004085").build(),
  ];
  sheet.setConditionalFormatRules(rules);
}

function autoResizeAll(sheet, numCols) {
  for (var i = 1; i <= numCols; i++) {
    sheet.autoResizeColumn(i);
  }
}

// ─── UTILITY HELPERS ─────────────────────────────────────────────────────────

function getOrCreateSheet(ss, name) {
  var sh = ss.getSheetByName(name);
  if (!sh) {
    sh = ss.insertSheet(name);
  }
  return sh;
}

function getSetting(key) {
  var ss = SpreadsheetApp.getActive();
  var sh = ss.getSheetByName(CONFIG.SHEETS.SETTINGS);
  if (!sh) return null;
  var data = sh.getDataRange().getValues();
  for (var i = 1; i < data.length; i++) {
    if (data[i][0] === key) return data[i][1];
  }
  return null;
}

function generateClaimID() {
  var ss = SpreadsheetApp.getActive();
  var sh = ss.getSheetByName(CONFIG.SHEETS.CLAIMS);
  var lastRow = sh.getLastRow();
  var year = new Date().getFullYear();
  var seq = String(lastRow).padStart(4, "0");
  return "CLM-" + year + "-" + seq;
}

function generateAdvanceID() {
  var ss = SpreadsheetApp.getActive();
  var sh = ss.getSheetByName(CONFIG.SHEETS.ADVANCES);
  var lastRow = sh.getLastRow();
  var year = new Date().getFullYear();
  var seq = String(lastRow).padStart(4, "0");
  return "ADV-" + year + "-" + seq;
}

function logAudit(userEmail, action, entityType, entityID, oldValue, newValue, notes) {
  var ss = SpreadsheetApp.getActive();
  var sh = ss.getSheetByName(CONFIG.SHEETS.AUDIT);
  sh.appendRow([
    new Date(),
    userEmail,
    action,
    entityType,
    entityID,
    oldValue || "",
    newValue || "",
    notes || "",
  ]);
}
