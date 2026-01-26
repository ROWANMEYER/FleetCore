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
      </div>
    </div>
  );
}
