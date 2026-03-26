import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";

const API_KEY = process.env.GEMINI_API_KEY!;
const MODEL = "gemini-3.1-flash-image-preview";

export const maxDuration = 120;

export async function POST(req: NextRequest) {
  const body = await req.json();
  const dishes: string[] = body.dishes || [];

  if (!dishes.length) {
    return NextResponse.json({ error: "No dish images uploaded" }, { status: 400 });
  }

  // Encode table image
  const tablePath = path.join(process.cwd(), "public", "table.jpg");
  const tableB64 = fs.readFileSync(tablePath).toString("base64");

  // Dish images already base64 from client
  const dishParts = dishes.map((b64: string) => ({
    inline_data: {
      mime_type: "image/jpeg",
      data: b64,
    },
  }));

  const n = dishes.length;
  const dishRefs = Array.from({ length: n }, (_, i) => `Image ${i + 2}`).join(", ");

  const prompt = `Image 1 is the BASE TABLE photo. Keep it EXACTLY as is — every existing item (bowls, chopsticks, napkins, cups, place settings) stays completely untouched. Do not alter, move, or remove anything.

${dishRefs} are dish photos. From each, extract ONLY the main center dish/plate. Ignore everything else in those photos (background tables, rice bowls, other plates, hands, legs, chairs, water glasses, cutlery — ignore all of that).

PLACEMENT RULES:
1. Every dish must be FULLY VISIBLE — absolutely NO cropping at edges. Every plate must be 100% within the frame.
2. Keep the original portrait orientation and aspect ratio of the table image.
3. Place all ${n} dishes in the open center area of the table between the two place settings. Arrange them naturally like a real Chinese family dinner — clustered together, close but not overlapping.
4. Natural realistic plate sizes relative to the table.
5. Leave breathing room from edges so nothing gets cut off.
6. Match the lighting, shadows, and top-down camera angle perfectly. Photorealistic result.

Return ONLY the final composited image.`;

  const parts: any[] = [
    { text: prompt },
    { inline_data: { mime_type: "image/jpeg", data: tableB64 } },
    ...dishParts,
  ];

  const payload = {
    contents: [{ parts }],
    generationConfig: {
      responseModalities: ["IMAGE", "TEXT"],
      temperature: 0.3,
    },
  };

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${API_KEY}`;

  const resp = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!resp.ok) {
    const text = await resp.text();
    return NextResponse.json(
      { error: `Gemini API error: ${text.slice(0, 200)}` },
      { status: resp.status }
    );
  }

  const result = await resp.json();

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
