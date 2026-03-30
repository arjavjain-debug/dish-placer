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
  const customTable: string | undefined = body.customTable;

  if (!dishes.length) {
    return NextResponse.json({ error: "No dish images uploaded" }, { status: 400 });
  }

  let tableB64: string;
  if (tableId === "custom" && customTable) {
    tableB64 = customTable;
  } else {
    const allowedTables: Record<string, string> = {
      table: "table.jpg",
      table2: "table2.jpg",
    };
    const tableFile = allowedTables[tableId] ?? "table.jpg";
    const tablePath = path.join(process.cwd(), "public", tableFile);
    tableB64 = fs.readFileSync(tablePath).toString("base64");
  }

  // Dish images already base64 from client
  const dishParts = dishes.map((b64: string) => ({
    inline_data: {
      mime_type: "image/jpeg",
      data: b64,
    },
  }));

  const n = dishes.length;
  const dishRefs = Array.from({ length: n }, (_, i) => `Image ${i + 1}`).join(", ");

  const layoutInstructions: Record<number, string> = {
    1: "Place the single dish dead-center on the open wood surface between the two place settings. It should be prominent and centered both horizontally and vertically in the empty zone.",
    2: "Place the 2 dishes side-by-side horizontally in the center of the open wood surface, with a small natural gap between them. They should be evenly spaced and centered as a pair.",
    3: "Arrange the 3 dishes in a tight triangle: one dish centered near the top of the open zone, and two dishes side-by-side below it. The group should be centered on the table.",
    4: "Arrange the 4 dishes in a 2×2 grid in the center of the open wood zone. Two dishes on top row, two on bottom row, with small natural gaps. The grid should be centered on the table.",
    5: "Arrange the 5 dishes like a quincunx (dice pattern): 2 on top, 1 in the center, 2 on the bottom — all tightly clustered in the center of the open wood zone.",
    6: "Arrange the 6 dishes in a 2-row grid: 3 dishes on top, 3 dishes on the bottom, tightly clustered in the center of the open wood zone. Small natural gaps between dishes.",
  };

  const layout = layoutInstructions[n];

  const prompt = `${dishRefs} are dish reference photos. The LAST image is the actual table photo that you must edit.

From each dish reference photo, extract only the main plate/bowl of food — ignore backgrounds, hands, other items.

Edit the LAST image (the table photo) by placing all ${n} extracted ${n === 1 ? "dish" : "dishes"} onto the large empty dark wood surface in the center/upper area of the table. Do not modify anything already in the table photo.

${layout}

Rules:
- Every dish fully visible, no cropping at edges.
- Match the top-down overhead angle of the table photo.
- Realistic plate sizes relative to existing bowls on the table.
- Soft shadow under each dish.
- Do not alter the table photo in any other way.

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
  for (let attempt = 1; attempt <= 4; attempt++) {
    resp = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (resp.status !== 503) break;
    if (attempt < 4) await new Promise((r) => setTimeout(r, attempt * 3000));
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
