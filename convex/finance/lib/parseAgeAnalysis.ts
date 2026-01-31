export interface AgeAnalysisRow {
  accountNumber: string;
  clientName: string;
  days120: number;
  days90: number;
  days60: number;
  days30: number;
  current: number;
  totalDue: number;
  originalRowIndex: number;
}
