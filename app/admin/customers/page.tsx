"use client";

import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import Link from "next/link";
import { Id } from "@/convex/_generated/dataModel";

type Customer = {
  _id: Id<"customers">;
  name: string;
  accountNumber?: string;
  note?: string;
  vatNumber?: string;
  address?: string;
  contactPerson?: string;
  email?: string;
  isActive: boolean;
  createdAt: number;
};

export default function CustomersPage() {
  const customers = useQuery(api.customers.list);
  const createCustomer = useMutation(api.customers.createCustomer);
  const updateCustomer = useMutation(api.customers.updateCustomer);
  const deactivateCustomer = useMutation(api.customers.deactivateCustomer);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null);
  
  const [formData, setFormData] = useState({
    name: "",
    accountNumber: "",
    note: "",
    vatNumber: "",
    address: "",
    contactPerson: "",
    email: ""
  });
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const openAddModal = () => {
    setEditingCustomer(null);
    setFormData({ 
      name: "", 
      accountNumber: "", 
      note: "",
      vatNumber: "",
      address: "",
      contactPerson: "",
      email: ""
    });
    setError("");
    setSuccess("");
    setIsModalOpen(true);
  };

  const openEditModal = (customer: Customer) => {
    setEditingCustomer(customer);
    setFormData({
      name: customer.name,
      accountNumber: customer.accountNumber || "",
      note: customer.note || "",
      vatNumber: customer.vatNumber || "",
      address: customer.address || "",
      contactPerson: customer.contactPerson || "",
      email: customer.email || ""
    });
    setError("");
    setSuccess("");
    setIsModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSuccess("");

    if (!formData.name.trim()) {
      setError("Name is required");
      return;
    }

    try {
      if (editingCustomer) {
        await updateCustomer({
          id: editingCustomer._id,
          name: formData.name,
          accountNumber: formData.accountNumber || undefined,
          note: formData.note || undefined,
          vatNumber: formData.vatNumber || undefined,
          address: formData.address || undefined,
          contactPerson: formData.contactPerson || undefined,
          email: formData.email || undefined
        });
        setSuccess("Customer updated successfully!");
      } else {
        await createCustomer({
          name: formData.name,
          accountNumber: formData.accountNumber || undefined,
          note: formData.note || undefined,
          vatNumber: formData.vatNumber || undefined,
          address: formData.address || undefined,
          contactPerson: formData.contactPerson || undefined,
          email: formData.email || undefined
        });
        setSuccess("Customer created successfully!");
      }
      
      // Close modal after short delay or immediately?
      // Let's keep it open to show success, or close it. 
      // User experience: usually close on success.
      setIsModalOpen(false);
      setFormData({ 
        name: "", 
        accountNumber: "", 
        note: "",
        vatNumber: "",
        address: "",
        contactPerson: "",
        email: ""
      });
    } catch (err: any) {
      setError(err.message || "Failed to save customer");
    }
  };

  const handleToggleActive = async (customer: Customer) => {
    try {
      await deactivateCustomer({
        id: customer._id,
        isActive: !customer.isActive,
      });
    } catch (err: any) {
      alert("Failed to update status: " + err.message);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* Header */}
      <div className="bg-white border-b px-8 py-4 flex items-center justify-between sticky top-0 z-10">
        <div>
          <Link href="/admin" className="text-blue-600 hover:text-blue-800 text-sm font-medium mb-2 block">
            ← Back to Admin
          </Link>
          <h1 className="text-2xl font-bold text-gray-900">Customers</h1>
          <p className="text-gray-500 text-sm mt-1">
            Manage master customer list.
          </p>
        </div>
        <button
          onClick={openAddModal}
          className="bg-blue-600 text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-blue-700 transition-colors"
        >
          Add Customer
        </button>
      </div>

      {/* Main Content */}
      <div className="flex-1 p-8 overflow-auto">
        {customers === undefined ? (
          <div className="text-center text-gray-500 mt-10">Loading customers...</div>
        ) : customers.length === 0 ? (
          <div className="text-center text-gray-500 mt-10 bg-white p-8 rounded-lg shadow-sm">
            No customers found. Click "Add Customer" to create one.
          </div>
        ) : (
          <div className="bg-white shadow-sm rounded-lg overflow-hidden border border-gray-200">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Name
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Account Number
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Status
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Note
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {customers.map((customer) => (
                  <tr key={customer._id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                      {customer.name}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 font-mono">
                      {customer.accountNumber || "—"}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${
                        customer.isActive 
                          ? "bg-green-100 text-green-800" 
                          : "bg-red-100 text-red-800"
                      }`}>
                        {customer.isActive ? "Active" : "Inactive"}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-500 truncate max-w-xs" title={customer.note}>
                      {customer.note || "—"}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                      <button
                        onClick={() => openEditModal(customer)}
                        className="text-blue-600 hover:text-blue-900 mr-4"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => handleToggleActive(customer)}
                        className={`${
                          customer.isActive ? "text-red-600 hover:text-red-900" : "text-green-600 hover:text-green-900"
                        }`}
                      >
                        {customer.isActive ? "Deactivate" : "Activate"}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Add/Edit Customer Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50 flex items-center justify-center">
          <div className="relative bg-white rounded-lg shadow-xl max-w-md w-full p-6">
            <h3 className="text-lg font-bold text-gray-900 mb-4">
              {editingCustomer ? "Edit Customer" : "Add Customer"}
            </h3>
            
            {error && (
              <div className="mb-4 bg-red-50 border-l-4 border-red-500 p-4">
                <p className="text-sm text-red-700">{error}</p>
              </div>
            )}
            
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                  placeholder="e.g. ABC Logistics"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Account Number
                </label>
                <input
                  type="text"
                  value={formData.accountNumber}
                  onChange={(e) => setFormData({ ...formData, accountNumber: e.target.value })}
                  className="w-full border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                  placeholder="e.g. A001"
                />
              </div>

              {/* Invoice Details Section */}
              <div className="pt-2 border-t border-gray-100">
                <h4 className="text-sm font-semibold text-gray-900 mb-3">Invoice Details</h4>
                <div className="space-y-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">VAT Number</label>
                    <input
                      type="text"
                      value={formData.vatNumber}
                      onChange={(e) => setFormData({ ...formData, vatNumber: e.target.value })}
                      className="w-full border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                      placeholder="e.g. 4700291823"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">Postal Address</label>
                    <textarea
                      rows={2}
                      value={formData.address}
                      onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                      className="w-full border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                      placeholder="e.g. 123 Industrial Rd, George, 6530"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-gray-500 mb-1">Contact Person</label>
                      <input
                        type="text"
                        value={formData.contactPerson}
                        onChange={(e) => setFormData({ ...formData, contactPerson: e.target.value })}
                        className="w-full border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                        placeholder="Name"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-500 mb-1">Email</label>
                      <input
                        type="email"
                        value={formData.email}
                        onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                        className="w-full border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                        placeholder="accounts@client.com"
                      />
                    </div>
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Note
                </label>
                <textarea
                  value={formData.note}
                  onChange={(e) => setFormData({ ...formData, note: e.target.value })}
                  rows={3}
                  className="w-full border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                  placeholder="Optional details..."
                />
              </div>

              <div className="mt-6 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700"
                >
                  {editingCustomer ? "Save Changes" : "Create Customer"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}