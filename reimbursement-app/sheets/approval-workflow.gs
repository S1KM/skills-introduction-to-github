/**
 * approval-workflow.gs
 *
 * Handles claim approval, rejection, and payment marking.
 * These functions are called:
 *   - By onEdit trigger when finance changes Status in ExpenseClaims sheet.
 *   - Directly from AppSheet custom actions.
 *   - From the custom menu (for manual use).
 */

// ─── MAIN EDIT TRIGGER ────────────────────────────────────────────────────────

/**
 * Fired by an installable onEdit trigger.
 * Detects status changes in the ExpenseClaims sheet and routes accordingly.
 */
function onClaimStatusChange(e) {
  var sheet = e.range.getSheet();
  if (sheet.getName() !== CONFIG.SHEETS.CLAIMS) return;

  var col = e.range.getColumn();
  var row = e.range.getRow();
  if (row === 1) return; // Skip header

  // Column K = Status (index 11)
  var STATUS_COL = 11;
  if (col !== STATUS_COL) return;

  var newStatus = e.range.getValue();
  var oldStatus = e.oldValue || "";

  if (newStatus === oldStatus) return;

  var claimRow = sheet.getRange(row, 1, 1, 19).getValues()[0];
  var claimID      = claimRow[0];
  var employeeID   = claimRow[1];
  var employeeName = claimRow[2];
  var amount       = claimRow[7];
  var category     = claimRow[5];
  var description  = claimRow[6];
  var reviewedBy   = Session.getActiveUser().getEmail();

  // Record who reviewed and when
  sheet.getRange(row, 12).setValue(reviewedBy);       // L: ReviewedBy
  sheet.getRange(row, 13).setValue(new Date());        // M: ReviewDate

  if (newStatus === CONFIG.STATUS.APPROVED) {
    handleApproval(sheet, row, claimID, employeeID, employeeName, amount, category, description, reviewedBy);
  } else if (newStatus === CONFIG.STATUS.REJECTED) {
    handleRejection(sheet, row, claimID, employeeID, employeeName, amount, reviewedBy);
  } else if (newStatus === CONFIG.STATUS.PAID) {
    handlePayment(sheet, row, claimID, employeeID, employeeName, amount);
  }

  logAudit(reviewedBy, "STATUS_CHANGE", "Claim", claimID, oldStatus, newStatus, "");
}

// ─── APPROVAL ────────────────────────────────────────────────────────────────

function handleApproval(sheet, row, claimID, employeeID, employeeName, claimedAmount, category, description, reviewedBy) {
  // If ApprovedAmount (col O) is blank, default to claimedAmount
  var approvedAmount = sheet.getRange(row, 15).getValue();
  if (!approvedAmount || approvedAmount === "") {
    sheet.getRange(row, 15).setValue(claimedAmount);
    approvedAmount = claimedAmount;
  }

  // Look up outstanding advances for this employee
  var advanceTotal = getOutstandingAdvances(employeeID);
  sheet.getRange(row, 16).setValue(advanceTotal);           // P: AdvanceDeducted

  var netPayable = Math.max(0, approvedAmount - advanceTotal);
  sheet.getRange(row, 17).setValue(netPayable);             // Q: NetPayable

  // Mark advances as settled if fully covered
  if (advanceTotal > 0) {
    settleAdvancesForEmployee(employeeID, approvedAmount, claimID);
  }

  // Rebuild ledger
  rebuildLedger();

  // Notify employee
  var empEmail = getEmployeeEmail(employeeID);
  if (empEmail) {
    sendApprovalNotification(empEmail, employeeName, claimID, approvedAmount, advanceTotal, netPayable, category, description);
  }
}

// ─── REJECTION ───────────────────────────────────────────────────────────────

function handleRejection(sheet, row, claimID, employeeID, employeeName, amount, reviewedBy) {
  var notes = sheet.getRange(row, 14).getValue(); // N: ReviewNotes
  sheet.getRange(row, 15).setValue(0);             // ApprovedAmount = 0
  sheet.getRange(row, 17).setValue(0);             // NetPayable = 0

  rebuildLedger();

  var empEmail = getEmployeeEmail(employeeID);
  if (empEmail) {
    sendRejectionNotification(empEmail, employeeName, claimID, amount, notes);
  }
}

// ─── PAYMENT MARKED ──────────────────────────────────────────────────────────

function handlePayment(sheet, row, claimID, employeeID, employeeName, amount) {
  sheet.getRange(row, 18).setValue(new Date()); // R: PaymentDate
  rebuildLedger();

  var empEmail = getEmployeeEmail(employeeID);
  if (empEmail) {
    var netPayable = sheet.getRange(row, 17).getValue();
    sendPaymentNotification(empEmail, employeeName, claimID, netPayable);
  }

  logAudit(Session.getActiveUser().getEmail(), "PAYMENT_MARKED", "Claim", claimID, "", CONFIG.STATUS.PAID, "");
}

// ─── ADVANCE LOGIC ───────────────────────────────────────────────────────────

/**
 * Returns total outstanding advance amount for a given employee.
 */
function getOutstandingAdvances(employeeID) {
  var ss = SpreadsheetApp.getActive();
  var sh = ss.getSheetByName(CONFIG.SHEETS.ADVANCES);
  var data = sh.getDataRange().getValues();
  var total = 0;

  for (var i = 1; i < data.length; i++) {
    if (data[i][1] === employeeID && data[i][7] === "Outstanding") {
      total += parseFloat(data[i][5]) || 0;
    }
  }
  return total;
}

