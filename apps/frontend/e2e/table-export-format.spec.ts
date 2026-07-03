import { expect, test } from "@playwright/test";
import { login, requireAuthEnv } from "./helpers/auth";
import { exportCsv, exportXls, gotoSofortList } from "./helpers/table-pages";

requireAuthEnv(test);
test.describe.configure({ mode: "serial" });

function bufferToUtf8(buffer: Buffer): string {
  return buffer.toString("utf8");
}

test("sofort-list CSV export contains UTF-8 BOM and expected headers", async ({ page }) => {
  await login(page);
  await gotoSofortList(page);

  const downloadPromise = exportCsv(page);
  const download = await downloadPromise;

  const stream = await download.createReadStream();
  const chunks: Buffer[] = [];
  for await (const chunk of stream!) {
    chunks.push(Buffer.from(chunk));
  }
  const buffer = Buffer.concat(chunks);
  expect(buffer[0]).toBe(0xef);
  expect(buffer[1]).toBe(0xbb);
  expect(buffer[2]).toBe(0xbf);

  const text = bufferToUtf8(buffer);
  expect(text).toContain('"place","quantity","room","type","kid_number","kid_id","listing_status"');
});

test("sofort-list XLS export is Spreadsheet XML with expected headers", async ({ page }) => {
  await login(page);
  await gotoSofortList(page);

  const downloadPromise = exportXls(page);
  const download = await downloadPromise;
  expect(download.suggestedFilename().toLowerCase()).toContain(".xls");

  const stream = await download.createReadStream();
  const chunks: Buffer[] = [];
  for await (const chunk of stream!) {
    chunks.push(Buffer.from(chunk));
  }
  const xml = bufferToUtf8(Buffer.concat(chunks));
  expect(xml).toContain('<?xml version="1.0"?>');
  expect(xml).toContain("<Workbook");
  expect(xml).toContain("<Worksheet ss:Name=\"Export\">");
  expect(xml).toContain("<Data ss:Type=\"String\">place</Data>");
  expect(xml).toContain("<Data ss:Type=\"String\">quantity</Data>");
  expect(xml).toContain("<Data ss:Type=\"String\">kid_number</Data>");
});

