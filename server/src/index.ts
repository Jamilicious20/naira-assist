import { createAnthropicClient } from "./ai/anthropic.js";
import { StaticRates } from "./ai/tools.js";
import { createApp } from "./app.js";
import { createSupabaseVerifier } from "./auth.js";
import { loadConfig, parseLinkedNumbers } from "./config.js";
import { InMemoryConversationStore } from "./store/conversations.js";
import { InMemoryLedger } from "./store/ledger.js";
import { createWhatsAppSender } from "./whatsapp.js";

const config = loadConfig();
if (!config.ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY is required");

const whatsappReady =
  config.WHATSAPP_VERIFY_TOKEN && config.WHATSAPP_APP_SECRET && config.WHATSAPP_ACCESS_TOKEN && config.WHATSAPP_PHONE_NUMBER_ID;

const app = createApp({
  llm: createAnthropicClient({ apiKey: config.ANTHROPIC_API_KEY, model: config.LLM_MODEL, timeoutMs: config.LLM_TIMEOUT_MS }),
  ledger: new InMemoryLedger(),
  rates: new StaticRates(),
  conversations: new InMemoryConversationStore(),
  verifyToken: createSupabaseVerifier({ jwksUrl: config.SUPABASE_JWKS_URL, jwtSecret: config.SUPABASE_JWT_SECRET }),
  whatsapp: whatsappReady
    ? {
        verifyToken: config.WHATSAPP_VERIFY_TOKEN!,
        appSecret: config.WHATSAPP_APP_SECRET!,
        linkedNumbers: parseLinkedNumbers(config.WHATSAPP_LINKED_NUMBERS),
        send: createWhatsAppSender({
          accessToken: config.WHATSAPP_ACCESS_TOKEN!,
          phoneNumberId: config.WHATSAPP_PHONE_NUMBER_ID!,
          graphVersion: config.WHATSAPP_GRAPH_VERSION,
        }),
      }
    : undefined,
});

app.listen(config.PORT, () => {
  console.log(`Naira Assist API on :${config.PORT} (WhatsApp ${whatsappReady ? "enabled" : "disabled"})`);
});
