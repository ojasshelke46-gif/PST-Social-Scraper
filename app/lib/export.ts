import type { Post } from "../types";
import type jsPDFType from "jspdf";

function csvField(value: string): string {
  return `"${value.replace(/"/g, '""').replace(/[\r\n]+/g, " ")}"`;
}

export function exportToCSV(posts: Post[]): void {
  const header = ["Platform", "Author", "Text", "Likes", "URL", "Date"];
  const rows = posts.map((p) => [
    csvField(p.platform === "twitter" ? "X / Twitter" : "LinkedIn"),
    csvField(p.author),
    csvField(p.text),
    csvField(String(p.likes)),
    csvField(p.url),
    csvField(new Date(p.date).toLocaleDateString()),
  ]);

  const csv = [header.map((h) => `"${h}"`).join(","), ...rows.map((r) => r.join(","))].join("\r\n");

  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `social-signal-tracker-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

/** Measure rendered string width in mm and truncate with ellipsis to fit. */
function fitText(doc: jsPDFType, text: string, maxMm: number): string {
  const pad = 4; // 2mm internal padding × 2
  const available = maxMm - pad;
  if (available <= 0) return "";

  const scale = (doc.getFontSize() as number) / (doc.internal.scaleFactor as number);
  const measure = (s: string) => (doc.getStringUnitWidth(s) as number) * scale;

  if (measure(text) <= available) return text;

  // Binary search for the longest prefix that fits
  let lo = 0;
  let hi = text.length;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    if (measure(text.slice(0, mid) + "…") <= available) {
      lo = mid;
    } else {
      hi = mid - 1;
    }
  }
  return text.slice(0, lo) + "…";
}

export async function exportToPDF(posts: Post[]): Promise<void> {
  const { default: jsPDF } = await import("jspdf");

  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });

  const margin = 14;
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();

  // Landscape A4: 297mm wide, 210mm tall. Usable width = 297 - 28 = 269mm.
  const usableWidth = pageWidth - margin * 2;

  // Column widths — must sum to exactly usableWidth (269mm)
  const colW = {
    platform: 22,   // "X / Twitter" ≈ 22mm
    author:   42,   // names up to ~20 chars
    likes:    16,   // up to 6 digits
    date:     24,   // "MM/DD/YYYY"
    text:     90,   // main content
    url:      75,   // remaining: 269 - 22 - 42 - 16 - 24 - 90 = 75mm
  };

  // Build cumulative x positions
  const colX = (() => {
    let x = margin;
    const out: Record<string, number> = {};
    for (const [key, w] of Object.entries(colW)) {
      out[key] = x;
      x += w;
    }
    return out;
  })();

  const FONT_SIZE = 8;
  const HEADER_H = 9;
  const ROW_H = 9;
  const PAD = 2; // horizontal cell padding

  const drawPageFooter = () => {
    const pageNum = (doc.internal as unknown as { getCurrentPageInfo(): { pageNumber: number } })
      .getCurrentPageInfo().pageNumber;
    doc.setFontSize(8);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(150, 150, 150);
    doc.text(`Page ${pageNum}`, pageWidth - margin, pageHeight - 6, { align: "right" });
    doc.setTextColor(0, 0, 0);
  };

  const drawTableHeader = (y: number): number => {
    doc.setFillColor(26, 26, 46);
    doc.rect(margin, y, usableWidth, HEADER_H, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(FONT_SIZE + 0.5);
    doc.setTextColor(230, 230, 230);
    const textY = y + 6.2;
    doc.text("Platform",  colX.platform + PAD,  textY);
    doc.text("Author",    colX.author   + PAD,  textY);
    doc.text("Likes",     colX.likes    + PAD,  textY);
    doc.text("Date",      colX.date     + PAD,  textY);
    doc.text("Post text", colX.text     + PAD,  textY);
    doc.text("URL",       colX.url      + PAD,  textY);
    doc.setTextColor(0, 0, 0);
    return y + HEADER_H;
  };

  // ── Title block ──────────────────────────────────────────────────────────
  doc.setFont("helvetica", "bold");
  doc.setFontSize(15);
  doc.text("Social Signal Tracker — Export", margin, 18);
  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(100, 100, 100);
  doc.text(
    `Exported: ${new Date().toLocaleString()}  |  Total posts: ${posts.length}`,
    margin, 25,
  );
  doc.setTextColor(0, 0, 0);
  doc.setLineWidth(0.3);
  doc.setDrawColor(180, 180, 180);
  doc.line(margin, 28, pageWidth - margin, 28);

  // ── Table ────────────────────────────────────────────────────────────────
  let y = drawTableHeader(31);
  doc.setFontSize(FONT_SIZE);
  doc.setFont("helvetica", "normal");

  posts.forEach((post, i) => {
    if (y + ROW_H > pageHeight - 12) {
      drawPageFooter();
      doc.addPage();
      doc.setFontSize(FONT_SIZE);
      doc.setFont("helvetica", "normal");
      y = drawTableHeader(margin);
    }

    // Alternating row background
    if (i % 2 === 0) {
      doc.setFillColor(246, 247, 252);
      doc.rect(margin, y, usableWidth, ROW_H, "F");
    }

    const textY = y + 6;
    const cleanText = post.text.replace(/[\r\n\t]+/g, " ").trim();

    // Each cell value truncated to fit its column using actual font metrics
    const cells: [string, number, number, boolean][] = [
      // [value, colX, colWidth, isLink]
      [post.platform === "twitter" ? "X / Twitter" : "LinkedIn", colX.platform, colW.platform, false],
      [post.author,          colX.author,   colW.author,   false],
      [post.likes.toLocaleString(), colX.likes, colW.likes, false],
      [new Date(post.date).toLocaleDateString(), colX.date, colW.date, false],
      [cleanText,            colX.text,     colW.text,     false],
      [post.url,             colX.url,      colW.url,      true],
    ];

    for (const [value, cx, cw, isLink] of cells) {
      const fitted = fitText(doc, value, cw);
      if (isLink) doc.setTextColor(70, 100, 200);
      doc.text(fitted, cx + PAD, textY);
      if (isLink) doc.setTextColor(0, 0, 0);
    }

    // Row separator
    doc.setDrawColor(215, 217, 228);
    doc.setLineWidth(0.1);
    doc.line(margin, y + ROW_H, margin + usableWidth, y + ROW_H);

    y += ROW_H;
  });

  drawPageFooter();
  doc.save(`social-signal-tracker-${new Date().toISOString().slice(0, 10)}.pdf`);
}
