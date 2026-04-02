"use client";

import { useState, useRef, useCallback, useEffect } from "react";

type Placement = { dishIndex: number; x: number; y: number };

const DEFAULT_POSITIONS: Record<number, { x: number; y: number }[]> = {
  1: [{ x: 50, y: 50 }],
  2: [{ x: 35, y: 50 }, { x: 65, y: 50 }],
  3: [{ x: 50, y: 35 }, { x: 35, y: 62 }, { x: 65, y: 62 }],
  4: [{ x: 35, y: 37 }, { x: 65, y: 37 }, { x: 35, y: 63 }, { x: 65, y: 63 }],
  5: [{ x: 35, y: 37 }, { x: 65, y: 37 }, { x: 50, y: 52 }, { x: 35, y: 67 }, { x: 65, y: 67 }],
  6: [{ x: 28, y: 37 }, { x: 50, y: 37 }, { x: 72, y: 37 }, { x: 28, y: 63 }, { x: 50, y: 63 }, { x: 72, y: 63 }],
};

type TableId = "table" | "table2" | "table3" | "table4" | "table5" | "table6" | "table7";

// Explicit output dimensions per template (w x h). Tables not listed use natural image dimensions.
const TABLE_OUTPUT_DIMS: Partial<Record<TableId, { w: number; h: number }>> = {
  table6: { w: 1920, h: 1080 }, // Charcoal — 16:9
};

