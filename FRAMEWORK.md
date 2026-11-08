# TaskBase — Framework & Stack Deep Dive (Interview Prep)

> **What this file is.** `README.md` says *what* TaskBase does, and `TASKBASE-DOCUMENTATION.md` walks through *each file*.
> This file explains **the technologies underneath**: what each framework is, what every API you call actually does,
> what happens on the network and in the database when it runs, and the questions an interviewer is likely to ask.
>
> Every code reference is to a real file in this repo. Where the code and the older docs disagree, this file says so
> (see [§18 Honest notes](#18-honest-notes--things-an-interviewer-might-catch)).

---

## Table of Contents

0. [The 60-second pitch](#0-the-60-second-pitch)
1. [The whole stack on one page](#1-the-whole-stack-on-one-page)
2. [What happens when a user opens TaskBase (request lifecycle)](#2-what-happens-when-a-user-opens-taskbase-request-lifecycle)
3. [TanStack Start — the full-stack framework](#3-tanstack-start--the-full-stack-framework)
4. [Server Functions (`createServerFn`) — in depth](#4-server-functions-createserverfn--in-depth)
5. [Middleware (`createMiddleware`) — in depth](#5-middleware-createmiddleware--in-depth)
6. [TanStack Router — file-based routing](#6-tanstack-router--file-based-routing)
7. [TanStack Query — server state on the client](#7-tanstack-query--server-state-on-the-client)
8. [React 19 features used](#8-react-19-features-used)
9. [Supabase — what it really is](#9-supabase--what-it-really-is)
10. [Supabase Auth, JWTs and Google OAuth](#10-supabase-auth-jwts-and-google-oauth)
11. [PostgreSQL, SQL & Row Level Security](#11-postgresql-sql--row-level-security)
12. [pgvector, embeddings and RAG](#12-pgvector-embeddings-and-rag)
13. [Google Gemini (`@google/genai`) and prompt engineering](#13-google-gemini-googlegenai-and-prompt-engineering)
14. [Zod — runtime validation](#14-zod--runtime-validation)
15. [Google Calendar & Gmail REST APIs](#15-google-calendar--gmail-rest-apis)
16. [UI layer: Tailwind v4, shadcn/ui, Radix, dnd-kit, date-fns, Sonner, Markdown](#16-ui-layer)
17. [Build & tooling: Vite, Nitro, TypeScript, ESLint, Prettier, Docker, Bun](#17-build--tooling)
18. [Honest notes — things an interviewer might catch](#18-honest-notes--things-an-interviewer-might-catch)
19. [Interview question bank (with answers)](#19-interview-question-bank-with-answers)
20. [Glossary](#20-glossary)

---

## 0. The 60-second pitch

> "TaskBase is an AI task manager. It's a **full-stack TypeScript app on TanStack Start**, which gives me React with
> SSR, file-based routing, and **server functions**: type-safe RPC calls that run only on the server. Data lives in
> **Supabase Postgres**, and **Row Level Security** isolates each user's data. Users sign in with **Google OAuth through
> Supabase Auth**, and I request Calendar and Gmail scopes so the server can read their schedule and inbox.
> When a user uploads a PDF, the server extracts the text, splits it into overlapping chunks, embeds each chunk with
> **Gemini embeddings**, and stores the vectors in **pgvector** with an **HNSW index**. On every chat message or
> 'Refine' click, I embed the query, run a **cosine-similarity search**, and put the top chunks, the tasks, the chat
> history, the calendar and the emails into a prompt. Gemini returns **strict JSON**, I validate it with **Zod**, and I
> rewrite the task board. Every AI task carries an `ai_reason`, so the decisions are explainable.
> On the client, **TanStack Query** handles caching and invalidation, and **dnd-kit** handles drag-and-drop with
> optimistic updates. The app ships as a **Nitro Node server in a multi-stage Docker image**."

---

## 1. The whole stack on one page

| Layer | Technology | Version (package.json) | Where it's used |
|---|---|---|---|
| UI library | React | ^19.2 | every `.tsx` |
| Full-stack framework | TanStack Start (`@tanstack/react-start`) | ^1.168 | `src/start.ts`, `src/server.ts`, all `*.functions.ts` |
| Routing | TanStack Router (`@tanstack/react-router`) + `@tanstack/router-plugin` | ^1.170 | `src/routes/**`, `src/router.tsx`, `routeTree.gen.ts` |
| Server-state cache | TanStack Query (`@tanstack/react-query`) | ^5.101 | `home.tsx`, `chat.tsx`, `documents.tsx`, `permissions.tsx` |
| Server runtime | Nitro (`nitro/vite`) on top of h3 | 3.0 beta | `vite.config.ts`, Docker output `.output/server/index.mjs` |
| Database | Supabase Postgres + **pgvector** | — | `supabase/migrations/*.sql` |
| DB / auth client | `@supabase/supabase-js` | ^2.108 | `src/integrations/supabase/*` |
| Auth provider | Supabase Auth (GoTrue) + Google OAuth 2.0 | — | `auth.tsx`, `auth/callback.tsx`, `auth-middleware.ts` |
| LLM + embeddings | Google Gemini via `@google/genai` | ^2.12 | `src/lib/gemini.server.ts` |
| Validation | Zod | ^3.24 | every server function + AI output |
| PDF parsing | `unpdf` (a serverless build of Mozilla PDF.js) | ^1.6 | `documents.functions.ts` |
| External APIs | Google Calendar v3, Gmail v1, OAuth2 tokeninfo | — | `google.functions.ts`, `google-permissions.ts` |
| Styling | Tailwind CSS v4 (`@tailwindcss/vite`), `@tailwindcss/typography`, `tw-animate-css` | ^4.2 | `src/styles.css` |
| Components | shadcn/ui (New York style) on Radix UI primitives | — | `src/components/ui/*`, `components.json` |
| Drag & drop | `@dnd-kit/core`, `@dnd-kit/sortable`, `@dnd-kit/utilities` | ^6 / ^10 / ^3 | `home.tsx`, `task-card.tsx` |
| Dates | `date-fns` | ^4.1 | `home.tsx`, `task-card.tsx` |
| Toasts | Sonner | ^2.0 | everywhere (`toast.success(...)`) |
| Markdown | `react-markdown` + `remark-gfm` | ^10 / ^4 | `chat.tsx`, `documentation.tsx` |
| Icons | `lucide-react` | ^0.575 | everywhere |
| Build tool | Vite 8 (Rolldown-based) | ^8.0 | `vite.config.ts` |
| Language | TypeScript (strict) | ^5.8 | `tsconfig.json` |
| Lint / format | ESLint 9 (flat config) + Prettier | ^9 / ^3 | `eslint.config.js`, `.prettierrc` |
| Container | Docker multi-stage, `node:20-alpine` | — | `Dockerfile` |

Installed but **not really used** by app code (they come with the shadcn template): `react-hook-form`,
`@hookform/resolvers`, `recharts`, `embla-carousel-react`, `cmdk`, `vaul`, `input-otp`, `react-day-picker`,
`react-resizable-panels`. If an interviewer asks, say they arrived with the shadcn/Lovable template and the
hand-written forms don't use them.

---

## 2. What happens when a user opens TaskBase (request lifecycle)

Here is the full path for **opening `/home` and seeing the task list**.

```
1. Browser  ──GET /home──▶  Node process (.output/server/index.mjs, built by Nitro)
2. Nitro/h3 turns the Node request into a Web-standard `Request`
3. src/server.ts → createServerEntry({ fetch }) → handler.fetch(request)   (TanStack Start handler)
4. Start creates a router via getRouter() (src/router.tsx) and matches the URL against routeTree.gen.ts
   └─ "/home" lives under the pathless layout "/_authenticated", which has  ssr: false
5. Because ssr:false, the server does NOT run beforeLoad or render the page. It streams the HTML *shell*
   (RootShell in __root.tsx: <html>, <HeadContent/>, <Scripts/>) plus the JS bundles.
6. Browser downloads JS → React hydrates the shell → the router runs on the client
7. _authenticated/route.tsx  beforeLoad → supabase.auth.getUser()
       → reads the JWT from localStorage → calls GET {SUPABASE_URL}/auth/v1/user to verify it
       → no user? throw redirect({ to: "/auth" })
8. HomePage mounts → useQuery({ queryKey: ["tasks"], queryFn: () => list() })
9. list() is a SERVER FUNCTION stub. The client middleware attachSupabaseAuth runs first:
       → supabase.auth.getSession() → adds header  Authorization: Bearer <supabase JWT>
10. Stub sends an HTTP request to Start's internal server-function endpoint (by default under /_serverFn/…)
11. On the server, requireSupabaseAuth runs:
       → reads the header with getRequest() → checks it looks like a JWT → createClient(...) with that JWT
       → supabase.auth.getClaims(token) verifies the signature → context = { supabase, userId, claims }
12. listTasks handler: context.supabase.from("tasks").select("*").order("position").order("created_at")
       → supabase-js sends:  GET {SUPABASE_URL}/rest/v1/tasks?select=*&order=position.asc,created_at.asc
                             headers: apikey: <publishable key>, Authorization: Bearer <user JWT>
13. PostgREST verifies the JWT, runs  SET ROLE authenticated; and sets request.jwt.claims,
       then runs the SQL. RLS policy  auth.uid() = user_id  adds an invisible WHERE clause.
14. Rows → JSON → server function result → serialized back to the browser → React Query caches it
       under ["tasks"] → component re-renders.
```

**The key interview insight:** there are **two** network hops for data, browser → my server function → Supabase.
The browser *could* talk to Supabase directly (it does for `upload_progress`), but going through server functions
lets me keep the Gemini key secret, validate input with Zod, and run multi-step logic in one place.

---

## 3. TanStack Start — the full-stack framework

### 3.1 What it is

TanStack Start is a **full-stack React meta-framework**, in the same category as Next.js and Remix. It's built from:

| Piece | Role |
|---|---|
| **TanStack Router** | Type-safe routing, loaders, `beforeLoad`, SSR, streaming |
| **A Vite plugin** (`tanstackStart()` from `@tanstack/react-start/plugin/vite`) | Generates the route tree and **compiles server functions** (splits server code from client code) |
| **A server runtime** | In this project, **Nitro** (via `nitro/vite`), which uses **h3** as its HTTP layer. Nitro can target Node, Cloudflare, Vercel, etc. |
| **Server functions & middleware** | `createServerFn`, `createMiddleware`, `createStart` |

**How it differs from Next.js:** Start doesn't use React Server Components. Pages are normal client components that
can be SSR'd, and "server-ness" is explicit: you write `createServerFn` for server code. The router is fully typed,
so `<Link to="/home">` is checked at compile time against your route files.

### 3.2 The four entry files

#### `src/start.ts`: Start configuration
```ts
export const startInstance = createStart(() => ({
  functionMiddleware: [attachSupabaseAuth],
}));
```
- `createStart` builds the global configuration for the app.
- `functionMiddleware` is a list of middleware that runs around **every server function call**, so every RPC
  from the browser automatically carries the user's Bearer token.
- Start also supports `requestMiddleware`, which runs for **every HTTP request**, including page SSR. group-tea
  uses that one for its error page. Knowing the difference is a good interview point.

#### `src/server.ts`: server entry
```ts
import handler, { createServerEntry } from "@tanstack/react-start/server-entry";
export default createServerEntry({ fetch(request) { return handler.fetch(request); } });
```
- The server entry is a **Web-standard fetch handler**: `(Request) => Response`. The same signature works in
  Node (via Nitro), Cloudflare Workers, Deno and Bun.
- `handler.fetch` is Start's request handler. It decides whether the request is a **page** (SSR the route), a
  **server-function call** (run the RPC), or a **static asset**.
- This file is where you'd add custom logic, like the error wrapper group-tea has.

#### `src/router.tsx`: router factory
```ts
export const getRouter = () => {
  const queryClient = new QueryClient();
  return createRouter({ routeTree, context: { queryClient }, scrollRestoration: true, defaultPreloadStaleTime: 0 });
};
```
- It's a **factory function**, not a singleton, because on the server a **new router (and a new QueryClient) must be
  created per request**. Otherwise one user's cached data could leak into another user's SSR response.
- `context: { queryClient }`: router context is dependency injection. Every route can read it with
  `Route.useRouteContext()` or in `beforeLoad({ context })`. `__root.tsx` declares the type with
  `createRootRouteWithContext<{ queryClient: QueryClient }>()`.
- `scrollRestoration: true` remembers the scroll position per history entry.
- `defaultPreloadStaleTime: 0` treats route-loader data as stale immediately. This is the TanStack Query
  integration recommendation: let **Query** decide caching, not the router's own loader cache.

#### `src/routeTree.gen.ts`: generated, never edited
The router plugin scans `src/routes/` and writes this file, which wires every route's parent/child relationship
and generates the **types** for paths and params. That's why `navigate({ to: "/hom" })` would be a TypeScript error.

### 3.3 SSR, the shell, and hydration (`src/routes/__root.tsx`)

```tsx
export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({ meta: [...], links: [{ rel: "stylesheet", href: appCss }] }),
  shellComponent: RootShell,      // <html><head><HeadContent/></head><body>{children}<Scripts/></body></html>
  component: RootComponent,       // QueryClientProvider + <Outlet/> + <Toaster/>
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});
```

| API | What it does |
|---|---|
| `shellComponent` | The outer HTML document. It's always rendered on the server, even when a child route has `ssr: false`. |
| `<HeadContent />` | Renders the `<title>`, `<meta>` and `<link>` tags collected from every matched route's `head()`. Child routes like `home.tsx` override the title. |
| `<Scripts />` | Injects the client JS bundles and the router's serialized state, so the browser can **hydrate**. |
| `<Outlet />` | The placeholder where the matched child route renders. |
| `head()` | Per-route metadata. `appCss` comes from `import appCss from "../styles.css?url"`, a **Vite `?url` import** that gives the built URL of the CSS file. |
| `errorComponent` | A React error boundary for the route subtree. Your "Try again" calls `router.invalidate()` (re-runs loaders/beforeLoad) and `reset()` (clears the boundary). |
| `notFoundComponent` | Rendered when no route matches. |

**Hydration** means React attaches event handlers to server-rendered HTML instead of re-creating the DOM. The
markup the server produced must match what the client renders the first time.

**Why `ssr: false` on `/_authenticated` and `/`:** the Supabase session lives in **`localStorage`**, which doesn't
exist on the server. If the server tried to run `beforeLoad` it would always see "no user" and redirect to `/auth`.
With `ssr: false`, the server sends only the shell and the auth check runs in the browser. The trade-off: those pages
get no SEO and no server-rendered content, which is fine for a private dashboard. The alternative is cookie-based
sessions (`@supabase/ssr`), which let the server read the session.

### 3.4 Module naming conventions: `*.functions.ts` vs `*.server.ts`

| Suffix | Meaning | Examples |
|---|---|---|
| `*.functions.ts` | Files that **export server functions**. They are imported by client components, so the file is part of the client bundle, but the compiler replaces each handler body with an RPC stub. | `tasks.functions.ts`, `ai.functions.ts`, `documents.functions.ts`, `google.functions.ts` |
| `*.server.ts` | **Server-only** modules: secrets, Node-only libraries. They must never reach the browser. TanStack Start treats `.server.*` files as server-only. Your ESLint config even tells you to use this convention instead of Next's `server-only` package. | `gemini.server.ts` (holds `GEMINI_API_KEY`), `rag.server.ts`, `client.server.ts` (service-role key) |

The safe pattern, used in `ai.functions.ts` and `documents.functions.ts`, is to load server modules **inside** the
handler:
```ts
const { retrieveContext } = await import("./rag.server");   // dynamic import inside handler
const { embedTexts } = await import("./gemini.server");
```
Because the handler body is stripped from the client build, that import can never end up in the browser bundle.
`google.functions.ts` uses a top-level static `import { embedTexts } from "./gemini.server"`. That still works,
because the bundler tree-shakes it once the handler bodies are removed, but the dynamic import is the more
defensive style.

---

## 4. Server Functions (`createServerFn`) — in depth

### 4.1 Mental model

A server function is a **function you write once, call from the browser like a local async function, but which only
ever executes on the server**. It's RPC (Remote Procedure Call) with end-to-end TypeScript types.

```ts
// src/lib/tasks.functions.ts
export const createTask = createServerFn({ method: "POST" })   // 1. HTTP method used for the RPC
  .middleware([requireSupabaseAuth])                            // 2. runs before the handler, adds context
  .inputValidator((d: unknown) => CreateTaskInput.parse(d))     // 3. validates/transforms `data`
  .handler(async ({ context, data }) => { ... return row; });   // 4. the server-only code
```

The builder chain:

| Method | What it does | Notes |
|---|---|---|
| `createServerFn({ method })` | Creates the function. `"GET"` sends input in the URL query string; `"POST"` sends it in the request body. | Use GET for reads (`listTasks`, `listDocuments`, `getTaskSummary`), POST for writes or big payloads (`uploadDocument` sends base64 files, which would never fit in a URL). |
| `.middleware([...])` | Attaches function middleware. The middleware's `next({ context })` output becomes `context` in the handler, **fully typed**. | Every function here uses `requireSupabaseAuth`. |
| `.inputValidator(fn)` | Receives the raw input (`unknown`, because it came over the network), must return typed data or throw. | `.validator(...)` is the **older name** of the same method. `ai.functions.ts`, `documents.functions.ts` (upload) and `google.functions.ts` use `.validator`; `tasks.functions.ts` and `deleteDocument` use `.inputValidator`. Same behavior; prefer `inputValidator`. |
| `.handler(async ({ data, context }) => ...)` | The actual server code. Whatever it returns is serialized back to the caller. | Throwing an `Error` makes the client-side call reject with that message. That's how `toast.error(error.message)` shows server errors. |

### 4.2 What the compiler does (the "magic")

At build time the Start Vite plugin compiles **two versions** of each `*.functions.ts` file:

- **Server build:** the full handler is kept and registered under a stable **function ID**.
- **Client build:** the handler body is **removed** and replaced by a small stub, roughly:
  ```ts
  createTask = (opts) => fetch("/_serverFn/<id>", { method: "POST", body: serialize(opts.data), headers: ... })
  ```
  Client-side middleware (`attachSupabaseAuth`) runs inside that stub before the fetch.

The secrets inside the handler (`process.env.GEMINI_API_KEY`) and the server-only imports are therefore **never in the
JS the browser downloads**.

Input and output are serialized with a serializer richer than `JSON.stringify` (Start uses **seroval**, which can
round-trip `Date`, `Map`, `Set`, `undefined`, etc.). The values returned here are plain objects and arrays, so
nothing exotic is needed.

### 4.3 Calling a server function

There are three ways, and TaskBase uses two of them:

1. **`useServerFn(fn)`** (in components):
   ```ts
   const list = useServerFn(listTasks);           // home.tsx
   useQuery({ queryKey: ["tasks"], queryFn: () => list() });
   create({ data: draft });                        // input always goes under `data`
   ```
   `useServerFn` wraps the function so that if the server throws a router `redirect()` or `notFound()`, the
   **router** handles it (navigates) instead of you getting a raw error.
2. **Direct call** from client code: `cleanOldDocsFn()` is the `useServerFn` version, but you can also call `fn()` directly.
3. **Server-to-server call**: `syncCalendar` calls `await refineTasksWithAI()` **inside its own handler**. On the
   server this is a direct function invocation, not an HTTP round-trip. The middleware chain still runs, and
   `getRequest()` still returns the *original incoming request*, so `requireSupabaseAuth` finds the same
   `Authorization` header and the user is authenticated for the nested call too. That's why the Google sync
   functions can reuse the whole refine pipeline.

### 4.4 Every server function in TaskBase

| File | Function | Method | Input (Zod) | What it does on the backend |
|---|---|---|---|---|
| `tasks.functions.ts` | `listTasks` | GET | — | `SELECT * FROM tasks ORDER BY position, created_at` (RLS limits rows to the user's own) |
| | `createTask` | POST | title 1–200, description ≤2000, priority enum, tags[], due_date? | reads max `position`, inserts with `position = max+1`, `created_by='user'` |
| | `updateTask` | POST | `id` uuid + optional fields | `UPDATE tasks SET <patch> WHERE id=? AND user_id=?` and returns the row (`.select().single()`) |
| | `deleteTask` | POST | `id` uuid | `DELETE ... WHERE id=? AND user_id=?` |
| | `reorderTasks` | POST | `orderedIds` uuid[] | `Promise.all` of N `UPDATE tasks SET position=i` (parallel, one per task) |
| `ai.functions.ts` | `refineTasksWithAI` | POST | — | parallel fetch tasks/chat/docs → RAG → fetch calendar/gmail chunks → prompt → Gemini → Zod → **DELETE all + INSERT** |
| | `getTaskSummary` | GET | — | tasks → Gemini → 2–3 sentence summary |
| | `chat` | POST | `message` string | insert user msg → tasks + last 20 msgs → RAG (top 5) → Gemini JSON `{answer, updateTasks}` → insert assistant msg |
| | `listChatMessages` | GET | — | last 200 messages ascending |
| | `clearChat` | POST | — | `DELETE FROM chat_messages WHERE user_id=?` |
| `documents.functions.ts` | `listDocuments` | GET | — | documents newest first |
| | `uploadDocument` | POST | name, base64, progressId uuid | extract → normalize → chunk → embed (cancellable) → store → progress updates |
| | `deleteDocument` | POST | `id` uuid | delete document; `ON DELETE CASCADE` removes chunks |
| `google.functions.ts` | `removeIntegrationDoc` | POST | filename | delete that KB doc + chunks |
| | `cleanOldIntegrationDocs` | POST | — | delete `calendar!@#.txt` and `gmail!@#.txt` |
| | `syncCalendar` | POST | accessToken | Calendar API → text → KB → `refineTasksWithAI()` → push dated tasks as events |
| | `syncGmail` | POST | accessToken | Gmail list + metadata → text → KB → refine |
| | `syncAll` | POST | accessToken | both → KB → refine **once** → push events |

**Why is the Google access token sent from the client?** Supabase doesn't store Google's `provider_token` in the
database. It exists only in the **browser session** that came back from the OAuth redirect. So the client reads
`session.provider_token` and passes it as input. See §10.5.

---

## 5. Middleware (`createMiddleware`) — in depth

TanStack Start middleware is like Express middleware, except it can run **on both sides of the network** and its
outputs are typed.

```
 BROWSER                                         SERVER
 ┌───────────────────────────┐   HTTP RPC       ┌──────────────────────────────┐
 │ attachSupabaseAuth.client │ ───────────────▶ │ requireSupabaseAuth.server    │
 │   next({ headers })       │                  │   next({ context })           │
 └───────────────────────────┘                  │        ↓                      │
                                                │   handler({ data, context })  │
                                                └──────────────────────────────┘
```

### 5.1 `attachSupabaseAuth` (client side), `src/integrations/supabase/auth-attacher.ts`
```ts
createMiddleware({ type: "function" }).client(async ({ next }) => {
  const { data } = await supabase.auth.getSession();       // reads session from localStorage (no network)
  const token = data.session?.access_token;
  return next({ headers: token ? { Authorization: `Bearer ${token}` } : {} });
});
```
- `type: "function"`: this middleware wraps **server functions** (as opposed to `type: "request"`).
- `.client(...)` runs in the browser **before** the RPC fetch. `next({ headers })` merges extra headers into the
  outgoing request.
- It's registered globally in `start.ts`, so you never pass the token manually.
- `getSession()` also refreshes the token if it has expired and a refresh token exists (`autoRefreshToken: true`).

### 5.2 `requireSupabaseAuth` (server side), `src/integrations/supabase/auth-middleware.ts`
Step by step:
1. Reads `VITE_SUPABASE_URL`/`SUPABASE_URL` and `VITE_SUPABASE_KEY`/`SUPABASE_PUBLISHABLE_KEY` from `process.env`,
   and throws a clear error if either is missing.
2. `getRequest()` (from `@tanstack/react-start/server`) returns the **current incoming `Request`**. It works through
   async context (like Node's `AsyncLocalStorage`), so you can read it anywhere during the request.
3. Checks the `Authorization` header exists, starts with `Bearer `, and the token has **3 dot-separated parts**
   (`header.payload.signature`). This is a cheap sanity check before the real verification.
4. Creates a **per-request** Supabase client:
   ```ts
   createClient(URL, KEY, {
     global: { headers: { Authorization: `Bearer ${token}` } },   // every DB call is made AS THE USER
     auth: { storage: undefined, persistSession: false, autoRefreshToken: true },
   });
   ```
   Because the user's JWT is forwarded on every PostgREST call, **Postgres runs the query as that user and RLS
   applies**. The server never needs the service-role key for normal operations.
5. `supabase.auth.getClaims(token)` **verifies the JWT signature**. If the project uses asymmetric JWT signing keys,
   supabase-js verifies locally against the project's public JWKS (`/auth/v1/.well-known/jwks.json`, cached). With
   legacy symmetric (HS256) secrets it falls back to asking the Auth server. Either way a forged or expired token
   is rejected.
6. `claims.sub` is the **user's UUID** (the JWT "subject").
7. `next({ context: { supabase, userId, claims } })`: the handler receives these, **typed**.

**Defense in depth:** handlers *also* add `.eq("user_id", context.userId)` even though RLS already filters. If RLS
were ever misconfigured, the explicit filter still protects the data.

### 5.3 `createSupabaseFetch` and the new API keys
Supabase introduced new key formats, `sb_publishable_...` and `sb_secret_...`, which are **opaque strings, not
JWTs**. supabase-js historically sent the API key as both `apikey:` and `Authorization: Bearer <key>`. The custom
fetch removes the `Authorization` header **only when it equals the API key**, so an opaque key is never presented as
a bearer JWT, and it always sets `apikey`. In `auth-middleware.ts` that custom fetch is **commented out**, because there
the `Authorization` header carries the *user's* JWT, which must be kept.

---

## 6. TanStack Router — file-based routing

### 6.1 Route files in this project

| File | URL | Notes |
|---|---|---|
| `routes/__root.tsx` | (wraps everything) | `createRootRouteWithContext` |
| `routes/index.tsx` | `/` | `ssr:false`; `beforeLoad` redirects to `/home` or `/auth` and renders `null` |
| `routes/auth.tsx` | `/auth` | login page |
| `routes/auth/callback.tsx` | `/auth/callback` | OAuth return URL |
| `routes/_authenticated/route.tsx` | *(no URL segment)* | **pathless layout**. The leading `_` means it adds no path segment, but wraps its children with an auth guard and the nav header |
| `routes/_authenticated/home.tsx` | `/home` | task board |
| `routes/_authenticated/chat.tsx` | `/chat` | |
| `routes/_authenticated/documents.tsx` | `/documents` | |
| `routes/_authenticated/permissions.tsx` | `/permissions` | the link is commented out of the nav, but the route exists |
| `routes/_authenticated/documentation.tsx` | `/documentation` | renders `content/documentation.md` |

`src/routes/README.md` lists the naming rules: `$id` is a dynamic param, `{-$x}` is optional, `$` is a splat, and `_x`
is a layout.

### 6.2 Router APIs you call

| API | Where | What it does |
|---|---|---|
| `createFileRoute("/path")({...})` | every route | Defines a route. The string must match the file path (the plugin keeps it in sync). |
| `beforeLoad` | `index.tsx`, `_authenticated/route.tsx` | Runs **before** the route and its children load, top-down. Ideal for auth guards. Whatever it returns is merged into **route context** (`{ user }` here). |
| `throw redirect({ to })` | same | Redirects are thrown, not returned. That stops loading immediately, and the router catches it and navigates. |
| `ssr: false` | `index.tsx`, `_authenticated` | Disables SSR for that route subtree (see §3.3). |
| `component` | every route | The React component for the route. |
| `head` | `__root`, `auth`, `home` | Title/meta per route. |
| `<Outlet/>` | `__root`, `_authenticated/route.tsx` | Where children render. |
| `<Link to activeProps>` | nav | Type-safe link with client-side navigation and preloading. `activeProps` applies a class when the route is active (highlighted nav item). |
| `useNavigate()` | auth, callback, layout | Imperative navigation: `navigate({ to: "/home" })`. |
| `useRouter()` + `router.invalidate()` | `__root.tsx` | Marks all matches stale and **re-runs `beforeLoad`/loaders**. It's called on `SIGNED_IN`/`SIGNED_OUT`/`USER_UPDATED`, so the guard re-checks auth instantly. |
| `Route.useRouteContext()` | `__root.tsx` | Reads the injected `queryClient`. |

### 6.3 Vite import suffixes used with routes
- `styles.css?url` gives the final URL string of the built CSS, used in `<link>`.
- `documentation.md?raw` gives the **file contents as a string** at build time, rendered with `<ReactMarkdown>`.
  No server request is needed; the markdown is bundled into the JS.

---

## 7. TanStack Query — server state on the client

### 7.1 Why use it
`useEffect + fetch + useState` means you hand-write loading and error states, caching, de-duplication, refetching
and race-condition handling. TanStack Query treats **server data as a cache** keyed by a **query key**.

### 7.2 Concepts and every API used

| API | Example in TaskBase | Behavior |
|---|---|---|
| `new QueryClient()` | `router.tsx` | The cache store. One per request on the server, one for the app in the browser. |
| `<QueryClientProvider client>` | `__root.tsx` | Makes the client available to hooks. |
| `useQuery({ queryKey, queryFn })` | `["tasks"]`, `["chat"]`, `["documents"]` | Runs `queryFn`, caches the result under the key, returns `{ data, isLoading, error, refetch, ... }`. Several components with the same key share **one** request. |
| `enabled: false` | `["task-summary"]` | The query **never runs automatically**; you trigger it with `summaryQuery.refetch()` after a refine. That avoids a Gemini call on every page load. |
| `useMutation({ mutationFn, onSuccess, onError })` | create/update/delete/reorder/refine/sync | For writes. Exposes `mutate()` (fire-and-forget), `mutateAsync()` (returns a promise; used in `handleSubmit`), and `isPending` (drives the spinner and disables the Refine button). |
| `useQueryClient()` | everywhere | Gets the client to manipulate the cache. |
| `queryClient.invalidateQueries({ queryKey })` | after every mutation | Marks the data **stale** and refetches active queries. With no arguments (`__root.tsx`) it invalidates **everything**. |
| `queryClient.setQueryData(["tasks"], merged)` | `handleDragEnd` in `home.tsx` | **Optimistic update**: writes to the cache directly, so the UI reorders instantly before the server answers. `reorderMut` then persists, and its `onSuccess` invalidates to reconcile with the server. |

**Defaults worth knowing:** `staleTime: 0` (data is stale immediately), refetch on window focus and on reconnect,
**3 retries** with exponential backoff for failed queries (mutations aren't retried), and unused cache entries are
garbage-collected after 5 minutes (`gcTime`).

**Optimistic update pattern in one sentence:** *update the cache first, send the request, and on error roll back or
invalidate.* TaskBase invalidates on success and shows a toast on error. A stricter version would snapshot the
previous data in `onMutate` and restore it in `onError`.

---

## 8. React 19 features used

| Hook / feature | Where | Why |
|---|---|---|
| `useState` | everywhere | local UI state (dialog open, section tab, upload progress) |
| `useEffect` + **cleanup** | `__root.tsx` (`subscription.unsubscribe()`), `callback.tsx` (`active=false`), `agent-timeline.tsx` (`clearInterval`) | side effects; the cleanup prevents leaks and setting state after unmount |
| `useMemo` | `home.tsx` (`visible`, `topPriorities`, `upcoming`, completion %) | recomputes only when `tasks`/`section` change |
| `useRef` | `documents.tsx` (`progressPollRef`, `inputRef`) | holds the `setInterval` id across renders **without causing re-renders**; resets the file input |
| Controlled inputs | `task-editor.tsx` | `value` + `onChange` |
| `key` prop | lists | React's reconciliation needs stable keys (task `id`) |
| Conditional rendering, composition | everywhere | |

**Stale-closure guard** in `callback.tsx`: `let active = true; ... return () => { active = false }`. React StrictMode
mounts effects twice in dev, and the auth listener can fire after unmount, so the flag prevents navigating from a dead
component.

---

## 9. Supabase — what it really is

Supabase is **not one product**. It's a hosted Postgres database plus open-source services in front of it:

| Service | What it is | Used by TaskBase? |
|---|---|---|
| **PostgreSQL** | the actual database | ✅ all data |
| **PostgREST** | auto-generates a **REST API** from your schema: `/rest/v1/<table>` and `/rest/v1/rpc/<function>` | ✅ every `.from()` / `.rpc()` |
| **GoTrue (Supabase Auth)** | users, sessions, JWTs, OAuth providers: `/auth/v1/...` | ✅ Google login |
| Storage | S3-like file storage | ❌ (files are sent as base64 and only their text is kept) |
| Realtime | Postgres changes over websockets | ❌ (upload progress uses **polling** instead) |
| Edge Functions | Deno serverless functions | ❌ (TanStack server functions play this role) |

### 9.1 supabase-js query builder → HTTP

supabase-js is a thin, **chainable builder that produces a PostgREST HTTP request**. Nothing is sent until you `await`.

| Code in TaskBase | HTTP that gets sent | SQL Postgres runs (roughly) |
|---|---|---|
| `.from("tasks").select("*").order("position",{ascending:true})` | `GET /rest/v1/tasks?select=*&order=position.asc` | `SELECT * FROM tasks ORDER BY position` |
| `.select("position").eq("user_id", id).order("position",{ascending:false}).limit(1).maybeSingle()` | `GET ...?select=position&user_id=eq.<id>&order=position.desc&limit=1` | `... LIMIT 1` |
| `.insert({...}).select().single()` | `POST /rest/v1/tasks` + `Prefer: return=representation` | `INSERT ... RETURNING *` |
| `.update(patch).eq("id", id).eq("user_id", uid)` | `PATCH /rest/v1/tasks?id=eq.<id>&user_id=eq.<uid>` | `UPDATE ... WHERE ...` |
| `.delete().eq("user_id", uid)` | `DELETE /rest/v1/tasks?user_id=eq.<uid>` | `DELETE ... WHERE ...` |
| `.in("name", ["calendar!@#.txt","gmail!@#.txt"])` | `?name=in.(...)` | `WHERE name IN (...)` |
| `.select("id", { count: "exact", head: true })` | `HEAD /rest/v1/documents?select=id` + `Prefer: count=exact` | `SELECT count(*)`; **no rows returned**, the count comes back in the `Content-Range` header |
| `.rpc("match_document_chunks", { query_embedding, match_count })` | `POST /rest/v1/rpc/match_document_chunks` with a JSON body | `SELECT * FROM match_document_chunks(...)` |

| Modifier | Meaning |
|---|---|
| `.single()` | expects **exactly one** row; errors otherwise. Returns an object instead of an array |
| `.maybeSingle()` | zero or one row; `data` is `null` if there are none (used for "does this exist?") |
| `.select()` after insert/update | asks PostgREST to **return** the written rows |

Every call returns `{ data, error }` and **does not throw**. That's why the code always does
`if (error) throw new Error(error.message)`.

### 9.2 The lazy Proxy client (`client.ts`)
```ts
export const supabase = new Proxy({} as SupabaseClient, {
  get(_, prop, receiver) {
    if (!_supabase) _supabase = createSupabaseClient();
    return Reflect.get(_supabase, prop, receiver);
  },
});
```
- **JS Proxy:** intercepts property access. The first time anyone touches `supabase.auth` or `supabase.from`, the real
  client is created; after that, every access is forwarded to it with `Reflect.get`.
- **Why:** the module is imported during SSR too. Creating the client at import time would touch `localStorage`
  and env vars that may not exist on the server. The Proxy defers creation to first real use (the singleton pattern
  with lazy initialization).

### 9.3 Client options explained
```ts
auth: {
  storage: typeof window !== "undefined" ? localStorage : undefined,  // where the session is saved
  persistSession: true,      // survive page reloads
  autoRefreshToken: true,    // refresh the JWT in the background before it expires (default lifetime ~1h)
  flowType: "implicit",      // see §10.3
}
```

### 9.4 Env-variable fallbacks
`import.meta.env.VITE_*` is replaced **at build time** by Vite. Only variables prefixed `VITE_` are exposed to the
browser, which is why the *publishable* key is `VITE_SUPABASE_KEY` while `GEMINI_API_KEY` and
`SUPABASE_SERVICE_ROLE_KEY` have no `VITE_` prefix. They must never reach the client. `process.env.*` is read at
**runtime** on the server (Docker, Nitro).

### 9.5 `client.server.ts`: the admin client
It's built with `SUPABASE_SERVICE_ROLE_KEY`, which **bypasses RLS**. It's generated scaffolding and **not used** by
TaskBase, which intentionally does everything as the user. If asked, explain that the service role is for trusted
admin jobs only and must never be imported into client-reachable code.

### 9.6 `types.ts`: the generated database types
`createClient<Database>(...)` makes `.from("tasks")` autocomplete column names and type the rows. You can generate it
with `supabase gen types typescript`.

---

## 10. Supabase Auth, JWTs and Google OAuth

### 10.1 What a Supabase JWT contains
A JWT is `base64url(header).base64url(payload).signature`. The Supabase access token payload includes:
- `sub`: the user id (UUID). This is what `auth.uid()` returns in SQL.
- `role`: `"authenticated"`. PostgREST does `SET ROLE authenticated`, which is why the migrations `GRANT ... TO authenticated`.
- `email`, `exp` (expiry), `iat`, `aud`, `app_metadata` (contains the provider, e.g. `google`), `user_metadata`.

The signature proves Supabase issued it. Anyone can *read* a JWT, so **never put secrets in it**.

### 10.2 Three auth calls that look alike but aren't

| Call | Network? | Trust level | Used in |
|---|---|---|---|
| `supabase.auth.getSession()` | **no** (reads localStorage; may refresh) | **not verified**: localStorage can be tampered with | attaching the token, reading `provider_token` |
| `supabase.auth.getUser()` | **yes**, `GET /auth/v1/user` | **verified by the Auth server** | route guards (`beforeLoad`), `documents.tsx` |
| `supabase.auth.getClaims(jwt)` | usually no (JWKS cached) | **verified** signature | server middleware |

Interview line: *"Never trust `getSession()` on the server; verify with `getUser()` or `getClaims()`."* TaskBase
follows this rule.

### 10.3 The OAuth flow, step by step

```
auth.tsx  google()
  supabase.auth.signInWithOAuth({
     provider: "google",
     options: { redirectTo: <origin>/auth/callback,
                scopes: "calendar.readonly gmail.readonly calendar.events",
                queryParams: { access_type: "offline", prompt: "consent" } } })
  → returns data.url → window.location.assign(url)

Browser → https://<project>.supabase.co/auth/v1/authorize?provider=google&scopes=...
       → Google consent screen (user approves scopes)
       → Google redirects to Supabase's callback with an authorization code
       → Supabase exchanges the code with Google, gets Google's access token (+ refresh token),
         creates/updates the user, mints a Supabase JWT
       → redirects to  /auth/callback#access_token=<supabase jwt>&refresh_token=...&provider_token=<google token>&...
                               (IMPLICIT FLOW = tokens in the URL #fragment)

callback.tsx
  supabase-js (detectSessionInUrl) parses the #fragment, stores the session in localStorage,
  fires onAuthStateChange("SIGNED_IN", session)
  → handleSession(): verifyGoogleTokenScopes(session.provider_token)
       → GET https://www.googleapis.com/oauth2/v1/tokeninfo?access_token=...
       → checks the "scope" string includes all 3 scopes
       → missing? signOut() + localStorage flag + redirect /auth?error=permissions_required
       → ok? navigate("/home")
```

| OAuth parameter | Meaning |
|---|---|
| `scopes` | the permissions requested. `calendar.readonly` = read events; `calendar.events` = create/edit events; `gmail.readonly` = read mail |
| `access_type: "offline"` | asks Google for a **refresh token** too (Supabase returns it as `provider_refresh_token`) |
| `prompt: "consent"` | always show the consent screen, so the user re-grants every scope (Google only returns a refresh token on consent) |
| `redirectTo` | must be in Supabase's allowed redirect URLs |

### 10.4 Implicit flow vs PKCE (a common question)
- **Implicit:** tokens come back in the URL **fragment** (`#...`). Fragments are never sent to servers, but they can
  leak through browser history or extensions. It's simpler: no code exchange step.
- **PKCE (Proof Key for Code Exchange):** the client generates a random `code_verifier`, sends its hash
  (`code_challenge`), and gets back a **one-time `?code=`** that it exchanges, together with the verifier, for tokens.
  An intercepted code is useless without the verifier. **PKCE is the recommended and more secure flow**, and it's
  the supabase-js default for SSR setups.
- **Why TaskBase chose implicit:** the session, *including `provider_token`*, is available immediately on the
  callback page with no exchange step (`exchangeCodeForSession`) to implement. Be honest in an interview: PKCE can
  also give you the provider token after the exchange, so the real reason is simplicity. Moving to PKCE is a sensible
  hardening step.

### 10.5 Two different tokens
| Token | Issued by | Used for | Lifetime |
|---|---|---|---|
| `session.access_token` | **Supabase** | calling *your* backend and Supabase (RLS) | ~1 hour, auto-refreshed |
| `session.provider_token` | **Google** | calling Google Calendar and Gmail | ~1 hour, **not auto-refreshed by Supabase** |

Supabase does **not** persist `provider_token` server-side, and it isn't re-issued when the Supabase session refreshes.
After about an hour, Google calls fail with **401** until the user logs in again. The proper fix is to store
`provider_refresh_token` securely and exchange it at `https://oauth2.googleapis.com/token`.

### 10.6 `onAuthStateChange`
It's an event subscription. Events include `INITIAL_SESSION`, `SIGNED_IN`, `SIGNED_OUT`, `TOKEN_REFRESHED`,
`USER_UPDATED`, `PASSWORD_RECOVERY`. `__root.tsx` reacts to sign-in, sign-out and user-updated by **invalidating the
router and all queries**, so a user switch never shows stale data. It returns `{ data: { subscription } }`, and you
must `unsubscribe()` in the effect's cleanup.

---

## 11. PostgreSQL, SQL & Row Level Security

### 11.1 Schema features used (from `supabase/migrations`)

| SQL feature | Example | Explanation |
|---|---|---|
| **ENUM types** | `CREATE TYPE task_priority AS ENUM ('high','medium','low')` | The DB rejects invalid values; Zod mirrors this with `z.enum`. |
| **UUID PK** | `id UUID PRIMARY KEY DEFAULT gen_random_uuid()` | Random ids aren't guessable or sequential, and clients can generate them too (`crypto.randomUUID()` for `upload_progress`). |
| **Foreign key + cascade** | `user_id ... REFERENCES auth.users(id) ON DELETE CASCADE` | Deleting a user deletes their rows; deleting a document deletes its chunks. |
| **Arrays** | `tags TEXT[] DEFAULT '{}'` | Postgres native arrays; supabase-js sends and receives JS arrays. |
| **Composite index** | `CREATE INDEX tasks_user_position_idx ON tasks(user_id, position)` | Matches the query "this user's tasks ordered by position", so it's index-only ordering. |
| **Trigger** | `BEFORE UPDATE ... EXECUTE FUNCTION set_updated_at()` | A PL/pgSQL function that sets `NEW.updated_at = now()` on every update, so app code can't forget. |
| **`SET search_path = public`** on functions | | Prevents search-path hijacking in functions (a Supabase security advisory). |
| **CHECK constraint** | `upload_progress.status CHECK (status IN (...))` | DB-level state machine validation. |
| **GRANT** | `GRANT SELECT, INSERT, UPDATE, DELETE ON tasks TO authenticated` | Table privileges per role. RLS then narrows down which **rows**. |
| `CREATE EXTENSION vector / pgcrypto` | | pgvector for embeddings; pgcrypto provides `gen_random_uuid()` on older Postgres versions. |

### 11.2 Row Level Security (RLS)
`ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;` means **no rows are visible unless a policy allows them**.

```sql
CREATE POLICY "tasks_select_own" ON tasks FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "tasks_insert_own" ON tasks FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "tasks_update_own" ON tasks FOR UPDATE TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
```
- **`USING`** filters **existing rows** that can be seen, updated or deleted. Postgres adds it to the `WHERE` clause.
- **`WITH CHECK`** validates **new or modified rows**. You can't insert a row with someone else's `user_id`, and an
  update can't move a row to another user.
- **`auth.uid()`** is a Supabase SQL function that reads `sub` from the JWT claims PostgREST set for the request.
- `chat_messages` has **no UPDATE policy**, so messages are effectively immutable.

**Why RLS is powerful:** security lives **in the database**. Even if a server function forgot `.eq("user_id")`, or
someone called PostgREST directly with their own JWT, they could only touch their own rows.

### 11.3 The `match_document_chunks` SQL function
```sql
create or replace function public.match_document_chunks(query_embedding vector(1536), match_count int default 5)
returns table (id uuid, document_id uuid, content text, similarity float)
language sql as $$
  select c.id, c.document_id, c.content, 1 - (c.embedding <=> query_embedding) as similarity
  from public.document_chunks c
  where c.user_id = auth.uid() and c.embedding is not null
  order by c.embedding <=> query_embedding
  limit match_count;
$$;
```
- **Why a SQL function at all?** PostgREST can't express `ORDER BY embedding <=> $vector` through query-string
  filters. A function exposed at `/rpc/` is the standard Supabase pattern for vector search.
- **`SECURITY INVOKER`** (the default; migration 3 removed `SECURITY DEFINER`): the function runs with the
  **caller's** privileges, so RLS applies *and* the explicit `auth.uid()` filter applies.
- `SECURITY DEFINER` (migration 2's version) would run as the function *owner* and bypass RLS. That's safe only
  because it filters by `owner` manually. Invoker is the safer default.
- `STABLE` (in the first version) tells the planner the function doesn't modify data and returns the same result
  within a statement.

### 11.4 Transactions (what's *not* there)
`refineTasksWithAI` does `DELETE all tasks` and then `INSERT new tasks` as **two separate HTTP calls**, so there's no
transaction. If the insert fails, the user is left with **zero tasks**. The textbook fix is to move both statements
into one SQL function (`/rpc/replace_tasks`), which runs inside a single transaction.

---

## 12. pgvector, embeddings and RAG

### 12.1 Embeddings in plain words
An **embedding** is a list of numbers (here, **1536 floats**) that represents the *meaning* of a text. Texts with
similar meanings get vectors that point in similar directions. "Submit the calculus assignment" and "math homework
due" end up close together even though they share no words.

### 12.2 Cosine similarity: the math
```
cos(θ) = (A · B) / (|A| · |B|)         range −1 … 1  (1 = same direction)
cosine distance = 1 − cos(θ)            pgvector operator  <=>
similarity in the SQL = 1 − (a <=> b)   → back to cosine similarity
```
pgvector has three distance operators: `<->` (Euclidean / L2), `<#>` (negative inner product) and `<=>` (cosine).
**The operator in `ORDER BY` must match the index's operator class** (`vector_cosine_ops` ↔ `<=>`), or Postgres won't
use the index.

### 12.3 The HNSW index
```sql
create index document_chunks_embedding_idx on document_chunks using hnsw (embedding vector_cosine_ops);
```
- Exact nearest-neighbor search compares the query with **every** row, which is O(n).
- **HNSW (Hierarchical Navigable Small World)** builds a multi-layer graph where each vector links to its near
  neighbors. Search starts at the sparse top layer and greedily walks down. This gives **approximate** nearest
  neighbors (ANN) in roughly logarithmic time.
- Build parameters are `m` (links per node, default 16) and `ef_construction` (default 64). The query-time parameter
  is `hnsw.ef_search` (default 40, the candidate list size).
- **HNSW vs IVFFlat:** IVFFlat clusters vectors into `lists` and needs data present *before* building, but builds
  faster. HNSW gives better recall vs speed and can be built on an empty table. That's why it's the usual default.
- **pgvector limits:** an HNSW index on the `vector` type supports up to 2000 dimensions, so 1536 fits. (3072, the
  Gemini default, would not, which is another reason for `outputDimensionality: 1536`.)
- **Advanced point:** filters like `WHERE user_id = auth.uid()` are applied **after** the ANN candidate search. With
  many users, the top 40 candidates might mostly belong to other users, so you could get fewer than `match_count`
  results. pgvector 0.8 added *iterative index scans* to mitigate this. Alternatives are a larger `ef_search` or
  partial indexes per tenant.

### 12.4 The RAG pipeline in TaskBase

**Ingestion (`uploadDocument`):**
```
File (browser) ── fileToBase64 (32KB chunks + btoa) ──▶ server
extractText:   .txt/.md → TextDecoder (UTF-8)
               .pdf     → unpdf.getDocumentProxy(bytes) → extractText({ mergePages: true })
normalizeText: \r\n→\n, collapse 3+ newlines, trim
chunkText:     sliding window 4000 chars, step = 4000 + 1 − 150 → ~150-char overlap; drop chunks ≤ 20 chars
embed:         loop in groups of 100 → ensureNotCancelled() → embedTexts(batch) (one API call per chunk)
store:         INSERT document_chunks (content, embedding vector(1536))
```
**Why chunk at all?** Embedding models have input limits, and one vector for a 50-page PDF would blur every topic
together. Smaller chunks give precise retrieval. **Why overlap?** A sentence cut at a boundary still appears whole
in one of the two chunks.

**Retrieval (`retrieveContext` in `rag.server.ts`):**
```
query text → embedTexts([query]) → supabase.rpc("match_document_chunks", {query_embedding, match_count})
          → "[1] chunk…\n\n[2] chunk…"  → pasted into the prompt as KNOWLEDGE BASE
```
- In `chat`, the query is the **user's message** (top 5).
- In `refineTasksWithAI`, the query is **recent chat + task titles** (top 6).
- Errors are **swallowed** (`return ""`), so the AI still answers without context. Graceful degradation, but it
  can hide bugs (see §18).

**Generation:** the prompt combines rules, the date, the tasks as JSON, the KB excerpts, the chat history, and the
calendar and Gmail text. Gemini answers, the app parses JSON, validates with Zod, and writes to the DB.

**Why calendar and Gmail are fetched directly instead of via RAG:** their text is turned into KB docs named
`calendar!@#.txt` / `gmail!@#.txt`, but `refineTasksWithAI` **always** loads their full chunks. Similarity search might
not rank them highly, and schedule data is always relevant. Retrieval is for "maybe relevant"; direct injection is for
"always relevant".

### 12.5 Cooperative cancellation & progress (polling)
- The browser inserts an `upload_progress` row with a client-generated UUID **before** calling the server.
- It **polls** that row every second with `setInterval` and Supabase directly from the browser (RLS lets the user read
  and update their own row).
- "Cancel" sets `status = 'cancel_requested'`. The server calls `ensureNotCancelled()` before each batch, sees the
  flag, marks the row `cancelled` and throws.
- **Why not `AbortController`?** Aborting the HTTP request only stops the *client* from waiting. The server handler
  keeps running and paying for embeddings. A DB flag is a channel the *server* can check.
- **Alternative:** Supabase **Realtime** (websocket push) instead of polling, or server-sent events.

---

## 13. Google Gemini (`@google/genai`) and prompt engineering

### 13.1 The SDK calls (`gemini.server.ts`)
```ts
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

// Text generation
const res = await ai.models.generateContent({ model: "gemini-3.1-flash-lite", contents: prompt });
res.text;                       // convenience getter: concatenated text of the first candidate

// Embeddings
const r = await ai.models.embedContent({
  model: "gemini-embedding-001",
  contents: input,
  config: { outputDimensionality: 1536, taskType: "SEMANTIC_SIMILARITY" },
});
r.embeddings[0].values;         // number[] of length 1536
```
- `@google/genai` is Google's current unified SDK (the successor to `@google/generative-ai`). Under the hood it sends
  HTTPS POSTs to `generativelanguage.googleapis.com` with your API key.
- **`outputDimensionality`:** `gemini-embedding-001` natively outputs 3072 dimensions. It was trained with
  *Matryoshka Representation Learning*, so a **prefix** of the vector is still a good embedding. Requesting 1536 halves
  storage and index size and fits pgvector's HNSW limit. The code also **asserts** `vector.length === 1536` to fail
  fast. (Google recommends normalizing truncated vectors; with cosine distance the magnitude doesn't matter anyway.)
- **`taskType`:** tells the model how the vector will be used. `SEMANTIC_SIMILARITY` is for comparing texts with each
  other. For search, Google recommends **`RETRIEVAL_DOCUMENT`** for stored chunks and **`RETRIEVAL_QUERY`** for the
  question (asymmetric). That's a good "what would you improve" answer.
- **`getAiClient()`** is created per call and reads the key lazily. It throws early if the key is missing.
- The key lives only in a `.server.ts` file and is read from `process.env` with no `VITE_` prefix, so it's never
  bundled to the browser.

### 13.2 Prompt engineering techniques used
1. **Role + task:** "You are a productivity assistant. Refine the user's task list."
2. **Grounding context in labelled sections:** `CURRENT TASKS (JSON)`, `KNOWLEDGE BASE`, `GOOGLE CALENDAR DATA`, …
3. **Explicit rules:** keep user tasks, don't invent details, date format `YYYY-MM-DD`.
4. **Output contract:** "Return STRICT JSON only" plus an example **JSON shape**.
5. **Explainability:** `ai_reason` per task, and a first-person `summary`.
6. **Fallback markers:** `(no calendar data synced)`, so the model doesn't hallucinate missing sections.
7. **Tool-like intent detection:** in `chat`, the model sets `"updateTasks": true` when the board should change.
   That's a lightweight form of **function calling / agent routing**. The client then calls `refineTasksWithAI`.

### 13.3 Parsing LLM output safely
```ts
function parseAIJson(raw) {          // ai.functions.ts
  const s = raw.indexOf("{"), e = raw.lastIndexOf("}");
  if (s === -1 || e === -1) throw new Error("Invalid output from the AI");
  return JSON.parse(raw.substring(s, e + 1));
}
const parsed = RefineResponseSchema.parse(parseAIJson(raw));   // then Zod validates the shape
```
LLMs often wrap JSON in ```` ```json ```` fences or add prose. Slicing from the first `{` to the last `}` removes that,
and **Zod** guarantees the shape (and fills defaults like `priority: "medium"`).
**A better production approach** is Gemini's structured output: `config: { responseMimeType: "application/json",
responseSchema: ... }` constrains generation itself.

### 13.4 Rate limits and errors
The free tier has requests-per-minute limits and returns **429/503** when overloaded. `embedTexts` runs
**sequentially**, which naturally limits the request rate. The header popover mentions "exponential backoff", but
**there is no retry code in `gemini.server.ts`**. Know this before an interviewer finds it (see §18). A retry
wrapper would look like this:
```ts
for (let attempt = 0; attempt < 5; attempt++) {
  try { return await call(); }
  catch (e) { if (!isRetryable(e)) throw e; await sleep(2 ** attempt * 1000 + Math.random() * 250); } // jitter
}
```

---

## 14. Zod — runtime validation

TypeScript types **disappear at runtime**. Anything arriving over the network (the client input to a server function,
or an LLM's output) is really `unknown`. Zod checks it at runtime **and** gives you the TypeScript type.

| Zod API | Example | Meaning |
|---|---|---|
| `z.object({...})` | `CreateTaskInput` | object schema; unknown keys are **stripped** by default |
| `z.string().min(1).max(200)` | title | length constraints |
| `z.string().uuid()` | ids | format check |
| `z.enum(["high","medium","low"])` | priority | literal union |
| `.optional()` / `.nullable()` | `due_date: z.string().nullable().optional()` | may be `undefined` / may be `null` |
| `.default(x)` | `priority: ...default("medium")` | fills the value if missing (the output type is then non-optional) |
| `z.array(z.string())` | tags | |
| `z.boolean().default(false)` | `updateTasks` | |
| `.parse(x)` | everywhere | returns typed data or **throws** `ZodError` |
| `.safeParse(x)` | (not used) | returns `{ success, data \| error }` without throwing |
| `z.infer<typeof Schema>` | `let parsed: z.infer<typeof RefineResponseSchema>` | derives the TS type from the schema, a single source of truth |

**Why validate the AI output too:** the model might return `"priority": "urgent"`, or forget `tags`. Zod either fixes it
with defaults or rejects it *before* bad data hits the DB enum (which would fail anyway, but with an uglier error).

---

## 15. Google Calendar & Gmail REST APIs

All calls are plain `fetch` with `Authorization: Bearer <provider_token>`; no Google SDK is involved.

| Call | Endpoint | Parameters & why |
|---|---|---|
| Read events | `GET https://www.googleapis.com/calendar/v3/calendars/primary/events` | `timeMin=<now ISO>` = only future events; `maxResults=50`; **`singleEvents=true`** = expand recurring events into individual instances (required for `orderBy=startTime`); `orderBy=startTime` |
| Create event | `POST .../calendars/primary/events` | body: `summary`, `description`, **all-day** `start.date` / `end.date` (`YYYY-MM-DD`). **The end date is exclusive**, so a one-day event on the 2nd ends on the 3rd, hence `getNextDayStr()` using UTC math to avoid timezone shifts. `extendedProperties.private` = hidden key/values (`productivity_companion`, `task_id`) visible only to this app, useful for dedup later |
| List mail | `GET https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=20` | returns only `{id, threadId}` per message |
| Get mail | `GET .../messages/{id}?format=metadata&metadataHeaders=Subject&metadataHeaders=From&metadataHeaders=Date` | `format=metadata` = headers only, no body (privacy + speed); `snippet` = Google's short preview text |
| Scope check | `GET https://www.googleapis.com/oauth2/v1/tokeninfo?access_token=...` | returns `scope`, `expires_in`, `email` |

**The N+1 pattern:** Gmail needs one list call plus 20 get calls, made **sequentially** in a `for` loop. They could
run in parallel with `Promise.all`, or use Gmail's **batch** endpoint.

**Known limitation:** each sync **creates** calendar events again; it doesn't check `extendedProperties` for existing
ones. Repeated syncs can create duplicates. The tag is there so dedup can be added (search with
`privateExtendedProperty=task_id=<id>`).

---

## 16. UI layer

### 16.1 Tailwind CSS v4 (`src/styles.css`)
Tailwind is **utility-first CSS**: classes like `flex items-center gap-2 rounded-md px-3` map to single CSS rules.
The build scans source files and emits **only the classes you use**.

v4 is **CSS-first**: there's no `tailwind.config.js`; configuration lives in CSS.

| Directive in `styles.css` | Meaning |
|---|---|
| `@import "tailwindcss" source(none);` | load Tailwind, and **turn off automatic source detection** |
| `@source "../src";` | …then scan only `src/` for class names |
| `@plugin "@tailwindcss/typography";` | adds `prose` classes (used for rendered markdown) |
| `@import "tw-animate-css";` | animation utilities used by shadcn (`animate-in`, `fade-in`, …) |
| `@custom-variant dark (&:is(.dark *));` | `dark:` variant activates under a `.dark` ancestor (class strategy) |
| `@theme inline { --color-primary: var(--primary); ... }` | registers **design tokens** so `bg-primary` and `text-muted-foreground` exist; `inline` makes the utility reference the variable directly |
| `@utility card-soft { ... }` | defines a **custom utility class** usable like any Tailwind class |
| `oklch(L C H)` colors | perceptually uniform color space: equal lightness steps *look* equal, so themes are easier to tune |

The Vite plugin `@tailwindcss/vite` replaces the PostCSS setup of v3 and is faster (its engine is written in Rust).

### 16.2 shadcn/ui + Radix UI
- **shadcn/ui is not a library you install.** It's a CLI that **copies component source code** into
  `src/components/ui/`. You own and edit the code. `components.json` tells the CLI the style (`new-york`), the CSS
  file, the aliases (`@/components/ui`) and the icon library (`lucide`).
- The components are built on **Radix UI primitives** (`@radix-ui/react-dialog`, `-dropdown-menu`, `-popover`,
  `-select`, `-tabs`, `-checkbox`, `-collapsible`, `-progress`), which are **unstyled, accessible** components with
  focus trapping, keyboard navigation, ARIA attributes and portals done right. Tailwind then supplies the look.
- **`asChild`** (used in `<DropdownMenuTrigger asChild>`, `<SheetClose asChild>`): Radix's `Slot` merges the trigger's
  behavior **into your child element** instead of rendering an extra `<button>`. That avoids `<button><button>` nesting.
- **`class-variance-authority` (cva)** powers `<Button variant="outline" size="sm">`. It maps variant props to class
  strings.
- Components used in TaskBase: Button, Dialog, DropdownMenu, Popover, Sheet (mobile nav drawer), Tabs, Collapsible,
  Progress, Checkbox, Select, Input, Textarea, Label, and Sonner's Toaster.

### 16.3 `cn()` (`src/lib/utils.ts`)
```ts
export function cn(...inputs: ClassValue[]) { return twMerge(clsx(inputs)); }
```
- **`clsx`** builds a class string from conditionals: `clsx("a", isDone && "line-through")`.
- **`tailwind-merge`** resolves **conflicts**: `twMerge("px-2 px-4")` gives `"px-4"`. Without it, the CSS source
  order decides, not the order in your string.

### 16.4 dnd-kit (drag-and-drop)
| API | Where | Role |
|---|---|---|
| `<DndContext sensors collisionDetection={closestCenter} onDragEnd>` | `home.tsx` | provider that tracks the drag state |
| `useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }))` | `home.tsx` | input methods. A 6px threshold means **clicks on buttons inside cards still work**. The keyboard sensor makes reordering **accessible** (space to lift, arrows to move) |
| `closestCenter` | | collision algorithm: the droppable whose center is nearest the dragged item |
| `<SortableContext items={ids} strategy={verticalListSortingStrategy}>` | `home.tsx` | declares a sortable list |
| `useSortable({ id, disabled })` | `task-card.tsx` | returns `attributes`, `listeners` (spread on the drag handle), `setNodeRef`, `transform`, `transition`, `isDragging` |
| `CSS.Transform.toString(transform)` | `task-card.tsx` (`@dnd-kit/utilities`) | converts the transform object to a CSS `translate3d(...)`. Moving with transforms is GPU-friendly and avoids layout reflow |
| `arrayMove(arr, from, to)` | `handleDragEnd` | immutable reorder helper |

Flow: drag ends → `arrayMove` on the **visible** (filtered) list → append the hidden tasks → `setQueryData`
(optimistic) → `reorderTasks` persists `position = index`.

### 16.5 date-fns
A functional, tree-shakeable date library that works on native `Date` objects.
`parseISO("2026-07-02")` → Date; `startOfDay/endOfDay`, `startOfWeek/endOfWeek` (week starts **Sunday** by default),
`startOfMonth/endOfMonth`; `isWithinInterval(date, {start, end})`; `isBefore`; `format(date, "MMM d")`.
Used for the All, Today, Week, Month and Past tabs.

### 16.6 Sonner, Markdown, Lucide
- **Sonner:** `toast.success/error/info/message(title, { description, duration })`, mounted once with
  `<Toaster richColors position="top-right" />`. It works outside React components too (`google-permissions.ts`).
- **react-markdown** converts markdown to React elements. It doesn't use `dangerouslySetInnerHTML` and doesn't
  render raw HTML by default, which makes AI output **safe against XSS**. **remark-gfm** adds GitHub-flavored
  markdown: tables, strikethrough, task lists, autolinks.
- **`@tailwindcss/typography`** `prose` classes style the generated HTML.
- **lucide-react:** tree-shakeable SVG icon components (`<Sparkles className="h-4 w-4" />`).

### 16.7 `AgentTimeline`: a *simulated* progress UI
Steps advance on a **700ms timer**, not on real server events. The last step stays "current" until the mutation
finishes (`active=false`), and then everything ticks done. It's a UX technique that gives perceived progress for a
single long request. Say it honestly if asked; real progress would need streaming, SSE, or a progress table like the
one uploads use.

---

## 17. Build & tooling

### 17.1 Vite (`vite.config.ts`)
```ts
plugins: [ nitro({ rollupConfig: { external: [/^@sentry\//] } }), tailwindcss(), tanstackStart(), viteReact() ]
resolve: { tsconfigPaths: true }   // honors "@/*" → "./src/*" from tsconfig
```
- **Dev:** Vite serves source files as native **ES modules** with **HMR** (hot module replacement) and no bundling,
  so startup is instant. `viteReact()` adds Fast Refresh (keeps component state on edit).
- **Build:** Vite 8 bundles with **Rolldown** (a Rust bundler) and produces two outputs, a **client bundle** and a
  **server bundle**. `tanstackStart()` generates the route tree and compiles server functions; `nitro()` packages the
  server into `.output/` for the chosen preset (Node here).
- `external: [/^@sentry\//]` means "don't bundle Sentry packages; resolve them at runtime".
- Plugin order matters: Tailwind runs before the React transform, and Start before React.

### 17.2 Nitro & h3
**Nitro** is a server toolkit (from the Nuxt/UnJS team) that builds portable servers. One codebase can target
`node-server`, Cloudflare Workers, Vercel, Netlify, Deno and more through **presets**. Its HTTP layer is **h3**, a small
framework built on Web `Request`/`Response`. The build output `.output/server/index.mjs` is a **self-contained Node
server** with dependencies bundled in, which is why the Docker runner stage needs **no `node_modules`**.

### 17.3 TypeScript (`tsconfig.json`)
| Option | Meaning |
|---|---|
| `"strict": true` | enables `strictNullChecks`, `noImplicitAny`, etc. |
| `"moduleResolution": "Bundler"` | resolve imports the way Vite does (supports `exports` maps, no file extensions needed) |
| `"noEmit": true` | `tsc` only type-checks; Vite/esbuild strips the types |
| `"jsx": "react-jsx"` | the new JSX transform (no `import React` needed) |
| `"paths": { "@/*": ["./src/*"] }` | the `@/` alias |
| `"types": ["vite/client"]` | types for `import.meta.env` and `?url`/`?raw` imports |
| `"noUncheckedSideEffectImports"` | errors on side-effect imports (`import "./x"`) that don't resolve |

### 17.4 ESLint & Prettier
- **ESLint 9 flat config** (`eslint.config.js`) with `typescript-eslint`, `eslint-plugin-react-hooks` (enforces the
  rules of hooks and exhaustive deps, which is why `home.tsx` has an `eslint-disable-next-line`), and
  `react-refresh`. It also has a custom `no-restricted-imports` rule that blocks Next.js's `server-only` package.
- **Prettier** formats the code; `eslint-config-prettier` turns off ESLint rules that would conflict with it.

### 17.5 Docker (`Dockerfile`): multi-stage build
```dockerfile
FROM node:20-alpine AS builder      # stage 1: full toolchain
COPY package*.json ./               # copy manifests FIRST → the npm layer is cached unless dependencies change
RUN npm ci || npm install           # ci = exact lockfile install
COPY . . && RUN npm run build       # → .output/

FROM node:20-alpine AS runner       # stage 2: tiny runtime
COPY --from=builder /app/.output ./.output   # only the build output, no source, no dev deps
ENV PORT=3000  EXPOSE 3000
CMD ["node", ".output/server/index.mjs"]
```
Benefits: a **small image**, a **smaller attack surface**, and **layer caching**. Note that `.dockerignore` keeps
`node_modules` and `.env` out of the build context. Environment variables (`GEMINI_API_KEY`, Supabase keys) are
passed at `docker run -e ...` time.

### 17.6 Bun & lockfiles
There are both `bun.lock` and `package-lock.json`, so either package manager works (the Dockerfile uses npm).
`bunfig.toml` sets `minimumReleaseAge = 86400`, a **supply-chain guard** that refuses package versions published less
than 24 hours ago. That protects against a freshly compromised npm release.

### 17.7 The test script (`src/lib/__tests__/run-tests.js`)
It's a small hand-rolled Node test using `node:assert`. It mocks `localStorage` and `toast` on `globalThis` and tests the
permission-state helpers. There's no test framework (no Vitest/Jest). If asked how you'd improve it: add **Vitest**
(Vite-native), mock Supabase/Gemini, and add Playwright for end-to-end tests.

---

## 18. Honest notes — things an interviewer might catch

Knowing your own project's rough edges reads as seniority. These are all observations about the current code,
which I haven't changed:

1. **Missing module:** `home.tsx` imports `useGlobalBusy` from `@/lib/global-busy`, but `src/lib/global-busy.ts`
   **doesn't exist** and the hook is never used. A strict build will fail on the unresolved import until that line
   is removed or the file is added.
2. **"Exponential backoff" isn't implemented:** the header popover and the older docs say the backend retries Gemini
   503s with exponential backoff, but `gemini.server.ts` makes one call with no retry.
3. **Possible RPC overload ambiguity:** migration 2 creates `match_document_chunks(vector, int, uuid)` and migration 3
   uses `create or replace` with **a different parameter list** `(vector, int)`. In Postgres that creates a **second
   overload** rather than replacing the first. PostgREST may then answer `rpc("match_document_chunks", {query_embedding,
   match_count})` with an ambiguity error (`PGRST203`). Because `retrieveContext` swallows errors and returns `""`,
   RAG would silently return nothing. Check the logs for `[rag] similarity search failed`; the fix is a
   `DROP FUNCTION match_document_chunks(vector, int, uuid);` migration.
4. **Non-transactional replace:** refine deletes all tasks, then inserts. If the insert fails, the board is empty
   (§11.4). Manual edits made during a refine are also lost, a documented trade-off.
5. **`reorderTasks` sends N UPDATE requests.** That's fine for small lists; a single SQL function taking an array
   would be one round-trip and one transaction.
6. **Google token expiry:** `provider_token` lasts about an hour and isn't refreshed (§10.5).
7. **Duplicate calendar events** on repeated syncs (§15).
8. **`taskType: "SEMANTIC_SIMILARITY"`** works, but `RETRIEVAL_DOCUMENT`/`RETRIEVAL_QUERY` is the recommended pair for
   search (§13.1).
9. **`.validator` vs `.inputValidator`:** both are used; they're the same method under its old and new names.
10. **Implicit OAuth flow** is simpler, but PKCE is the recommended flow (§10.4).
11. **`MAX_DOCS = 10` counts `calendar!@#.txt` and `gmail!@#.txt` too**, so users really get 8 uploads when both are
    synced.
12. **`.env` is not in `.gitignore`** (only `*.local` is). Make sure real keys never get committed; use `.env.example`
    for the template.
13. **`asksForTaskUpdate`** (regex intent detector) is defined but its use is commented out; the LLM decides instead.
14. **AgentTimeline is simulated** progress, not real server events.

---

## 19. Interview question bank (with answers)

**Framework / architecture**

1. **What is TanStack Start, and why did you pick it over Next.js?**
   It's a full-stack React framework built on TanStack Router plus Vite plus a server runtime (Nitro). I wanted
   end-to-end type safety (typed routes and typed server functions), explicit server code via `createServerFn` instead of
   React Server Components, and Vite's dev speed. It deploys anywhere Nitro has a preset.

2. **How does a server function work under the hood?**
   At build time the Start Vite plugin compiles the file twice. The server build keeps the handler and registers it
   under an ID. The client build replaces the handler with a stub that serializes the input and makes an HTTP
   request to Start's server-function endpoint. Client middleware runs before the request, server middleware runs
   before the handler, and the return value is serialized back. Secrets in the handler never ship to the browser.

3. **GET vs POST server functions?**
   GET puts the serialized input in the URL (cacheable, size-limited, for reads). POST puts it in the body (for writes
   and large payloads like base64 files).

4. **How is authentication enforced on server functions?**
   A global client middleware attaches the Supabase JWT as a Bearer header to every RPC. A server middleware
   (`requireSupabaseAuth`) reads it with `getRequest()`, verifies it with `getClaims()`, creates a per-request Supabase
   client that forwards the JWT (so RLS applies), and injects `{ supabase, userId }` into the handler context.

5. **Function middleware vs request middleware?**
   Function middleware wraps server-function calls and can have client and server parts. Request middleware wraps
   every HTTP request, including SSR page loads (group-tea uses it for error pages).

6. **Why is `getRouter` a function?**
   On the server each request needs its own router and QueryClient. A singleton would share cached data between users.

7. **Why `ssr: false` on authenticated routes?**
   The session is in localStorage, which the server can't read. With SSR the guard would always redirect. The
   alternative is cookie-based sessions with `@supabase/ssr`.

8. **What does `beforeLoad` do, and why `throw redirect`?**
   It runs before a route (and its children) load, top-down, so it's ideal for guards. Throwing aborts loading
   immediately; the router catches the redirect and navigates.

9. **Explain hydration.**
   The server sends HTML; the client downloads JS and React attaches handlers to the existing DOM. The first client
   render must match the server HTML.

**Data / Supabase / SQL**

10. **What is Supabase?**
    Hosted Postgres plus PostgREST (an auto REST API), GoTrue (auth), Storage, Realtime and Edge Functions. supabase-js
    builds PostgREST HTTP requests.

11. **What is RLS? Explain `USING` vs `WITH CHECK`.**
    Row Level Security adds per-row policies inside Postgres. `USING` filters which existing rows you can
    see/update/delete; `WITH CHECK` validates new or changed rows. My policies are `auth.uid() = user_id`.

12. **If RLS exists, why also `.eq("user_id", userId)`?**
    Defense in depth: if a policy is ever dropped or misconfigured, the query is still scoped.

13. **`getSession` vs `getUser` vs `getClaims`?**
    `getSession` reads local storage unverified. `getUser` asks the auth server. `getClaims` verifies the JWT signature
    (locally with JWKS when asymmetric keys are used). Never trust `getSession` for server-side authorization.

14. **Anon/publishable key vs service-role key?**
    The publishable key is safe in the browser because RLS restricts it. The service role bypasses RLS, is server-only,
    and is never exposed. TaskBase runs everything as the user and doesn't use the service role.

15. **What does `.select("id", { count: "exact", head: true })` do?**
    It sends a HEAD request with `Prefer: count=exact`. Postgres counts the rows, no rows are returned, and the count
    comes back in the `Content-Range` header.

16. **Why is vector search a SQL function?**
    PostgREST filters can't express `ORDER BY embedding <=> $1`. An RPC function can, and it runs with the caller's
    privileges (security invoker), so RLS still applies.

17. **SECURITY DEFINER vs INVOKER?**
    Definer runs as the function's owner (bypasses RLS, so it needs manual filters and a fixed `search_path`). Invoker
    runs as the caller. I switched to invoker.

18. **What does the `updated_at` trigger do?**
    A `BEFORE UPDATE` row trigger in PL/pgSQL sets `NEW.updated_at = now()`, so app code can't forget it.

**AI / RAG**

19. **Walk me through your RAG pipeline.**
    Extract text (unpdf for PDFs), normalize, chunk into 4000-character windows with 150 characters of overlap, embed
    each chunk with gemini-embedding-001 at 1536 dimensions, and store in pgvector with an HNSW cosine index. At query
    time I embed the question, call `match_document_chunks` for the top-k by cosine similarity, and inject the chunks
    into the prompt along with tasks, chat history, calendar and Gmail. Then I validate the JSON output with Zod.

20. **Why chunk, and why overlap?**
    Model input limits and retrieval precision. One vector per huge doc blurs its meaning. Overlap keeps sentences
    that are split at a boundary intact in at least one chunk.

21. **What's cosine similarity? Why 1 − distance?**
    The angle between vectors, (A·B)/(|A||B|). pgvector's `<=>` returns cosine **distance** (1 − similarity), so I
    convert it back.

22. **HNSW vs IVFFlat?**
    Both are approximate. HNSW is a layered proximity graph with better recall vs speed, buildable on an empty table.
    IVFFlat clusters into lists, needs existing data, and builds faster. The index's opclass must match the operator.

23. **Why 1536 dimensions?**
    gemini-embedding-001 is Matryoshka-trained, so truncated vectors stay meaningful. It halves storage and fits
    pgvector's 2000-dimension HNSW limit.

24. **How do you make LLM output reliable?**
    A strict JSON instruction plus a schema example, slicing `{…}` to drop fences or prose, and Zod parsing with
    defaults. I'd improve it with Gemini's `responseMimeType: "application/json"` plus `responseSchema`, and add
    retries.

25. **How does chat decide to update tasks?**
    The model returns `{answer, updateTasks}`. If `updateTasks` is true, the client runs the refine server function and
    invalidates the task queries. That's lightweight intent routing.

26. **How do you handle hallucinations?**
    Grounded context, the "don't invent details" rule, an `ai_reason` that cites its source document/email/event, and
    schema validation. Users can still edit everything.

27. **How did you implement upload cancellation?**
    Cooperative cancellation through an `upload_progress` row. The client polls it every second and can set
    `cancel_requested`; the server checks before each embedding batch. AbortController would only stop the client
    from waiting, not the server work.

**Frontend**

28. **Why TanStack Query instead of useEffect?**
    Caching, request dedup, invalidation, retries, refetch on focus, and loading/error state for free. Mutations
    invalidate keys like `["tasks"]`.

29. **Explain your optimistic update in drag-and-drop.**
    `arrayMove` the visible list, merge in the hidden tasks, `setQueryData(["tasks"], merged)` so the UI updates
    instantly, then the `reorderTasks` mutation persists and invalidation reconciles with the server.

30. **What is shadcn/ui? Is it a dependency?**
    No. It's copy-paste component source built on Radix primitives (accessibility) and Tailwind (style). I own the
    code. `asChild` uses Radix Slot to avoid nested buttons.

31. **What does `cn()` do?**
    `clsx` for conditional classes plus `tailwind-merge` to resolve conflicting Tailwind classes.

32. **What's new in Tailwind v4?**
    CSS-first configuration (`@theme`, `@utility`, `@plugin`, `@source`), no JS config, the Vite plugin instead of
    PostCSS, a faster engine, and OKLCH colors.

33. **How is AI markdown rendered safely?**
    react-markdown builds React elements and doesn't render raw HTML by default, so there's no
    `dangerouslySetInnerHTML` and no XSS.

**OAuth / Google**

34. **Explain your Google OAuth flow.**
    `signInWithOAuth` with Calendar and Gmail scopes, `access_type=offline` and `prompt=consent` → Google consent →
    Supabase exchanges the code, creates the session → redirect to `/auth/callback` with tokens in the URL hash
    (implicit flow) → I verify the granted scopes with Google's tokeninfo and sign out if any are missing.

35. **Implicit vs PKCE?**
    Implicit returns tokens in the URL fragment, which is simpler. PKCE returns a one-time code exchanged with a
    verifier, which is more secure and recommended. I'd migrate to PKCE.

36. **Two tokens: which is which?**
    `access_token` is Supabase's JWT for my backend and RLS. `provider_token` is Google's token for Calendar and Gmail,
    which expires in about an hour and isn't auto-refreshed.

37. **Why `singleEvents=true` in the Calendar call?**
    It expands recurring events into instances; it's required for `orderBy=startTime`.

38. **Why is the all-day event's end date the next day?**
    Google's `end.date` is exclusive.

**DevOps**

39. **Explain your Dockerfile.**
    A multi-stage build. The builder installs and builds into `.output`, a self-contained Nitro server bundle. The
    runner copies only `.output` into a fresh `node:20-alpine` image: small, no source, no dev dependencies.

40. **Where do secrets live?**
    In environment variables. Only `VITE_*` variables are inlined into the client (the publishable Supabase key).
    `GEMINI_API_KEY` is read from `process.env` inside `.server.ts` code only.

**"What would you improve?"** (pick 3–4)
PKCE plus Google refresh-token handling · a transactional `replace_tasks` RPC · retries with exponential backoff and
jitter for Gemini · structured JSON output · `RETRIEVAL_DOCUMENT`/`RETRIEVAL_QUERY` task types and batched embedding
calls · Realtime instead of polling · event dedup through `extendedProperties` · Vitest and Playwright tests ·
rate limiting per user.

---

## 20. Glossary

| Term | Meaning |
|---|---|
| **RPC** | Remote Procedure Call: calling a function that runs on another machine as if it were local |
| **SSR** | Server-Side Rendering: HTML generated on the server per request |
| **Hydration** | React attaching interactivity to server-rendered HTML |
| **Meta-framework** | A framework on top of a UI library that adds routing, SSR, data loading and server code (Next, Remix, Start) |
| **Middleware** | Code that runs before or after a handler and can modify the request, context or response |
| **JWT** | JSON Web Token: a signed, base64url-encoded claims object |
| **JWKS** | JSON Web Key Set: the public keys used to verify JWT signatures |
| **RLS** | Row Level Security: per-row access policies in Postgres |
| **PostgREST** | A server that turns a Postgres schema into a REST API |
| **Embedding** | A vector representing the meaning of a text |
| **ANN** | Approximate Nearest Neighbor search |
| **HNSW** | Hierarchical Navigable Small World: a graph-based ANN index |
| **RAG** | Retrieval-Augmented Generation: retrieve relevant context, then generate with it |
| **Chunking** | Splitting documents into pieces for embedding |
| **Optimistic update** | Updating the UI before the server confirms |
| **Query key** | The identifier of a cached query in TanStack Query |
| **Invalidation** | Marking cached data stale so it refetches |
| **OAuth scope** | A named permission an app requests from a provider |
| **Implicit flow / PKCE** | OAuth flows: tokens in the URL fragment vs a one-time code plus a verifier |
| **Nitro / h3** | A portable server build toolkit / its minimal HTTP framework |
| **HMR** | Hot Module Replacement: swapping changed modules in the dev server without a reload |
| **Multi-stage build** | A Dockerfile with separate build and runtime images |
| **Matryoshka embeddings** | Embeddings whose prefixes are also valid, lower-dimensional embeddings |
