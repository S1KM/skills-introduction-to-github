/**
 * email-notifications.gs
 *
 * All outbound email functions for the reimbursement system.
 * Uses GmailApp (available to the script owner).
 * All emails are HTML for professional appearance.
 */

// ─── SUBMISSION NOTIFICATIONS ─────────────────────────────────────────────────

/**
 * Sent to finance when an employee submits a new claim.
 * Called from the AppSheet "New Claim" form action or triggers.gs onFormSubmit.
 */
function sendNewClaimNotification(claimID, employeeName, employeeEmail, amount, category, description, receiptURL) {
  var financeEmail = getSetting("FINANCE_EMAIL");
  var companyName  = getSetting("COMPANY_NAME") || "Your Company";
  var spreadsheetURL = SpreadsheetApp.getActive().getUrl();

  var subject = "[Reimbursement] New claim from " + employeeName + " — " + claimID;

  var html = buildEmailWrapper(companyName, [
    "<h2 style='color:#2c3e50;'>New Expense Claim Submitted</h2>",
    "<p>A new reimbursement claim requires your review.</p>",
    buildInfoTable([
      ["Claim ID",     claimID],
      ["Employee",     employeeName + " (" + employeeEmail + ")"],
      ["Category",     category],
      ["Amount",       CONFIG.CURRENCY + " " + formatAmount(amount)],
      ["Description",  description],
      ["Receipt",      receiptURL ? "<a href='" + receiptURL + "'>View Receipt</a>" : "No receipt attached"],
    ]),
    "<p style='margin-top:20px;'>",
    "<a href='" + spreadsheetURL + "' style='" + buttonStyle("#f5a623") + "'>",
    "Review in Google Sheets</a></p>",
    "<p style='color:#666;font-size:12px;'>Please review and update the Status column to Approved or Rejected.</p>",
  ]);

  GmailApp.sendEmail(financeEmail, subject, stripHtml(html), { htmlBody: html, name: companyName + " Reimbursements" });
}

// ─── APPROVAL NOTIFICATION ────────────────────────────────────────────────────

/**
 * Sent to the employee when their claim is approved.
 */
function sendApprovalNotification(empEmail, employeeName, claimID, approvedAmount, advanceDeducted, netPayable, category, description) {
  var companyName = getSetting("COMPANY_NAME") || "Your Company";
  var subject = "[Reimbursement] ✅ Claim " + claimID + " Approved";

  var tableRows = [
    ["Claim ID",          claimID],
    ["Category",          category],
    ["Description",       description],
    ["Approved Amount",   CONFIG.CURRENCY + " " + formatAmount(approvedAmount)],
  ];

  if (advanceDeducted > 0) {
    tableRows.push(["Advance Deducted", "− " + CONFIG.CURRENCY + " " + formatAmount(advanceDeducted)]);
    tableRows.push(["Net Payable",      "<strong>" + CONFIG.CURRENCY + " " + formatAmount(netPayable) + "</strong>"]);
  }

  var html = buildEmailWrapper(companyName, [
    "<h2 style='color:#27ae60;'>Your Claim Has Been Approved</h2>",
    "<p>Hi " + employeeName + ", your expense claim has been reviewed and approved.</p>",
    buildInfoTable(tableRows),
    advanceDeducted > 0
      ? "<p style='color:#856404;background:#fff3cd;padding:10px;border-radius:4px;'>An advance of " + CONFIG.CURRENCY + " " + formatAmount(advanceDeducted) + " has been deducted from your reimbursement. Your net payable amount is " + CONFIG.CURRENCY + " " + formatAmount(netPayable) + ".</p>"
      : "",
    "<p style='color:#666;font-size:12px;margin-top:20px;'>Payment will be processed within 5–7 business days. You will receive a confirmation email when payment is made.</p>",
  ]);

  GmailApp.sendEmail(empEmail, subject, stripHtml(html), { htmlBody: html, name: companyName + " Reimbursements" });
}

// ─── REJECTION NOTIFICATION ───────────────────────────────────────────────────

/**
 * Sent to the employee when their claim is rejected.
 */
