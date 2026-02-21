/**
 * ledger-calculations.gs
 *
 * Rebuilds the Ledger sheet with per-employee totals.
 * Called after every approval, rejection, or payment event.
 *
 * Ledger columns (A–J):
 *   A: EmployeeID
 *   B: EmployeeName
 *   C: Department
 *   D: TotalClaimed       — sum of all submitted claim amounts
 *   E: TotalApproved      — sum of ApprovedAmount for Approved + Paid claims
 *   F: TotalAdvances      — sum of currently Outstanding advances
 *   G: TotalPaid          — sum of NetPayable for Paid claims
 *   H: PendingApproval    — sum of amounts in Pending status
 *   I: NetBalance         — TotalApproved − TotalAdvances − TotalPaid
 *   J: LastUpdated
 */

// ─── MAIN REBUILD ─────────────────────────────────────────────────────────────

/**
 * Clears and rebuilds the entire Ledger sheet from Claims and Advances data.
 * Safe to call any time — fully idempotent.
 */
function rebuildLedger() {
  var ss = SpreadsheetApp.getActive();

  var empData     = loadEmployees(ss);
  var claimsData  = loadClaims(ss);
  var advData     = loadAdvances(ss);

  // Aggregate per employee
  var ledger = {};   // { employeeID: { ...sums } }

  // Initialize from employee master
  empData.forEach(function(emp) {
    if (!emp.id) return;
    ledger[emp.id] = {
      id:             emp.id,
      name:           emp.name,
      department:     emp.department,
      totalClaimed:   0,
      totalApproved:  0,
      totalAdvances:  0,
      totalPaid:      0,
      pendingApproval:0,
    };
  });

  // Aggregate claims
  claimsData.forEach(function(claim) {
    var eid    = claim.employeeID;
    var amount = parseFloat(claim.amount)         || 0;
    var appAmt = parseFloat(claim.approvedAmount) || 0;
    var netPay = parseFloat(claim.netPayable)     || 0;
    var status = claim.status;

    if (!ledger[eid]) {
      // Employee not in master — create a row anyway
      ledger[eid] = { id: eid, name: claim.employeeName, department: "", totalClaimed: 0, totalApproved: 0, totalAdvances: 0, totalPaid: 0, pendingApproval: 0 };
    }

    ledger[eid].totalClaimed += amount;

    if (status === CONFIG.STATUS.APPROVED || status === CONFIG.STATUS.PAID) {
      ledger[eid].totalApproved += appAmt;
    }
    if (status === CONFIG.STATUS.PENDING) {
      ledger[eid].pendingApproval += amount;
    }
    if (status === CONFIG.STATUS.PAID && claim.paymentDate) {
      ledger[eid].totalPaid += netPay;
    }
  });

  // Aggregate outstanding advances
  advData.forEach(function(adv) {
    var eid = adv.employeeID;
    if (!ledger[eid]) return;
    if (adv.status === "Outstanding") {
      ledger[eid].totalAdvances += parseFloat(adv.amount) || 0;
    }
  });

  // Write to Ledger sheet
  var ledgerSheet = ss.getSheetByName(CONFIG.SHEETS.LEDGER);
  // Clear data rows (keep header)
  var lastRow = ledgerSheet.getLastRow();
  if (lastRow > 1) {
    ledgerSheet.getRange(2, 1, lastRow - 1, 10).clearContent();
  }

  var rows = Object.values(ledger).map(function(e) {
    var netBalance = e.totalApproved - e.totalAdvances - e.totalPaid;
    return [
      e.id,
      e.name,
      e.department,
      e.totalClaimed,
      e.totalApproved,
      e.totalAdvances,
      e.totalPaid,
      e.pendingApproval,
      netBalance,
      new Date(),
    ];
  });

  if (rows.length > 0) {
    ledgerSheet.getRange(2, 1, rows.length, 10).setValues(rows);
    formatLedgerRows(ledgerSheet, rows.length);
  }

  logAudit(
    Session.getActiveUser().getEmail(),
    "LEDGER_REBUILT",
    "Ledger",
    "ALL",
    "",
    rows.length + " rows",
    ""
  );
}

// ─── DATA LOADERS ─────────────────────────────────────────────────────────────

function loadEmployees(ss) {
  var sh = ss.getSheetByName(CONFIG.SHEETS.EMPLOYEES);
  var data = sh.getDataRange().getValues();
  return data.slice(1).map(function(row) {
    return {
      id:         row[0],
      name:       row[1],
      email:      row[2],
      department: row[3],
      active:     row[7],
    };
  }).filter(function(e) { return e.id && e.active === "Yes"; });
}

