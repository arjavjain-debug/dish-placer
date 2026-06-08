import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import sharp from "sharp";

// The model outputs ~1024px regardless of input resolution, so shrinking inputs
// to 1024px is the single biggest speed win (the baked table is 4284x5712).
async function shrink(buf: Buffer): Promise<Buffer> {
  return sharp(buf)
    .resize(1024, 1024, { fit: "inside", withoutEnlargement: true })
    .jpeg({ quality: 85 })
    .toBuffer();
}

const API_KEY = process.env.OPENAI_API_KEY!;
// gpt-image-1.5 supports input_fidelity:high, which keeps the table's exact
// appearance and camera angle (gpt-image-2 lacks it and re-renders the table).
const MODEL = "gpt-image-1.5";
// "low" effort + high fidelity completes in ~25-45s, under Vercel Hobby's 60s cap.
const QUALITY = "low";

export const maxDuration = 60;

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

function withCors(res: NextResponse) {
  for (const [k, v] of Object.entries(CORS_HEADERS)) res.headers.set(k, v);
  return res;
}

// Pick the closest supported output size to the table's aspect ratio; the
// client crops the result to exact dimensions afterward.
function pickSize(dims: { w: number; h: number } | null): string {
  if (!dims) return "auto";
  const ratio = dims.w / dims.h;
  if (ratio > 1.2) return "1536x1024"; // landscape
  if (ratio < 0.83) return "1024x1536"; // portrait
  return "1024x1024"; // square-ish
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const dishes: string[] = body.dishes || [];
    const tableId: string = body.table || "table";
    const placements: { dishIndex: number; x: number; y: number }[] = body.placements || [];
    const outputDims: { w: number; h: number } | null = body.outputDims ?? null;

    if (!dishes.length) {
      return withCors(NextResponse.json({ error: "No dish images uploaded" }, { status: 400 }));
    }

    const allowedTables: Record<string, string> = {
      table: "table.jpg",
      table2: "table2.jpg",
      table3: "table3.jpg",
      table4: "table4.jpg",
      table5: "table5.jpg",
      table6: "table6.jpg",
    };
    const tableFile = allowedTables[tableId] ?? "table.jpg";
    const tablePath = path.join(process.cwd(), "public", tableFile);
    const tableBuffer = fs.readFileSync(tablePath);

    const n = dishes.length;
    const dishRefs = Array.from({ length: n }, (_, i) => `Image ${i + 1}`).join(", ");

    // Build layout instruction from placements (user-defined positions) or fall back to defaults
    let layout: string;
    if (placements.length === n) {
      const positionLines = placements
        .map((p) => `  - Image ${p.dishIndex + 1}: place at ${Math.round(p.x)}% from the left edge and ${Math.round(p.y)}% from the top edge of the table image`)
        .join("\n");
      layout = `Place each dish at the positions specified below (as % of the full table image dimensions):\n${positionLines}\nTreat these as target positions, but keeping every dish FULLY on the table surface always takes priority — if a target would push a dish off the table edge or onto a chair, floor, or other surface, move it inward and/or shrink it so the entire plate rests on the table.`;
    } else {
      const layoutInstructions: Record<number, string> = {
        1: "Place the single dish dead-center on the open surface between the two place settings.",
        2: "Place the 2 dishes side-by-side horizontally in the center of the open surface, evenly spaced.",
        3: "Arrange the 3 dishes in a triangle: one near the top-center, two below side-by-side.",
        4: "Arrange the 4 dishes in a 2×2 grid in the center of the open zone.",
        5: "Arrange the 5 dishes like a quincunx: 2 on top, 1 center, 2 on bottom.",
        6: "Arrange the 6 dishes in a 2-row grid: 3 on top, 3 on bottom.",
      };
      layout = layoutInstructions[n] ?? layoutInstructions[6];
    }

    const prompt = `You are given ${n + 1} images. The FIRST ${n} (${dishRefs}) are dish reference photos. The LAST image is the actual table photo that must be edited.

From each dish reference photo, extract only the main plate/bowl of food — ignore backgrounds, hands, other items.

Edit the LAST image (the table photo) by placing all ${n} extracted ${n === 1 ? "dish" : "dishes"} onto the empty surface of the table. Do not modify anything already in the table photo.

${layout}

Rules:
- The table photo must remain PIXEL-FOR-PIXEL identical except for the newly added dishes. Treat it as a fixed background you are compositing onto.
- Keep the EXACT same camera angle, perspective, framing, field of view, zoom level, lighting, and composition as the original table photo. Do NOT rotate, tilt, zoom, pan, or re-render the table or its viewpoint in any way.
- Do NOT move, resize, recolor, or regenerate any object already on the table (existing bowls, cups, napkins, chopsticks, placemats) — leave them exactly where and how they are.
- Every chair, floor, wall, and surrounding detail visible in the original must remain in the exact same position in the output.
- CRITICAL: every added dish must sit ENTIRELY on the table's surface. No part of any plate may overhang the table edge or rest on a chair, floor, runner gap, or any non-table surface. If the table is narrow, place the dishes closer together along its center and make them smaller so they all fit within the table surface.
- Size each dish so it fits comfortably on the table with margin to the edges; never let a plate touch or cross a table edge.
- Every dish fully visible, no cropping at edges.
- Match the top-down overhead angle of the table photo.
- Realistic plate sizes relative to existing items on the table.
- Soft shadow under each dish.
- Do not alter the table photo in any other way.

Return only the final edited table photo.`;

    // Build multipart form for the OpenAI image edits endpoint.
    // Dish references first, table photo last (matches the prompt ordering).
    const form = new FormData();
    form.append("model", MODEL);
    form.append("prompt", prompt);
    form.append("size", pickSize(outputDims));
    form.append("quality", QUALITY);
    // Preserve the table's exact look and camera angle — only paint in the new dishes.
    form.append("input_fidelity", "high");

    // Shrink every input to 1024px before upload — big speed gain, no output-quality loss.
    const dishBufs = await Promise.all(dishes.map((b64) => shrink(Buffer.from(b64, "base64"))));
    const tableSmall = await shrink(tableBuffer);
    dishBufs.forEach((buf, i) => {
      form.append("image[]", new Blob([new Uint8Array(buf)], { type: "image/jpeg" }), `dish${i + 1}.jpg`);
    });
    form.append("image[]", new Blob([new Uint8Array(tableSmall)], { type: "image/jpeg" }), "table.jpg");

    let resp: Response | null = null;
    for (let attempt = 1; attempt <= 3; attempt++) {
      resp = await fetch("https://api.openai.com/v1/images/edits", {
        method: "POST",
        headers: { Authorization: `Bearer ${API_KEY}` },
        body: form,
      });
      if (resp.status !== 429 && resp.status < 500) break;
      if (attempt < 3) await new Promise((r) => setTimeout(r, attempt * 4000));
    }

    if (!resp!.ok) {
      const text = await resp!.text();
      return withCors(NextResponse.json(
        { error: `OpenAI API error: ${text.slice(0, 300)}` },
        { status: resp!.status }
      ));
    }

    const result = await resp!.json();
    const b64 = result?.data?.[0]?.b64_json;
    if (!b64) {
      return withCors(NextResponse.json({ error: "No image returned from OpenAI" }, { status: 500 }));
    }

    const imgBuffer = Buffer.from(b64, "base64");
    return new NextResponse(imgBuffer, {
      headers: {
        "Content-Type": "image/png",
        "Content-Disposition": "inline; filename=dish-placer-output.png",
        ...CORS_HEADERS,
      },
    });
  } catch (err: any) {
    return withCors(NextResponse.json({ error: err?.message || "Internal server error" }, { status: 500 }));
  }
}
