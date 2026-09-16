import ExcelJS from "exceljs";
import { describe, expect, it, vi } from "vitest";
import { toBuffer } from "../excel-export";

describe("toBuffer", () => {
  it("preserves a writeBuffer() view's byteOffset/byteLength instead of returning the whole backing allocation", async () => {
    // Simulate what Node actually returns: a Buffer that is a *view* into a
    // larger, shared backing ArrayBuffer (e.g. from a pool), not a
    // standalone allocation starting at offset 0.
    const backing = Buffer.alloc(100, 0);
    const marker = Buffer.from("PK\x03\x04-payload-bytes-here");
    marker.copy(backing, 20);
    const view = backing.subarray(20, 20 + marker.length);

    const fakeWorkbook = {
      xlsx: { writeBuffer: vi.fn().mockResolvedValue(view) },
    } as unknown as ExcelJS.Workbook;

    const result = await toBuffer(fakeWorkbook);

    expect(Buffer.from(result).equals(marker)).toBe(true);
  });

  it("round-trips a real workbook to a loadable xlsx", async () => {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("Sheet1");
    sheet.addRow(["hello", "world"]);

    const result = await toBuffer(workbook);

    const reloaded = new ExcelJS.Workbook();
    await reloaded.xlsx.load(Buffer.from(result) as any);
    expect(reloaded.getWorksheet("Sheet1")?.getRow(1).getCell(1).value).toBe(
      "hello",
    );
  });
});
