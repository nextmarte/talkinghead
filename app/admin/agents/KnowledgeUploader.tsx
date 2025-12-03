"use client";

import { useState, useRef } from "react";

interface Document {
  id: string;
  fileName: string;
  fileSize: number;
  status: string;
  createdAt: Date;
}

interface KnowledgeUploaderProps {
  agentId: string;
  documents: Document[];
  onUpdate: () => void;
}

export default function KnowledgeUploader({
  agentId,
  documents: initialDocuments,
  onUpdate,
}: KnowledgeUploaderProps) {
  const [documents, setDocuments] = useState(initialDocuments);
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "COMPLETED":
        return "bg-green-500/20 text-green-400";
      case "PROCESSING":
        return "bg-yellow-500/20 text-yellow-400 animate-pulse";
      case "FAILED":
        return "bg-red-500/20 text-red-400";
      default:
        return "bg-slate-500/20 text-slate-400";
    }
  };

  const getStatusText = (status: string) => {
    switch (status) {
      case "COMPLETED":
        return "✓ Vetorizado";
      case "PROCESSING":
        return "⏳ Processando...";
      case "FAILED":
        return "✗ Erro";
      default:
        return "⏸ Pendente";
    }
  };

  const handleUpload = async (files: FileList) => {
    setUploading(true);

    for (const file of Array.from(files)) {
      const formData = new FormData();
      formData.append("file", file);

      try {
        const res = await fetch(`/api/agents/${agentId}/knowledge`, {
          method: "POST",
          body: formData,
        });

        if (res.ok) {
          const doc = await res.json();
          setDocuments((prev) => [doc, ...prev]);
        } else {
          const data = await res.json();
          alert(`Erro ao enviar ${file.name}: ${data.error}`);
        }
      } catch (err) {
        console.error("Erro ao fazer upload:", err);
        alert(`Erro ao enviar ${file.name}`);
      }
    }

    setUploading(false);
    onUpdate();
  };

  const handleDelete = async (docId: string) => {
    if (!confirm("Tem certeza que deseja remover este documento?")) return;

    try {
      const res = await fetch(`/api/agents/${agentId}/knowledge/${docId}`, {
        method: "DELETE",
      });

      if (res.ok) {
        setDocuments((prev) => prev.filter((d) => d.id !== docId));
        onUpdate();
      }
    } catch (err) {
      console.error("Erro ao deletar documento:", err);
    }
  };

  const handleProcess = async (doc: Document) => {
    // Atualiza status local para PROCESSING
    setDocuments((prev) =>
      prev.map((d) => (d.id === doc.id ? { ...d, status: "PROCESSING" } : d))
    );

    try {
      const res = await fetch(`/api/agents/${agentId}/knowledge/${doc.id}/process`, {
        method: "POST",
      });

      if (res.ok) {
        // Polling para verificar status
        const pollStatus = async () => {
          const statusRes = await fetch(`/api/agents/${agentId}/knowledge`);
          if (statusRes.ok) {
            const docs = await statusRes.json();
            setDocuments(docs);
            const updatedDoc = docs.find((d: Document) => d.id === doc.id);
            if (updatedDoc && updatedDoc.status === "PROCESSING") {
              setTimeout(pollStatus, 2000);
            } else {
              onUpdate();
            }
          }
        };
        setTimeout(pollStatus, 2000);
      } else {
        const data = await res.json();
        alert(`Erro ao processar: ${data.error}`);
        setDocuments((prev) =>
          prev.map((d) => (d.id === doc.id ? { ...d, status: "FAILED" } : d))
        );
      }
    } catch (err) {
      console.error("Erro ao processar documento:", err);
      setDocuments((prev) =>
        prev.map((d) => (d.id === doc.id ? { ...d, status: "FAILED" } : d))
      );
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    if (e.dataTransfer.files.length > 0) {
      handleUpload(e.dataTransfer.files);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h4 className="font-medium text-white">Base de Conhecimento</h4>
        <span className="text-sm text-slate-400">
          {documents.length} documento(s)
        </span>
      </div>

      {/* Upload Area */}
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        className={`border-2 border-dashed rounded-xl p-6 text-center transition ${
          dragOver
            ? "border-purple-500 bg-purple-500/10"
            : "border-slate-600 hover:border-slate-500"
        }`}
      >
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept=".pdf,.txt,.docx,.doc,.md,.json"
          onChange={(e) => e.target.files && handleUpload(e.target.files)}
          className="hidden"
        />
        
        {uploading ? (
          <div className="flex items-center justify-center gap-2 text-purple-400">
            <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
            </svg>
            Enviando...
          </div>
        ) : (
          <>
            <svg
              className="w-10 h-10 text-slate-500 mx-auto mb-3"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
              />
            </svg>
            <p className="text-slate-400 mb-2">
              Arraste arquivos aqui ou{" "}
              <button
                onClick={() => fileInputRef.current?.click()}
                className="text-purple-400 hover:text-purple-300 underline"
              >
                clique para selecionar
              </button>
            </p>
            <p className="text-xs text-slate-500">
              Suportado: PDF, TXT, DOCX, MD, JSON (máx. 50MB)
            </p>
          </>
        )}
      </div>

      {/* Documents List */}
      {documents.length > 0 && (
        <div className="space-y-2">
          {documents.map((doc) => (
            <div
              key={doc.id}
              className="flex items-center justify-between p-3 bg-slate-800/50 rounded-lg"
            >
              <div className="flex items-center gap-3 min-w-0">
                <svg
                  className="w-5 h-5 text-slate-400 flex-shrink-0"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                  />
                </svg>
                <div className="min-w-0">
                  <p className="text-sm text-white truncate">{doc.fileName}</p>
                  <p className="text-xs text-slate-500">{formatSize(doc.fileSize)}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span
                  className={`px-2 py-1 rounded text-xs font-medium ${getStatusColor(
                    doc.status
                  )}`}
                >
                  {getStatusText(doc.status)}
                </span>
                {(doc.status === "PENDING" || doc.status === "FAILED") && (
                  <button
                    onClick={() => handleProcess(doc)}
                    className="p-1 text-purple-400 hover:text-purple-300 transition"
                    title="Processar documento"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  </button>
                )}
                <button
                  onClick={() => handleDelete(doc.id)}
                  className="p-1 text-slate-400 hover:text-red-400 transition"
                  title="Remover"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                    />
                  </svg>
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
