export interface AIUsage {
  inputTokens: number | null;
  outputTokens: number | null;
  totalTokens: number | null;
}

export interface AIGenerateResult<T> {
  ok: boolean;
  data?: T;
  usage: AIUsage;
  durationMs: number;
  errorMessage?: string;
  /** Raw grounding sources, when Google Search grounding was used. */
  sources?: { url: string; title: string }[];
}

export interface AIProvider {
  key: string;
  model: string;
  /** Generates a structured JSON response validated against a JSON schema. */
  generateStructured<T>(params: {
    systemPrompt: string;
    userPrompt: string;
    schema: object;
    useGrounding?: boolean;
  }): Promise<AIGenerateResult<T>>;
  testConnection(): Promise<{ ok: boolean; message: string }>;
}
