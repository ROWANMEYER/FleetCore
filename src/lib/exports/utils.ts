export function downloadFile(content: string | Blob, filename: string, type: string) {
  const blob = typeof content === 'string' ? new Blob([content], { type }) : content;
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a); // Append to body to ensure click works in all browsers
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
