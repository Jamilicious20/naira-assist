# Naira Assist

An AI money assistant for a Nigerian digital wallet. Users ask questions in plain English, in the **mobile app** or on **WhatsApp**, and get answers from their real wallet data:

- "What's my balance?"
- "Why did my data purchase fail?"
- "How much is ₦100,000 in dollars?"

The assistant can read balances and transactions and quote exchange rates. **It cannot move money.** Payments stay in the app's own confirmed flows.

```
┌──────────────────────┐     HTTPS + Supabase JWT      ┌───────────────────────────────┐
│  mobile/ (Expo, RN)  │ ────────────────────────────▶ │  server/ (Node.js, TypeScript)│
│  Wallet · Assistant  │                               │  /api/wallet   /api/chat      │
└──────────────────────┘                               │                               │
┌──────────────────────┐   Meta webhook (HMAC-signed)  │  Agent loop ──▶ Claude API    │
│  WhatsApp user       │ ────────────────────────────▶ │     │  tool calls             │
└──────────────────────┘ ◀──── Cloud API reply ─────── │     ▼                         │
                                                       │  get_balance · list_txns ·    │
                                                       │  convert_currency (read-only) │
                                                       └───────────────────────────────┘
```

## What's inside

### `server/`: conversational AI service
- **Express 5 + TypeScript**, env validated with Zod at startup.
- **LLM tool calling**: an agent loop sends the conversation to Claude. It runs the tools the model asks for (in parallel when there are several) and feeds the results back until the model answers. A step limit stops runaway loops.
- **Safe tools**: every tool input from the model is validated with Zod (extra fields rejected). The user's ID comes from the verified token, never from the model, so the model can't read another user's wallet. Tool errors go back to the model so it can recover instead of crashing the request.
- **Conversation memory**: per-conversation history with a size budget and an idle expiry. Trimming never splits a `tool_use` from its `tool_result`, which the API would reject. Conversations are namespaced per user, and turns are serialised per conversation so two quick messages can't corrupt history.
- **WhatsApp Cloud API webhook**: verification handshake, `X-Hub-Signature-256` HMAC check over the raw body (constant-time compare), and an immediate 200 so Meta doesn't retry. Duplicate deliveries are dropped by message ID. Unlinked numbers and non-text messages get helpful replies.
- **Reliability**: timeouts on every outbound call, plus exponential backoff with jitter that retries only 429/5xx/network errors. Friendly 502s are returned when the LLM is down.
- **Money handling**: amounts are integers in kobo, and pending/failed transactions are excluded from the balance.

### `mobile/`: React Native app
- **Expo SDK 58, Expo Router, TypeScript** (strict + `noUncheckedIndexedAccess`).
- **Auth**: Supabase email/password with protected routes (`Stack.Protected`). The session is stored in the device keychain/keystore via `expo-secure-store`, chunked because sessions can exceed SecureStore's size limit. Cached data and chat history are cleared when the user changes.
- **State**: TanStack Query for server state (wallet), and Zustand for the chat (optimistic messages, per-message failure and retry, one turn at a time).
- **API client**: typed, with timeouts. On 401 it refreshes the token once, then signs out. Only GETs are retried, so a chat message is never sent twice. Errors map to user-friendly messages.
- **UX**: loading, empty, error and stale-data states; pull to refresh; typing indicator; suggestion chips; accessibility labels.
- **EAS Build** profiles for development, preview (APK) and production.

## Run it

**Server**
```bash
cd server
cp .env.example .env      # add ANTHROPIC_API_KEY and your Supabase JWKS URL
npm install
npm run dev               # http://localhost:8787
npm test
```

**Mobile**
```bash
cd mobile
cp .env.example .env      # Supabase URL + publishable key, API URL (use your LAN IP on a phone)
npm install
npx expo start
npm test
```

**WhatsApp (optional)**: create an app at developers.facebook.com, add the WhatsApp product, and point the webhook to `https://<your-server>/webhooks/whatsapp` with your verify token. Then set the four `WHATSAPP_*` variables and link your test number in `WHATSAPP_LINKED_NUMBERS`.

## Tests and CI

- Server: 28 Vitest + Supertest tests covering the agent loop, tool validation, auth, the webhook signature/dedupe flow, history trimming and retries. The LLM is replaced by a scripted fake, so tests are fast and free.
- Mobile: 19 Jest tests (jest-expo + React Native Testing Library) for the API client, chat store and components.
- GitHub Actions runs typecheck and tests for both on every push and pull request.

## Notes and next steps

The wallet is an in-memory demo ledger with seeded transactions, behind a `LedgerRepository` interface. In production it would call the backend team's ledger service. Next steps: persistent conversation storage (Postgres), streaming replies, voice notes on WhatsApp, and an in-app flow to link a WhatsApp number.