/**
 * Settles outstanding advances for an employee up to the approved claim amount.
 * Marks advance as "Settled" or "Partially Settled" as appropriate.
 */
function settleAdvancesForEmployee(employeeID, approvedAmount, claimID) {
  var ss = SpreadsheetApp.getActive();
  var sh = ss.getSheetByName(CONFIG.SHEETS.ADVANCES);
  var data = sh.getDataRange().getValues();
  var remaining = approvedAmount;

  for (var i = 1; i < data.length; i++) {
    if (data[i][1] !== employeeID || data[i][7] !== "Outstanding") continue;

    var advAmount = parseFloat(data[i][5]) || 0;

    if (remaining >= advAmount) {
      // Fully settle this advance
      sh.getRange(i + 1, 8).setValue("Settled");          // Status
      sh.getRange(i + 1, 9).setValue(advAmount);           // SettledAmount
      sh.getRange(i + 1, 10).setValue(new Date());          // SettledDate
      sh.getRange(i + 1, 11).setValue(claimID);             // LinkedClaimID
      remaining -= advAmount;
    } else if (remaining > 0) {
      // Partially settle
      sh.getRange(i + 1, 8).setValue("Partially Settled");
      sh.getRange(i + 1, 9).setValue(remaining);
      sh.getRange(i + 1, 10).setValue(new Date());
      sh.getRange(i + 1, 11).setValue(claimID);
      sh.getRange(i + 1, 5).setValue(advAmount - remaining); // Remaining advance amount
      remaining = 0;
    }

    if (remaining <= 0) break;
  }
}

// ─── EMPLOYEE LOOKUP ─────────────────────────────────────────────────────────

function getEmployeeEmail(employeeID) {
  var ss = SpreadsheetApp.getActive();
  var sh = ss.getSheetByName(CONFIG.SHEETS.EMPLOYEES);
  var data = sh.getDataRange().getValues();

  for (var i = 1; i < data.length; i++) {
    if (data[i][0] === employeeID) return data[i][2]; // Column C: Email
  }
  return null;
}

function getEmployeeByID(employeeID) {
  var ss = SpreadsheetApp.getActive();
  var sh = ss.getSheetByName(CONFIG.SHEETS.EMPLOYEES);
  var data = sh.getDataRange().getValues();

  for (var i = 1; i < data.length; i++) {
    if (data[i][0] === employeeID) {
      return {
        id:          data[i][0],
        name:        data[i][1],
        email:       data[i][2],
        department:  data[i][3],
        managerEmail:data[i][4],
        role:        data[i][5],
      };
    }
  }
  return null;
}

// ─── MANUAL MENU ACTIONS ─────────────────────────────────────────────────────

/**
 * Adds a custom menu to the spreadsheet for finance users.
 * Called automatically via a simple onOpen trigger.
 */
function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu("💼 Reimbursement")
    .addItem("Rebuild Ledger",       "rebuildLedger")
    .addItem("Export Employee Report (PDF)", "exportAllEmployeePDFs")
    .addItem("Export to Excel",      "exportToExcel")
    .addSeparator()
    .addItem("Send Reminder Emails (Pending)", "sendPendingReminders")
    .addSeparator()
    .addItem("Setup / Re-initialize Sheets",   "setupAll")
    .addItem("Install Triggers",               "installTriggers")
    .addToUi();
}

/**
 * Sends reminder email to finance for all claims still in Pending status
 * older than 3 business days.
 */
function sendPendingReminders() {
  var ss = SpreadsheetApp.getActive();
  var sh = ss.getSheetByName(CONFIG.SHEETS.CLAIMS);
  var data = sh.getDataRange().getValues();
  var financeEmail = getSetting("FINANCE_EMAIL");
  var reminders = [];
  var now = new Date();

  for (var i = 1; i < data.length; i++) {
    if (data[i][10] !== CONFIG.STATUS.PENDING) continue;
    var submittedDate = new Date(data[i][3]);
    var daysDiff = Math.floor((now - submittedDate) / 86400000);
    if (daysDiff >= 3) {
      reminders.push({
        claimID: data[i][0],
        employee: data[i][2],
        amount: data[i][7],
        days: daysDiff,
      });
    }
  }

  if (reminders.length === 0) {
    SpreadsheetApp.getUi().alert("No pending claims older than 3 days.");
    return;
  }

  var body = "<h2>Pending Reimbursement Claims — Action Required</h2>";
  body += "<p>The following claims have been awaiting review for 3 or more days:</p>";
  body += "<table border='1' cellpadding='6' cellspacing='0'>";
  body += "<tr><th>Claim ID</th><th>Employee</th><th>Amount</th><th>Days Pending</th></tr>";
  reminders.forEach(function(r) {
    body += "<tr><td>" + r.claimID + "</td><td>" + r.employee + "</td><td>" + r.amount + "</td><td>" + r.days + "</td></tr>";
  });
  body += "</table>";

  GmailApp.sendEmail(financeEmail, "⏰ Action Required: " + reminders.length + " Pending Expense Claims", "", { htmlBody: body });
  SpreadsheetApp.getActive().toast("Reminder sent to " + financeEmail, "✅ Done", 5);
}
