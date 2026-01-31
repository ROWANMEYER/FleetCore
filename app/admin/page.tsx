import Link from "next/link";

export default function AdminPage() {
  return (
    <div className="p-8">
      <h1 className="text-2xl font-bold mb-6">Admin</h1>
      
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        <Link 
          href="/admin/age-analysis"
          className="block p-6 bg-white border border-gray-200 rounded-lg shadow-sm hover:shadow-md transition-shadow"
        >
          <h2 className="text-lg font-semibold mb-2 text-gray-900">Age Analysis</h2>
          <p className="text-gray-600 text-sm">
            Import and manage monthly age analysis snapshots.
          </p>
        </Link>

        <Link 
          href="/admin/payments"
          className="block p-6 bg-white border border-gray-200 rounded-lg shadow-sm hover:shadow-md transition-shadow"
        >
          <h2 className="text-lg font-semibold mb-2 text-gray-900">Payments</h2>
          <p className="text-gray-600 text-sm">
            Import raw bank payments via copy-paste.
          </p>
        </Link>

        <Link 
          href="/admin/reconciliation"
          className="block p-6 bg-white border border-gray-200 rounded-lg shadow-sm hover:shadow-md transition-shadow"
        >
          <h2 className="text-lg font-semibold mb-2 text-gray-900">Reconciliation</h2>
          <p className="text-gray-600 text-sm">
            Read-only view of payments vs age analysis.
          </p>
        </Link>

        <Link 
          href="/admin/customers"
          className="block p-6 bg-white border border-gray-200 rounded-lg shadow-sm hover:shadow-md transition-shadow"
        >
          <h2 className="text-lg font-semibold mb-2 text-gray-900">Customers</h2>
          <p className="text-gray-600 text-sm">
            Manage master customer list manually.
          </p>
        </Link>

        <Link 
          href="/admin/trucks"
          className="block p-6 bg-white border border-gray-200 rounded-lg shadow-sm hover:shadow-md transition-shadow"
        >
          <h2 className="text-lg font-semibold mb-2 text-gray-900">Trucks</h2>
          <p className="text-gray-600 text-sm">
            Manage fleet trucks.
          </p>
        </Link>

        <Link 
          href="/admin/drivers"
          className="block p-6 bg-white border border-gray-200 rounded-lg shadow-sm hover:shadow-md transition-shadow"
        >
          <h2 className="text-lg font-semibold mb-2 text-gray-900">Drivers</h2>
          <p className="text-gray-600 text-sm">
            Manage drivers (Active/Inactive).
          </p>
        </Link>

        <Link 
          href="/admin/trailers"
          className="block p-6 bg-white border border-gray-200 rounded-lg shadow-sm hover:shadow-md transition-shadow"
        >
          <h2 className="text-lg font-semibold mb-2 text-gray-900">Trailers</h2>
          <p className="text-gray-600 text-sm">
            Manage fleet trailers.
          </p>
        </Link>
      </div>
    </div>
  );
}
