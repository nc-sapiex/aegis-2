/**
 * Audit Report XLSX Generator (Phase 2 — R29)
 *
 * Generates multi-tab Excel workbook matching existing bank audit format.
 * Uses ExcelJS for programmatic workbook creation.
 */

import ExcelJS from "exceljs";

// Type for full audit report data (from getAuditReportData)
type AuditReportData = NonNullable<
  Awaited<ReturnType<typeof import("@/data-access/reports").getAuditReportData>>
>;

/**
 * Generate complete audit report XLSX workbook.
 * Returns buffer ready for S3 upload.
 */
export async function generateAuditReportXLSX(
  auditData: AuditReportData,
  templateData?: Record<string, any>,
): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();

  workbook.creator = "AEGIS Audit System";
  workbook.created = new Date();
  workbook.modified = new Date();

  // Tab 1: Audit Summary
  await addSummarySheet(workbook, auditData);

  // Tab 2: Observations (all)
  await addObservationsSheet(workbook, auditData);

  // Tab 3: Observations by Severity
  await addObservationsBySeveritySheet(workbook, auditData);

  // Tab 4: Cash Verification
  await addCashVerificationSheet(workbook, auditData);

  // Tab 5: Loan Review
  await addLoanReviewSheet(workbook, auditData);

  // Tab 6: SMA/NPA Analysis
  await addSmaNpaSheet(workbook, auditData);

  // Tab 7: Branch Profile
  await addBranchProfileSheet(workbook, auditData);

  // Tabs 8-32: Examination Responses by Area (25 functional areas)
  await addExaminationResponseSheets(workbook, auditData);

  // Tab 33: Team Members
  await addTeamMembersSheet(workbook, auditData);

  // Generate buffer
  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}

/**
 * Tab 1: Audit Summary
 */
async function addSummarySheet(
  workbook: ExcelJS.Workbook,
  data: AuditReportData,
) {
  const sheet = workbook.addWorksheet("Audit Summary");

  // Header styling
  const headerStyle = {
    font: { bold: true, size: 12 },
    fill: {
      type: "pattern" as const,
      pattern: "solid" as const,
      fgColor: { argb: "FFD9E1F2" },
    },
    alignment: { vertical: "middle" as const, horizontal: "left" as const },
  };

  // Title
  sheet.mergeCells("A1:D1");
  sheet.getCell("A1").value = "Internal Audit Report";
  sheet.getCell("A1").font = { bold: true, size: 16 };
  sheet.getCell("A1").alignment = { horizontal: "center" };

  // Metadata
  let row = 3;
  sheet.getCell(`A${row}`).value = "Audit Number:";
  sheet.getCell(`A${row}`).font = { bold: true };
  sheet.getCell(`B${row}`).value = data.auditNumber || "N/A";
  row++;

  sheet.getCell(`A${row}`).value = "Branch:";
  sheet.getCell(`A${row}`).font = { bold: true };
  sheet.getCell(`B${row}`).value = data.branch?.name || "N/A";
  row++;

  sheet.getCell(`A${row}`).value = "Branch Code:";
  sheet.getCell(`A${row}`).font = { bold: true };
  sheet.getCell(`B${row}`).value = data.branch?.code || "N/A";
  row++;

  sheet.getCell(`A${row}`).value = "Audit Type:";
  sheet.getCell(`A${row}`).font = { bold: true };
  sheet.getCell(`B${row}`).value = data.auditType || "RBIA";
  row++;

  sheet.getCell(`A${row}`).value = "Period From:";
  sheet.getCell(`A${row}`).font = { bold: true };
  sheet.getCell(`B${row}`).value = data.periodFrom
    ? new Date(data.periodFrom)
    : "N/A";
  row++;

  sheet.getCell(`A${row}`).value = "Period To:";
  sheet.getCell(`A${row}`).font = { bold: true };
  sheet.getCell(`B${row}`).value = data.periodTo
    ? new Date(data.periodTo)
    : "N/A";
  row++;

  sheet.getCell(`A${row}`).value = "Overall Risk Rating:";
  sheet.getCell(`A${row}`).font = { bold: true };
  sheet.getCell(`B${row}`).value = data.overallRiskRating || "Not Computed";
  row++;

  sheet.getCell(`A${row}`).value = "Total Observations:";
  sheet.getCell(`A${row}`).font = { bold: true };
  sheet.getCell(`B${row}`).value = data.observations?.length || 0;

  // Column widths
  sheet.getColumn("A").width = 25;
  sheet.getColumn("B").width = 40;
}

/**
 * Tab 2: All Observations
 */
