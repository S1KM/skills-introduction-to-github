# Reimbursement Management App
### Google AppSheet + Google Sheets + Apps Script

A complete travel and expense reimbursement system for mobile and desktop,
built without custom server infrastructure.

```
Employee (mobile/laptop)         Finance Team (desktop/mobile)
        │                                      │
        ▼                                      ▼
  AppSheet App              ────────►   AppSheet App
  Submit claim                           Review queue
  View ledger                            Approve/Reject/Pay
  See advances                           View all ledgers
        │                                      │
        └─────────────┬────────────────────────┘
                      ▼
              Google Sheets
          (Backend data store)
                      │
                      ▼
            Apps Script Automation
         Email notifications · Ledger rebuild
         PDF/Excel export · Advance deduction
```

---

## Features

| Feature | Details |
|---------|---------|
| **Expense categories** | Air travel, ground transport, accommodation, meals, per diem, communication, office supplies, training, miscellaneous |
| **Advance deduction** | Outstanding advances are automatically deducted from approved claims before payout |
| **Role-based access** | Employees see only their own claims and ledger; Finance sees everything |
| **Receipt upload** | Employees attach photos or PDFs from their phone |
| **Approval workflow** | Finance approves/rejects with notes; status changes trigger instant email notifications |
| **Email notifications** | New submission → Finance; Approved/Rejected/Paid → Employee; Monthly summary → Finance |
| **PDF export** | Per-employee claim statement or consolidated finance ledger, emailed automatically |
| **Excel export** | Full spreadsheet exported as XLSX to Google Drive and emailed to finance |
| **Audit log** | Every status change, ledger rebuild, and payment is time-stamped and attributed |
| **Mobile-first** | AppSheet PWA installable on iOS and Android from any browser |
| **Offline support** | AppSheet supports offline claim entry; syncs when connected |
| **Pending reminders** | Daily automated reminder to finance for claims pending 3+ days |
| **Monthly summary** | Auto-generated finance report on the 1st of each month |

---

## Project Structure

```
reimbursement-app/
├── sheets/
│   ├── setup.gs               ← Run first: creates all sheets, formatting, validation
│   ├── approval-workflow.gs   ← Approval, rejection, payment logic + advance settlement
│   ├── email-notifications.gs ← All outbound HTML email templates
│   ├── ledger-calculations.gs ← Ledger rebuild and per-employee summary calculations
│   ├── export-reports.gs      ← PDF and Excel export to Google Drive
│   └── triggers.gs            ← Trigger installer + form submit handler + health check
├── appsheet/
│   └── appsheet-config.md     ← Step-by-step AppSheet setup guide
└── README.md                  ← This file
```

---

## Quick Start (30-minute setup)

### Step 1 — Create the Google Sheet

