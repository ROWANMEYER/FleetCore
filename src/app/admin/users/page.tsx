"use client";

import { useMemo, useState } from "react";
import { useAction, useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { useAuth } from "@/src/components/auth/AuthProvider";
import { SkeletonPage } from "@/src/components/common/Skeleton";
import { ConfirmDialog } from "@/src/components/common/ConfirmDialog";
import { ModalShell } from "@/src/components/common/ModalShell";
import { useToast } from "@/src/components/common/Toast";
import {
  Users,
  Plus,
  Pencil,
  Trash2,
  KeyRound,
  Shield,
  MapPin,
  X,
} from "lucide-react";

type UserRow = {
  _id: Id<"users">;
  email: string;
  role: "admin" | "regional";
  region: "garden_route" | "eastern_cape" | null;
  signedIn: boolean;
};

type Region = "garden_route" | "eastern_cape";

const REGION_LABELS: Record<Region, string> = {
  garden_route: "Garden Route",
  eastern_cape: "Eastern Cape",
};

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function AdminUsersPage() {
  const { token, user: me } = useAuth();
  const { addToast } = useToast();

  const users = useQuery(api.users.listUsers, token ? { token } : "skip");
  const createUser = useAction(api.users.createUser);
  const updateUser = useAction(api.users.updateUser);
  const deleteUser = useMutation(api.users.deleteUser);

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<UserRow | null>(null);
  const [form, setForm] = useState({
    email: "",
    password: "",
    role: "regional" as "admin" | "regional",
    region: "garden_route" as Region,
  });
  const [saving, setSaving] = useState(false);

  const [resetting, setResetting] = useState<UserRow | null>(null);
  const [resetPw, setResetPw] = useState("");
  const [resettingBusy, setResettingBusy] = useState(false);

  const [deleting, setDeleting] = useState<UserRow | null>(null);
  const [deletingBusy, setDeletingBusy] = useState(false);

  const isAdmin = me?.role === "admin";
  const sorted = useMemo(() => users ?? [], [users]);

  // ── Admin-only guard (defense in depth — backend enforces too) ────────────
  if (!me || me.role !== "admin") {
    return (
      <div className="h-full overflow-y-auto">
        <div className="max-w-3xl mx-auto p-6">
          <div className="glass-card rounded-xl p-10 text-center">
            <div className="mx-auto w-14 h-14 rounded-full bg-[var(--card-bg)] border border-[var(--card-border)] flex items-center justify-center mb-4">
              <Shield size={24} className="text-[#06B6D4]" strokeWidth={2} />
            </div>
            <h2 className="text-lg font-semibold text-[var(--foreground)]">
              Admins only
            </h2>
            <p className="text-sm text-[var(--nav-text-color)] mt-2">
              User management is restricted to administrators.
            </p>
          </div>
        </div>
      </div>
    );
  }

  // ── Handlers ───────────────────────────────────────────────────────────────
  const openCreate = () => {
    setEditing(null);
    setForm({ email: "", password: "", role: "regional", region: "garden_route" });
    setModalOpen(true);
  };

  const openEdit = (u: UserRow) => {
    setEditing(u);
    setForm({
      email: u.email,
      password: "",
      role: u.role,
      region: u.region ?? "garden_route",
    });
    setModalOpen(true);
  };

  const handleSave = async () => {
    if (!token) return;
    const email = form.email.trim().toLowerCase();
    if (!emailPattern.test(email)) {
      addToast("Enter a valid email address", "error");
      return;
    }
    if (!editing && form.password.length < 6) {
      addToast("Password must be at least 6 characters", "error");
      return;
    }
    if (form.role === "regional" && !form.region) {
      addToast("A region is required for regional users", "error");
      return;
    }
    setSaving(true);
    try {
      if (editing) {
        const res = await updateUser({
          token,
          userId: editing._id,
          role: form.role,
          region: form.role === "regional" ? form.region : undefined,
        });
        if (!res.ok) throw new Error(res.error || "Failed to update user");
        addToast("User updated", "success");
      } else {
        const res = await createUser({
          token,
          email,
          password: form.password,
          role: form.role,
          region: form.role === "regional" ? form.region : undefined,
        });
        if (!res.ok) throw new Error(res.error || "Failed to create user");
        addToast("User created", "success");
      }
      setModalOpen(false);
    } catch (e) {
      addToast(e instanceof Error ? e.message : String(e), "error");
    } finally {
      setSaving(false);
    }
  };

  const handleResetPassword = async () => {
    if (!token || !resetting) return;
    if (resetPw.length < 6) {
      addToast("Password must be at least 6 characters", "error");
      return;
    }
    setResettingBusy(true);
    try {
      const res = await updateUser({ token, userId: resetting._id, newPassword: resetPw });
      if (!res.ok) throw new Error(res.error || "Failed to reset password");
      addToast(`Password reset for ${resetting.email}`, "success");
      setResetting(null);
      setResetPw("");
    } catch (e) {
      addToast(e instanceof Error ? e.message : String(e), "error");
    } finally {
      setResettingBusy(false);
    }
  };

  const handleDelete = async () => {
    if (!token || !deleting) return;
    setDeletingBusy(true);
    try {
      await deleteUser({ token, userId: deleting._id });
      addToast(`Deleted ${deleting.email}`, "success");
      setDeleting(null);
    } catch (e) {
      addToast(e instanceof Error ? e.message : String(e), "error");
    } finally {
      setDeletingBusy(false);
    }
  };

  if (!isAdmin) return null;
  if (users === undefined) return <SkeletonPage />;

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-3xl mx-auto p-4 sm:p-6 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center w-11 h-11 rounded-xl bg-gradient-to-br from-[#06B6D4] to-[#0891B2] shadow-md shadow-[rgba(6,182,212,0.3)]">
              <Users size={22} className="text-white" strokeWidth={2.5} />
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-[var(--foreground)]">
                Users
              </h1>
              <p className="text-sm text-[var(--nav-text-color)] mt-0.5">
                Manage who can sign in and which region they see
              </p>
            </div>
          </div>
          <button
            onClick={openCreate}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium bg-gradient-to-br from-[#06B6D4] to-[#0891B2] text-white hover:opacity-90 shadow-sm transition-all"
          >
            <Plus className="w-4 h-4" /> Add User
          </button>
        </div>

        {/* User list */}
        {sorted.length === 0 ? (
          <div className="text-center py-16 glass-card-premium rounded-xl border-dashed">
            <div className="text-4xl mb-3 opacity-30">👤</div>
            <p className="text-sm font-medium text-[var(--nav-text-color)]">
              No users yet
            </p>
            <p className="text-xs mt-1 text-[var(--nav-text-color)]">
              Click Add User to create the first one
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {sorted.map((u) => {
              const isSelf = me && u._id === me._id;
              const isLastAdmin =
                u.role === "admin" && sorted.filter((x) => x.role === "admin").length <= 1;
              return (
                <div
                  key={u._id}
                  className="glass-card-premium rounded-xl p-4 flex items-center gap-4"
                >
                  {/* Avatar */}
                  <div className="flex items-center justify-center w-11 h-11 rounded-full bg-[var(--card-bg)] border border-[var(--card-border)] shrink-0">
                    <span className="text-sm font-bold text-[#06B6D4]">
                      {u.email.slice(0, 2).toUpperCase()}
                    </span>
                  </div>

                  {/* Email + badges */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-semibold text-[var(--foreground)] truncate">
                        {u.email}
                      </span>
                      {isSelf && (
                        <span className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold bg-[var(--card-bg)] border border-[var(--card-border)] text-[var(--nav-text-color)]">
                          you
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                      <span
                        className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${
                          u.role === "admin"
                            ? "bg-gradient-to-br from-[#06B6D4] to-[#0891B2] text-white"
                            : "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300"
                        }`}
                      >
                        {u.role === "admin" ? "Admin" : "Regional"}
                      </span>
                      {u.region && (
                        <span className="inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-medium bg-[var(--card-bg)] border border-[var(--card-border)] text-[var(--nav-text-color)]">
                          <MapPin className="w-3 h-3" />
                          {REGION_LABELS[u.region]}
                        </span>
                      )}
                      <span
                        className={`inline-flex items-center gap-1.5 text-[11px] font-medium ${
                          u.signedIn
                            ? "text-emerald-600 dark:text-emerald-400"
                            : "text-[var(--nav-text-color)]"
                        }`}
                      >
                        <span
                          className={`w-1.5 h-1.5 rounded-full ${
                            u.signedIn ? "bg-emerald-500" : "bg-[var(--card-border)]"
                          }`}
                        />
                        {u.signedIn ? "Signed in" : "Signed out"}
                      </span>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      onClick={() => openEdit(u)}
                      title="Edit user"
                      aria-label={`Edit ${u.email}`}
                      className="p-2 rounded-lg text-[var(--nav-text-color)] hover:bg-[var(--card-bg)] hover:text-[var(--foreground)] transition-colors"
                    >
                      <Pencil className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => {
                        setResetting(u);
                        setResetPw("");
                      }}
                      title="Reset password"
                      aria-label={`Reset password for ${u.email}`}
                      className="p-2 rounded-lg text-[var(--nav-text-color)] hover:bg-[var(--card-bg)] hover:text-[#06B6D4] transition-colors"
                    >
                      <KeyRound className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => setDeleting(u)}
                      disabled={isSelf || isLastAdmin}
                      title={
                        isSelf
                          ? "You cannot delete your own account"
                          : isLastAdmin
                          ? "Cannot delete the last admin"
                          : "Delete user"
                      }
                      aria-label={`Delete ${u.email}`}
                      className="p-2 rounded-lg text-[var(--nav-text-color)] hover:bg-red-50 dark:hover:bg-red-950/30 hover:text-red-600 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Create / Edit modal */}
      <ModalShell open={modalOpen} onClose={() => setModalOpen(false)}>
        <div className="p-6">
          <div className="flex items-center justify-between mb-5">
            <h3 className="text-lg font-bold text-[var(--foreground)]">
              {editing ? "Edit User" : "Add User"}
            </h3>
            <button
              onClick={() => setModalOpen(false)}
              className="p-1 rounded hover:bg-[var(--card-bg)] text-[var(--nav-text-color)]"
              aria-label="Close"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="space-y-4">
            <div>
              <label className="text-xs font-semibold uppercase tracking-wider text-[var(--nav-text-color)] mb-2 block">
                Email
              </label>
              <input
                type="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                disabled={!!editing}
                placeholder="user@company.co.za"
                className="w-full h-10 px-3 rounded-lg text-sm bg-[var(--card-bg)] border border-[var(--card-border)] text-[var(--foreground)] placeholder-[var(--nav-text-color)] outline-none transition-all focus:border-[#06B6D4] focus:ring-2 focus:ring-[#06B6D4]/30 disabled:opacity-60"
              />
              {editing && (
                <p className="text-[11px] text-[var(--nav-text-color)] mt-1">
                  Email cannot be changed — delete and re-create if needed.
                </p>
              )}
            </div>

            {!editing && (
              <div>
                <label className="text-xs font-semibold uppercase tracking-wider text-[var(--nav-text-color)] mb-2 block">
                  Password
                </label>
                <input
                  type="password"
                  value={form.password}
                  onChange={(e) => setForm({ ...form, password: e.target.value })}
                  placeholder="At least 6 characters"
                  className="w-full h-10 px-3 rounded-lg text-sm bg-[var(--card-bg)] border border-[var(--card-border)] text-[var(--foreground)] placeholder-[var(--nav-text-color)] outline-none transition-all focus:border-[#06B6D4] focus:ring-2 focus:ring-[#06B6D4]/30"
                />
              </div>
            )}

            <div>
              <label className="text-xs font-semibold uppercase tracking-wider text-[var(--nav-text-color)] mb-2 block">
                Role
              </label>
              <div className="grid grid-cols-2 gap-2">
                {(["admin", "regional"] as const).map((r) => (
                  <button
                    key={r}
                    type="button"
                    onClick={() =>
                      setForm({
                        ...form,
                        role: r,
                        region: r === "regional" && !form.region ? "garden_route" : form.region,
                      })
                    }
                    disabled={editing?._id === me?._id && r !== "admin"}
                    className={`px-3 py-2 rounded-lg text-sm font-medium border transition-all ${
                      form.role === r
                        ? "bg-gradient-to-br from-[#06B6D4] to-[#0891B2] text-white border-transparent shadow-sm"
                        : "bg-[var(--card-bg)] text-[var(--nav-text-color)] border-[var(--card-border)] hover:border-[#06B6D4]/50"
                    } disabled:opacity-40 disabled:cursor-not-allowed`}
                  >
                    {r === "admin" ? "Admin" : "Regional"}
                  </button>
                ))}
              </div>
            </div>

            {form.role === "regional" && (
              <div>
                <label className="text-xs font-semibold uppercase tracking-wider text-[var(--nav-text-color)] mb-2 block">
                  Region
                </label>
                <select
                  value={form.region}
                  onChange={(e) =>
                    setForm({ ...form, region: e.target.value as Region })
                  }
                  className="w-full h-10 px-3 rounded-lg text-sm bg-[var(--card-bg)] border border-[var(--card-border)] text-[var(--foreground)] outline-none transition-all focus:border-[#06B6D4] focus:ring-2 focus:ring-[#06B6D4]/30"
                >
                  <option value="garden_route">Garden Route</option>
                  <option value="eastern_cape">Eastern Cape</option>
                </select>
              </div>
            )}
          </div>

          <div className="flex justify-end gap-3 mt-6">
            <button
              onClick={() => setModalOpen(false)}
              disabled={saving}
              className="px-4 py-2 text-sm font-medium text-[var(--foreground)] bg-[var(--card-bg)] border border-[var(--card-border)] hover:opacity-80 rounded-md transition-colors disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              className="px-4 py-2 text-sm font-medium text-white bg-gradient-to-br from-[#06B6D4] to-[#0891B2] hover:opacity-90 rounded-md shadow-sm transition-colors disabled:opacity-50"
            >
              {saving ? "Saving..." : editing ? "Save changes" : "Create user"}
            </button>
          </div>
        </div>
      </ModalShell>

      {/* Reset password modal */}
      <ModalShell open={resetting !== null} onClose={() => setResetting(null)}>
        <div className="p-6">
          <div className="flex items-center gap-2 mb-5">
            <KeyRound className="w-5 h-5 text-[#06B6D4]" />
            <h3 className="text-lg font-bold text-[var(--foreground)]">
              Reset password
            </h3>
          </div>
          <p className="text-sm text-[var(--nav-text-color)] mb-4">
            Set a new password for{" "}
            <span className="font-semibold text-[var(--foreground)]">
              {resetting?.email}
            </span>
            . They will need to sign in again.
          </p>
          <input
            type="password"
            value={resetPw}
            onChange={(e) => setResetPw(e.target.value)}
            placeholder="New password (min 6 characters)"
            className="w-full h-10 px-3 rounded-lg text-sm bg-[var(--card-bg)] border border-[var(--card-border)] text-[var(--foreground)] placeholder-[var(--nav-text-color)] outline-none transition-all focus:border-[#06B6D4] focus:ring-2 focus:ring-[#06B6D4]/30"
          />
          <div className="flex justify-end gap-3 mt-6">
            <button
              onClick={() => setResetting(null)}
              disabled={resettingBusy}
              className="px-4 py-2 text-sm font-medium text-[var(--foreground)] bg-[var(--card-bg)] border border-[var(--card-border)] hover:opacity-80 rounded-md transition-colors disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              onClick={handleResetPassword}
              disabled={resettingBusy || resetPw.length < 6}
              className="px-4 py-2 text-sm font-medium text-white bg-gradient-to-br from-[#06B6D4] to-[#0891B2] hover:opacity-90 rounded-md shadow-sm transition-colors disabled:opacity-50"
            >
              {resettingBusy ? "Resetting..." : "Reset password"}
            </button>
          </div>
        </div>
      </ModalShell>

      {/* Delete confirm */}
      <ConfirmDialog
        open={deleting !== null}
        title="Delete User"
        message={`Delete ${deleting?.email}? They will no longer be able to sign in. This cannot be undone.`}
        confirmLabel="Delete"
        variant="danger"
        loading={deletingBusy}
        onConfirm={handleDelete}
        onCancel={() => setDeleting(null)}
      />
    </div>
  );
}