async function addObservationsSheet(
  workbook: ExcelJS.Workbook,
  data: AuditReportData,
) {
  const sheet = workbook.addWorksheet("Observations");

  // Headers
  const headers = [
    "S.No.",
    "Observation Title",
    "Severity",
    "Audit Area",
    "Condition",
    "Criteria",
    "Cause",
    "Effect",
    "Recommendation",
    "Status",
  ];

  sheet.addRow(headers);
  sheet.getRow(1).font = { bold: true };
  sheet.getRow(1).fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FFD9E1F2" },
  };

  // Data rows
  data.observations?.forEach((obs: any, idx: number) => {
    sheet.addRow([
      idx + 1,
      obs.title,
      obs.severity,
      obs.auditArea?.name || "N/A",
      obs.condition,
      obs.criteria,
      obs.cause,
      obs.effect,
      obs.recommendation,
      obs.status,
    ]);
  });

  // Column widths
  sheet.getColumn(1).width = 6;
  sheet.getColumn(2).width = 40;
  sheet.getColumn(3).width = 12;
  sheet.getColumn(4).width = 20;
  sheet.getColumn(5).width = 30;
  sheet.getColumn(6).width = 30;
  sheet.getColumn(7).width = 30;
  sheet.getColumn(8).width = 30;
  sheet.getColumn(9).width = 30;
  sheet.getColumn(10).width = 15;
}

/**
 * Tab 3: Observations by Severity
 */
async function addObservationsBySeveritySheet(
  workbook: ExcelJS.Workbook,
  data: AuditReportData,
) {
  const sheet = workbook.addWorksheet("Observations by Severity");

  const severities = ["CRITICAL", "HIGH", "MEDIUM", "LOW"];

  severities.forEach((severity, idx) => {
    const filtered =
      data.observations?.filter((o: any) => o.severity === severity) || [];

    const startRow = idx * 20 + 1; // Space between sections

    // Section title
    sheet.mergeCells(`A${startRow}:D${startRow}`);
    sheet.getCell(`A${startRow}`).value =
      `${severity} Severity Observations (${filtered.length})`;
    sheet.getCell(`A${startRow}`).font = { bold: true, size: 14 };
    sheet.getCell(`A${startRow}`).fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: {
        argb:
          severity === "CRITICAL"
            ? "FFFF0000"
            : severity === "HIGH"
              ? "FFFF9900"
              : severity === "MEDIUM"
                ? "FFFFFF00"
                : "FF00FF00",
      },
    };

    // Headers
    const headerRow = startRow + 1;
    sheet.getRow(headerRow).values = [
      "S.No.",
      "Title",
      "Condition",
      "Recommendation",
    ];
    sheet.getRow(headerRow).font = { bold: true };

    // Data
    filtered.forEach((obs: any, i: number) => {
      const dataRow = headerRow + i + 1;
      sheet.getRow(dataRow).values = [
        i + 1,
        obs.title,
        obs.condition,
        obs.recommendation,
      ];
    });
  });

  sheet.getColumn(1).width = 6;
  sheet.getColumn(2).width = 40;
  sheet.getColumn(3).width = 50;
  sheet.getColumn(4).width = 50;
}

/**
 * Tab 4: Cash Verification
 */
async function addCashVerificationSheet(
  workbook: ExcelJS.Workbook,
  data: AuditReportData,
) {
  const sheet = workbook.addWorksheet("Cash Verification");

  const cashCheck = data.cashChecks?.[0]; // Assuming one cash check per audit

  if (!cashCheck) {
    sheet.getCell("A1").value = "No cash verification data available";
    return;
  }

  sheet.getCell("A1").value = "Cash in Hand:";
  sheet.getCell("A1").font = { bold: true };
  sheet.getCell("B1").value = Number(cashCheck.cashInHand);

  sheet.getCell("A2").value = "Book Balance:";
  sheet.getCell("A2").font = { bold: true };
  sheet.getCell("B2").value = Number(cashCheck.bookBalance);

  sheet.getCell("A3").value = "Difference:";
  sheet.getCell("A3").font = { bold: true };
  sheet.getCell("B3").value = Number(cashCheck.difference);

  sheet.getCell("A4").value = "Retention Limit:";
  sheet.getCell("A4").font = { bold: true };
  sheet.getCell("B4").value = cashCheck.retentionLimit
    ? Number(cashCheck.retentionLimit)
    : "N/A";

  // Denomination breakdown if available
  if (cashCheck.denominationData) {
    sheet.getCell("A6").value = "Denomination Breakdown:";
    sheet.getCell("A6").font = { bold: true, size: 12 };

    let row = 7;
    const denomData = cashCheck.denominationData as any;
    for (const [denom, count] of Object.entries(denomData)) {
      sheet.getCell(`A${row}`).value = `₹${denom}`;
      sheet.getCell(`B${row}`).value = count as number;
      row++;
    }
  }

  sheet.getColumn("A").width = 25;
  sheet.getColumn("B").width = 20;
}

/**
 * Tab 5: Loan Review
 */
