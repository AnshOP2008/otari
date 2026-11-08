import { GoogleGenAI } from "@google/genai";

const TEXT_MODEL = "gemini-3.1-flash-lite";
const EMBEDDING_MODEL = "gemini-embedding-001";
const EMBEDDING_DIMENSIONS = 1536;

function getAiClient() {
  const key = process.env.GEMINI_API_KEY;
  if (!key) {
    throw new Error("GEMINI_API_KEY missing");
  }
  return new GoogleGenAI({ apiKey: key });
}

export async function generateGeminiText(prompt: string): Promise<string> {
  if (prompt.trim() == "") return "";
  const ai = getAiClient();
  const response = await ai.models.generateContent({
    model: TEXT_MODEL,
    contents: prompt,
  });

  const text = response.text;
  if (!text) {
    throw new Error("Gemini returned no text.");
  }

  return text.trim();
}

async function embedText(input: string): Promise<number[]> {
  const ai = getAiClient();
  const response = await ai.models.embedContent({
    model: EMBEDDING_MODEL,
    contents: input,
    config: { outputDimensionality: EMBEDDING_DIMENSIONS, taskType: "SEMANTIC_SIMILARITY" },
  });

  const vector = response.embeddings?.[0]?.values;
  if (!vector || vector.length !== EMBEDDING_DIMENSIONS) {
    throw new Error(
      `Gemini returned an invalid embedding vector. Expected ${EMBEDDING_DIMENSIONS} dimensions.`,
    );
  }

  return vector;
}

export async function embedTexts(inputs: string[]): Promise<number[][]> {
  if (inputs.length === 0) {
    return [];
  }

  const vectors: number[][] = [];
  for (let index = 0; index < inputs.length; index += 1) {
    const input = inputs[index];
    console.log("[gemini] embedding text", { position: index + 1, total: inputs.length });
    vectors.push(await embedText(input));
  }

  return vectors;
}