function loadClaims(ss) {
  var sh = ss.getSheetByName(CONFIG.SHEETS.CLAIMS);
  var data = sh.getDataRange().getValues();
  return data.slice(1).map(function(row) {
    return {
      claimID:        row[0],
      employeeID:     row[1],
      employeeName:   row[2],
      submissionDate: row[3],
      expenseDate:    row[4],
      category:       row[5],
      description:    row[6],
      amount:         row[7],
      currency:       row[8],
      receiptURL:     row[9],
      status:         row[10],
      reviewedBy:     row[11],
      reviewDate:     row[12],
      reviewNotes:    row[13],
      approvedAmount: row[14],
      advanceDeducted:row[15],
      netPayable:     row[16],
      paymentDate:    row[17],
      paymentRef:     row[18],
    };
  }).filter(function(c) { return c.claimID; });
}

function loadAdvances(ss) {
  var sh = ss.getSheetByName(CONFIG.SHEETS.ADVANCES);
  var data = sh.getDataRange().getValues();
  return data.slice(1).map(function(row) {
    return {
      advanceID:    row[0],
      employeeID:   row[1],
      employeeName: row[2],
      issueDate:    row[3],
      purpose:      row[4],
      amount:       row[5],
      currency:     row[6],
      status:       row[7],
      settledAmount:row[8],
      settledDate:  row[9],
      linkedClaim:  row[10],
    };
  }).filter(function(a) { return a.advanceID; });
}

// ─── FORMATTING ───────────────────────────────────────────────────────────────

function formatLedgerRows(sheet, numRows) {
  if (numRows < 1) return;

  // Currency columns: D, E, F, G, H, I (indices 4–9)
  var currencyCols = ["D","E","F","G","H","I"];
  currencyCols.forEach(function(col) {
    sheet.getRange(col + "2:" + col + (numRows + 1))
      .setNumberFormat('"' + CONFIG.CURRENCY + '"#,##0.00');
  });

  // Highlight negative NetBalance (column I) in red
  var netRange = sheet.getRange("I2:I" + (numRows + 1));
  var rules = sheet.getConditionalFormatRules() || [];
  rules.push(
    SpreadsheetApp.newConditionalFormatRule()
      .whenNumberLessThan(0)
      .setBackground("#f8d7da")
      .setFontColor("#721c24")
      .setRanges([netRange])
      .build()
  );
  rules.push(
    SpreadsheetApp.newConditionalFormatRule()
      .whenNumberGreaterThan(0)
      .setBackground("#d4edda")
      .setFontColor("#155724")
      .setRanges([netRange])
      .build()
  );
  sheet.setConditionalFormatRules(rules);

  // Date formatting on column J (LastUpdated)
  sheet.getRange("J2:J" + (numRows + 1))
    .setNumberFormat("yyyy-mm-dd hh:mm");

  // Alternate row banding
  sheet.getRange(2, 1, numRows, 10)
    .applyRowBanding(SpreadsheetApp.BandingTheme.LIGHT_GREY);
}

// ─── INDIVIDUAL EMPLOYEE LEDGER VIEW ──────────────────────────────────────────

/**
 * Returns a summary object for a single employee.
 * Used internally for validation and by AppSheet virtual columns.
 */
function getEmployeeLedgerSummary(employeeID) {
  var ss = SpreadsheetApp.getActive();
  var claims   = loadClaims(ss).filter(function(c) { return c.employeeID === employeeID; });
  var advances = loadAdvances(ss).filter(function(a) { return a.employeeID === employeeID; });

  var totalClaimed    = 0;
  var totalApproved   = 0;
  var totalPaid       = 0;
  var pendingApproval = 0;
  var totalAdvances   = 0;

  claims.forEach(function(c) {
    totalClaimed += parseFloat(c.amount) || 0;
    if (c.status === CONFIG.STATUS.APPROVED || c.status === CONFIG.STATUS.PAID) {
      totalApproved += parseFloat(c.approvedAmount) || 0;
    }
    if (c.status === CONFIG.STATUS.PENDING) {
      pendingApproval += parseFloat(c.amount) || 0;
    }
    if (c.status === CONFIG.STATUS.PAID && c.paymentDate) {
      totalPaid += parseFloat(c.netPayable) || 0;
    }
  });

  advances.forEach(function(a) {
    if (a.status === "Outstanding") {
      totalAdvances += parseFloat(a.amount) || 0;
    }
  });

  return {
    employeeID:      employeeID,
    totalClaimed:    totalClaimed,
    totalApproved:   totalApproved,
    totalAdvances:   totalAdvances,
    totalPaid:       totalPaid,
    pendingApproval: pendingApproval,
    netBalance:      totalApproved - totalAdvances - totalPaid,
  };
}
