export interface CsvColumn {
  key: string;
  label: string;
  transform?: (value: any, row: any) => string;
}

export function exportToCsv(rows: any[], columns: CsvColumn[], fileName: string) {
  const header = columns.map(c => escapeCsv(c.label)).join(',');
  const body = rows.map(row =>
    columns
      .map(col => {
        const raw = col.transform ? col.transform(row[col.key], row) : row[col.key] ?? '';
        return escapeCsv(String(raw));
      })
      .join(',')
  ).join('\n');

  const csv = '\uFEFF' + header + '\n' + body;

  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${fileName}.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

function escapeCsv(s: string): string {
  if (s.includes(',') || s.includes('"') || s.includes('\n')) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}