function sendRejectionNotification(empEmail, employeeName, claimID, amount, rejectionNotes) {
  var companyName  = getSetting("COMPANY_NAME") || "Your Company";
  var financeEmail = getSetting("FINANCE_EMAIL");
  var subject = "[Reimbursement] ❌ Claim " + claimID + " Rejected";

  var html = buildEmailWrapper(companyName, [
    "<h2 style='color:#c0392b;'>Claim Not Approved</h2>",
    "<p>Hi " + employeeName + ", your expense claim could not be approved at this time.</p>",
    buildInfoTable([
      ["Claim ID",  claimID],
      ["Amount",    CONFIG.CURRENCY + " " + formatAmount(amount)],
      ["Reason",    rejectionNotes || "No reason provided. Please contact finance."],
    ]),
    "<p style='color:#666;font-size:12px;margin-top:20px;'>If you believe this is an error, please reply to this email or contact the finance team at <a href='mailto:" + financeEmail + "'>" + financeEmail + "</a>.</p>",
  ]);

  GmailApp.sendEmail(empEmail, subject, stripHtml(html), {
    htmlBody: html,
    name: companyName + " Reimbursements",
    replyTo: financeEmail,
  });
}

// ─── PAYMENT NOTIFICATION ─────────────────────────────────────────────────────

/**
 * Sent to the employee when their approved claim has been paid.
 */
function sendPaymentNotification(empEmail, employeeName, claimID, netPayable) {
  var companyName = getSetting("COMPANY_NAME") || "Your Company";
  var subject = "[Reimbursement] 💳 Payment Processed — " + claimID;

  var html = buildEmailWrapper(companyName, [
    "<h2 style='color:#2980b9;'>Payment Processed</h2>",
    "<p>Hi " + employeeName + ", your reimbursement payment has been processed.</p>",
    buildInfoTable([
      ["Claim ID",         claimID],
      ["Amount Paid",      "<strong>" + CONFIG.CURRENCY + " " + formatAmount(netPayable) + "</strong>"],
      ["Date",             Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "MMMM dd, yyyy")],
    ]),
    "<p style='color:#666;font-size:12px;margin-top:20px;'>Please allow 1–3 business days for the amount to reflect in your bank account. If you have questions, contact the finance team.</p>",
  ]);

  GmailApp.sendEmail(empEmail, subject, stripHtml(html), { htmlBody: html, name: companyName + " Reimbursements" });
}

// ─── ADVANCE ISSUED NOTIFICATION ──────────────────────────────────────────────

/**
 * Sent to the employee when a travel advance is issued.
 */
function sendAdvanceIssuedNotification(empEmail, employeeName, advanceID, amount, purpose) {
  var companyName = getSetting("COMPANY_NAME") || "Your Company";
  var subject = "[Reimbursement] Advance Issued — " + advanceID;

  var html = buildEmailWrapper(companyName, [
    "<h2 style='color:#8e44ad;'>Travel Advance Issued</h2>",
    "<p>Hi " + employeeName + ", a travel advance has been issued to you.</p>",
    buildInfoTable([
      ["Advance ID", advanceID],
      ["Purpose",    purpose],
      ["Amount",     "<strong>" + CONFIG.CURRENCY + " " + formatAmount(amount) + "</strong>"],
    ]),
    "<p style='background:#fff3cd;color:#856404;padding:10px;border-radius:4px;'>",
    "This advance will be automatically deducted from your future expense reimbursements. ",
    "Please retain all receipts for your trip expenses.</p>",
  ]);

  GmailApp.sendEmail(empEmail, subject, stripHtml(html), { htmlBody: html, name: companyName + " Reimbursements" });
}

// ─── MONTHLY SUMMARY ─────────────────────────────────────────────────────────

/**
 * Sends a monthly summary report to finance.
 * Intended to be called by a monthly time-based trigger.
 */
