import test from "node:test";
import assert from "node:assert/strict";
import { buildCsvContent, buildExcelXmlContent } from "../components/shared/table/export-contract.mjs";

test("export contract: CSV has BOM, header contract and escaped values", () => {
  const headers = ["place", "quantity", "type"];
  const rows = [["2", "1", 'Chair "XL"'], ["3", "1", "A,B"]];
  const csv = buildCsvContent(headers, rows);

  assert.equal(csv.charCodeAt(0), 0xfeff, "CSV must start with UTF-8 BOM marker");
  assert.ok(csv.includes('"place","quantity","type"'));
  assert.ok(csv.includes('"Chair ""XL"""'));
  assert.ok(csv.includes('"A,B"'));
});

test("export contract: XML has spreadsheet envelope and escaped values", () => {
  const headers = ["place", "kid_number"];
  const rows = [["2", "544346381"], ["3", 'A&B <tag> "q"']];
  const xml = buildExcelXmlContent(headers, rows);

  assert.ok(xml.startsWith('<?xml version="1.0"?>'));
  assert.ok(xml.includes("<Workbook"));
  assert.ok(xml.includes('<Worksheet ss:Name="Export">'));
  assert.ok(xml.includes("<Data ss:Type=\"String\">place</Data>"));
  assert.ok(xml.includes("<Data ss:Type=\"String\">kid_number</Data>"));
  assert.ok(xml.includes("A&amp;B &lt;tag&gt; &quot;q&quot;"));
});
