"use client";

import { useState, useRef } from "react";

export default function Home() {
  const [files, setFiles] = useState<File[]>([]);
  const [previews, setPreviews] = useState<string[]>([]);
  const [result, setResult] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedTable, setSelectedTable] = useState<"table" | "table2" | "custom">("table");
  const [customTableB64, setCustomTableB64] = useState<string | null>(null);
  const [customTablePreview, setCustomTablePreview] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const tableInputRef = useRef<HTMLInputElement>(null);

  const tables = [
    { id: "table" as const, label: "Dark Wood", src: "/table.jpg" },
    { id: "table2" as const, label: "Walnut Bistro", src: "/table2.jpg" },
  ];

  function handleFiles(e: React.ChangeEvent<HTMLInputElement>) {
    const selected = Array.from(e.target.files || []).slice(0, 6);
    setFiles(selected);
    setPreviews(selected.map((f) => URL.createObjectURL(f)));
    setResult(null);
    setError(null);
  }

  function removeFile(index: number) {
    const newFiles = files.filter((_, i) => i !== index);
    const newPreviews = previews.filter((_, i) => i !== index);
    setFiles(newFiles);
    setPreviews(newPreviews);
  }

  function compressImage(file: File, maxSize = 800): Promise<string> {
    return new Promise((resolve) => {
      const img = new window.Image();
      img.onload = () => {
        const canvas = document.createElement("canvas");
        const ratio = Math.min(maxSize / img.width, maxSize / img.height, 1);
        canvas.width = img.width * ratio;
        canvas.height = img.height * ratio;
        const ctx = canvas.getContext("2d")!;
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        const dataUrl = canvas.toDataURL("image/jpeg", 0.6);
        resolve(dataUrl.split(",")[1]);
      };
      img.src = URL.createObjectURL(file);
    });
  }

  async function handleCustomTable(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setCustomTablePreview(URL.createObjectURL(file));
    const b64 = await compressImage(file, 1500);
    setCustomTableB64(b64);
    setSelectedTable("custom");
    setResult(null);
    setError(null);
  }

  async function generate() {
    if (!files.length) return;
    if (selectedTable === "custom" && !customTableB64) return;
    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const dishes = await Promise.all(files.map((f) => compressImage(f)));

      const resp = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          dishes,
          table: selectedTable,
          customTable: selectedTable === "custom" ? customTableB64 : undefined,
        }),
      });

      if (!resp.ok) {
        const data = await resp.json();
        throw new Error(data.error || "Generation failed");
      }

      const blob = await resp.blob();
      setResult(URL.createObjectURL(blob));
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  function download() {
    if (!result) return;
    const a = document.createElement("a");
    a.href = result;
    a.download = "dish-placer-output.png";
    a.click();
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-white">
      <div className="max-w-5xl mx-auto px-6 py-12">
        <div className="mb-10">
          <h1 className="text-3xl font-bold tracking-tight">Dish Placer</h1>
          <p className="text-zinc-400 mt-2">
            Upload photos of dishes and they&apos;ll be placed on the table automatically.
          </p>
        </div>

        {/* Table selector */}
        <div className="mb-8">
          <p className="text-sm text-zinc-400 mb-3">Choose a table</p>
          <div className="flex gap-3 flex-wrap">
            {tables.map((t) => (
              <button
                key={t.id}
                onClick={() => setSelectedTable(t.id)}
                className={`relative rounded-xl overflow-hidden border-2 transition-colors w-32 h-20 flex-shrink-0 ${
                  selectedTable === t.id ? "border-white" : "border-zinc-700 hover:border-zinc-500"
                }`}
              >
                <img src={t.src} alt={t.label} className="w-full h-full object-cover" />
                <div className="absolute inset-0 bg-black/30 flex items-end p-1.5">
                  <span className="text-xs font-medium text-white leading-none">{t.label}</span>
                </div>
                {selectedTable === t.id && (
                  <div className="absolute top-1.5 right-1.5 w-4 h-4 bg-white rounded-full flex items-center justify-center">
                    <svg className="w-2.5 h-2.5 text-black" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                    </svg>
                  </div>
                )}
              </button>
            ))}

            {/* Upload custom table */}
            <input
              ref={tableInputRef}
              type="file"
              accept="image/*"
              onChange={handleCustomTable}
              className="hidden"
            />
            <button
              onClick={() => tableInputRef.current?.click()}
              className={`relative rounded-xl overflow-hidden border-2 transition-colors w-32 h-20 flex-shrink-0 ${
                selectedTable === "custom" && customTablePreview
                  ? "border-white"
                  : "border-zinc-700 hover:border-zinc-500"
              }`}
            >
              {customTablePreview ? (
                <>
                  <img src={customTablePreview} alt="Custom table" className="w-full h-full object-cover" />
                  <div className="absolute inset-0 bg-black/30 flex items-end p-1.5">
                    <span className="text-xs font-medium text-white leading-none">My Table</span>
                  </div>
                  {selectedTable === "custom" && (
                    <div className="absolute top-1.5 right-1.5 w-4 h-4 bg-white rounded-full flex items-center justify-center">
                      <svg className="w-2.5 h-2.5 text-black" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                      </svg>
                    </div>
                  )}
                </>
              ) : (
                <div className="w-full h-full flex flex-col items-center justify-center gap-1 text-zinc-500">
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 4v16m8-8H4" />
                  </svg>
                  <span className="text-xs">Upload yours</span>
                </div>
              )}
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Left: Upload */}
          <div>
            <div
              onClick={() => inputRef.current?.click()}
              className="border-2 border-dashed border-zinc-700 rounded-xl p-8 text-center cursor-pointer hover:border-zinc-500 transition-colors"
            >
              <input
                ref={inputRef}
                type="file"
                accept="image/*"
                multiple
                onChange={handleFiles}
                className="hidden"
              />
              <div className="text-zinc-400">
                <svg className="w-10 h-10 mx-auto mb-3 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 4v16m8-8H4" />
                </svg>
                <p className="text-sm">Click to upload dish images (up to 6)</p>
              </div>
            </div>

            {previews.length > 0 && (
              <div className="mt-4 grid grid-cols-3 gap-3">
                {previews.map((src, i) => (
                  <div key={i} className="relative group">
                    <img
                      src={src}
                      alt={`Dish ${i + 1}`}
                      className="w-full aspect-square object-cover rounded-lg"
                    />
                    <button
                      onClick={() => removeFile(i)}
                      className="absolute top-1 right-1 bg-black/70 rounded-full w-6 h-6 flex items-center justify-center text-xs opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      x
                    </button>
                  </div>
                ))}
              </div>
            )}

            <button
              onClick={generate}
              disabled={!files.length || loading || (selectedTable === "custom" && !customTableB64)}
              className="mt-6 w-full bg-white text-black font-semibold py-3 rounded-lg hover:bg-zinc-200 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              {loading ? "Generating..." : "Place Dishes on Table"}
            </button>

            {error && (
              <p className="mt-3 text-red-400 text-sm">{error}</p>
            )}
          </div>

          {/* Right: Result */}
          <div>
            {loading && (
              <div className="border border-zinc-800 rounded-xl h-96 flex items-center justify-center">
                <div className="text-center">
                  <div className="w-8 h-8 border-2 border-white border-t-transparent rounded-full animate-spin mx-auto mb-3" />
                  <p className="text-zinc-400 text-sm">Placing dishes on table...</p>
                </div>
              </div>
            )}

            {result && !loading && (
              <div>
                <img
                  src={result}
                  alt="Result"
                  className="w-full rounded-xl"
                />
                <button
                  onClick={download}
                  className="mt-4 w-full border border-zinc-700 py-2.5 rounded-lg text-sm hover:bg-zinc-800 transition-colors"
                >
                  Download Image
                </button>
              </div>
            )}

            {!result && !loading && (
              <div className="border border-zinc-800 rounded-xl h-96 flex items-center justify-center">
                <p className="text-zinc-600 text-sm">Result will appear here</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
