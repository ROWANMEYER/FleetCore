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
  phone?: string;
  email?: string;
  isActive: boolean;
  createdAt: number;
};

export default function CustomersPage() {
  const customers = useQuery(api.customers.list);
  const createCustomer = useMutation(api.customers.createCustomer);
  const updateCustomer = useMutation(api.customers.updateCustomer);
  const deactivateCustomer = useMutation(api.customers.deactivateCustomer);
  const deleteCustomer = useMutation(api.customers.deleteCustomer);
  const deleteBulkCustomers = useMutation(api.customers.deleteBulkCustomers);

  const [selected, setSelected] = useState<Set<Id<"customers">>>(new Set());

  const toggleSelect = (id: Id<"customers">) =>
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  const toggleSelectAll = () => {
    if (!customers) return;
    if (selected.size === customers.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(customers.map((c) => c._id)));
    }
  };

  const handleBulkDelete = async () => {
    if (selected.size === 0) return;
    if (!confirm(`Delete ${selected.size} selected customer(s)? This cannot be undone.`)) return;
    try {
      await deleteBulkCustomers({ ids: Array.from(selected) as Id<"customers">[] });
      setSelected(new Set());
    } catch (err: any) {
      alert(err.message || "Bulk delete failed");
      setSelected(new Set());
    }
  };

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null);
  
  const [formData, setFormData] = useState({
    name: "",
    accountNumber: "",
    note: "",
    vatNumber: "",
    address: "",
    contactPerson: "",
    phone: "",
    email: "",
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
      phone: "",
      email: "",
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
      phone: customer.phone || "",
      email: customer.email || "",
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
          phone: formData.phone || undefined,
          email: formData.email || undefined,
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
          phone: formData.phone || undefined,
          email: formData.email || undefined,
        });
        setSuccess("Customer created successfully!");
      }
      
      setIsModalOpen(false);
      setFormData({ 
        name: "", 
        accountNumber: "", 
        note: "",
        vatNumber: "",
        address: "",
        contactPerson: "",
        phone: "",
        email: "",
      });
    } catch (err: any) {
      setError(err.message || "Failed to save customer");
    }
  };

  const handleToggleActive = async (customer: Customer) => {
    try {
      await deactivateCustomer({ id: customer._id, isActive: !customer.isActive });
    } catch (err: any) {
      alert("Failed to update status: " + err.message);
    }
  };

  const handleDelete = async (customer: Customer) => {
    if (!confirm(`Delete "${customer.name}"? This cannot be undone.`)) return;
    try {
      await deleteCustomer({ id: customer._id });
    } catch (err: any) {
      alert(err.message || "Failed to delete customer");
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-slate-950 flex flex-col">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-8 py-4 flex items-center justify-between sticky top-0 z-10 dark:bg-slate-950/60 dark:border-slate-800 dark:backdrop-blur-sm">
        <div>
          <Link href="/admin" className="text-blue-600 hover:text-blue-800 text-sm font-medium mb-2 block">
            ← Back to Admin
          </Link>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Customers</h1>
          <p className="text-gray-500 dark:text-slate-400 text-sm mt-1">
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

      {/* Bulk action bar */}
      {selected.size > 0 && (
        <div className="bg-red-50 border-b border-red-200 px-8 py-3 flex items-center justify-between dark:bg-red-950/30 dark:border-red-900/40">
          <span className="text-sm font-medium text-red-700 dark:text-red-200">{selected.size} customer{selected.size > 1 ? "s" : ""} selected</span>
          <div className="flex gap-3">
            <button onClick={() => setSelected(new Set())} className="text-sm text-gray-600 hover:text-gray-900 dark:text-slate-300 dark:hover:text-white">
              Clear
            </button>
            <button
              onClick={handleBulkDelete}
              className="bg-red-600 text-white px-4 py-1.5 rounded-md text-sm font-medium hover:bg-red-700"
            >
              Delete Selected
            </button>
          </div>
        </div>
      )}

      {/* Main Content */}
      <div className="flex-1 p-8 overflow-auto">
        {customers === undefined ? (
          <div className="text-center text-gray-500 dark:text-slate-400 mt-10">Loading customers...</div>
        ) : customers.length === 0 ? (
          <div className="text-center text-gray-500 dark:text-slate-400 mt-10 bg-white dark:bg-slate-900/60 p-8 rounded-lg shadow-sm border border-gray-200 dark:border-slate-800">
            No customers found. Click &quot;Add Customer&quot; to create one.
          </div>
        ) : (
          <div className="bg-white dark:bg-slate-900/60 shadow-sm rounded-lg overflow-hidden border border-gray-200 dark:border-slate-800">
            <table className="min-w-full divide-y divide-gray-200 dark:divide-slate-800">
              <thead className="bg-gray-50 dark:bg-slate-950/40">
                <tr>
                  <th className="px-4 py-3 w-10">
                    <input
                      type="checkbox"
                      checked={customers.length > 0 && selected.size === customers.length}
                      onChange={toggleSelectAll}
                      className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                    />
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-slate-400 uppercase tracking-wider">Name</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-slate-400 uppercase tracking-wider">VAT No.</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-slate-400 uppercase tracking-wider">Address</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-slate-400 uppercase tracking-wider">Contact</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-slate-400 uppercase tracking-wider">Phone</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-slate-400 uppercase tracking-wider">Email</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-slate-400 uppercase tracking-wider">Status</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 dark:text-slate-400 uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody className="bg-white dark:bg-transparent divide-y divide-gray-200 dark:divide-slate-800">
                {customers.map((customer) => (
                  <tr key={customer._id} className={["hover:bg-gray-50 dark:hover:bg-slate-950/50", selected.has(customer._id) ? "bg-blue-50 dark:bg-slate-950/40" : ""].join(" ").trim()}>
                    <td className="px-4 py-3 w-10">
                      <input
                        type="checkbox"
                        checked={selected.has(customer._id)}
                        onChange={() => toggleSelect(customer._id)}
                        className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                      />
                    </td>                    <td className="px-4 py-3 text-sm font-semibold text-gray-900 dark:text-gray-100">{customer.name}</td>
                    <td className="px-4 py-3 text-sm text-gray-500 dark:text-slate-300 font-mono">{customer.vatNumber || "—"}</td>
                    <td className="px-4 py-3 text-sm text-gray-500 dark:text-slate-300 max-w-[160px] truncate" title={customer.address}>{customer.address || "—"}</td>
                    <td className="px-4 py-3 text-sm text-gray-700 dark:text-slate-200">{customer.contactPerson || "—"}</td>
                    <td className="px-4 py-3 text-sm text-gray-500 dark:text-slate-300 font-mono">{(customer as any).phone || "—"}</td>
                    <td className="px-4 py-3 text-sm text-gray-500 dark:text-slate-300 max-w-[160px] truncate" title={customer.email}>{customer.email || "—"}</td>
                    <td className="px-4 py-3">
                      <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${
                        customer.isActive ? "bg-green-100 text-green-800" : "bg-red-100 text-red-800"
                      }`}>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-right text-sm font-medium">
                      <button onClick={() => openEditModal(customer)} className="text-blue-600 hover:text-blue-900 mr-4">Edit</button>
                      <button
                        onClick={() => handleToggleActive(customer)}
                        className={customer.isActive ? "text-orange-600 hover:text-orange-900 mr-4" : "text-green-600 hover:text-green-900 mr-4"}
                      >
                        {customer.isActive ? "Deactivate" : "Activate"}
                      </button>
                      <button
                        onClick={() => handleDelete(customer)}
                        className="text-red-600 hover:text-red-900"
                      >
                        Delete
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
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm overflow-y-auto h-full w-full z-50 flex items-center justify-center">
          <div className="relative bg-white dark:bg-slate-950 border border-gray-200 dark:border-slate-800 rounded-lg shadow-xl max-w-md w-full p-6">
            <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100 mb-4">
              {editingCustomer ? "Edit Customer" : "Add Customer"}
            </h3>
            
            {error && (
              <div className="mb-4 bg-red-50 border-l-4 border-red-500 p-4">
                <p className="text-sm text-red-700">{error}</p>
              </div>
            )}
            
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-slate-200 mb-1">
                  Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value.toUpperCase() })}
                  className="w-full border border-gray-300 dark:border-slate-700 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 sm:text-sm bg-white dark:bg-slate-950 text-gray-900 dark:text-slate-100"
                  placeholder="e.g. ABC Logistics"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-slate-200 mb-1">
                  Account Number
                </label>
                <input
                  type="text"
                  value={formData.accountNumber}
                  onChange={(e) => setFormData({ ...formData, accountNumber: e.target.value.toUpperCase() })}
                  className="w-full border border-gray-300 dark:border-slate-700 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 sm:text-sm bg-white dark:bg-slate-950 text-gray-900 dark:text-slate-100"
                  placeholder="e.g. A001"
                />
              </div>

              {/* Invoice Details Section */}
              <div className="pt-2 border-t border-gray-100">
                <h4 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-3">Invoice Details</h4>
                <div className="space-y-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-500 dark:text-slate-400 mb-1">VAT Number</label>
                    <input
                      type="text"
                      value={formData.vatNumber}
                      onChange={(e) => setFormData({ ...formData, vatNumber: e.target.value.toUpperCase() })}
                      className="w-full border border-gray-300 dark:border-slate-700 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 sm:text-sm bg-white dark:bg-slate-950 text-gray-900 dark:text-slate-100"
                      placeholder="e.g. 4700291823"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-500 dark:text-slate-400 mb-1">Postal Address</label>
                    <textarea
                      rows={2}
                      value={formData.address}
                      onChange={(e) => setFormData({ ...formData, address: e.target.value.toUpperCase() })}
                      className="w-full border border-gray-300 dark:border-slate-700 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 sm:text-sm bg-white dark:bg-slate-950 text-gray-900 dark:text-slate-100"
                      placeholder="e.g. 123 Industrial Rd, George, 6530"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-gray-500 dark:text-slate-400 mb-1">Contact Person</label>
                      <input
                        type="text"
                        value={formData.contactPerson}
                        onChange={(e) => setFormData({ ...formData, contactPerson: e.target.value.toUpperCase() })}
                        className="w-full border border-gray-300 dark:border-slate-700 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 sm:text-sm bg-white dark:bg-slate-950 text-gray-900 dark:text-slate-100"
                        placeholder="Name"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-500 dark:text-slate-400 mb-1">Phone</label>
                      <input
                        type="tel"
                        value={formData.phone}
                        onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                        className="w-full border border-gray-300 dark:border-slate-700 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 sm:text-sm bg-white dark:bg-slate-950 text-gray-900 dark:text-slate-100"
                        placeholder="e.g. 0729527049"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-500 dark:text-slate-400 mb-1">Email</label>
                    <input
                      type="email"
                      value={formData.email}
                      onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                      className="w-full border border-gray-300 dark:border-slate-700 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 sm:text-sm bg-white dark:bg-slate-950 text-gray-900 dark:text-slate-100"
                      placeholder="accounts@client.com"
                    />
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-slate-200 mb-1">
                  Note
                </label>
                <textarea
                  value={formData.note}
                  onChange={(e) => setFormData({ ...formData, note: e.target.value })}
                  rows={3}
                  className="w-full border border-gray-300 dark:border-slate-700 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 sm:text-sm bg-white dark:bg-slate-950 text-gray-900 dark:text-slate-100"
                  placeholder="Optional details..."
                />
              </div>

              <div className="mt-6 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-slate-200 bg-white dark:bg-slate-900 border border-gray-300 dark:border-slate-700 rounded-md hover:bg-gray-50 dark:hover:bg-slate-800"
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
