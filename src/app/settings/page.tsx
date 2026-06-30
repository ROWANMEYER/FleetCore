"use client";

export default function SettingsPage() {
  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-3xl mx-auto space-y-6 p-8">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-gray-900 dark:text-gray-100">Settings</h1>
          <p className="text-sm text-gray-900/80 dark:text-slate-300 mt-1">Customize FleetCore appearance</p>
        </div>

        <div className="bg-white dark:bg-slate-900/60 rounded-xl border border-gray-200 dark:border-slate-800 shadow-sm p-6">
          <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Background</h2>
          <p className="text-xs text-gray-600 dark:text-slate-300 mt-1">
            Wallpaper is disabled to keep all pages consistent in dark mode.
          </p>
        </div>
      </div>
    </div>
  );
}
