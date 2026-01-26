import EditRouteForm from "./EditRouteForm";

export default function EditRoutePage() {
  return (
    <div className="h-full w-full overflow-y-auto bg-gray-50">
      <div className="max-w-5xl mx-auto px-6 py-8">
        <h1 className="text-xl font-semibold mb-4">
          Edit Route
        </h1>
        <EditRouteForm />
      </div>
    </div>
  );
}
