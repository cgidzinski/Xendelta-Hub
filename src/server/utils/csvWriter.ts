// CSV output for streamed server responses.
//
// The client has its own csvCell/toCsv in utils/csvMapping.ts for exports it builds in
// memory. This is the streaming counterpart: a row at a time, so an export of tens of
// thousands of items never has to exist as one string. The quoting is deliberately
// identical to the client's, so the two exports read the same in a spreadsheet.

/** Quotes one value. Every field is quoted, so a comma or newline inside it is harmless. */
export function csvCell(value: unknown): string {
  return `"${String(value ?? "").replace(/"/g, '""')}"`;
}

/**
 * One CSV record, terminated.
 *
 * CRLF because that is what RFC 4180 specifies and what Excel expects: a bare \n leaves
 * some spreadsheet importers treating the whole file as a single row.
 */
export function csvLine(values: unknown[]): string {
  return `${values.map(csvCell).join(",")}\r\n`;
}
