import fs from 'fs';
import { GoogleGenerativeAI } from '@google/generative-ai';
import dotenv from 'dotenv';
dotenv.config();

const genAI = new GoogleGenerativeAI(process.env.VITE_GEMINI_API_KEY);

async function test() {
  const model = genAI.getGenerativeModel({ model: "gemini-2.5-pro", generationConfig: { responseMimeType: "application/json" } });
  
  const prompt = `Analyze this document page. Recreate its exact layout, text, formatting, and tables.
Return a generic JSON structure that represents the document flow and layout:
{
  "elements": [
    {
      "type": "text",
      "text": "String",
      "font_size": 14,
      "bold": true,
      "alignment": "center" | "left" | "right",
      "x": 100, // approximate X coordinate if absolute positioned
      "y": 50  // approximate Y coordinate
    },
    {
      "type": "image",
      "description": "QR Code or Logo",
      "bbox": [ymin, xmin, ymax, xmax] // normalized 0-1000
    },
    {
      "type": "table",
      "rows": [
        [ {"text": "Cell text", "bold": true} ]
      ]
    }
  ]
}
Return ONLY valid JSON.`;

  // We need an image. I don't have the user's image locally, but I can just test the prompt structure.
  console.log("Prompt ready.");
}
test();
