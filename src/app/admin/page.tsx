import Link from "next/link";

export default function AdminPage() {
  return (
    <div className="p-8">
      <h1 className="text-2xl font-bold mb-6 text-gray-900 dark:text-gray-100">Admin</h1>
      
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        <Link 
          href="/admin/age-analysis"
          className="block p-6 bg-white border border-gray-200 rounded-lg shadow-sm hover:shadow-md transition-shadow dark:bg-slate-900/60 dark:border-slate-800 dark:hover:bg-slate-900/80"
        >
          <h2 className="text-lg font-semibold mb-2 text-gray-900 dark:text-gray-100">Age Analysis</h2>
          <p className="text-gray-600 text-sm dark:text-slate-300">
            Import and manage monthly age analysis snapshots.
          </p>
        </Link>

        <Link 
          href="/admin/payments"
          className="block p-6 bg-white border border-gray-200 rounded-lg shadow-sm hover:shadow-md transition-shadow dark:bg-slate-900/60 dark:border-slate-800 dark:hover:bg-slate-900/80"
        >
          <h2 className="text-lg font-semibold mb-2 text-gray-900 dark:text-gray-100">Payments</h2>
          <p className="text-gray-600 text-sm dark:text-slate-300">
            Import raw bank payments via copy-paste.
          </p>
        </Link>

        <Link 
          href="/admin/reconciliation"
          className="block p-6 bg-white border border-gray-200 rounded-lg shadow-sm hover:shadow-md transition-shadow dark:bg-slate-900/60 dark:border-slate-800 dark:hover:bg-slate-900/80"
        >
          <h2 className="text-lg font-semibold mb-2 text-gray-900 dark:text-gray-100">Reconciliation</h2>
          <p className="text-gray-600 text-sm dark:text-slate-300">
            Read-only view of payments vs age analysis.
          </p>
        </Link>

        <Link 
          href="/admin/customers"
          className="block p-6 bg-white border border-gray-200 rounded-lg shadow-sm hover:shadow-md transition-shadow dark:bg-slate-900/60 dark:border-slate-800 dark:hover:bg-slate-900/80"
        >
          <h2 className="text-lg font-semibold mb-2 text-gray-900 dark:text-gray-100">Customers</h2>
          <p className="text-gray-600 text-sm dark:text-slate-300">
            Manage master customer list manually.
          </p>
        </Link>

        <Link 
          href="/admin/trucks"
          className="block p-6 bg-white border border-gray-200 rounded-lg shadow-sm hover:shadow-md transition-shadow dark:bg-slate-900/60 dark:border-slate-800 dark:hover:bg-slate-900/80"
        >
          <h2 className="text-lg font-semibold mb-2 text-gray-900 dark:text-gray-100">Trucks</h2>
          <p className="text-gray-600 text-sm dark:text-slate-300">
            Manage fleet trucks.
          </p>
        </Link>

        <Link 
          href="/admin/drivers"
          className="block p-6 bg-white border border-gray-200 rounded-lg shadow-sm hover:shadow-md transition-shadow dark:bg-slate-900/60 dark:border-slate-800 dark:hover:bg-slate-900/80"
        >
          <h2 className="text-lg font-semibold mb-2 text-gray-900 dark:text-gray-100">Drivers</h2>
          <p className="text-gray-600 text-sm dark:text-slate-300">
            Manage drivers (Active/Inactive).
          </p>
        </Link>

        <Link 
          href="/admin/trailers"
          className="block p-6 bg-white border border-gray-200 rounded-lg shadow-sm hover:shadow-md transition-shadow dark:bg-slate-900/60 dark:border-slate-800 dark:hover:bg-slate-900/80"
        >
          <h2 className="text-lg font-semibold mb-2 text-gray-900 dark:text-gray-100">Trailers</h2>
          <p className="text-gray-600 text-sm dark:text-slate-300">
            Manage fleet trailers.
          </p>
        </Link>

        <Link 
          href="/admin/fleet-import"
          className="block p-6 bg-white border border-gray-200 rounded-lg shadow-sm hover:shadow-md transition-shadow dark:bg-slate-900/60 dark:border-slate-800 dark:hover:bg-slate-900/80"
        >
          <h2 className="text-lg font-semibold mb-2 text-gray-900 dark:text-gray-100">Fleet Import</h2>
          <p className="text-gray-600 text-sm dark:text-slate-300">
            Bulk-import Trucks, Trailers and Drivers from Excel.
          </p>
        </Link>
      </div>
    </div>
  );
}
