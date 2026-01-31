import { AgeAnalysisRow } from "./parseAgeAnalysis";

export interface ValidationError {
  rowIndex: number;
  accountNumber: string;
  message: string;
  difference?: number;
}

export function isSummaryRow(row: AgeAnalysisRow): boolean {
  const name = row.clientName?.toLowerCase().trim() ?? "";

  return (
    name.startsWith("totals") ||
    name.startsWith("percentage") ||
    name.startsWith("grand")
  );
}

export function validateAgeRows(rows: AgeAnalysisRow[]): ValidationError[] {
  const errors: ValidationError[] = [];

  for (const row of rows) {
    if (isSummaryRow(row)) continue;

    const sum = 
      row.days120 + 
      row.days90 + 
      row.days60 + 
      row.days30 + 
      row.current;
    
    const diff = Math.abs(sum - row.totalDue);
    
    // Tolerance 0.01
    if (diff > 0.01) {
      errors.push({
        rowIndex: row.originalRowIndex,
        accountNumber: row.accountNumber,
        message: `Validation failed: Sum of aging buckets (${sum.toFixed(2)}) does not match Total Due (${row.totalDue.toFixed(2)})`,
        difference: diff
      });
    }
  }

  return errors;
}
