import type { Post } from "../types";

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

export async function exportToPDF(posts: Post[]): Promise<void> {
  const { default: jsPDF } = await import("jspdf");

  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });

  const margin = 14;
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();

  // Column widths (landscape A4 ≈ 297mm wide, 269mm usable)
  const cols = {
    platform: 22,
    author: 42,
    likes: 18,
    date: 28,
    text: 98,
    url: 0, // filled below
  };
  const usableWidth = pageWidth - margin * 2;
  cols.url = usableWidth - cols.platform - cols.author - cols.likes - cols.date - cols.text;

  const colX = {
    platform: margin,
    author: margin + cols.platform,
    likes: margin + cols.platform + cols.author,
    date: margin + cols.platform + cols.author + cols.likes,
    text: margin + cols.platform + cols.author + cols.likes + cols.date,
    url: margin + cols.platform + cols.author + cols.likes + cols.date + cols.text,
  };

  const drawPageFooter = () => {
    const pageNum = (doc.internal as unknown as { getCurrentPageInfo(): { pageNumber: number } })
      .getCurrentPageInfo().pageNumber;
    doc.setFontSize(8);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(150, 150, 150);
    doc.text(`Page ${pageNum}`, pageWidth - margin, pageHeight - 6, { align: "right" });
    doc.setTextColor(0, 0, 0);
  };

  const drawTableHeader = (y: number) => {
    doc.setFillColor(26, 26, 46);
    doc.rect(margin, y, usableWidth, 9, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8.5);
    doc.setTextColor(230, 230, 230);
    const pad = 2;
    doc.text("Platform", colX.platform + pad, y + 6);
    doc.text("Author", colX.author + pad, y + 6);
    doc.text("Likes", colX.likes + pad, y + 6);
    doc.text("Date", colX.date + pad, y + 6);
    doc.text("Post text", colX.text + pad, y + 6);
    doc.text("URL", colX.url + pad, y + 6);
    doc.setTextColor(0, 0, 0);
    return y + 9;
  };

  // Title block
  doc.setFont("helvetica", "bold");
  doc.setFontSize(15);
  doc.text("Social Signal Tracker — Export", margin, 18);
  doc.setFontSize(9.5);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(100, 100, 100);
  doc.text(
    `Exported: ${new Date().toLocaleString()}  |  Total posts: ${posts.length}`,
    margin,
    25,
  );
  doc.setTextColor(0, 0, 0);
  doc.setLineWidth(0.3);
  doc.setDrawColor(180, 180, 180);
  doc.line(margin, 28, pageWidth - margin, 28);

  let y = drawTableHeader(31);
  const rowH = 10;

  doc.setFontSize(8);
  doc.setFont("helvetica", "normal");

  posts.forEach((post, i) => {
    if (y + rowH > pageHeight - 12) {
      drawPageFooter();
      doc.addPage();
      y = drawTableHeader(margin);
    }

    // Alternating row background
    if (i % 2 === 0) {
      doc.setFillColor(248, 248, 252);
      doc.rect(margin, y, usableWidth, rowH, "F");
    }

    const pad = 2;
    const textY = y + 6.5;

    const platform = post.platform === "twitter" ? "X / Twitter" : "LinkedIn";
    const author = post.author.length > 28 ? post.author.slice(0, 25) + "…" : post.author;
    const text =
      post.text.replace(/[\r\n]+/g, " ").length > 120
        ? post.text.replace(/[\r\n]+/g, " ").slice(0, 117) + "…"
        : post.text.replace(/[\r\n]+/g, " ");
    const url = post.url.length > 58 ? post.url.slice(0, 55) + "…" : post.url;
    const date = new Date(post.date).toLocaleDateString();

    doc.text(platform, colX.platform + pad, textY);
    doc.text(author, colX.author + pad, textY);
    doc.text(String(post.likes.toLocaleString()), colX.likes + pad, textY);
    doc.text(date, colX.date + pad, textY);
    doc.text(text, colX.text + pad, textY);
    doc.setTextColor(80, 100, 200);
    doc.text(url, colX.url + pad, textY);
    doc.setTextColor(0, 0, 0);

    // subtle row separator
    doc.setDrawColor(220, 220, 220);
    doc.setLineWidth(0.1);
    doc.line(margin, y + rowH, margin + usableWidth, y + rowH);

    y += rowH;
  });

  drawPageFooter();
  doc.save(`social-signal-tracker-${new Date().toISOString().slice(0, 10)}.pdf`);
}
