export const formatCurrency = (amount: number): string => {
  // [FORMATTING CRITICAL] Strict ZAR formatting: "R 1 234,56"
  // MUST use space for thousands and comma for decimals.
  // DO NOT use toLocaleString() as it varies by system locale.
  // 1. Fixed to 2 decimal places
  // 2. Replace dot with comma
  // 3. Add spaces for thousands separator
  const parts = amount.toFixed(2).split(".");
  const integerPart = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, " ");
  return `R ${integerPart},${parts[1]}`;
};

export const formatDate = (date: string | Date): string => {
  if (!date) return "";
  const d = typeof date === "string" ? new Date(date) : date;
  return d.toISOString().split("T")[0];
};

export const formatDescription = (rawDesc: string): string => {
  // Enforce line break after " TO " for visual structure
  return rawDesc.replace(/ TO /i, " TO \n");
};

const MAX_LINE_CHARS = 68;
export const clampText = (text: string | undefined): string => {
  return (text ?? "").slice(0, MAX_LINE_CHARS);
};

