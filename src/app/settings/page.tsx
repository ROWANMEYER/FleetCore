"use client";

import { useState, useEffect} from"react";
import { useQuery, useMutation, useAction} from"convex/react";
import { api} from"@/convex/_generated/api";
import {
 Bell,
 BellRing,
 Sliders,
 Palette,
 Truck,
 Users,
 FileText,
 Download,
 Shield,
 Save,
 CheckCircle,
 RotateCcw,
 KeyRound,
 AlertTriangle,
 RefreshCw,
} from"lucide-react";
import { PushNotificationSettings } from"@/src/components/PushNotificationSettings";

function SettingsSection({
 icon,
 title,
 description,
 children,
}: {
 icon: React.ReactNode;
 title: string;
 description: string;
 children: React.ReactNode;
}) {
 return (
 <div className="glass-card-premium overflow-hidden">
 <div className="px-6 py-4" style={{borderBottom:"1px solid var(--card-border)"}}>
 <div className="flex items-center gap-3">
 <div className="flex items-center justify-center w-9 h-9 rounded-lg bg-gradient-to-br from-[#06B6D4] to-[#0891B2] shadow-lg shadow-[rgba(6,182,212,0.3)] shrink-0">
 <div className="text-white">{icon}</div>
 </div>
 <div>
 <h2 className="text-sm font-semibold" style={{color:"var(--foreground)"}}>{title}</h2>
 <p className="text-xs mt-0.5" style={{color:"var(--nav-text-color)"}}>{description}</p>
 </div>
 </div>
 </div>
 <div className="px-6 py-5">{children}</div>
 </div>
);
}

function ToggleField({ label, description, enabled, onChange}: {
 label: string;
 description: string;
 enabled: boolean;
 onChange: (v: boolean) => void;
}) {
 return (
 <div className="flex items-center justify-between py-2">
 <div className="pr-4">
 <div className="text-sm font-medium text-[var(--foreground)]">{label}</div>
 <div className="text-xs text-[var(--nav-text-color)] mt-0.5">{description}</div>
 </div>
 <label className="relative inline-flex items-center cursor-pointer flex-shrink-0">
 <input
 type="checkbox"
 checked={enabled}
 onChange={(e) => onChange(e.target.checked)}
 className="sr-only peer"
 />
 <div className="w-10 h-6 bg-[var(--card-bg)] rounded-full peer peer-checked:bg-[#06B6D4] peer-focus:ring-2 peer-focus:ring-[#06B6D4]/30 transition-all after:content-[''] after:absolute after:top-[3px] after:start-[3px] after:bg-[var(--card-bg)] after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:after:translate-x-full" />
 </label>
 </div>
);
}

function NumberField({ label, value, min, max, step, suffix, onChange}: {
 label: string;
 value: number;
 min: number;
 max: number;
 step: number;
 suffix?: string;
 onChange: (v: number) => void;
}) {
 return (
 <div className="flex items-center justify-between py-2">
 <div className="text-sm font-medium text-[var(--foreground)]">{label}</div>
 <div className="flex items-center gap-3">
 <input
 type="range"
 min={min}
 max={max}
 step={step}
 value={value}
 onChange={(e) => onChange(parseFloat(e.target.value))}
 className="w-24 h-1.5 bg-[var(--card-bg)] rounded-full appearance-none cursor-pointer accent-[#06B6D4]"
 />
 <span className="text-sm font-mono text-[var(--foreground)] min-w-[3rem] text-right tabular-nums">
 {value}{suffix ||""}
 </span>
 </div>
 </div>
);
}

