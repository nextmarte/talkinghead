"use client";

import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";

interface Invitation {
  id: string;
  token: string;
  email: string | null;
  role: string;
  expiresAt: Date;
  usedAt: Date | null;
  usedBy: string | null;
  createdAt: Date;
}

export default function InvitationManager() {
  const { data: session } = useSession();
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<"pending" | "used" | "all">("pending");
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newInvite, setNewInvite] = useState({ email: "", role: "USER", expiresInHours: 48 });
  const [invitationLink, setInvitationLink] = useState<string | null>(null);

  if (!session?.user || session.user.role !== "ADMIN") {
    return null;
  }


  const fetchInvitations = async () => {
    setIsLoading(true);
    try {
      const query = status !== "all" ? `?status=${status}` : "";
      const response = await fetch(`/api/admin/invitations${query}`);
      if (!response.ok) throw new Error("Erro ao buscar convites");
      const data = await response.json();
      setInvitations(data.invitations || []);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchInvitations();
  }, [status]);

  const handleCreateInvitation = async () => {
    setIsLoading(true);
    try {
      const response = await fetch("/api/admin/invitations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newInvite),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Erro ao criar convite");
      }

      const data = await response.json();
      setInvitationLink(data.invitationLink);
      setNewInvite({ email: "", role: "USER", expiresInHours: 48 });
      fetchInvitations();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleDeleteInvitation = async (id: string) => {
    if (!confirm("Tem certeza que deseja cancelar este convite?")) return;

    try {
      const response = await fetch(`/api/admin/invitations?id=${id}`, {
        method: "DELETE",
      });

      if (!response.ok) throw new Error("Erro ao deletar convite");
      fetchInvitations();
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const handleCopyLink = (link: string) => {
    navigator.clipboard.writeText(link);
    alert("Link copiado para a área de transferência!");
  };

  return (
    <div className="p-6 bg-slate-800/50 rounded-2xl border border-slate-700/50">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-lg font-semibold text-white">Gerenciar Convites</h2>
        <button
          onClick={() => setShowCreateForm(!showCreateForm)}
          className="px-4 py-2 bg-purple-500 hover:bg-purple-600 text-white rounded-lg transition"
        >
          + Novo Convite
        </button>
      </div>

      {/* Form de Criação */}
      {showCreateForm && (
        <div className="mb-6 p-4 bg-slate-900/50 rounded-lg border border-slate-700">
          <h3 className="text-sm font-medium text-white mb-4">Criar Novo Convite</h3>
          <div className="space-y-3">
            <input
              type="email"
              placeholder="Email (opcional)"
              value={newInvite.email}
              onChange={(e) => setNewInvite({ ...newInvite, email: e.target.value })}
              className="w-full px-3 py-2 bg-slate-800 border border-slate-600 rounded text-white text-sm"
            />
            <div className="grid grid-cols-2 gap-3">
              <select
                value={newInvite.role}
                onChange={(e) => setNewInvite({ ...newInvite, role: e.target.value })}
                className="px-3 py-2 bg-slate-800 border border-slate-600 rounded text-white text-sm"
              >
                <option value="USER">Usuário</option>
                <option value="ADMIN">Admin</option>
              </select>
              <input
                type="number"
                min="1"
                max="720"
                value={newInvite.expiresInHours}
                onChange={(e) =>
                  setNewInvite({
                    ...newInvite,
                    expiresInHours: parseInt(e.target.value) || 48,
                  })
                }
                className="px-3 py-2 bg-slate-800 border border-slate-600 rounded text-white text-sm"
                placeholder="Expira em (horas)"
              />
            </div>
            <div className="flex gap-2">
              <button
                onClick={handleCreateInvitation}
                disabled={isLoading}
                className="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-lg transition"
              >
                {isLoading ? "Criando..." : "Criar Convite"}
              </button>
              <button
                onClick={() => {
                  setShowCreateForm(false);
                  setInvitationLink(null);
                }}
                className="flex-1 px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg transition"
              >
                Cancelar
              </button>
            </div>

            {/* Link do convite criado */}
            {invitationLink && (
              <div className="mt-4 p-3 bg-green-500/20 border border-green-500/50 rounded-lg">
                <p className="text-sm text-green-400 mb-2">✓ Convite criado! Compartilhe este link:</p>
                <div className="flex gap-2">
                  <code className="flex-1 px-3 py-2 bg-slate-900 border border-slate-600 rounded text-xs text-slate-200 truncate">
                    {invitationLink}
                  </code>
                  <button
                    onClick={() => handleCopyLink(invitationLink)}
                    className="px-3 py-2 bg-green-600 hover:bg-green-700 text-white text-xs rounded transition"
                  >
                    Copiar
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {error && <div className="mb-4 p-3 bg-red-500/20 border border-red-500/50 rounded text-red-400 text-sm">{error}</div>}

      {/* Filtros */}
      <div className="flex gap-2 mb-6">
        {(["pending", "used", "all"] as const).map((s) => (
          <button
            key={s}
            onClick={() => setStatus(s)}
            className={`px-3 py-1 rounded text-sm transition ${
              status === s
                ? "bg-purple-600 text-white"
                : "bg-slate-700 text-slate-300 hover:text-white"
            }`}
          >
            {s === "pending" && "Pendentes"}
            {s === "used" && "Utilizados"}
            {s === "all" && "Todos"}
          </button>
        ))}
      </div>

      {/* Lista de Convites */}
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-slate-700">
              <th className="text-left py-3 px-4 text-slate-400 font-medium">Email</th>
              <th className="text-left py-3 px-4 text-slate-400 font-medium">Role</th>
              <th className="text-left py-3 px-4 text-slate-400 font-medium">Status</th>
              <th className="text-left py-3 px-4 text-slate-400 font-medium">Expira em</th>
              <th className="text-left py-3 px-4 text-slate-400 font-medium">Ações</th>
            </tr>
          </thead>
          <tbody>
            {invitations.map((inv) => (
              <tr key={inv.id} className="border-b border-slate-700/50 hover:bg-slate-700/30">
                <td className="py-3 px-4 text-white">{inv.email || "-"}</td>
                <td className="py-3 px-4">
                  <span
                    className={`px-2 py-1 rounded text-xs font-medium ${
                      inv.role === "ADMIN"
                        ? "bg-purple-500/20 text-purple-400"
                        : "bg-slate-600/50 text-slate-300"
                    }`}
                  >
                    {inv.role}
                  </span>
                </td>
                <td className="py-3 px-4">
                  <span
                    className={`px-2 py-1 rounded text-xs font-medium ${
                      inv.usedAt
                        ? "bg-green-500/20 text-green-400"
                        : "bg-blue-500/20 text-blue-400"
                    }`}
                  >
                    {inv.usedAt ? "Usado" : "Pendente"}
                  </span>
                </td>
                <td className="py-3 px-4 text-slate-400 text-sm">
                  {new Date(inv.expiresAt).toLocaleDateString("pt-BR")}
                </td>
                <td className="py-3 px-4">
                  {!inv.usedAt && (
                    <button
                      onClick={() => handleDeleteInvitation(inv.id)}
                      className="px-3 py-1 text-xs bg-red-500/20 text-red-400 hover:bg-red-500/30 rounded transition"
                    >
                      Cancelar
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {invitations.length === 0 && (
          <div className="text-center py-8 text-slate-400">
            Nenhum convite encontrado
          </div>
        )}
      </div>
    </div>
  );
}
