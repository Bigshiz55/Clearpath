// A small, correct RFC-4180-ish CSV parser. Pure and tested. Handles quoted
// fields, escaped quotes ("") and commas/newlines inside quotes. Used by the
// Goodreads / StoryGraph / generic import flows.

export interface ParsedCsv {
  headers: string[];
  rows: Record<string, string>[];
}

/** Tokenize CSV text into a matrix of raw string cells. */
export function parseCsvMatrix(text: string): string[][] {
  const rows: string[][] = [];
  let field = '';
  let row: string[] = [];
  let inQuotes = false;
  // Normalize newlines.
  const src = text.replace(/\r\n?/g, '\n');

  for (let i = 0; i < src.length; i++) {
    const c = src[i]!;
    if (inQuotes) {
      if (c === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ',') {
      row.push(field);
      field = '';
    } else if (c === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else {
      field += c;
    }
  }
  // Flush trailing field/row (unless the input ended on a clean newline).
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

/** Parse CSV text into headers + keyed row objects. */
export function parseCsv(text: string): ParsedCsv {
  const matrix = parseCsvMatrix(text).filter(
    (r) => r.length > 1 || (r[0] ?? '').trim() !== '',
  );
  if (matrix.length === 0) return { headers: [], rows: [] };
  const headers = matrix[0]!.map((h) => h.trim());
  const rows = matrix.slice(1).map((cells) => {
    const obj: Record<string, string> = {};
    headers.forEach((h, i) => {
      obj[h] = (cells[i] ?? '').trim();
    });
    return obj;
  });
  return { headers, rows };
}
