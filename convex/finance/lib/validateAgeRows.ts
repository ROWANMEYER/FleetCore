import { AgeAnalysisRow } from "./parseAgeAnalysis";

export interface ValidationError {
  rowIndex: number;
  accountNumber: string;
  message: string;
  difference?: number;
}

function isSummaryRow(row: AgeAnalysisRow): boolean {
  const name = row.clientName?.toLowerCase() ?? "";

  // Explicit summary labels
  if (
    name.includes("grand") ||
    name.includes("total") ||
    name.includes("subtotal")
  ) {
    return true;
  }

  // Implicit summary pattern:
  // totalDue > 0 but all aging buckets are zero
  const bucketSum =
    row.days120 +
    row.days90 +
    row.days60 +
    row.days30 +
    row.current;

  return bucketSum === 0 && row.totalDue > 0;
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