export default function Home() {
  const [files, setFiles] = useState<File[]>([]);
  const [previews, setPreviews] = useState<string[]>([]);
  const [result, setResult] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedTable, setSelectedTable] = useState<TableId>("table");
  const [placements, setPlacements] = useState<Placement[]>([]);
  const [dragging, setDragging] = useState<number | null>(null);
  const dragOffset = useRef({ x: 0, y: 0 });
  const canvasRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const tables: { id: TableId; label: string; src: string }[] = [
    { id: "table", label: "Dark Wood", src: "/table.jpg" },
    { id: "table2", label: "Walnut Bistro", src: "/table2.jpg" },
    { id: "table3", label: "Mediterranean", src: "/table3.jpg" },
    { id: "table4", label: "Oak & Coral", src: "/table4.jpg" },
    { id: "table5", label: "Marble Round", src: "/table5.jpg" },
    { id: "table6", label: "Charcoal", src: "/table6.jpg" },
    { id: "table7", label: "Pine & Leather", src: "/table7.jpg" },
  ];

  const currentTableSrc = `/${selectedTable}.jpg`;

  function initPlacements(count: number) {
    const positions = DEFAULT_POSITIONS[count] ?? DEFAULT_POSITIONS[6];
    setPlacements(positions.slice(0, count).map((pos, i) => ({ dishIndex: i, ...pos })));
  }

  function handleFiles(e: React.ChangeEvent<HTMLInputElement>) {
    const selected = Array.from(e.target.files || []).slice(0, 6);
    setFiles(selected);
    setPreviews(selected.map((f) => URL.createObjectURL(f)));
    setResult(null);
    setError(null);
    initPlacements(selected.length);
  }

  function removeFile(index: number) {
    const newFiles = files.filter((_, i) => i !== index);
    const newPreviews = previews.filter((_, i) => i !== index);
    setFiles(newFiles);
    setPreviews(newPreviews);
    initPlacements(newFiles.length);
  }

  function fitToAspectRatio(blobUrl: string, targetSrc: string, tableId: TableId): Promise<string> {
    return new Promise((resolve) => {
      const tableImg = new window.Image();
      tableImg.onload = () => {
        const resultImg = new window.Image();
        resultImg.onload = () => {
          const dims = TABLE_OUTPUT_DIMS[tableId];
          const tw = dims ? dims.w : tableImg.naturalWidth;
          const th = dims ? dims.h : tableImg.naturalHeight;
          const rw = resultImg.naturalWidth;
          const rh = resultImg.naturalHeight;
          const targetRatio = tw / th;
          const srcRatio = rw / rh;
          // contain: scale result to fit inside target dimensions without cropping
          let dw: number, dh: number;
          if (srcRatio > targetRatio) {
            dw = tw;
            dh = tw / srcRatio;
          } else {
            dh = th;
            dw = th * srcRatio;
          }
          const dx = (tw - dw) / 2;
          const dy = (th - dh) / 2;
          const canvas = document.createElement("canvas");
          canvas.width = tw;
          canvas.height = th;
          const ctx = canvas.getContext("2d")!;
          ctx.fillStyle = "#000";
          ctx.fillRect(0, 0, tw, th);
          ctx.drawImage(resultImg, 0, 0, rw, rh, dx, dy, dw, dh);
          resolve(canvas.toDataURL("image/jpeg", 0.92));
        };
        resultImg.src = blobUrl;
      };
      tableImg.src = targetSrc;
    });
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
        resolve(canvas.toDataURL("image/jpeg", 0.6).split(",")[1]);
      };
      img.src = URL.createObjectURL(file);
    });
  }

  function onDishMouseDown(e: React.MouseEvent, index: number) {
    e.preventDefault();
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const currentX = (placements[index].x / 100) * rect.width;
    const currentY = (placements[index].y / 100) * rect.height;
    dragOffset.current = {
      x: e.clientX - rect.left - currentX,
      y: e.clientY - rect.top - currentY,
    };
    setDragging(index);
  }

  const onMouseMove = useCallback((e: MouseEvent) => {
    if (dragging === null) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const x = Math.min(100, Math.max(0, ((e.clientX - rect.left - dragOffset.current.x) / rect.width) * 100));
    const y = Math.min(100, Math.max(0, ((e.clientY - rect.top - dragOffset.current.y) / rect.height) * 100));
    setPlacements((prev) => prev.map((p, i) => (i === dragging ? { ...p, x, y } : p)));
  }, [dragging]);

  const onMouseUp = useCallback(() => setDragging(null), []);

  useEffect(() => {
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
    return () => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    };
  }, [onMouseMove, onMouseUp]);

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
        body: JSON.stringify({ dishes, table: selectedTable, placements }),
      });

      if (!resp.ok) {
        const data = await resp.json();
        throw new Error(data.error || "Generation failed");
      }

      const blob = await resp.blob();
      const rawUrl = URL.createObjectURL(blob);
      const cropped = await fitToAspectRatio(rawUrl, currentTableSrc, selectedTable);
      setResult(cropped);
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
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Left: Upload + placement canvas */}
          <div>
            <div
              onClick={() => inputRef.current?.click()}
              className="border-2 border-dashed border-zinc-700 rounded-xl p-8 text-center cursor-pointer hover:border-zinc-500 transition-colors"
            >
              <input ref={inputRef} type="file" accept="image/*" multiple onChange={handleFiles} className="hidden" />
              <div className="text-zinc-400">
                <svg className="w-10 h-10 mx-auto mb-3 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 4v16m8-8H4" />
                </svg>
                <p className="text-sm">Click to upload dish images (up to 6)</p>
              </div>
            </div>

            {/* Placement canvas */}
            {previews.length > 0 && (
              <div className="mt-4">
                <p className="text-xs text-zinc-500 mb-2">Drag dishes to reposition</p>
                <div
                  ref={canvasRef}
                  className="relative w-full select-none"
                  style={{ cursor: dragging !== null ? "grabbing" : "default" }}
                >
                  <img
                    src={currentTableSrc}
                    alt="Table"
                    className="w-full block rounded-xl"
                    draggable={false}
                  />
                  {placements.map((p, i) => (
                    <div
                      key={i}
                      className="absolute"
                      style={{
                        left: `${p.x}%`,
                        top: `${p.y}%`,
                        transform: "translate(-50%, -50%)",
                        cursor: dragging === i ? "grabbing" : "grab",
                        zIndex: dragging === i ? 10 : 1,
                      }}
                      onMouseDown={(e) => onDishMouseDown(e, i)}
                    >
                      <img
                        src={previews[p.dishIndex]}
                        alt={`Dish ${i + 1}`}
                        className="w-14 h-14 object-cover rounded-full border-2 border-white shadow-lg"
                        draggable={false}
                      />
                      <div className="absolute -bottom-1 -right-1 w-4 h-4 bg-zinc-900 rounded-full flex items-center justify-center text-[9px] font-bold border border-zinc-600">
                        {i + 1}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <button
              onClick={generate}
              disabled={!files.length || loading}
              className="mt-6 w-full bg-white text-black font-semibold py-3 rounded-lg hover:bg-zinc-200 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              {loading ? "Generating..." : "Place Dishes on Table"}
            </button>

            {error && <p className="mt-3 text-red-400 text-sm">{error}</p>}
          </div>

          {/* Right: Result */}
          <div>
            {loading && (
              <div className="border border-zinc-800 rounded-xl h-96 flex items-center justify-center">
                <div className="text-center">
                  <div className="w-8 h-8 border-2 border-white border-t-transparent rounded-full animate-spin mx-auto mb-3" />
                  <p className="text-zinc-400 text-sm">Placing dishes on table — this may take up to a minute...</p>
                </div>
              </div>
            )}

            {result && !loading && (
              <div>
                <img src={result} alt="Result" className="w-full rounded-xl" />
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
