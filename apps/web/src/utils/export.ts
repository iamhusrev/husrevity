import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import * as XLSX from "xlsx";

/**
 * Downloads a plain text file in the browser.
 * Mirrors the Blob + synthetic <a download> pattern used in VaultPage's env export.
 */
export function exportAsTxt(filename: string, content: string): void {
  const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

type PdfTextOpts = { title?: string; text: string };
type PdfTableOpts = { title?: string; columns: string[]; rows: (string | number)[][] };

/**
 * Generates and downloads a PDF file, either as free-flowing text or as a table.
 */
export function exportAsPdf(filename: string, opts: PdfTextOpts | PdfTableOpts): void {
  const doc = new jsPDF();
  const marginX = 14;
  let cursorY = 18;

  if (opts.title) {
    doc.setFontSize(16);
    doc.text(opts.title, marginX, cursorY);
    cursorY += 10;
  }

  if ("text" in opts) {
    doc.setFontSize(11);
    const pageWidth = doc.internal.pageSize.getWidth();
    const lines = doc.splitTextToSize(opts.text, pageWidth - marginX * 2);
    doc.text(lines, marginX, cursorY);
  } else {
    autoTable(doc, {
      startY: cursorY,
      head: [opts.columns],
      body: opts.rows,
    });
  }

  doc.save(filename);
}

/**
 * Generates and downloads an XLSX workbook from a flat array of row objects.
 */
export function exportAsXlsx(
  filename: string,
  sheetData: Record<string, unknown>[],
  sheetName = "Sheet1",
): void {
  const worksheet = XLSX.utils.json_to_sheet(sheetData);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);
  XLSX.writeFile(workbook, filename);
}
