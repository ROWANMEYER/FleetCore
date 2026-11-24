export type CeramicRestoreMode = "unassigned" | "previous_assignment";

export function CeramicRestoreOptions({ mode, onChange, disabled }: {
  mode: CeramicRestoreMode; onChange: (mode: CeramicRestoreMode) => void; disabled: boolean;
}) {
  return <fieldset disabled={disabled} className="space-y-3">
    <legend className="mb-2 text-sm font-semibold">How should this shipment return?</legend>
    <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-[var(--card-border)] p-3">
      <input type="radio" name="ceramic-restore-mode" value="unassigned" checked={mode === "unassigned"} onChange={() => onChange("unassigned")} className="mt-1 accent-[#0891B2]" />
      <span><strong className="block text-sm">Restore as unassigned (recommended)</strong><span className="mt-1 block text-xs text-[var(--nav-text-color)]">Choose the driver, truck and planning date again. The old Planner load and reports stay inactive until you save a fresh assignment. Previous amounts remain in history; billing must be reviewed again.</span></span>
    </label>
    <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-[var(--card-border)] p-3">
      <input type="radio" name="ceramic-restore-mode" value="previous_assignment" checked={mode === "previous_assignment"} onChange={() => onChange("previous_assignment")} className="mt-1 accent-[#0891B2]" />
      <span><strong className="block text-sm">Restore previous assignment</strong><span className="mt-1 block text-xs text-[var(--nav-text-color)]">Bring back the saved driver, truck, planning date, Planner load and report amounts. Review the driver instructions before sending.</span></span>
    </label>
  </fieldset>;
}
