import fs from 'fs';
import dotenv from 'dotenv';
dotenv.config();

const apiKey = process.env.VITE_GEMINI_API_KEY;

async function run() {
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`);
  const data = await res.json();
  const models = data.models.map(m => m.name);
  console.log(models.filter(m => m.includes('gemini')));
}
run();
