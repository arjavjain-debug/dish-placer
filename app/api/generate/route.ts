import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";

const API_KEY = process.env.GEMINI_API_KEY!;
const MODEL = "gemini-3-pro-image-preview";

export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const body = await req.json();
  const dishes: string[] = body.dishes || [];
  const tableId: string = body.table || "table";
  const placements: { dishIndex: number; x: number; y: number }[] = body.placements || [];

  if (!dishes.length) {
    return NextResponse.json({ error: "No dish images uploaded" }, { status: 400 });
  }

  const allowedTables: Record<string, string> = {
    table: "table.jpg",
    table2: "table2.jpg",
    table3: "table3.jpg",
    table4: "table4.jpg",
    table5: "table5.jpg",
    table6: "table6.jpg",
    table7: "table7.jpg",
  };
  const tableFile = allowedTables[tableId] ?? "table.jpg";
  const tablePath = path.join(process.cwd(), "public", tableFile);
  const tableBuffer = fs.readFileSync(tablePath);
  const tableB64 = tableBuffer.toString("base64");

  // Dish images already base64 from client
  const dishParts = dishes.map((b64: string) => ({
    inline_data: {
      mime_type: "image/jpeg",
      data: b64,
    },
  }));

  const n = dishes.length;
  const dishRefs = Array.from({ length: n }, (_, i) => `Image ${i + 1}`).join(", ");

  // Build layout instruction from placements (user-defined positions) or fall back to defaults
  let layout: string;
  if (placements.length === n) {
    const positionLines = placements
      .map((p) => `  - Image ${p.dishIndex + 1}: place at ${Math.round(p.x)}% from the left edge and ${Math.round(p.y)}% from the top edge of the table image`)
      .join("\n");
    layout = `Place each dish at the exact positions specified below (as % of the full table image dimensions):\n${positionLines}\nHonor these positions as closely as possible.`;
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

  const prompt = `${dishRefs} are dish reference photos. The LAST image is the actual table photo that you must edit.

From each dish reference photo, extract only the main plate/bowl of food — ignore backgrounds, hands, other items.

Edit the LAST image (the table photo) by placing all ${n} extracted ${n === 1 ? "dish" : "dishes"} onto the empty surface of the table. Do not modify anything already in the table photo.

${layout}

Rules:
- Keep the EXACT same framing, field of view, zoom level, and composition as the original table photo. Do NOT zoom in, pan, or change the camera perspective in any way.
- Every chair, floor, wall, and surrounding detail visible in the original must remain visible in the output.
- Every dish fully visible, no cropping at edges.
- Match the top-down overhead angle of the table photo.
- Realistic plate sizes relative to existing items on the table.
- Soft shadow under each dish.
- Do not alter the table photo in any other way.
- Output must be the exact same dimensions and aspect ratio as the input table photo. Do not add any padding or borders.

Return only the final edited table photo.`;

  // Dish images first as references, table image last = the image to be edited
  const parts: any[] = [
    { text: prompt },
    ...dishParts,
    { inline_data: { mime_type: "image/jpeg", data: tableB64 } },
  ];

  const payload = {
    contents: [{ parts }],
    generationConfig: {
      responseModalities: ["IMAGE", "TEXT"],
      temperature: 0.3,
    },
  };

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${API_KEY}`;

  let resp: Response | null = null;
  for (let attempt = 1; attempt <= 3; attempt++) {
    resp = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (resp.status !== 503) break;
    if (attempt < 3) await new Promise((r) => setTimeout(r, attempt * 4000));
  }

  if (!resp!.ok) {
    const text = await resp!.text();
    return NextResponse.json(
      { error: `Gemini API error: ${text.slice(0, 200)}` },
      { status: resp!.status }
    );
  }

  const result = await resp!.json();

  for (const candidate of result.candidates || []) {
    for (const part of candidate.content?.parts || []) {
      if (part.inlineData) {
        const imgBuffer = Buffer.from(part.inlineData.data, "base64");
        return new NextResponse(imgBuffer, {
          headers: {
            "Content-Type": `image/${part.inlineData.mimeType?.split("/")[1] || "png"}`,
            "Content-Disposition": "inline; filename=dish-placer-output.png",
          },
        });
      }
    }
  }

  return NextResponse.json({ error: "No image returned from Gemini" }, { status: 500 });
}
