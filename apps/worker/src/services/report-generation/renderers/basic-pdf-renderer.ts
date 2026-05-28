export interface PdfRenderMetadata {
  title: string;
  reportNumber: string;
}

export class BasicPdfRenderer {
  render(markdown: string, metadata: PdfRenderMetadata): Buffer {
    const titleLines = [`${metadata.title}`, `Report ${metadata.reportNumber}`, ""];
    const textLines = [...titleLines, ...markdownToPlainText(markdown)];
    const wrappedLines = textLines.flatMap((line) => wrapLine(line, 96));
    const pages = chunk(wrappedLines, 58);

    return buildPdf(pages.length > 0 ? pages : [["No report content was available."]]);
  }
}

function markdownToPlainText(markdown: string): string[] {
  return markdown
    .split(/\r?\n/)
    .filter((line) => !line.startsWith("---"))
    .map((line) =>
      line
        .replace(/^#{1,6}\s+/u, "")
        .replace(/^[-*]\s+/u, "- ")
        .replace(/\*\*(.*?)\*\*/gu, "$1")
        .replace(/`{3}.*$/u, "")
        .replace(/`/gu, "")
    );
}

function wrapLine(line: string, width: number): string[] {
  if (line.length <= width) {
    return [line];
  }

  const words = line.split(/\s+/);
  const lines: string[] = [];
  let current = "";

  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (candidate.length > width && current) {
      lines.push(current);
      current = word;
    } else {
      current = candidate;
    }
  }

  if (current) {
    lines.push(current);
  }

  return lines;
}

function chunk<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}

function buildPdf(pages: string[][]): Buffer {
  const objects: string[] = [];
  const pageIds: number[] = [];

  objects.push("<< /Type /Catalog /Pages 2 0 R >>");
  objects.push("");
  objects.push("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>");

  for (const page of pages) {
    const content = buildPageContent(page);
    const pageId = objects.length + 1;
    const contentId = pageId + 1;

    pageIds.push(pageId);
    objects.push(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 3 0 R >> >> /Contents ${contentId} 0 R >>`
    );
    objects.push(`<< /Length ${Buffer.byteLength(content, "utf8")} >>\nstream\n${content}\nendstream`);
  }

  objects[1] = `<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(" ")}] /Count ${pageIds.length} >>`;

  const header = "%PDF-1.4\n";
  const offsets = [0];
  let body = "";

  for (const [index, object] of objects.entries()) {
    offsets.push(Buffer.byteLength(header + body, "utf8"));
    body += `${index + 1} 0 obj\n${object}\nendobj\n`;
  }

  const xrefOffset = Buffer.byteLength(header + body, "utf8");
  const xref = [
    "xref",
    `0 ${objects.length + 1}`,
    "0000000000 65535 f ",
    ...offsets.slice(1).map((offset) => `${offset.toString().padStart(10, "0")} 00000 n `),
    "trailer",
    `<< /Size ${objects.length + 1} /Root 1 0 R >>`,
    "startxref",
    String(xrefOffset),
    "%%EOF",
    ""
  ].join("\n");

  return Buffer.from(header + body + xref, "utf8");
}

function buildPageContent(lines: string[]): string {
  const escaped = lines.map((line) => `(${escapePdfText(line)}) Tj T*`).join("\n");
  return ["BT", "/F1 9 Tf", "50 750 Td", "12 TL", escaped, "ET"].join("\n");
}

function escapePdfText(value: string): string {
  return value
    .replace(/\\/gu, "\\\\")
    .replace(/\(/gu, "\\(")
    .replace(/\)/gu, "\\)")
    .replace(/\r|\n/gu, " ");
}
