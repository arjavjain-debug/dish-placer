"use client";

import { useState, useRef } from "react";

export default function Home() {
  const [files, setFiles] = useState<File[]>([]);
  const [previews, setPreviews] = useState<string[]>([]);
  const [result, setResult] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

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

  async function generate() {
    if (!files.length) return;
    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const dishes = await Promise.all(files.map((f) => compressImage(f)));

      const resp = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dishes }),
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
              disabled={!files.length || loading}
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
