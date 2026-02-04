"use client";

import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import UserAgentAccessModal from "./UserAgentAccessModal";

interface User {
  id: string;
  name: string | null;
  email: string;
  role: string;
  createdAt: Date;
  _count: { conversations: number };
}

interface UserActionsProps {
  user: User;
  onActionComplete: () => void;
}

export default function UserActions({ user, onActionComplete }: UserActionsProps) {
  const { data: session } = useSession();
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resetPassword, setResetPassword] = useState("");
  const [showPasswordInput, setShowPasswordInput] = useState(false);
  const [showAgentAccessModal, setShowAgentAccessModal] = useState(false);

  if (!session?.user || session.user.role !== "ADMIN") {
    return null;
  }

  const handleResetPassword = async () => {
    if (!resetPassword.trim()) {
      setError("Senha não pode estar vazia");
      return;
    }

    setIsLoading(true);
    try {
      const response = await fetch(`/api/admin/users/${user.id}/reset-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ newPassword: resetPassword }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Erro ao resetar senha");
      }

      setResetPassword("");
      setShowPasswordInput(false);
      setError(null);
      onActionComplete();
      alert("Senha resetada com sucesso!");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleChangeRole = async () => {
    const newRole = user.role === "ADMIN" ? "USER" : "ADMIN";
    setIsLoading(true);

    try {
      const response = await fetch(`/api/admin/users/${user.id}/role`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role: newRole }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Erro ao alterar role");
      }

      onActionComplete();
      alert(`Usuário ${newRole === "ADMIN" ? "promovido a Admin" : "rebaixado a Usuário"}`);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="px-3 py-1 text-xs bg-slate-700 hover:bg-slate-600 rounded text-slate-200 transition"
      >
        Ações ▼
      </button>

      {isOpen && (
        <div className="absolute right-0 mt-2 w-48 bg-slate-900 border border-slate-700 rounded-lg shadow-lg z-50">
          {showPasswordInput ? (
            <div className="p-3 border-b border-slate-700">
              <input
                type="password"
                value={resetPassword}
                onChange={(e) => setResetPassword(e.target.value)}
                placeholder="Nova senha"
                className="w-full px-2 py-1 mb-2 bg-slate-800 border border-slate-600 rounded text-white text-sm"
                disabled={isLoading}
              />
              <div className="flex gap-2">
                <button
                  onClick={handleResetPassword}
                  disabled={isLoading}
                  className="flex-1 px-2 py-1 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 rounded text-xs text-white transition"
                >
                  {isLoading ? "..." : "Confirmar"}
                </button>
                <button
                  onClick={() => {
                    setShowPasswordInput(false);
                    setResetPassword("");
                    setError(null);
                  }}
                  className="flex-1 px-2 py-1 bg-slate-700 hover:bg-slate-600 rounded text-xs text-white transition"
                >
                  Cancelar
                </button>
              </div>
              {error && <p className="text-red-400 text-xs mt-2">{error}</p>}
            </div>
          ) : (
            <>
              <button
                onClick={() => setShowPasswordInput(true)}
                className="w-full text-left px-4 py-2 text-sm text-slate-300 hover:bg-slate-800 transition"
              >
                🔑 Resetar Senha
              </button>
              <button
                onClick={() => {
                  setShowAgentAccessModal(true);
                  setIsOpen(false);
                }}
                className="w-full text-left px-4 py-2 text-sm text-slate-300 hover:bg-slate-800 transition"
              >
                🤖 Gerenciar Agentes
              </button>
              <button
                onClick={handleChangeRole}
                disabled={isLoading}
                className="w-full text-left px-4 py-2 text-sm text-slate-300 hover:bg-slate-800 disabled:opacity-50 transition"
              >
                👤 {user.role === "ADMIN" ? "Rebaixar a Usuário" : "Promover a Admin"}
              </button>
              <button
                onClick={() => setIsOpen(false)}
                className="w-full text-left px-4 py-2 text-sm text-slate-400 hover:bg-slate-800 border-t border-slate-700 transition"
              >
                Fechar
              </button>
            </>
          )}
        </div>
      )}

      {/* Modal de acesso a agentes */}
      {showAgentAccessModal && (
        <UserAgentAccessModal
          userId={user.id}
          onClose={() => setShowAgentAccessModal(false)}
        />
      )}
    </div>
  );
}
