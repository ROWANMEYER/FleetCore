export default function DashboardPage() {
  return (
    <div className="p-8">
      <h1 className="text-2xl font-bold mb-4">FleetCore Dashboards</h1>
      <p className="text-gray-600 mb-4">
        This is a legacy placeholder. The real dashboard is available at:
      </p>
      <a
        href="/operations/dashboard"
        className="text-blue-600 hover:text-blue-800 underline font-medium"
      >
        /operations/dashboard
      </a>
    </div>
  );
}
