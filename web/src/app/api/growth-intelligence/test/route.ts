import { NextResponse } from "next/server";
import { geminiProvider } from "@/lib/ai/gemini";

export async function POST() {
  const result = await geminiProvider.testConnection();
  return NextResponse.json({ ...result, model: geminiProvider.model });
}