async function addLoanReviewSheet(
  workbook: ExcelJS.Workbook,
  data: AuditReportData,
) {
  const sheet = workbook.addWorksheet("Loan Review");

  const headers = [
    "S.No.",
    "Account No",
    "Borrower Name",
    "Product Type",
    "Sanction Amount",
    "Outstanding Amount",
    "Asset Class",
    "DPD",
    "Audit Observation",
  ];

  sheet.addRow(headers);
  sheet.getRow(1).font = { bold: true };
  sheet.getRow(1).fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FFD9E1F2" },
  };

  data.loanReviews?.forEach((loan: any, idx: number) => {
    sheet.addRow([
      idx + 1,
      loan.accountNo,
      loan.borrowerName,
      loan.productType,
      Number(loan.sanctionAmount),
      Number(loan.outstandingAmount),
      loan.assetClass,
      loan.dpd,
      loan.auditObservation || "N/A",
    ]);
  });

  sheet.getColumn(1).width = 6;
  sheet.getColumn(2).width = 15;
  sheet.getColumn(3).width = 25;
  sheet.getColumn(4).width = 20;
  sheet.getColumn(5).width = 15;
  sheet.getColumn(6).width = 15;
  sheet.getColumn(7).width = 15;
  sheet.getColumn(8).width = 8;
  sheet.getColumn(9).width = 40;
}

/**
 * Tab 6: SMA/NPA Analysis
 */
async function addSmaNpaSheet(
  workbook: ExcelJS.Workbook,
  data: AuditReportData,
) {
  const sheet = workbook.addWorksheet("SMA-NPA Analysis");

  const headers = ["Category", "Account Count", "Total Amount (₹)"];
  sheet.addRow(headers);
  sheet.getRow(1).font = { bold: true };
  sheet.getRow(1).fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FFD9E1F2" },
  };

  data.smaNpaEntries?.forEach((entry: any) => {
    sheet.addRow([
      entry.category,
      entry.accountCount,
      Number(entry.totalAmount),
    ]);
  });

  sheet.getColumn(1).width = 20;
  sheet.getColumn(2).width = 15;
  sheet.getColumn(3).width = 20;
}

/**
 * Tab 7: Branch Profile
 */
async function addBranchProfileSheet(
  workbook: ExcelJS.Workbook,
  data: AuditReportData,
) {
  const sheet = workbook.addWorksheet("Branch Profile");

  if (!data.branch) {
    sheet.getCell("A1").value = "No branch data available";
    return;
  }

  const fields = [
    ["Branch Name", data.branch.name],
    ["Branch Code", data.branch.code],
    ["City", data.branch.city],
    ["State", data.branch.state],
    ["Category", data.branch.category || "N/A"],
    [
      "Business Size (₹ Lakhs)",
      data.branch.businessSize ? Number(data.branch.businessSize) : "N/A",
    ],
    ["RAM Score", data.branch.ramScore ? Number(data.branch.ramScore) : "N/A"],
  ];

  fields.forEach((field, idx) => {
    const row = idx + 1;
    sheet.getCell(`A${row}`).value = field[0];
    sheet.getCell(`A${row}`).font = { bold: true };
    sheet.getCell(`B${row}`).value = field[1];
  });

  sheet.getColumn("A").width = 25;
  sheet.getColumn("B").width = 40;
}

/**
 * Tabs 8-32: Examination Responses by Area
 */
async function addExaminationResponseSheets(
  workbook: ExcelJS.Workbook,
  data: AuditReportData,
) {
  // Group responses by area
  const responsesByArea = new Map<string, any[]>();

  data.examinationResponses?.forEach((resp: any) => {
    const areaName = resp.item?.area?.name || "Unknown";
    if (!responsesByArea.has(areaName)) {
      responsesByArea.set(areaName, []);
    }
    responsesByArea.get(areaName)?.push(resp);
  });

  // Create one sheet per area
  responsesByArea.forEach((responses, areaName) => {
    const sheet = workbook.addWorksheet(areaName.substring(0, 31)); // Excel limit

    const headers = [
      "Item No",
      "Particulars",
      "Status",
      "Observation",
      "Risk Rating",
    ];
    sheet.addRow(headers);
    sheet.getRow(1).font = { bold: true };
    sheet.getRow(1).fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FFD9E1F2" },
    };

    responses.forEach((resp) => {
      sheet.addRow([
        resp.item?.itemNumber || "N/A",
        resp.item?.particulars || "N/A",
        resp.status,
        resp.observation || "N/A",
        resp.riskRating || "N/A",
      ]);
    });

    sheet.getColumn(1).width = 12;
    sheet.getColumn(2).width = 60;
    sheet.getColumn(3).width = 15;
    sheet.getColumn(4).width = 40;
    sheet.getColumn(5).width = 12;
  });
}

/**
 * Tab: Team Members
 */
async function addTeamMembersSheet(
  workbook: ExcelJS.Workbook,
  data: AuditReportData,
) {
  const sheet = workbook.addWorksheet("Team Members");

  const headers = ["Name", "Email", "Role", "Assigned Sections"];
  sheet.addRow(headers);
  sheet.getRow(1).font = { bold: true };
  sheet.getRow(1).fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FFD9E1F2" },
  };

  data.teamMembers?.forEach((member: any) => {
    sheet.addRow([
      member.user.name,
      member.user.email,
      member.roleInEngagement,
      member.assignedSections.join(", "),
    ]);
  });

  sheet.getColumn(1).width = 25;
  sheet.getColumn(2).width = 30;
  sheet.getColumn(3).width = 20;
  sheet.getColumn(4).width = 40;
}
