/**
 * Excel template generator for Organization Structure (Step 4 onboarding).
 *
 * Generates a styled .xlsx file with two worksheets:
 * - Branches: Branch Name, Code, City, State, Type, Manager Name, Manager Email
 * - Departments: Department Name, Code, Head Name, Head Email
 *
 * Features:
 * - Data validation dropdowns for Type (HO, Branch, Extension Counter) and State (31 Indian states)
 * - Styled headers (bold, gray fill, bottom border)
 * - Example rows with italic font and light blue fill
 * - Column widths optimized for readability
 */

import ExcelJS from "exceljs";

// Indian states and UTs (same as step-4-org-structure.tsx)
const INDIAN_STATES = [
  "Andhra Pradesh",
  "Arunachal Pradesh",
  "Assam",
  "Bihar",
  "Chhattisgarh",
  "Goa",
  "Gujarat",
  "Haryana",
  "Himachal Pradesh",
  "Jharkhand",
  "Karnataka",
  "Kerala",
  "Madhya Pradesh",
  "Maharashtra",
  "Manipur",
  "Meghalaya",
  "Mizoram",
  "Nagaland",
  "Odisha",
  "Punjab",
  "Rajasthan",
  "Sikkim",
  "Tamil Nadu",
  "Telangana",
  "Tripura",
  "Uttar Pradesh",
  "Uttarakhand",
  "West Bengal",
  "Delhi",
  "Puducherry",
];

const BRANCH_TYPES = ["HO", "Branch", "Extension Counter"];

/**
 * Generates an Excel workbook with Branches and Departments worksheets.
 * Returns a Buffer that can be sent to the client.
 */
export async function generateOrgStructureTemplate(): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();

  // ─── Branches Worksheet ────────────────────────────────────────────────

  const branchesSheet = workbook.addWorksheet("Branches");

  // Column definitions
  branchesSheet.columns = [
    { header: "Branch Name*", key: "name", width: 30 },
    { header: "Branch Code*", key: "code", width: 15 },
    { header: "City*", key: "city", width: 20 },
    { header: "State*", key: "state", width: 20 },
    { header: "Type*", key: "type", width: 20 },
    { header: "Manager Name", key: "managerName", width: 25 },
    { header: "Manager Email", key: "managerEmail", width: 30 },
  ];

  // Header row styling (row 1)
  const branchHeaderRow = branchesSheet.getRow(1);
  branchHeaderRow.font = { bold: true };
  branchHeaderRow.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FFE0E0E0" },
  };
  branchHeaderRow.border = {
    bottom: { style: "thin", color: { argb: "FF000000" } },
  };
  branchHeaderRow.alignment = { vertical: "middle", horizontal: "left" };

  // Data validation for Type column (E2:E100)
  for (let rowNum = 2; rowNum <= 100; rowNum++) {
    branchesSheet.getCell(`E${rowNum}`).dataValidation = {
      type: "list",
      allowBlank: false,
      formulae: [`"${BRANCH_TYPES.join(",")}"`],
      showErrorMessage: true,
      errorTitle: "Invalid Type",
      error: "Please select HO, Branch, or Extension Counter",
    };
  }

  // Data validation for State column (D2:D100)
  for (let rowNum = 2; rowNum <= 100; rowNum++) {
    branchesSheet.getCell(`D${rowNum}`).dataValidation = {
      type: "list",
      allowBlank: false,
      formulae: [`"${INDIAN_STATES.join(",")}"`],
      showErrorMessage: true,
      errorTitle: "Invalid State",
      error: "Please select a valid Indian state or UT",
    };
  }

  // Example row 1 (row 2)
  branchesSheet.addRow({
    name: "Head Office",
    code: "HO",
    city: "Mumbai",
    state: "Maharashtra",
    type: "HO",
    managerName: "Rajesh Kumar",
    managerEmail: "rajesh@bank.com",
  });

  const branchExampleRow1 = branchesSheet.getRow(2);
  branchExampleRow1.font = { italic: true };
  branchExampleRow1.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FFE8F0FE" },
  };

  // Example row 2 (row 3)
  branchesSheet.addRow({
    name: "Andheri Branch",
    code: "BR001",
    city: "Mumbai",
    state: "Maharashtra",
    type: "Branch",
    managerName: "Priya Sharma",
    managerEmail: "priya@bank.com",
  });

  const branchExampleRow2 = branchesSheet.getRow(3);
  branchExampleRow2.font = { italic: true };
  branchExampleRow2.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FFE8F0FE" },
  };

  // Add instruction comment to cell A1
  branchesSheet.getCell("A1").note = {
    texts: [
      {
        text: "Instructions:\n1. Rows 2-3 are examples (styled in blue/italic)\n2. Delete example rows before uploading\n3. Fill your branch data starting from row 4\n4. Required fields marked with * must be filled\n5. Use dropdowns for Type and State columns",
      },
    ],
    margins: {
      insetmode: "custom",
      inset: [10, 10, 10, 10],
    },
  };

  // ─── Departments Worksheet ─────────────────────────────────────────────

  const departmentsSheet = workbook.addWorksheet("Departments");

  // Column definitions
  departmentsSheet.columns = [
    { header: "Department Name*", key: "name", width: 30 },
    { header: "Department Code*", key: "code", width: 15 },
    { header: "Head of Department", key: "headName", width: 25 },
    { header: "Head Email", key: "headEmail", width: 30 },
  ];

  // Header row styling
  const deptHeaderRow = departmentsSheet.getRow(1);
  deptHeaderRow.font = { bold: true };
  deptHeaderRow.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FFE0E0E0" },
  };
  deptHeaderRow.border = {
    bottom: { style: "thin", color: { argb: "FF000000" } },
  };
  deptHeaderRow.alignment = { vertical: "middle", horizontal: "left" };

  // Example row 1
  departmentsSheet.addRow({
    name: "Audit",
    code: "AUD",
    headName: "",
    headEmail: "",
  });

  const deptExampleRow1 = departmentsSheet.getRow(2);
  deptExampleRow1.font = { italic: true };
  deptExampleRow1.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FFE8F0FE" },
  };

  // Example row 2
  departmentsSheet.addRow({
    name: "Credit",
    code: "CRD",
    headName: "",
    headEmail: "",
  });

  const deptExampleRow2 = departmentsSheet.getRow(3);
  deptExampleRow2.font = { italic: true };
  deptExampleRow2.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FFE8F0FE" },
  };

  // Add instruction comment
  departmentsSheet.getCell("A1").note = {
    texts: [
      {
        text: "Instructions:\n1. Rows 2-3 are examples (styled in blue/italic)\n2. Delete example rows before uploading\n3. Fill your department data starting from row 4\n4. Required fields marked with * must be filled\n5. Most UCBs have: Credit, Operations, IT, Compliance, Audit, HR, Treasury",
      },
    ],
    margins: {
      insetmode: "custom",
      inset: [10, 10, 10, 10],
    },
  };

  // Generate buffer
  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}