function sendMonthlyFinanceSummary() {
  var financeEmail = getSetting("FINANCE_EMAIL");
  var companyName  = getSetting("COMPANY_NAME") || "Your Company";
  var ss = SpreadsheetApp.getActive();
  var claimsSheet = ss.getSheetByName(CONFIG.SHEETS.CLAIMS);
  var data = claimsSheet.getDataRange().getValues();

  var now = new Date();
  var thisMonth = now.getMonth();
  var thisYear  = now.getFullYear();

  var stats = { total: 0, pending: 0, approved: 0, rejected: 0, paid: 0, totalAmount: 0, approvedAmount: 0 };

  for (var i = 1; i < data.length; i++) {
    var submDate = new Date(data[i][3]);
    if (submDate.getMonth() !== thisMonth || submDate.getFullYear() !== thisYear) continue;
    stats.total++;
    stats.totalAmount += parseFloat(data[i][7]) || 0;
    var status = data[i][10];
    if (status === CONFIG.STATUS.PENDING)  stats.pending++;
    if (status === CONFIG.STATUS.APPROVED) { stats.approved++; stats.approvedAmount += parseFloat(data[i][14]) || 0; }
    if (status === CONFIG.STATUS.REJECTED) stats.rejected++;
    if (status === CONFIG.STATUS.PAID)     stats.paid++;
  }

  var monthName = Utilities.formatDate(now, Session.getScriptTimeZone(), "MMMM yyyy");
  var subject = "[Reimbursement] Monthly Summary — " + monthName;

  var html = buildEmailWrapper(companyName, [
    "<h2 style='color:#2c3e50;'>Monthly Reimbursement Summary</h2>",
    "<h3 style='color:#7f8c8d;'>" + monthName + "</h3>",
    buildInfoTable([
      ["Total Claims Submitted", stats.total],
      ["Total Amount Claimed",   CONFIG.CURRENCY + " " + formatAmount(stats.totalAmount)],
      ["Pending Review",         stats.pending],
      ["Approved",               stats.approved + " (" + CONFIG.CURRENCY + " " + formatAmount(stats.approvedAmount) + ")"],
      ["Rejected",               stats.rejected],
      ["Paid",                   stats.paid],
    ]),
    "<p><a href='" + ss.getUrl() + "' style='" + buttonStyle("#2c3e50") + "'>Open Spreadsheet</a></p>",
  ]);

  GmailApp.sendEmail(financeEmail, subject, stripHtml(html), { htmlBody: html, name: companyName + " Reimbursements" });
}

// ─── EMAIL TEMPLATE HELPERS ───────────────────────────────────────────────────

function buildEmailWrapper(companyName, sections) {
  return [
    "<!DOCTYPE html><html><body style='font-family:Arial,sans-serif;color:#333;max-width:600px;margin:0 auto;'>",
    "<div style='background:#2c3e50;padding:20px;text-align:center;'>",
    "<h1 style='color:#fff;margin:0;font-size:18px;'>" + companyName + "</h1>",
    "<p style='color:#bdc3c7;margin:4px 0 0;font-size:13px;'>Expense &amp; Reimbursement Management</p>",
    "</div>",
    "<div style='padding:24px;border:1px solid #e0e0e0;border-top:none;'>",
    sections.join("\n"),
    "</div>",
    "<div style='background:#f5f5f5;padding:12px;text-align:center;font-size:11px;color:#999;'>",
    "This is an automated message. Please do not reply directly to this email.",
    "</div>",
    "</body></html>",
  ].join("\n");
}

function buildInfoTable(rows) {
  var html = "<table style='width:100%;border-collapse:collapse;margin:16px 0;'>";
  rows.forEach(function(row, idx) {
    var bg = idx % 2 === 0 ? "#f9f9f9" : "#ffffff";
    html += "<tr style='background:" + bg + ";'>";
    html += "<td style='padding:8px 12px;font-weight:bold;width:40%;border:1px solid #e0e0e0;'>" + row[0] + "</td>";
    html += "<td style='padding:8px 12px;border:1px solid #e0e0e0;'>" + row[1] + "</td>";
    html += "</tr>";
  });
  html += "</table>";
  return html;
}

function buttonStyle(color) {
  return "background:" + color + ";color:#fff;padding:10px 20px;text-decoration:none;border-radius:4px;font-weight:bold;display:inline-block;";
}

function formatAmount(amount) {
  return parseFloat(amount).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

function stripHtml(html) {
  return html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}
