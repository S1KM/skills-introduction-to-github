/**
 * triggers.gs
 *
 * Installs all Apps Script triggers for the reimbursement system.
 *
 * RUN ONCE: Call installTriggers() after setupAll() to enable full automation.
 * RUN TO RESET: Call removeTriggers() to delete all installed triggers,
 *   then re-run installTriggers() to reinstall cleanly.
 *
 * Trigger inventory:
 *   1. onOpen         — Adds custom "Reimbursement" menu to the spreadsheet.
 *   2. onEditInstall  — Detects Status changes in ExpenseClaims → approval flow.
 *   3. onFormSubmit   — Fires when AppSheet (or a linked Google Form) adds a row.
 *   4. dailyReminder  — Every weekday morning: sends pending claim reminders to finance.
 *   5. monthlySummary — 1st of each month: sends finance summary report.
 */

// ─── INSTALL / REMOVE ─────────────────────────────────────────────────────────

/**
 * Installs all triggers. Safe to call multiple times — removes old duplicates first.
 */
function installTriggers() {
  removeTriggers(); // Clean slate

  var ss = SpreadsheetApp.getActive();

  // 1. onOpen — simple trigger (can't be installed; defined in onOpen() directly)
  //    Just log a reminder.
  Logger.log("Note: onOpen is a simple trigger. Define it directly in your script.");

  // 2. onEdit (installable) — detects Status column changes
  ScriptApp.newTrigger("onClaimStatusChange")
    .forSpreadsheet(ss)
    .onEdit()
    .create();

  // 3. onFormSubmit — handles new claim submissions from AppSheet/Google Form
  ScriptApp.newTrigger("onNewClaimSubmitted")
    .forSpreadsheet(ss)
    .onFormSubmit()
    .create();

  // 4. Daily weekday reminder — 8:00–9:00 AM in the script's timezone
  ScriptApp.newTrigger("sendPendingReminders")
    .timeBased()
    .everyDays(1)
    .atHour(8)
    .create();

  // 5. Monthly summary — 1st of month at 7:00 AM
  ScriptApp.newTrigger("sendMonthlyFinanceSummary")
    .timeBased()
    .onMonthDay(1)
    .atHour(7)
    .create();

  Logger.log("✅ Triggers installed successfully.");
  SpreadsheetApp.getActive().toast(
    "All automation triggers are now active.",
    "✅ Triggers Installed",
    6
  );
}

/**
 * Removes all project-specific triggers from this spreadsheet.
 */
function removeTriggers() {
  var triggerFunctions = [
    "onClaimStatusChange",
    "onNewClaimSubmitted",
    "sendPendingReminders",
    "sendMonthlyFinanceSummary",
  ];

  ScriptApp.getProjectTriggers().forEach(function(trigger) {
    if (triggerFunctions.indexOf(trigger.getHandlerFunction()) !== -1) {
      ScriptApp.deleteTrigger(trigger);
    }
  });

  Logger.log("All reimbursement triggers removed.");
}

/**
 * Lists all current triggers to the log for debugging.
 */
function listTriggers() {
  ScriptApp.getProjectTriggers().forEach(function(t) {
    Logger.log("[Trigger] " + t.getHandlerFunction() + " | " + t.getEventType() + " | " + t.getTriggerSourceId());
  });
}

// ─── FORM SUBMIT HANDLER ──────────────────────────────────────────────────────

/**
 * Called when a new row is added to ExpenseClaims via AppSheet or Google Form.
 * Assigns a ClaimID, stamps the submission date, and notifies finance.
 *
 * @param {Object} e - Apps Script form submit event object.
 */