1. Go to [sheets.google.com](https://sheets.google.com) and create a new blank spreadsheet.
2. Rename it to something like **"Company Reimbursements"**.

### Step 2 — Add the Apps Script Files

1. In the spreadsheet, go to **Extensions** → **Apps Script**.
2. In the Apps Script editor, create one file per `.gs` file in the `sheets/` folder:
   - Click the **+** button next to "Files" to add each new file.
   - Name it identically to the source file (e.g., `setup`, `approval-workflow`, etc.).
   - Copy-paste the full content of each `.gs` file.
3. The five files to create:

| File tab name | Source file |
|--------------|-------------|
| `setup` | `sheets/setup.gs` |
| `approval-workflow` | `sheets/approval-workflow.gs` |
| `email-notifications` | `sheets/email-notifications.gs` |
| `ledger-calculations` | `sheets/ledger-calculations.gs` |
| `export-reports` | `sheets/export-reports.gs` |
| `triggers` | `sheets/triggers.gs` |

### Step 3 — Configure Settings

Before running setup, update the `CONFIG` object at the top of `setup.gs`:

```javascript
var CONFIG = {
  // ...
  FINANCE_EMAIL: "finance@yourcompany.com",   // ← Change this
  CURRENCY: "USD",                             // ← Change if needed
};
```

### Step 4 — Run Setup

1. In the Apps Script editor, select the function `setupAll` from the function dropdown.
2. Click **Run** ▶.
3. Grant permissions when prompted (the script needs access to your Sheets, Gmail, and Drive).
4. Wait ~15 seconds. You'll see a toast notification in your spreadsheet when complete.

> **What `setupAll()` creates:**
> - Employees, ExpenseClaims, Advances, Ledger, Categories, AuditLog, Settings sheets
> - Column headers, data validation dropdowns, conditional formatting
> - Color-coded tab indicators per sheet type
> - Sample employee data (delete before go-live)

### Step 5 — Update Settings Sheet

In the newly created **Settings** sheet, update:

| Key | Value to set |
|-----|-------------|
| `FINANCE_EMAIL` | Your finance team's email address |
| `COMPANY_NAME` | Your company name (used in email headers and PDF) |
| `CURRENCY` | Your default currency (e.g., USD, EUR, INR) |

### Step 6 — Install Triggers

1. Back in Apps Script, select `installTriggers` and click **Run**.
2. Grant any additional permissions if prompted.
3. Done — automation is now live.

> Run `listTriggers()` at any time to confirm triggers are active.
> Run `healthCheck()` to validate the full setup.

### Step 7 — Add Your Employees

In the **Employees** sheet, replace the sample rows with real data:

| Column | Description |
|--------|-------------|
| `EmployeeID` | Unique ID, e.g. `EMP001` |
| `FullName` | Employee's full name |
| `Email` | Must match their Google account email (used for AppSheet login) |
| `Department` | e.g. `Sales`, `Engineering` |
| `ManagerEmail` | Direct manager's email (optional) |
| `Role` | `Employee` or `Finance` |
| `BankAccount` | Last 4 digits or account reference (optional) |
| `Active` | `Yes` or `No` |
| `JoinDate` | ISO date, e.g. `2023-06-15` |

### Step 8 — Build the AppSheet App

Follow the detailed guide in [`appsheet/appsheet-config.md`](appsheet/appsheet-config.md).

Summary:
1. Go to [appsheet.com](https://www.appsheet.com)
2. Create app from the Google Sheet
3. Configure tables, roles, views, and actions per the guide
4. Deploy and share with your team

---

## Data Flow

```
Employee submits claim (AppSheet form)
         │
         ▼
ExpenseClaims sheet row added
         │
         ▼
Apps Script: onNewClaimSubmitted trigger fires
  - Assigns ClaimID (CLM-YYYY-NNNN)
  - Stamps SubmissionDate
  - Sets Status = "Pending"
  - Sends email to Finance
  - Rebuilds Ledger
         │
         ▼
Finance reviews claim in AppSheet or Google Sheets
  - Changes Status to "Approved" or "Rejected"
         │
         ▼
Apps Script: onClaimStatusChange trigger fires
  ┌──────────────────┬─────────────────────┐
  │   On Approval    │    On Rejection      │
  │                  │                      │
  │ Look up advances │  Set ApprovedAmt = 0 │
  │ Deduct from net  │  Send rejection email│
  │ Settle advances  │                      │
  │ Set NetPayable   │                      │
  │ Send approval    │                      │
  │ email to employee│                      │
  └──────────────────┴─────────────────────┘
         │
         ▼
Finance marks claim as "Paid"
  - Sets PaymentDate
  - Sends payment confirmation to employee
  - Ledger updated
```

---

## Ledger Logic

The **Ledger** sheet is rebuilt automatically on every approval/rejection/payment.

```
Net Balance = TotalApproved − TotalAdvances − TotalPaid

Where:
  TotalClaimed   = SUM of all claim amounts submitted (any status)
  TotalApproved  = SUM of ApprovedAmount for Approved + Paid claims
  TotalAdvances  = SUM of Outstanding advance amounts
  TotalPaid      = SUM of NetPayable for claims with a PaymentDate
  PendingApproval= SUM of claim amounts with Status = "Pending"
```

**Advance Deduction Example:**

```
Employee submits $800 claim.
Outstanding advance: $300.

ApprovedAmount  = $800
AdvanceDeducted = $300   ← auto-pulled from Advances sheet
NetPayable      = $500   ← what Finance actually pays out

Advance status → "Settled"
```

---

## Maintenance

### Resetting the System

To reset to a clean state:
1. Delete all data rows (not headers) in ExpenseClaims, Advances, Ledger, AuditLog.
2. Set all advance statuses back to "Outstanding" if needed.
3. Run `rebuildLedger()` to refresh the Ledger sheet.

### Updating Categories

Edit the **Categories** sheet directly. Changes are immediately reflected in the AppSheet dropdown.

### Adding New Employees

Add a row to the **Employees** sheet. In AppSheet → Manage → Users, add their email and assign the `Employee` role.

### Upgrading Workflow Logic

Edit the relevant `.gs` file in Apps Script. Changes take effect immediately — no redeployment needed.

---

## Permissions Required

When you first run `setupAll()` or `installTriggers()`, Google will ask you to grant:

| Permission | Reason |
|-----------|--------|
| Google Sheets | Read/write spreadsheet data |
| Gmail | Send email notifications |
| Google Drive | Save PDF/Excel exports to Drive |
| External URLs | Generate PDF exports via Google export API |

All permissions are scoped to your Google account. No data leaves Google's infrastructure.

---

## Limitations (AppSheet Free Tier)

| Limit | Free | Paid (Core) |
|-------|------|-------------|
| Users | 10 | Unlimited |
| Automations | Basic | Advanced |
| Custom branding | No | Yes |
| Premium views | No | Yes |

For organizations with >10 employees, an AppSheet Core license (~$5/user/month) is required.

---

## Support & Customization

To extend this system:
- **Add fields:** Add columns to the relevant sheet → update AppSheet table config.
- **Add categories:** Edit the Categories sheet.
- **Add currencies:** Edit the Currency enum list in `setupExpenseClaims()` in `setup.gs`.
- **Change email templates:** Edit functions in `email-notifications.gs`.
- **Change approval logic:** Edit `approval-workflow.gs`.
- **Custom reports:** Add new functions to `export-reports.gs`.

For AppSheet-specific questions: [AppSheet documentation](https://support.google.com/appsheet)
For Apps Script questions: [Apps Script documentation](https://developers.google.com/apps-script)