export default function SettingsPage() {
 const appSettings = useQuery(api.settings.getAppSettings);
 const saveReminderThresholds = useMutation(api.settings.saveReminderThresholds);
 const saveFleetDefaults = useMutation(api.settings.saveFleetDefaults);
 const saveSubDefaults = useMutation(api.settings.saveSubDefaults);
 const saveDisplayDefaults = useMutation(api.settings.saveDisplayDefaults);
 const saveInvoiceDefaults = useMutation(api.settings.saveInvoiceDefaults);
 const saveExportDefaults = useMutation(api.settings.saveExportDefaults);
 const saveSecurityDefaults = useMutation(api.settings.saveSecurityDefaults);
 const adminMode = useQuery(api.adminSettings.getAppMode);
 const setAdminMode = useMutation(api.adminSettings.setMode);
 const verifyPassword = useAction(api.adminSettings.verifyAdminPassword);
 const hardResetAdmin = useAction(api.adminSettings.hardResetAdmin);

 const [reminders, setReminders] = useState({
 stage1AlertDays: 3,
 stage2AlertDays: 2,
 stage3AlertDays: 5,
 expiryReminder90: true,
 expiryReminder60: true,
 expiryReminder30: true,
});

 const [saveStatus, setSaveStatus] = useState<"idle" |"saving" |"saved">("idle");

 const [fleetDefaults, setFleetDefaults] = useState({
 defaultQuantityType:"tons",
 defaultRateType:"per_unit",
 defaultCurrency:"ZAR",
});

 const [fleetSaveStatus, setFleetSaveStatus] = useState<"idle" |"saving" |"saved">("idle");

 const [subDefaults, setSubDefaults] = useState({
 defaultSubRateType:"per_unit",
 autoSubNotes: true,
 showSubMarginOnCards: true,
});

 const [subSaveStatus, setSubSaveStatus] = useState<"idle" |"saving" |"saved">("idle");

 const [displayDefaults, setDisplayDefaults] = useState({
 compactMode: false,
 reduceMotion: false,
 zoomLevel: 100,
});

 const [displaySaveStatus, setDisplaySaveStatus] = useState<"idle" |"saving" |"saved">("idle");

 const [invoiceDefaults, setInvoiceDefaults] = useState({
 companyName:"",
 companyPobox:"",
 companyCity:"",
 companyPostal:"",
 companyPhone:"",
 companyFax:"",
 vatNumber:"",
 defaultVatRate: 15,
 bankName:"",
 accountNumber:"",
 branchCode:"",
 paymentTerms:"Net 30 Days",
});

 const [invoiceSaveStatus, setInvoiceSaveStatus] = useState<"idle" |"saving" |"saved">("idle");

 const [exportDefaults, setExportDefaults] = useState({
 defaultExportFormat:"excel",
 includeChartsInPdf: true,
 includeKpisInPdf: true,
 defaultDateRange:"month",
});

 const [exportSaveStatus, setExportSaveStatus] = useState<"idle" |"saving" |"saved">("idle");

 const [securityDefaults, setSecurityDefaults] = useState({
 sessionTimeoutMinutes: 60,
 enableAuditLog: true,
});

 const [securitySaveStatus, setSecuritySaveStatus] = useState<"idle" |"saving" |"saved">("idle");
 const [passwordInput, setPasswordInput] = useState("");
 const [passwordStatus, setPasswordStatus] = useState<"idle" |"verifying" |"success" |"error">("idle");
 const [resetStatus, setResetStatus] = useState<"idle" |"confirming" |"resetting" |"done">("idle");

 // Load settings from backend
 useEffect(() => {
 if (appSettings) {
 // Defer to a microtask so the state updates aren't synchronous inside the effect.
 const settings = appSettings as any;
 Promise.resolve().then(() => {
 setReminders({
 stage1AlertDays: appSettings.stage1AlertDays ?? 3,
 stage2AlertDays: appSettings.stage2AlertDays ?? 2,
 stage3AlertDays: appSettings.stage3AlertDays ?? 5,
 expiryReminder90: appSettings.expiryReminder90 ?? true,
 expiryReminder60: appSettings.expiryReminder60 ?? true,
 expiryReminder30: appSettings.expiryReminder30 ?? true,
});
 setFleetDefaults({
 defaultQuantityType: settings.defaultQuantityType ||"tons",
 defaultRateType: settings.defaultRateType ||"per_unit",
 defaultCurrency: settings.defaultCurrency ||"ZAR",
});
 setSubDefaults({
 defaultSubRateType: settings.defaultSubRateType ||"per_unit",
 autoSubNotes: settings.autoSubNotes !== undefined ? settings.autoSubNotes : true,
 showSubMarginOnCards: settings.showSubMarginOnCards !== undefined ? settings.showSubMarginOnCards : true,
});
 setDisplayDefaults({
 compactMode: settings.compactMode !== undefined ? settings.compactMode : false,
 reduceMotion: settings.reduceMotion !== undefined ? settings.reduceMotion : false,
 zoomLevel: settings.zoomLevel || 100,
});
 setInvoiceDefaults({
 companyName: settings.companyName ||"",
 companyPobox: settings.companyPobox ||"",
 companyCity: settings.companyCity ||"",
 companyPostal: settings.companyPostal ||"",
 companyPhone: settings.companyPhone ||"",
 companyFax: settings.companyFax ||"",
 vatNumber: settings.vatNumber ||"",
 defaultVatRate: settings.defaultVatRate || 15,
 bankName: settings.bankName ||"",
 accountNumber: settings.accountNumber ||"",
 branchCode: settings.branchCode ||"",
 paymentTerms: settings.paymentTerms ||"Net 30 Days",
});
 setExportDefaults({
 defaultExportFormat: settings.defaultExportFormat ||"excel",
 includeChartsInPdf: settings.includeChartsInPdf !== undefined ? settings.includeChartsInPdf : true,
 includeKpisInPdf: settings.includeKpisInPdf !== undefined ? settings.includeKpisInPdf : true,
 defaultDateRange: settings.defaultDateRange ||"month",
});
 setSecurityDefaults({
 sessionTimeoutMinutes: settings.sessionTimeoutMinutes || 60,
 enableAuditLog: settings.enableAuditLog !== undefined ? settings.enableAuditLog : true,
});
});
}
}, [appSettings]);

 const handleSaveReminders = async () => {
 setSaveStatus("saving");
 try {
 await saveReminderThresholds(reminders);
 setSaveStatus("saved");
 setTimeout(() => setSaveStatus("idle"), 2500);
} catch (e) {
 console.error("Failed to save reminders:", e);
 setSaveStatus("idle");
}
};

 const handleSaveFleetDefaults = async () => {
 setFleetSaveStatus("saving");
 try {
 await saveFleetDefaults(fleetDefaults);
 setFleetSaveStatus("saved");
 setTimeout(() => setFleetSaveStatus("idle"), 2500);
} catch (e) {
 console.error("Failed to save fleet defaults:", e);
 setFleetSaveStatus("idle");
}
};

 const handleSaveSubDefaults = async () => {
 setSubSaveStatus("saving");
 try {
 await saveSubDefaults(subDefaults);
 setSubSaveStatus("saved");
 setTimeout(() => setSubSaveStatus("idle"), 2500);
} catch (e) {
 console.error("Failed to save sub defaults:", e);
 setSubSaveStatus("idle");
}
};

 const handleSaveDisplayDefaults = async () => {
 setDisplaySaveStatus("saving");
 try {
 await saveDisplayDefaults(displayDefaults);
 setDisplaySaveStatus("saved");
 setTimeout(() => setDisplaySaveStatus("idle"), 2500);
} catch (e) {
 console.error("Failed to save display defaults:", e);
 setDisplaySaveStatus("idle");
}
};

 const handleSaveInvoiceDefaults = async () => {
 setInvoiceSaveStatus("saving");
 try {
 await saveInvoiceDefaults(invoiceDefaults);
 setInvoiceSaveStatus("saved");
 setTimeout(() => setInvoiceSaveStatus("idle"), 2500);
} catch (e) {
 console.error("Failed to save invoice defaults:", e);
 setInvoiceSaveStatus("idle");
}
};

 const handleSaveExportDefaults = async () => {
 setExportSaveStatus("saving");
 try {
 await saveExportDefaults(exportDefaults);
 setExportSaveStatus("saved");
 setTimeout(() => setExportSaveStatus("idle"), 2500);
} catch (e) {
 console.error("Failed to save export defaults:", e);
 setExportSaveStatus("idle");
}
};

 const handleSaveSecurityDefaults = async () => {
 setSecuritySaveStatus("saving");
 try {
 await saveSecurityDefaults(securityDefaults);
 setSecuritySaveStatus("saved");
 setTimeout(() => setSecuritySaveStatus("idle"), 2500);
} catch (e) {
 console.error("Failed to save security defaults:", e);
 setSecuritySaveStatus("idle");
}
};

 const handleVerifyPassword = async () => {
 setPasswordStatus("verifying");
 try {
 const result = await verifyPassword({ password: passwordInput});
 setPasswordStatus(result.success ?"success" :"error");
 setTimeout(() => setPasswordStatus("idle"), 3000);
} catch (e) {
 console.error("Password verification failed:", e);
 setPasswordStatus("error");
 setTimeout(() => setPasswordStatus("idle"), 3000);
}
};

 const handleHardReset = async () => {
 setResetStatus("resetting");
 try {
 await hardResetAdmin();
 setResetStatus("done");
 setTimeout(() => setResetStatus("idle"), 3000);
} catch (e) {
 console.error("Hard reset failed:", e);
 setResetStatus("idle");
}
};

 return (
 <div className="h-full overflow-y-auto">
 <div className="max-w-3xl mx-auto space-y-6 p-4 sm:p-8">
 {/* Page Header */}
 <div className="flex items-center justify-between flex-wrap gap-3">
 <div>
 <h1 className="text-2xl font-black tracking-tight" style={{color:"var(--foreground)"}}>Settings</h1>
 <p className="text-sm mt-1" style={{color:"var(--nav-text-color)"}}>Configure FleetCore to your workflow</p>
 </div>
 {/* Save indicator */}
 {saveStatus ==="saved" && (
 <div className="flex items-center gap-1.5 text-sm text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-500/10 px-3 py-1.5 rounded-lg border border-emerald-200 dark:border-emerald-500/30 animate-in fade-in slide-in-from-top-2">
 <CheckCircle className="w-4 h-4" />
 Saved
 </div>
)}
 </div>

 {/* Section 1: Expiry Reminder Thresholds */}
 <SettingsSection
 icon={<Bell className="w-5 h-5" />}
 title="Expiry Reminder Thresholds"
 description="Configure when to get alerted about upcoming licence, PDP, and service expiries"
 >
 <div className="space-y-1">
 <div className="text-xs font-semibold uppercase tracking-wider text-[var(--nav-text-color)] mb-2">Alert Stages (Days Before Expiry)</div>
 <NumberField
 label="Stage 1 — Soft warning"
 value={reminders.stage1AlertDays}
 min={1}
 max={30}
 step={1}
 suffix="d"
 onChange={(v) => setReminders((p) => ({ ...p, stage1AlertDays: v}))}
 />
 <NumberField
 label="Stage 2 — Medium warning"
 value={reminders.stage2AlertDays}
 min={1}
 max={30}
 step={1}
 suffix="d"
 onChange={(v) => setReminders((p) => ({ ...p, stage2AlertDays: v}))}
 />
 <NumberField
 label="Stage 3 — Critical alert"
 value={reminders.stage3AlertDays}
 min={1}
 max={30}
 step={1}
 suffix="d"
 onChange={(v) => setReminders((p) => ({ ...p, stage3AlertDays: v}))}
 />
 </div>

 <div className="border-t border-[var(--card-border)] mt-4 pt-4">
 <div className="text-xs font-semibold uppercase tracking-wider text-[var(--nav-text-color)] mb-2">Expiry Reminder Notifications</div>
 <ToggleField
 label="90-day reminder"
 description="Notify 90 days before licence/PDP expiry"
 enabled={reminders.expiryReminder90}
 onChange={(v) => setReminders((p) => ({ ...p, expiryReminder90: v}))}
 />
 <ToggleField
 label="60-day reminder"
 description="Notify 60 days before licence/PDP expiry"
 enabled={reminders.expiryReminder60}
 onChange={(v) => setReminders((p) => ({ ...p, expiryReminder60: v}))}
 />
 <ToggleField
 label="30-day reminder"
 description="Notify 30 days before licence/PDP expiry"
 enabled={reminders.expiryReminder30}
 onChange={(v) => setReminders((p) => ({ ...p, expiryReminder30: v}))}
 />
 </div>

 <div className="mt-4 pt-4 border-t border-[var(--card-border)] flex justify-end">
 <button
 onClick={handleSaveReminders}
 disabled={saveStatus ==="saving"}
 className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all shadow-sm ${
 saveStatus ==="saving"
 ?"bg-[var(--card-bg)] text-[var(--nav-text-color)] cursor-not-allowed"
 :"bg-gradient-to-br from-[#06B6D4] to-[#0891B2] text-white hover:opacity-90 shadow-sm"
}`}
 >
 {saveStatus ==="saving" ? (
 <><RotateCcw className="w-4 h-4 animate-spin" /> Saving...</>
) : (
 <><Save className="w-4 h-4" /> Save Reminder Settings</>
)}
 </button>
 </div>
 </SettingsSection>

 {/* Section 1b: Mobile Push Notifications */}
 <SettingsSection
 icon={<BellRing className="w-5 h-5" />}
 title="Mobile Push Notifications"
 description="Get notified on your phone — daily dispatch summary and alerts (works with the installed app)"
 >
 <PushNotificationSettings />
 </SettingsSection>

 {/* Section 2: Display & Theme */}
 <SettingsSection
 icon={<Palette className="w-5 h-5" />}
 title="Display & Theme"
 description="Customize the look and feel of FleetCore"
 >
 <div className="space-y-4">
 {/* Theme selector */}
 <div>
 <label className="text-xs font-semibold uppercase tracking-wider text-[var(--nav-text-color)] mb-2 block">Theme</label>
 <p className="text-xs text-[var(--nav-text-color)] mb-3">Use the theme toggle in the sidebar to switch between light and dark mode.</p>
 </div>

 {/* Zoom Level */}
 <div>
 <label className="text-xs font-semibold uppercase tracking-wider text-[var(--nav-text-color)] mb-2 block">Default Zoom Level</label>
 <NumberField
 label="Content zoom"
 value={displayDefaults.zoomLevel}
 min={70}
 max={150}
 step={5}
 suffix="%"
 onChange={(v) => setDisplayDefaults(p => ({ ...p, zoomLevel: v}))}
 />
 </div>

 {/* Behavior toggles */}
 <div className="border-t border-[var(--card-border)] pt-4 mt-2">
 <label className="text-xs font-semibold uppercase tracking-wider text-[var(--nav-text-color)] mb-2 block">Accessibility & Behavior</label>
 <ToggleField
 label="Compact mode"
 description="Reduce padding and spacing for a more condensed view"
 enabled={displayDefaults.compactMode}
 onChange={(v) => setDisplayDefaults(p => ({ ...p, compactMode: v}))}
 />
 <ToggleField
 label="Reduce motion"
 description="Disable animations and transitions throughout the app"
 enabled={displayDefaults.reduceMotion}
 onChange={(v) => setDisplayDefaults(p => ({ ...p, reduceMotion: v}))}
 />
 </div>

 <div className="pt-2 flex justify-end">
 <button
 onClick={handleSaveDisplayDefaults}
 disabled={displaySaveStatus ==="saving"}
 className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all shadow-sm ${
 displaySaveStatus ==="saving"
 ?"bg-[var(--card-bg)] text-[var(--nav-text-color)] cursor-not-allowed"
 :"bg-gradient-to-br from-[#06B6D4] to-[#0891B2] text-white hover:opacity-90 shadow-sm"
}`}
 >
 {displaySaveStatus ==="saving" ? (
 <><RotateCcw className="w-4 h-4 animate-spin" /> Saving...</>
) : (
 <><Save className="w-4 h-4" /> Save Display Settings</>
)}
 </button>
 </div>
 {displaySaveStatus ==="saved" && (
 <div className="flex items-center gap-1.5 text-xs text-emerald-600 dark:text-emerald-400 justify-end animate-in fade-in">
 <CheckCircle className="w-3.5 h-3.5" />
 Display settings saved
 </div>
)}
 </div>
 </SettingsSection>

 {/* Section 3: Fleet Defaults */}
 <SettingsSection
 icon={<Truck className="w-5 h-5" />}
 title="Fleet Defaults"
 description="Default values pre-filled when creating new routes"
 >
 <div className="space-y-4">
 {/* Quantity Type */}
 <div>
 <label className="text-xs font-semibold uppercase tracking-wider text-[var(--nav-text-color)] mb-2 block">Default Quantity Unit</label>
 <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
 {["tons","pallets","bales","bags"].map((unit) => (
 <button
 key={unit}
 onClick={() => setFleetDefaults(p => ({ ...p, defaultQuantityType: unit}))}
 className={`px-3 py-2 rounded-lg text-sm font-medium border transition-all capitalize ${
 fleetDefaults.defaultQuantityType === unit
 ?"bg-[#06B6D4]/10 border-[#06B6D4]/50 text-[#06B6D4] shadow-sm":"glass-card border-[var(--card-border)] text-[var(--nav-text-color)] hover:border-[var(--card-border)]"
 }`}
 >
 {unit}
 </button>
))}
 </div>
 </div>

 {/* Rate Type */}
 <div>
 <label className="text-xs font-semibold uppercase tracking-wider text-[var(--nav-text-color)] mb-2 block">Default Rate Type</label>
 <div className="grid grid-cols-2 gap-2">
 {[
 { value:"per_unit", label:"Per Unit", desc:"Rate × quantity"},
 { value:"flat", label:"Flat Rate", desc:"Fixed amount per load"},
].map((opt) => (
 <button
 key={opt.value}
 onClick={() => setFleetDefaults(p => ({ ...p, defaultRateType: opt.value}))}
 className={`px-3 py-3 rounded-lg text-sm font-medium border transition-all ${
 fleetDefaults.defaultRateType === opt.value
 ?"bg-[#06B6D4]/10 border-[#06B6D4]/50 text-[#06B6D4] shadow-sm":"glass-card border-[var(--card-border)] text-[var(--nav-text-color)] hover:border-[var(--card-border)]"
 }`}
 >
 <div>{opt.label}</div>
 <div className="text-[10px] text-[var(--nav-text-color)] font-normal mt-0.5">{opt.desc}</div>
 </button>
))}
 </div>
 </div>

 {/* Currency */}
 <div>
 <label className="text-xs font-semibold uppercase tracking-wider text-[var(--nav-text-color)] mb-2 block">Default Currency</label>
 <div className="grid grid-cols-3 gap-2">
 {[
 { value:"ZAR", label:"ZAR", desc:"R — South African Rand"},
 { value:"USD", label:"USD", desc:"$ — US Dollar"},
 { value:"EUR", label:"EUR", desc:"€ — Euro"},
].map((opt) => (
 <button
 key={opt.value}
 onClick={() => setFleetDefaults(p => ({ ...p, defaultCurrency: opt.value}))}
 className={`px-3 py-3 rounded-lg text-sm font-medium border transition-all ${
 fleetDefaults.defaultCurrency === opt.value
 ?"bg-[#06B6D4]/10 border-[#06B6D4]/50 text-[#06B6D4] shadow-sm":"glass-card border-[var(--card-border)] text-[var(--nav-text-color)] hover:border-[var(--card-border)]"
 }`}
 >
 <div>{opt.label}</div>
 <div className="text-[10px] text-[var(--nav-text-color)] font-normal mt-0.5">{opt.desc}</div>
 </button>
))}
 </div>
 </div>

 <div className="pt-2 flex justify-end">
 <button
 onClick={handleSaveFleetDefaults}
 disabled={fleetSaveStatus ==="saving"}
 className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all shadow-sm ${
 fleetSaveStatus ==="saving"
 ?"bg-[var(--card-bg)] text-[var(--nav-text-color)] cursor-not-allowed"
 :"bg-gradient-to-br from-[#06B6D4] to-[#0891B2] text-white hover:opacity-90 shadow-sm"
}`}
 >
 {fleetSaveStatus ==="saving" ? (
 <><RotateCcw className="w-4 h-4 animate-spin" /> Saving...</>
) : (
 <><Save className="w-4 h-4" /> Save Fleet Defaults</>
)}
 </button>
 </div>
 {fleetSaveStatus ==="saved" && (
 <div className="flex items-center gap-1.5 text-xs text-emerald-600 dark:text-emerald-400 justify-end animate-in fade-in">
 <CheckCircle className="w-3.5 h-3.5" />
 Fleet defaults saved
 </div>
)}
 </div>
 </SettingsSection>

 {/* Section 4: Subcontractor Defaults */}
 <SettingsSection
 icon={<Users className="w-5 h-5" />}
 title="Subcontractor Defaults"
 description="Default subcontractor rate and display preferences"
 >
 <div className="space-y-4">
 {/* Sub Rate Type */}
 <div>
 <label className="text-xs font-semibold uppercase tracking-wider text-[var(--nav-text-color)] mb-2 block">Default Sub Rate Type</label>
 <div className="grid grid-cols-2 gap-2">
 {[
 { value:"per_unit", label:"Per Unit", desc:"Rate × quantity — for per-ton or per-pallet pricing"},
 { value:"flat", label:"Flat Rate", desc:"Fixed amount per load — for trip-based pricing"},
].map((opt) => (
 <button
 key={opt.value}
 onClick={() => setSubDefaults(p => ({ ...p, defaultSubRateType: opt.value}))}
 className={`px-3 py-3 rounded-lg text-sm font-medium border transition-all ${
 subDefaults.defaultSubRateType === opt.value
 ?"bg-[#06B6D4]/10 border-[#06B6D4]/50 text-[#06B6D4] shadow-sm":"glass-card border-[var(--card-border)] text-[var(--nav-text-color)] hover:border-[var(--card-border)]"
 }`}
 >
 <div>{opt.label}</div>
 <div className="text-[10px] text-[var(--nav-text-color)] font-normal mt-0.5">{opt.desc}</div>
 </button>
))}
 </div>
 </div>

 {/* Display preferences */}
 <div className="border-t border-[var(--card-border)] pt-4 mt-4">
 <label className="text-xs font-semibold uppercase tracking-wider text-[var(--nav-text-color)] mb-2 block">Display Preferences</label>
 <ToggleField
 label="Auto-generate subcontractor notes"
 description="Include sub cost in the notes field when creating subcontractor routes"
 enabled={subDefaults.autoSubNotes}
 onChange={(v) => setSubDefaults(p => ({ ...p, autoSubNotes: v}))}
 />
 <ToggleField
 label="Show sub cost & margin on load cards"
 description="Display subcontractor cost and profit margin on each load card in the route planner"
 enabled={subDefaults.showSubMarginOnCards}
 onChange={(v) => setSubDefaults(p => ({ ...p, showSubMarginOnCards: v}))}
 />
 </div>

 <div className="pt-2 flex justify-end">
 <button
 onClick={handleSaveSubDefaults}
 disabled={subSaveStatus ==="saving"}
 className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all shadow-sm ${
 subSaveStatus ==="saving"
 ?"bg-[var(--card-bg)] text-[var(--nav-text-color)] cursor-not-allowed"
 :"bg-gradient-to-br from-[#06B6D4] to-[#0891B2] text-white hover:opacity-90 shadow-sm"
}`}
 >
 {subSaveStatus ==="saving" ? (
 <><RotateCcw className="w-4 h-4 animate-spin" /> Saving...</>
) : (
 <><Save className="w-4 h-4" /> Save Sub Defaults</>
)}
 </button>
 </div>
 {subSaveStatus ==="saved" && (
 <div className="flex items-center gap-1.5 text-xs text-emerald-600 dark:text-emerald-400 justify-end animate-in fade-in">
 <CheckCircle className="w-3.5 h-3.5" />
 Subcontractor defaults saved
 </div>
)}
 </div>
 </SettingsSection>

 {/* Section 5: Invoice Defaults */}
 <SettingsSection
 icon={<FileText className="w-5 h-5" />}
 title="Invoice Defaults"
 description="Company details, VAT rate, and payment terms for invoice PDF generation"
 >
 <div className="space-y-4">
 {/* Company Details */}
 <div>
 <label className="text-xs font-semibold uppercase tracking-wider text-[var(--nav-text-color)] mb-2 block">Company Details</label>
 <div className="grid grid-cols-2 gap-3">
 <div className="col-span-2">
 <input
 type="text"
 value={invoiceDefaults.companyName}
 onChange={(e) => setInvoiceDefaults(p => ({ ...p, companyName: e.target.value.toUpperCase()}))}
 className="w-full h-10 px-3 rounded-lg text-sm placeholder-[var(--nav-text-color)] outline-none transition-all settings-input"
 placeholder="Company Name"
 />
 </div>
 <input
 type="text"
 value={invoiceDefaults.companyPobox}
 onChange={(e) => setInvoiceDefaults(p => ({ ...p, companyPobox: e.target.value}))}
 className="w-full h-10 px-3 rounded-lg text-sm placeholder-[var(--nav-text-color)] outline-none transition-all settings-input"
 placeholder="PO Box / Street"
 />
 <div className="grid grid-cols-2 gap-3 col-span-2">
 <input
 type="text"
 value={invoiceDefaults.companyCity}
 onChange={(e) => setInvoiceDefaults(p => ({ ...p, companyCity: e.target.value.toUpperCase()}))}
 className="w-full h-10 px-3 rounded-lg text-sm placeholder-[var(--nav-text-color)] outline-none transition-all settings-input"
 placeholder="City"
 />
 <input
 type="text"
 value={invoiceDefaults.companyPostal}
 onChange={(e) => setInvoiceDefaults(p => ({ ...p, companyPostal: e.target.value}))}
 className="w-full h-10 px-3 rounded-lg text-sm placeholder-[var(--nav-text-color)] outline-none transition-all settings-input"
 placeholder="Postal Code"
 />
 </div>
 <input
 type="text"
 value={invoiceDefaults.companyPhone}
 onChange={(e) => setInvoiceDefaults(p => ({ ...p, companyPhone: e.target.value}))}
 className="w-full h-10 px-3 rounded-lg text-sm placeholder-[var(--nav-text-color)] outline-none transition-all settings-input"
 placeholder="Phone"
 />
 <input
 type="text"
 value={invoiceDefaults.companyFax}
 onChange={(e) => setInvoiceDefaults(p => ({ ...p, companyFax: e.target.value}))}
 className="w-full h-10 px-3 rounded-lg text-sm placeholder-[var(--nav-text-color)] outline-none transition-all settings-input"
 placeholder="Fax"
 />
 </div>
 </div>

 {/* VAT */}
 <div className="border-t border-[var(--card-border)] pt-4">
 <label className="text-xs font-semibold uppercase tracking-wider text-[var(--nav-text-color)] mb-2 block">Tax</label>
 <div className="grid grid-cols-2 gap-3">
 <input
 type="text"
 value={invoiceDefaults.vatNumber}
 onChange={(e) => setInvoiceDefaults(p => ({ ...p, vatNumber: e.target.value}))}
 className="w-full h-10 px-3 rounded-lg text-sm placeholder-[var(--nav-text-color)] outline-none transition-all settings-input"
 placeholder="VAT Number"
 />
 <NumberField
 label="VAT Rate"
 value={invoiceDefaults.defaultVatRate}
 min={0}
 max={25}
 step={0.5}
 suffix="%"
 onChange={(v) => setInvoiceDefaults(p => ({ ...p, defaultVatRate: v}))}
 />
 </div>
 </div>

 {/* Banking */}
 <div className="border-t border-[var(--card-border)] pt-4">
 <label className="text-xs font-semibold uppercase tracking-wider text-[var(--nav-text-color)] mb-2 block">Banking Details</label>
 <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
 <input
 type="text"
 value={invoiceDefaults.bankName}
 onChange={(e) => setInvoiceDefaults(p => ({ ...p, bankName: e.target.value.toUpperCase()}))}
 className="w-full h-10 px-3 rounded-lg text-sm placeholder-[var(--nav-text-color)] outline-none transition-all settings-input"
 placeholder="Bank Name"
 />
 <input
 type="text"
 value={invoiceDefaults.accountNumber}
 onChange={(e) => setInvoiceDefaults(p => ({ ...p, accountNumber: e.target.value}))}
 className="w-full h-10 px-3 rounded-lg text-sm placeholder-[var(--nav-text-color)] outline-none transition-all settings-input"
 placeholder="Account Number"
 />
 <input
 type="text"
 value={invoiceDefaults.branchCode}
 onChange={(e) => setInvoiceDefaults(p => ({ ...p, branchCode: e.target.value}))}
 className="w-full h-10 px-3 rounded-lg text-sm placeholder-[var(--nav-text-color)] outline-none transition-all settings-input"
 placeholder="Branch Code"
 />
 </div>
 </div>

 {/* Payment Terms */}
 <div className="border-t border-[var(--card-border)] pt-4">
 <label className="text-xs font-semibold uppercase tracking-wider text-[var(--nav-text-color)] mb-2 block">Payment Terms</label>
 <select
 value={invoiceDefaults.paymentTerms}
 onChange={(e) => setInvoiceDefaults(p => ({ ...p, paymentTerms: e.target.value}))}
 className="w-full h-10 px-3 rounded-lg text-sm outline-none transition-all appearance-none cursor-pointer settings-input"
 >
 <option value="Due on Receipt">Due on Receipt</option>
 <option value="Net 7 Days">Net 7 Days</option>
 <option value="Net 15 Days">Net 15 Days</option>
 <option value="Net 30 Days">Net 30 Days</option>
 <option value="Net 45 Days">Net 45 Days</option>
 <option value="Net 60 Days">Net 60 Days</option>
 </select>
 </div>

 <div className="pt-2 flex justify-end">
 <button
 onClick={handleSaveInvoiceDefaults}
 disabled={invoiceSaveStatus ==="saving"}
 className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all shadow-sm ${
 invoiceSaveStatus ==="saving"
 ?"bg-[var(--card-bg)] text-[var(--nav-text-color)] cursor-not-allowed"
 :"bg-gradient-to-br from-[#06B6D4] to-[#0891B2] text-white hover:opacity-90 shadow-sm"
}`}
 >
 {invoiceSaveStatus ==="saving" ? (
 <><RotateCcw className="w-4 h-4 animate-spin" /> Saving...</>
) : (
 <><Save className="w-4 h-4" /> Save Invoice Details</>
)}
 </button>
 </div>
 {invoiceSaveStatus ==="saved" && (
 <div className="flex items-center gap-1.5 text-xs text-emerald-600 dark:text-emerald-400 justify-end animate-in fade-in">
 <CheckCircle className="w-3.5 h-3.5" />
 Invoice details saved
 </div>
)}
 </div>
 </SettingsSection>

 {/* Section 6: Export Defaults */}
 <SettingsSection
 icon={<Download className="w-5 h-5" />}
 title="Export Defaults"
 description="Configure your preferred export formats and options"
 >
 <div className="space-y-4">
 {/* Default Format */}
 <div>
 <label className="text-xs font-semibold uppercase tracking-wider text-[var(--nav-text-color)] mb-2 block">Default Export Format</label>
 <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
 {[
 { value:"excel", label:"Excel", icon:"xlsx", color:"text-green-600"},
 { value:"csv", label:"CSV", icon:"csv", color:"text-blue-600"},
 { value:"json", label:"JSON", icon:"json", color:"text-yellow-600"},
 { value:"pdf", label:"PDF", icon:"pdf", color:"text-red-600"},
].map((opt) => (
 <button
 key={opt.value}
 onClick={() => setExportDefaults(p => ({ ...p, defaultExportFormat: opt.value}))}
 className={`px-3 py-3 rounded-lg text-sm font-medium border transition-all ${
 exportDefaults.defaultExportFormat === opt.value
 ?"bg-[#06B6D4]/10 border-[#06B6D4]/50 text-[#06B6D4] shadow-sm":"glass-card border-[var(--card-border)] text-[var(--nav-text-color)] hover:border-[var(--card-border)]"
 }`}
 >
 <div className={`font-bold ${opt.color}`}>{opt.icon}</div>
 <div className="text-[10px] text-[var(--nav-text-color)] font-normal">{opt.label}</div>
 </button>
))}
 </div>
 </div>

 {/* Date Range */}
 <div className="border-t border-[var(--card-border)] pt-4">
 <label className="text-xs font-semibold uppercase tracking-wider text-[var(--nav-text-color)] mb-2 block">Default Date Range</label>
 <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
 {[
 { value:"today", label:"Today"},
 { value:"week", label:"Last 7 Days"},
 { value:"month", label:"This Month"},
 { value:"custom", label:"Custom"},
].map((opt) => (
 <button
 key={opt.value}
 onClick={() => setExportDefaults(p => ({ ...p, defaultDateRange: opt.value}))}
 className={`px-3 py-2 rounded-lg text-sm font-medium border transition-all ${
 exportDefaults.defaultDateRange === opt.value
 ?"bg-[#06B6D4]/10 border-[#06B6D4]/50 text-[#06B6D4] shadow-sm":"glass-card border-[var(--card-border)] text-[var(--nav-text-color)] hover:border-[var(--card-border)]"
 }`}
 >
 {opt.label}
 </button>
))}
 </div>
 </div>

 {/* PDF options */}
 <div className="border-t border-[var(--card-border)] pt-4">
 <label className="text-xs font-semibold uppercase tracking-wider text-[var(--nav-text-color)] mb-2 block">PDF Export Options</label>
 <ToggleField
 label="Include charts"
 description="Add revenue and distance charts to PDF exports"
 enabled={exportDefaults.includeChartsInPdf}
 onChange={(v) => setExportDefaults(p => ({ ...p, includeChartsInPdf: v}))}
 />
 <ToggleField
 label="Include KPIs"
 description="Add KPI summary section to PDF exports"
 enabled={exportDefaults.includeKpisInPdf}
 onChange={(v) => setExportDefaults(p => ({ ...p, includeKpisInPdf: v}))}
 />
 </div>

 <div className="pt-2 flex justify-end">
 <button
 onClick={handleSaveExportDefaults}
 disabled={exportSaveStatus ==="saving"}
 className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all shadow-sm ${
 exportSaveStatus ==="saving"
 ?"bg-[var(--card-bg)] text-[var(--nav-text-color)] cursor-not-allowed"
 :"bg-gradient-to-br from-[#06B6D4] to-[#0891B2] text-white hover:opacity-90 shadow-sm"
}`}
 >
 {exportSaveStatus ==="saving" ? (
 <><RotateCcw className="w-4 h-4 animate-spin" /> Saving...</>
) : (
 <><Save className="w-4 h-4" /> Save Export Settings</>
)}
 </button>
 </div>
 {exportSaveStatus ==="saved" && (
 <div className="flex items-center gap-1.5 text-xs text-emerald-600 dark:text-emerald-400 justify-end animate-in fade-in">
 <CheckCircle className="w-3.5 h-3.5" />
 Export settings saved
 </div>
)}
 </div>
 </SettingsSection>

 {/* Section 7: Admin & Security */}
 <SettingsSection
 icon={<Shield className="w-5 h-5" />}
 title="Admin & Security"
 description="Password protection, access mode, and system controls"
 >
 <div className="space-y-4">
 {/* Admin Mode */}
 <div>
 <label className="text-xs font-semibold uppercase tracking-wider text-[var(--nav-text-color)] mb-2 block">Access Mode</label>
 <div className="flex items-center gap-4 p-3 bg-[var(--card-bg)]/50 rounded-lg border border-[var(--card-border)]">
 <div className="flex-1">
 <div className="text-sm font-medium text-[var(--foreground)]">
 Current mode: <span className="font-bold uppercase">{adminMode?.mode ||"ADMIN"}</span>
 </div>
 <div className="text-xs text-[var(--nav-text-color)] mt-0.5">
 {adminMode?.mode ==="ADMIN" ?"Full access to all features and settings" :"Limited user mode with restricted access"}
 </div>
 </div>
 <button
 onClick={() => setAdminMode({ mode: adminMode?.mode ==="ADMIN" ?"USER" :"ADMIN"})}
 className={`px-4 py-2 rounded-lg text-sm font-medium border transition-all shadow-sm ${
 adminMode?.mode ==="ADMIN"
 ?"bg-[#06B6D4]/10 border-[#06B6D4]/50 text-[#06B6D4] shadow-sm hover:bg-[#06B6D4]/20"
 :"bg-[var(--card-bg)] border-[var(--card-border)] text-[var(--nav-text-color)] hover:bg-[var(--card-border)]"
}`}
 >
 {adminMode?.mode ==="ADMIN" ?"Switch to User" :"Switch to Admin"}
 </button>
 </div>
 </div>

 {/* Password */}
 <div className="border-t border-[var(--card-border)] pt-4">
 <label className="text-xs font-semibold uppercase tracking-wider text-[var(--nav-text-color)] mb-2 block">
 <KeyRound className="w-3.5 h-3.5 inline mr-1" />
 Admin Password
 </label>
 <p className="text-xs text-[var(--nav-text-color)] mb-3">Default password is <code className="bg-[var(--card-bg)] px-1 rounded">admin123</code>. Enter to verify or reset.</p>
 <div className="flex gap-2">
 <input
 type="password"
 value={passwordInput}
 onChange={(e) => setPasswordInput(e.target.value)}
 className="flex-1 h-10 px-3 rounded-lg text-sm placeholder-[var(--nav-text-color)] outline-none transition-all settings-input"
 placeholder="Enter admin password"
 />
 <button
 onClick={handleVerifyPassword}
 disabled={passwordStatus ==="verifying" || !passwordInput}
 className={`px-4 py-2 rounded-lg text-sm font-medium transition-all shadow-sm ${
 passwordStatus ==="verifying" || !passwordInput
 ?"bg-[var(--card-bg)] text-[var(--nav-text-color)] cursor-not-allowed":"bg-gradient-to-br from-[#06B6D4] to-[#0891B2] text-white hover:opacity-90 shadow-sm"
}`}
 >
 {passwordStatus ==="verifying" ? (
 <><RotateCcw className="w-4 h-4 animate-spin" /> Verifying</>
) : (
"Verify"
)}
 </button>
 </div>
 {passwordStatus ==="success" && (
 <div className="mt-2 text-xs text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
 <CheckCircle className="w-3.5 h-3.5" /> Password verified successfully
 </div>
)}
 {passwordStatus ==="error" && (
 <div className="mt-2 text-xs text-red-600 dark:text-red-400 flex items-center gap-1">
 <AlertTriangle className="w-3.5 h-3.5" /> Incorrect password
 </div>
)}
 </div>

 {/* Session & Audit */}
 <div className="border-t border-[var(--card-border)] pt-4">
 <label className="text-xs font-semibold uppercase tracking-wider text-[var(--nav-text-color)] mb-2 block">Session & Audit</label>
 <NumberField
 label="Session timeout"
 value={securityDefaults.sessionTimeoutMinutes}
 min={5}
 max={480}
 step={5}
 suffix="min"
 onChange={(v) => setSecurityDefaults(p => ({ ...p, sessionTimeoutMinutes: v}))}
 />
 <ToggleField
 label="Enable audit logging"
 description="Track admin actions and configuration changes"
 enabled={securityDefaults.enableAuditLog}
 onChange={(v) => setSecurityDefaults(p => ({ ...p, enableAuditLog: v}))}
 />
 </div>

 {/* Danger Zone */}
 <div className="border-t border-red-200 dark:border-red-900/50 pt-4 mt-2">
 <label className="text-xs font-semibold uppercase tracking-wider text-red-500 dark:text-red-400 mb-2 block flex items-center gap-1">
 <AlertTriangle className="w-3.5 h-3.5" />
 Danger Zone
 </label>
 <div className="flex items-center justify-between p-3 bg-red-50 dark:bg-red-950/30 rounded-lg border border-red-200 dark:border-red-900/50">
 <div>
 <div className="text-sm font-medium text-red-800 dark:text-red-300">Reset admin password</div>
 <div className="text-xs text-red-600 dark:text-red-400 mt-0.5">Resets password to <code className="bg-red-100 dark:bg-red-900/50 px-1 rounded">admin123</code></div>
 </div>
 <div className="flex gap-2">
 {resetStatus ==="confirming" ? (
 <>
 <button
 onClick={handleHardReset}
 className="px-4 py-2 rounded-lg text-sm font-medium bg-red-600 text-white hover:bg-red-700 transition-all shadow-sm"
 >
 Confirm Reset
 </button>
 <button
 onClick={() => setResetStatus("idle")}
 className="px-4 py-2 rounded-lg text-sm font-medium bg-[var(--card-bg)] text-[var(--foreground)] hover:bg-[var(--card-bg)] transition-all"
 >
 Cancel
 </button>
 </>
) : resetStatus ==="resetting" ? (
 <span className="flex items-center gap-1 text-sm text-amber-600 dark:text-amber-400">
 <RotateCcw className="w-4 h-4 animate-spin" /> Resetting...
 </span>
) : resetStatus ==="done" ? (
 <span className="flex items-center gap-1 text-sm text-emerald-600 dark:text-emerald-400">
 <CheckCircle className="w-4 h-4" /> Reset complete
 </span>
) : (
 <button
 onClick={() => setResetStatus("confirming")}
 className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium bg-red-600 text-white hover:bg-red-700 transition-all shadow-sm"
 >
 <RefreshCw className="w-4 h-4" />
 Reset
 </button>
)}
 </div>
 </div>
 </div>

 <div className="pt-2 flex justify-end">
 <button
 onClick={handleSaveSecurityDefaults}
 disabled={securitySaveStatus ==="saving"}
 className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all shadow-sm ${
 securitySaveStatus ==="saving"
 ?"bg-[var(--card-bg)] text-[var(--nav-text-color)] cursor-not-allowed"
 :"bg-gradient-to-br from-[#06B6D4] to-[#0891B2] text-white hover:opacity-90 shadow-sm"
}`}
 >
 {securitySaveStatus ==="saving" ? (
 <><RotateCcw className="w-4 h-4 animate-spin" /> Saving...</>
) : (
 <><Save className="w-4 h-4" /> Save Security Settings</>
)}
 </button>
 </div>
 {securitySaveStatus ==="saved" && (
 <div className="flex items-center gap-1.5 text-xs text-emerald-600 dark:text-emerald-400 justify-end animate-in fade-in">
 <CheckCircle className="w-3.5 h-3.5" />
 Security settings saved
 </div>
)}
 </div>
 </SettingsSection>
 </div>
 </div>
);
}