function onNewClaimSubmitted(e) {
  var ss    = SpreadsheetApp.getActive();
  var sheet = ss.getSheetByName(CONFIG.SHEETS.CLAIMS);

  // For Google Form submissions, e.range is the new row.
  // For AppSheet, this trigger fires on any sheet edit/append.
  var range = e.range;
  var row   = range.getRow();

  // Only process if in the Claims sheet and not the header
  if (range.getSheet().getName() !== CONFIG.SHEETS.CLAIMS || row <= 1) return;

  var rowData = sheet.getRange(row, 1, 1, 19).getValues()[0];

  // Skip if ClaimID already exists (avoid double-processing)
  if (rowData[0] && rowData[0].toString().startsWith("CLM-")) return;

  // Assign ClaimID
  var claimID = generateClaimID();
  sheet.getRange(row, 1).setValue(claimID);           // A: ClaimID

  // Stamp submission date if not already set
  if (!rowData[3]) {
    sheet.getRange(row, 4).setValue(new Date());       // D: SubmissionDate
  }

  // Set initial status to Pending if blank
  if (!rowData[10]) {
    sheet.getRange(row, 11).setValue(CONFIG.STATUS.PENDING); // K: Status
  }

  // Look up employee name from EmployeeID
  var employeeID = rowData[1] || sheet.getRange(row, 2).getValue();
  if (employeeID) {
    var emp = getEmployeeByID(employeeID);
    if (emp) {
      sheet.getRange(row, 3).setValue(emp.name);       // C: EmployeeName
    }
  }

  // Re-read the (now populated) row for notification
  rowData = sheet.getRange(row, 1, 1, 19).getValues()[0];

  // Notify finance
  sendNewClaimNotification(
    rowData[0],    // ClaimID
    rowData[2],    // EmployeeName
    rowData[2],    // employeeEmail (best effort; could look up separately)
    rowData[7],    // Amount
    rowData[5],    // Category
    rowData[6],    // Description
    rowData[9],    // ReceiptURL
  );

  // Rebuild ledger to include new pending claim
  rebuildLedger();

  logAudit(
    employeeID || "unknown",
    "CLAIM_SUBMITTED",
    "Claim",
    claimID,
    "",
    CONFIG.STATUS.PENDING,
    "Auto-assigned via onNewClaimSubmitted trigger"
  );
}

// ─── ADVANCE SUBMIT HANDLER ───────────────────────────────────────────────────

/**
 * Call this manually (or wire to an AppSheet action) when a new advance is issued.
 * Assigns an AdvanceID and notifies the employee.
 *
 * @param {number} row - 1-based row in Advances sheet.
 */
function processNewAdvance(row) {
  var ss    = SpreadsheetApp.getActive();
  var sheet = ss.getSheetByName(CONFIG.SHEETS.ADVANCES);
  var data  = sheet.getRange(row, 1, 1, 12).getValues()[0];

  // Assign AdvanceID if missing
  if (!data[0]) {
    var advID = generateAdvanceID();
    sheet.getRange(row, 1).setValue(advID);
    data[0] = advID;
  }

  // Set status to Outstanding if blank
  if (!data[7]) {
    sheet.getRange(row, 8).setValue("Outstanding");
  }

  // Notify employee
  var emp = getEmployeeByID(data[1]);
  if (emp && emp.email) {
    sendAdvanceIssuedNotification(emp.email, emp.name, data[0], data[5], data[4]);
  }

  rebuildLedger();

  logAudit(
    Session.getActiveUser().getEmail(),
    "ADVANCE_ISSUED",
    "Advance",
    data[0],
    "",
    data[5],
    data[4]
  );
}

// ─── HEALTH CHECK ─────────────────────────────────────────────────────────────

/**
 * Validates the spreadsheet structure — checks all expected sheets exist.
 * Run this after setup to confirm everything is in order.
 */
function healthCheck() {
  var ss     = SpreadsheetApp.getActive();
  var issues = [];

  Object.values(CONFIG.SHEETS).forEach(function(name) {
    if (!ss.getSheetByName(name)) {
      issues.push("Missing sheet: " + name);
    }
  });

  var financeEmail = getSetting("FINANCE_EMAIL");
  if (!financeEmail || financeEmail === "finance@yourcompany.com") {
    issues.push("FINANCE_EMAIL in Settings sheet is still the default. Please update it.");
  }

  if (issues.length === 0) {
    SpreadsheetApp.getActive().toast("All checks passed!", "✅ Health Check OK", 5);
    Logger.log("Health check: PASSED");
  } else {
    var msg = "Issues found:\n" + issues.join("\n");
    SpreadsheetApp.getUi().alert("⚠️ Health Check Issues", msg, SpreadsheetApp.getUi().ButtonSet.OK);
    Logger.log("Health check issues:\n" + msg);
  }
}
