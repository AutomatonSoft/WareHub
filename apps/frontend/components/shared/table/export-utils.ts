function triggerDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function escapeCsv(value: string): string {
  return `"${value.replace(/"/g, "\"\"")}"`;
}

function buildCsvContent(headers: string[], rows: string[][]): string {
  const lines = [headers.map(escapeCsv).join(",")];
  for (const row of rows) {
    lines.push(row.map((cell) => escapeCsv(cell)).join(","));
  }
  return `\uFEFF${lines.join("\n")}`;
}

export function exportRowsToCsv(headers: string[], rows: string[][], filename: string): void {
  const csv = buildCsvContent(headers, rows);
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  triggerDownload(blob, filename);
}

function buildExcelXmlContent(headers: string[], rows: string[][]): string {
  const xmlEscape = (value: string) =>
    value
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&apos;");

  const headerCells = headers
    .map((header) => `<Cell><Data ss:Type="String">${xmlEscape(header)}</Data></Cell>`)
    .join("");
  const dataRows = rows
    .map((row) => `<Row>${row.map((cell) => `<Cell><Data ss:Type="String">${xmlEscape(cell)}</Data></Cell>`).join("")}</Row>`)
    .join("");

  return `<?xml version="1.0"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:o="urn:schemas-microsoft-com:office:office"
 xmlns:x="urn:schemas-microsoft-com:office:excel"
 xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">
 <Worksheet ss:Name="Export">
  <Table>
   <Row>${headerCells}</Row>
   ${dataRows}
  </Table>
 </Worksheet>
</Workbook>`;
}

export function exportRowsToExcelXml(headers: string[], rows: string[][], filename: string): void {
  const xml = buildExcelXmlContent(headers, rows);
  const blob = new Blob([xml], { type: "application/vnd.ms-excel;charset=utf-8;" });
  triggerDownload(blob, filename);
}
