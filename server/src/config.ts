import { z } from "zod";

const EnvSchema = z.object({
  PORT: z.coerce.number().int().positive().default(8787),
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),

  // LLM
  ANTHROPIC_API_KEY: z.string().min(1).optional(),
  LLM_MODEL: z.string().default("claude-haiku-5-5"),
  LLM_TIMEOUT_MS: z.coerce.number().int().positive().default(20_000),

  // Auth: Supabase signs user access tokens. Use the JWKS URL (asymmetric keys)
  // or, for older projects, the shared HS256 JWT secret.
  SUPABASE_JWKS_URL: z.string().url().optional(),
  SUPABASE_JWT_SECRET: z.string().min(16).optional(),

  // WhatsApp Cloud API
  WHATSAPP_VERIFY_TOKEN: z.string().min(8).optional(),
  WHATSAPP_APP_SECRET: z.string().min(8).optional(),
  WHATSAPP_ACCESS_TOKEN: z.string().min(1).optional(),
  WHATSAPP_PHONE_NUMBER_ID: z.string().min(1).optional(),
  WHATSAPP_GRAPH_VERSION: z.string().default("v21.0"),

  // Comma-separated "phone:userId" pairs linking WhatsApp numbers to app users (demo only).
  WHATSAPP_LINKED_NUMBERS: z.string().default(""),
});

export type Config = z.infer<typeof EnvSchema>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const parsed = EnvSchema.safeParse(env);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("\n");
    throw new Error(`Invalid environment configuration:\n${issues}`);
  }
  const config = parsed.data;
  if (!config.SUPABASE_JWKS_URL && !config.SUPABASE_JWT_SECRET) {
    throw new Error("Set SUPABASE_JWKS_URL or SUPABASE_JWT_SECRET so the API can verify users.");
  }
  return config;
}

export function parseLinkedNumbers(raw: string): Map<string, string> {
  const map = new Map<string, string>();
  for (const pair of raw.split(",").map((s) => s.trim()).filter(Boolean)) {
    const [phone, userId] = pair.split(":");
    if (phone && userId) map.set(phone.replace(/\D/g, ""), userId);
  }
  return map;
}
