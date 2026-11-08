# TaskBase — Complete Technical Documentation

## Table of Contents

1. [Project Overview](#1-project-overview)
2. [Tech Stack](#2-tech-stack)
3. [System Architecture](#3-system-architecture)
4. [Project Structure](#4-project-structure)
5. [Build & Configuration](#5-build--configuration)
6. [Database Schema & Migrations](#6-database-schema--migrations)
7. [Authentication Flow](#7-authentication-flow)
8. [Server-Side Middleware Pipeline](#8-server-side-middleware-pipeline)
9. [Supabase Client (Browser)](#9-supabase-client-browser)
10. [Task CRUD Server Functions](#10-task-crud-server-functions)
11. [AI Pipeline — Refinement, Chat, Summary](#11-ai-pipeline--refinement-chat-summary)
12. [Document Processing Pipeline](#12-document-processing-pipeline)
13. [Gemini AI Client](#13-gemini-ai-client)
14. [RAG (Retrieval-Augmented Generation)](#14-rag-retrieval-augmented-generation)
15. [Google Calendar & Gmail Sync](#15-google-calendar--gmail-sync)
16. [Google Permissions (Client-Side)](#16-google-permissions-client-side)
17. [Routing & App Shell](#17-routing--app-shell)
18. [Home Page — Task Board UI](#18-home-page--task-board-ui)
19. [Chat Page](#19-chat-page)
20. [Documents Page](#20-documents-page)
21. [Permissions Page](#21-permissions-page)
22. [Documentation Page](#22-documentation-page)
23. [Task Card Component](#23-task-card-component)
24. [Task Editor Component](#24-task-editor-component)
25. [Agent Timeline Component](#25-agent-timeline-component)
26. [Styling & Design System](#26-styling--design-system)
27. [Docker Deployment](#27-docker-deployment)
28. [Data Flow Diagrams](#28-data-flow-diagrams)
29. [Security Model](#29-security-model)
30. [Key Design Decisions & Trade-offs](#30-key-design-decisions--trade-offs)

---

## 1. Project Overview

### What TaskBase Does

TaskBase is an **AI-native productivity task manager** that bridges the gap between generic to-do apps and raw LLM chat. Users sign in with Google, upload study/work documents (syllabi, PDFs, notes), and the AI assistant transforms them into a prioritized, drag-and-drop task board. A built-in chat assistant has RAG (Retrieval-Augmented Generation) access to uploaded documents. The system optionally syncs with **Google Calendar** (bidirectional) and **Gmail** (read-only) to incorporate real-world schedule and email data into AI-driven task refinement.

### Core Value Proposition

1. **Document-to-task extraction**: Upload a PDF syllabus → AI generates a complete prioritized task board.
2. **Explainable AI**: Every AI-generated task includes an `ai_reason` field explaining *why* it exists, what document/email/calendar event influenced it, and why it received its priority.
3. **Bidirectional Calendar sync**: Dated tasks get pushed back to Google Calendar as all-day events.
4. **RAG-powered chat**: Semantic search over uploaded documents powers contextual answers.
5. **Narrated refinement**: Each refinement cycle produces a first-person summary of exactly what changed and why.

---

## 2. Tech Stack

### Frontend
| Technology | Purpose |
|---|---|
| **React 19** | UI library |
| **TanStack Start** | Full-stack SSR meta-framework (file-based routing + server functions) |
| **TanStack Router** | Type-safe client-side routing with SSR support |
| **TanStack Query (React Query)** | Server state management, caching, invalidation |
| **Tailwind CSS v4** | Utility-first styling |
| **shadcn/ui** (Radix primitives) | Pre-built accessible UI components (Dialog, Select, Tabs, Sheet, Popover, etc.) |
| **@dnd-kit/core + @dnd-kit/sortable** | Drag-and-drop task reordering |
| **date-fns** | Date manipulation (intervals, formatting, parsing) |
| **Lucide React** | Icon library |
| **Sonner** | Toast notification system |
| **react-markdown + remark-gfm** | Markdown rendering in chat |
| **tw-animate-css** | Animation utilities for Tailwind |

### Backend (Server Functions)
| Technology | Purpose |
|---|---|
| **TanStack Start Server Functions** (`createServerFn`) | Type-safe RPC layer (runs on server, called from client) |
| **Nitro** (dev dependency) | Server runtime that TanStack Start compiles to |
| **Zod** | Runtime schema validation for all inputs and AI outputs |
| **unpdf** | PDF text extraction on the server |

### AI & ML
| Technology | Purpose |
|---|---|
| **Google Gemini** (`@google/genai`) | Text generation (gemini-3.1-flash-lite) and embeddings (gemini-embedding-001) |
| **pgvector** | PostgreSQL vector similarity search extension |

### Database & Auth
| Technology | Purpose |
|---|---|
| **Supabase** (PostgreSQL) | Managed database with Row Level Security |
| **Supabase Auth** | Google OAuth (implicit flow) |
| **pgvector extension** | 1536-dimension cosine similarity search |

### External APIs
| API | Purpose |
|---|---|
| **Google Calendar API v3** | Read events, create all-day events |
| **Gmail API v1** | Read message metadata (Subject, From, Date, snippet) |
| **Google OAuth2 tokeninfo** | Scope verification |

### Build & Deploy
| Technology | Purpose |
|---|---|
| **Vite 8** | Build tool and dev server |
| **Docker** (multi-stage) | Production deployment |
| **Node.js 20 Alpine** | Runtime |

---

## 3. System Architecture

```
Browser (React + TanStack Router)
        │
  Bearer JWT + Google Provider Token
        │
        ▼
TanStack Start Server Functions (Nitro runtime)
        │
        ├── attachSupabaseAuth (client middleware — injects Bearer token)
        ├── requireSupabaseAuth (server middleware — validates JWT, creates scoped Supabase client)
        │
        ├── Task Server Functions (CRUD + reorder)
        ├── AI Server Functions (refine, chat, summary)
        ├── Document Server Functions (upload, delete, list)
        ├── Google Sync Server Functions (calendar, gmail, syncAll)
        └── RAG retrieval (embed query → pgvector similarity → context chunks)
        │
  ┌─────┴──────────┬──────────────────┐
  ▼                ▼                  ▼
Gemini API     Google APIs       Supabase
(LLM+Embed)   (Calendar/Gmail)     │
                                    ▼
                          PostgreSQL + pgvector
                          (RLS-protected tables)
```

### Request Flow

1. **Client** calls a server function (e.g., `listTasks()`)
2. **Client middleware** (`attachSupabaseAuth`) intercepts the call, reads the Supabase session, and attaches the JWT as a `Bearer` Authorization header
3. **Server middleware** (`requireSupabaseAuth`) extracts the Bearer token, validates it's a 3-part JWT, calls `supabase.auth.getClaims()`, creates a per-request Supabase client with the user's token, and injects `{supabase, userId, claims}` into the handler context
4. **Handler** executes with the authenticated, RLS-scoped Supabase client — all queries are automatically filtered to the user's data
5. **Response** flows back through the middleware chain to the client

---

## 4. Project Structure

```
TaskBaseGithubConnected/
├── src/
│   ├── start.ts                     # TanStack Start entry — registers global client middleware
│   ├── server.ts                    # Server entry point (Nitro)
│   ├── router.tsx                   # Router factory (QueryClient + routeTree)
│   ├── styles.css                   # Global styles (Tailwind v4 + custom theme)
│   │
│   ├── routes/
│   │   ├── __root.tsx               # Root layout (auth listener, QueryClientProvider, Toaster)
│   │   ├── auth.tsx                 # Login page (Google OAuth)
│   │   ├── auth/
│   │   │   └── callback.tsx         # OAuth callback (scope verification)
│   │   └── _authenticated/
│   │       ├── route.tsx            # Auth guard layout (nav, mobile sheet)
│   │       ├── home.tsx             # Main task board
│   │       ├── chat.tsx             # AI chat
│   │       ├── documents.tsx        # Document upload/management
│   │       ├── documentation.tsx    # In-app documentation viewer
│   │       ├── permissions.tsx      # Google permission management
│   │       └── content/
│   │           └── documentation.md # Bundled documentation markdown
│   │
│   ├── lib/
│   │   ├── tasks.functions.ts       # Task CRUD server functions
│   │   ├── ai.functions.ts          # AI pipeline (refine, chat, summary)
│   │   ├── documents.functions.ts   # Document processing pipeline
│   │   ├── google.functions.ts      # Google Calendar/Gmail sync
│   │   ├── gemini.server.ts         # Gemini API wrapper (text + embeddings)
│   │   ├── rag.server.ts            # RAG retrieval (pgvector search)
│   │   ├── google-permissions.ts    # Client-side localStorage permission state
│   │   ├── global-busy.ts           # (referenced in home.tsx)
│   │   └── utils.ts                 # Tailwind cn() merge utility
│   │
│   ├── integrations/supabase/
│   │   ├── client.ts                # Client-side Supabase (lazy Proxy, implicit OAuth)
│   │   ├── auth-middleware.ts        # Server-side JWT validation middleware
│   │   ├── auth-attacher.ts          # Client-side Bearer token injector
│   │   └── types.ts                  # Generated database types
│   │
│   └── components/
│       ├── tasks/
│       │   ├── task-card.tsx         # Individual task card (DnD, priority, AI badge)
│       │   └── task-editor.tsx       # Task create/edit dialog
│       ├── ai/
│       │   └── agent-timeline.tsx    # Live step-by-step progress indicator
│       └── ui/                       # shadcn/ui primitives
│
├── supabase/migrations/             # 4 SQL migration files
├── Dockerfile                        # Multi-stage Docker build
├── package.json
├── vite.config.ts
└── tsconfig.json
```

---

## 5. Build & Configuration

### `vite.config.ts`

**File**: `vite.config.ts`

```ts
export default defineConfig({
  resolve: { tsconfigPaths: true },
  plugins: [
    nitro({ rollupConfig: { external: [/^@sentry\//] } }),
    tailwindcss(),
    tanstackStart(),
    viteReact(),
  ],
});
```

**Plugin chain**:
1. **`nitro()`** — Configures the Nitro server runtime. Externals `@sentry/*` packages from the Rollup bundle so they're resolved at runtime (not bundled).
2. **`tailwindcss()`** — Tailwind CSS v4 Vite plugin (replaces PostCSS-based setup).
3. **`tanstackStart()`** — TanStack Start plugin that handles file-based routing, server function compilation, and SSR.
4. **`viteReact()`** — Standard React Vite plugin (JSX transform, fast refresh).

### `package.json` Scripts

| Script | Command | Description |
|---|---|---|
| `dev` | `vite dev` | Development server with HMR |
| `build` | `vite build` | Production build (outputs to `.output/`) |
| `build:dev` | `vite build --mode development` | Development-mode build |
| `preview` | `vite preview` | Preview production build locally |
| `lint` | `eslint .` | Run ESLint |
| `format` | `prettier --write .` | Format all files |

### `src/start.ts` — TanStack Start Entry

```ts
export const startInstance = createStart(() => ({
  functionMiddleware: [attachSupabaseAuth],
}));
```

This is the TanStack Start initialization file. It registers `attachSupabaseAuth` as a **global function middleware**, which means every server function call from the browser automatically has the Bearer token attached. Without this registration, no RPC call would carry authentication.

### `src/server.ts` — Server Entry

```ts
export default createServerEntry({
  fetch(request) {
    return handler.fetch(request);
  },
});
```

Minimal server entry that delegates all requests to the TanStack Start handler. The Nitro runtime calls this for every incoming HTTP request.

### `src/router.tsx` — Router Factory

```ts
export const getRouter = () => {
  const queryClient = new QueryClient();
  const router = createRouter({
    routeTree,
    context: { queryClient },
    scrollRestoration: true,
    defaultPreloadStaleTime: 0,
  });
  return router;
};
```

- Creates a `QueryClient` for React Query
- Builds the TanStack Router from the auto-generated `routeTree` (file-based routes)
- `scrollRestoration: true` — Restores scroll position on navigation
- `defaultPreloadStaleTime: 0` — Always refetch on preload (no stale cache)
- Injects `queryClient` into router context so route loaders can access it

---

## 6. Database Schema & Migrations

TaskBase uses 4 SQL migrations that create the complete schema:

### Migration 1: Core Tables (`20260627104733`)

#### Custom Enums
```sql
CREATE TYPE public.task_priority AS ENUM ('high', 'medium', 'low');
CREATE TYPE public.task_status AS ENUM ('todo', 'done');
CREATE TYPE public.task_origin AS ENUM ('user', 'ai');
CREATE TYPE public.chat_role AS ENUM ('user', 'assistant');
```

#### `set_updated_at()` Trigger Function
```sql
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql
AS $$ BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;
```
Automatically updates `updated_at` on every row update. Attached to `tasks` and `documents` tables.

#### `tasks` Table
| Column | Type | Default | Description |
|---|---|---|---|
| `id` | UUID | `gen_random_uuid()` | Primary key |
| `user_id` | UUID | — | FK → `auth.users(id)` ON DELETE CASCADE |
| `title` | TEXT | — | Task title (required) |
| `description` | TEXT | `''` | Optional description |
| `priority` | `task_priority` | `'medium'` | high / medium / low |
| `tags` | TEXT[] | `'{}'` | Array of tag strings |
| `status` | `task_status` | `'todo'` | todo / done |
| `position` | INTEGER | `0` | Sort order for drag-and-drop |
| `due_date` | DATE | NULL | Optional due date |
| `created_by` | `task_origin` | `'user'` | user / ai |
| `ai_reason` | TEXT | NULL | AI explanation for why this task exists |
| `created_at` | TIMESTAMPTZ | `now()` | Creation timestamp |
| `updated_at` | TIMESTAMPTZ | `now()` | Auto-updated via trigger |

**Indexes**:
- `tasks_user_position_idx` on `(user_id, position)` — Optimizes ordered task listing
- `tasks_user_due_idx` on `(user_id, due_date)` — Optimizes date-based filtering

**RLS Policies** (all scoped to `auth.uid() = user_id`):
- `tasks_select_own` — SELECT
- `tasks_insert_own` — INSERT
- `tasks_update_own` — UPDATE
- `tasks_delete_own` — DELETE

#### `chat_messages` Table
| Column | Type | Default | Description |
|---|---|---|---|
| `id` | UUID | `gen_random_uuid()` | Primary key |
| `user_id` | UUID | — | FK → `auth.users(id)` ON DELETE CASCADE |
| `role` | `chat_role` | — | user / assistant |
| `content` | TEXT | — | Message content |
| `created_at` | TIMESTAMPTZ | `now()` | Creation timestamp |

**Index**: `chat_messages_user_created_idx` on `(user_id, created_at)`.

**RLS Policies**: SELECT own, INSERT own, DELETE own (no UPDATE — messages are immutable).

### Migration 2: Document & Vector Tables (`20260627105832`)

Enables the `vector` extension:
```sql
CREATE EXTENSION IF NOT EXISTS vector;
```

#### `documents` Table
| Column | Type | Default | Description |
|---|---|---|---|
| `id` | UUID | `gen_random_uuid()` | Primary key |
| `user_id` | UUID | — | FK → `auth.users(id)` ON DELETE CASCADE |
| `name` | TEXT | — | Original filename |
| `status` | TEXT | `'processing'` | processing / ready / failed |
| `error_message` | TEXT | NULL | Error details if failed |
| `chunk_count` | INT | `0` | Number of chunks extracted |
| `created_at` | TIMESTAMPTZ | `now()` | Upload time |
| `updated_at` | TIMESTAMPTZ | `now()` | Auto-updated via trigger |

#### `document_chunks` Table
| Column | Type | Default | Description |
|---|---|---|---|
| `id` | UUID | `gen_random_uuid()` | Primary key |
| `document_id` | UUID | — | FK → `documents(id)` ON DELETE CASCADE |
| `user_id` | UUID | — | FK → `auth.users(id)` ON DELETE CASCADE |
| `chunk_index` | INT | — | Order within document |
| `content` | TEXT | — | Chunk text content |
| `embedding` | `vector(1536)` | NULL | Gemini embedding vector |
| `created_at` | TIMESTAMPTZ | `now()` | Creation timestamp |

**Indexes**:
- `document_chunks_doc_idx` on `(document_id)` — Fast chunk lookup by document
- `document_chunks_embedding_idx` using **HNSW** (`vector_cosine_ops`) — Approximate nearest-neighbor search for cosine similarity

#### `match_document_chunks()` PostgreSQL Function (initial version)

```sql
CREATE OR REPLACE FUNCTION public.match_document_chunks(
  query_embedding vector(1536),
  match_count int DEFAULT 5,
  owner uuid DEFAULT auth.uid()
)
RETURNS TABLE (id uuid, document_id uuid, content text, similarity float)
LANGUAGE sql STABLE SECURITY DEFINER
AS $$
  SELECT c.id, c.document_id, c.content,
    1 - (c.embedding <=> query_embedding) AS similarity
  FROM public.document_chunks c
  WHERE c.user_id = owner AND c.embedding IS NOT NULL
  ORDER BY c.embedding <=> query_embedding
  LIMIT match_count;
$$;
```

- **`<=>` operator**: pgvector's cosine distance operator
- **`1 - distance`**: Converts distance to similarity (1.0 = identical, 0.0 = orthogonal)
- **`SECURITY DEFINER`**: Runs with the function owner's permissions (bypasses RLS for this query since it already filters by `user_id = owner`)
- **Default `owner`**: `auth.uid()` — automatically scopes to the calling user

### Migration 3: Updated `match_document_chunks` (`20260627105853`)

Simplified version that removes the `owner` parameter and uses `auth.uid()` directly in the WHERE clause:

```sql
CREATE OR REPLACE FUNCTION public.match_document_chunks(
  query_embedding vector(1536),
  match_count int DEFAULT 5
)
RETURNS TABLE (id uuid, document_id uuid, content text, similarity float)
LANGUAGE sql
AS $$
  SELECT c.id, c.document_id, c.content,
    1 - (c.embedding <=> query_embedding) AS similarity
  FROM public.document_chunks c
  WHERE c.user_id = auth.uid() AND c.embedding IS NOT NULL
  ORDER BY c.embedding <=> query_embedding
  LIMIT match_count;
$$;
```

This version drops `SECURITY DEFINER` and the explicit `owner` parameter — relying on the caller's `auth.uid()` context instead. This is the version actually used at runtime.

### Migration 4: Upload Progress Table (`20260627165516`)

#### `upload_progress` Table
| Column | Type | Default | Constraint |
|---|---|---|---|
| `id` | UUID | `gen_random_uuid()` | Primary key |
| `user_id` | UUID | — | FK → `auth.users(id)` ON DELETE CASCADE |
| `status` | TEXT | `'running'` | CHECK: running / cancel_requested / cancelled / completed / failed |
| `stage` | TEXT | `'starting'` | Human-readable stage name |
| `message` | TEXT | `''` | Status message |
| `current` | INTEGER | `0` | Current progress count |
| `total` | INTEGER | `0` | Total expected count |
| `error_message` | TEXT | NULL | Error details |
| `created_at` | TIMESTAMPTZ | `now()` | — |
| `updated_at` | TIMESTAMPTZ | `now()` | — |

**RLS Policy**: Single policy `"Users manage own upload progress"` for ALL operations using `auth.uid() = user_id`.

This table enables the **cooperative cancellation** pattern: the client polls this table every 1 second for progress updates, and can set `status = 'cancel_requested'`. The server checks this status between each embedding batch and aborts if cancellation was requested.

---

## 7. Authentication Flow

### Overview

TaskBase uses **Supabase Auth** with **Google OAuth (implicit flow)**. The implicit flow means the `provider_token` (Google access token) is returned directly in the URL hash fragment after OAuth consent — no PKCE code exchange step is needed.

### Login (`src/routes/auth.tsx`)

#### `AuthPage` Component

**`google()` function** — Initiates the Google OAuth sign-in:
```ts
const google = async () => {
  const callbackUrl = `${window.location.origin}/auth/callback`;
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: callbackUrl,
      scopes: "https://www.googleapis.com/auth/calendar.readonly "
            + "https://www.googleapis.com/auth/gmail.readonly "
            + "https://www.googleapis.com/auth/calendar.events",
      queryParams: {
        access_type: "offline",
        prompt: "consent",
      },
    },
  });
  // ...redirects to Google consent screen
};
```

- **3 OAuth scopes requested**: Calendar read, Calendar events (write), Gmail read-only
- **`access_type: "offline"`**: Requests a refresh token (for long-lived access)
- **`prompt: "consent"`**: Forces the consent screen every time (ensures all scopes are granted)
- **`redirectTo`**: Points to `/auth/callback` for post-login handling

**Permission error handling**: If the user was redirected due to missing permissions (URL contains `permissions_required` or localStorage has `google_permission_error`), a modal dialog explains that all permissions are required and offers to retry the OAuth flow.

### OAuth Callback (`src/routes/auth/callback.tsx`)

#### `OAuthCallback` Component

**`handleSession()` function** — Runs after Supabase parses the OAuth hash:

1. Extracts `session.provider_token` (the Google access token)
2. Calls `verifyGoogleTokenScopes(token)` to check the Google tokeninfo endpoint
3. **If scope check fails**: Signs out, sets `google_permission_error` in localStorage, redirects to `/auth?error=permissions_required`
4. **If scope check passes**: Redirects to `/home`

Uses `supabase.auth.onAuthStateChange()` to listen for the `SIGNED_IN` event (because with implicit flow, Supabase JS parses the hash fragment automatically and fires this event).

The `active` flag with cleanup prevents navigation after component unmount (React strict mode double-mount protection).

### Scope Verification (`src/lib/google-permissions.ts`)

#### `verifyGoogleTokenScopes(accessToken: string): Promise<boolean>`

Technical implementation:
1. Calls `https://www.googleapis.com/oauth2/v1/tokeninfo?access_token=<token>`
2. Parses the response JSON for the `scope` field (space-separated string of granted scopes)
3. Checks for 3 required scopes:
   - `calendar.readonly` OR full `calendar` scope → `hasCalRead`
   - `calendar.events` OR full `calendar` scope → `hasCalEvents`
   - `gmail.readonly` OR full `mail.google.com/` scope → `hasGmail`
4. Returns `true` only if all 3 are present

This is a **client-side guard** — it doesn't prevent a user from manually revoking scopes later, but it catches the common case of users unchecking permissions during consent.

---

## 8. Server-Side Middleware Pipeline

### Client Middleware: `attachSupabaseAuth` (`src/integrations/supabase/auth-attacher.ts`)

```ts
export const attachSupabaseAuth = createMiddleware({ type: "function" }).client(
  async ({ next }) => {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    return next({
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
  },
);
```

- **Type**: `"function"` middleware with `.client()` — runs in the browser before every server function RPC
- Reads the Supabase session's JWT access token from the browser's auth state
- Attaches it as a `Bearer` Authorization header on the outgoing fetch request
- Registered globally in `src/start.ts` as `functionMiddleware: [attachSupabaseAuth]`

### Server Middleware: `requireSupabaseAuth` (`src/integrations/supabase/auth-middleware.ts`)

This is the core authentication gate. Every protected server function chains it as `.middleware([requireSupabaseAuth])`.

**Step-by-step execution**:

1. **Read environment variables**: Reads `VITE_SUPABASE_URL` and `VITE_SUPABASE_KEY` (with fallbacks to `SUPABASE_URL` and `SUPABASE_PUBLISHABLE_KEY`)

2. **Extract request**: Calls `getRequest()` from TanStack Start to get the incoming HTTP request

3. **Parse Authorization header**: Extracts the Bearer token from the `Authorization` header

4. **Validate token structure**: Checks that the token has exactly 3 `.`-separated parts (standard JWT structure: header.payload.signature)

5. **Create per-request Supabase client**:
   ```ts
   const supabase = createClient<Database>(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
     global: {
       headers: { Authorization: `Bearer ${token}` },
     },
     auth: {
       storage: undefined,
       persistSession: false,
       autoRefreshToken: true,
     },
   });
   ```
   - `storage: undefined` — No session persistence on the server
   - `persistSession: false` — Server doesn't keep sessions
   - The user's JWT is forwarded as the Authorization header, so all Supabase queries run with the user's RLS context

6. **Validate claims**: Calls `supabase.auth.getClaims(token)` to cryptographically verify the JWT and extract claims

7. **Extract user ID**: Reads `claims.sub` (the Supabase user UUID)

8. **Inject context**: Passes `{ supabase, userId, claims }` to the next middleware/handler via `next({ context: ... })`

#### New Supabase API Key Handling

Both the client and server contain a helper for new-format Supabase API keys:

```ts
function isNewSupabaseApiKey(value: string): boolean {
  return value.startsWith("sb_publishable_") || value.startsWith("sb_secret_");
}
```

The `createSupabaseFetch()` function wraps `fetch` to handle these new opaque keys. When the default Supabase client would send `Authorization: Bearer <api_key>`, this wrapper:
1. Removes the Authorization header (since new keys aren't JWTs)
2. Sets the `apikey` header instead

This ensures backward compatibility with both old JWT-style and new opaque Supabase API keys.

---

## 9. Supabase Client (Browser)

**File**: `src/integrations/supabase/client.ts`

### Lazy Proxy Pattern

```ts
let _supabase: ReturnType<typeof createSupabaseClient> | undefined;

export const supabase = new Proxy({} as ReturnType<typeof createSupabaseClient>, {
  get(_, prop, receiver) {
    if (!_supabase) _supabase = createSupabaseClient();
    return Reflect.get(_supabase, prop, receiver);
  },
});
```

The Supabase client is wrapped in a **JavaScript Proxy** that lazily initializes the actual client on first property access. This avoids:
- Throwing errors during SSR when `window`/`localStorage` don't exist
- Creating the client before environment variables are available
- Module-level side effects that break tree-shaking

### Client Configuration

```ts
createClient<Database>(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  global: {
    fetch: createSupabaseFetch(SUPABASE_PUBLISHABLE_KEY),
  },
  auth: {
    storage: typeof window !== "undefined" ? localStorage : undefined,
    persistSession: true,
    autoRefreshToken: true,
    flowType: "implicit",
  },
});
```

- **`flowType: "implicit"`**: Uses the OAuth implicit grant flow. The Google `provider_token` is returned in the URL hash fragment and Supabase JS parses it automatically. No PKCE code exchange is needed.
- **`storage: localStorage`** on client, `undefined` on server (SSR safety)
- **`persistSession: true`**: Keeps the session across page reloads
- **`autoRefreshToken: true`**: Automatically refreshes the JWT before expiry

### Environment Variable Resolution

Supports multiple naming conventions for compatibility:
- `import.meta.env.VITE_SUPABASE_URL` → `import.meta.env.VITE_SUPABASE_PROJECT_URL` → `process.env.VITE_SUPABASE_URL` → `process.env.SUPABASE_URL`
- Similar chain for the API key

This allows the same code to work in Vite dev (import.meta.env), SSR (process.env), and Docker (process.env).

---

## 10. Task CRUD Server Functions

**File**: `src/lib/tasks.functions.ts`

All functions use `.middleware([requireSupabaseAuth])` for authentication.

### `listTasks` (GET)

```ts
export const listTasks = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("tasks")
      .select("*")
      .order("position", { ascending: true })
      .order("created_at", { ascending: true });
    if (error) throw new Error(error.message);
    return data ?? [];
  });
```

- Orders by `position` first (drag-and-drop order), then `created_at` as tiebreaker
- RLS automatically filters to the authenticated user's tasks

### `createTask` (POST)

**Input validation** (Zod):
```ts
const CreateTaskInput = z.object({
  title: z.string().min(1).max(200),
  description: z.string().max(2000).optional().default(""),
  priority: PriorityEnum.default("medium"),
  tags: z.array(z.string()).default([]),
  due_date: z.string().nullable().optional(),
});
```

**Position auto-increment logic**:
1. Queries the maximum `position` value for the user's tasks: `SELECT position FROM tasks WHERE user_id = ? ORDER BY position DESC LIMIT 1`
2. Sets `nextPos = (maxRow?.position ?? -1) + 1`
3. Inserts with `created_by: "user"` (distinguishes from AI-generated tasks)

### `updateTask` (POST)

**Input validation**:
```ts
const UpdateTaskInput = z.object({
  id: z.string().uuid(),
  title: z.string().min(1).max(200).optional(),
  description: z.string().max(2000).optional(),
  priority: PriorityEnum.optional(),
  tags: z.array(z.string()).optional(),
  status: StatusEnum.optional(),
  due_date: z.string().nullable().optional(),
});
```

- Destructures `{ id, ...patch }` and applies `patch` as a partial update
- Filters by both `id` AND `user_id` to prevent unauthorized updates (defense-in-depth beyond RLS)

### `deleteTask` (POST)

- Takes `{ id: z.string().uuid() }`
- Deletes where `id` AND `user_id` match

### `reorderTasks` (POST)

```ts
export const reorderTasks = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ orderedIds: z.array(z.string().uuid()) }).parse(d))
  .handler(async ({ context, data }) => {
    await Promise.all(
      data.orderedIds.map((id, idx) =>
        context.supabase
          .from("tasks")
          .update({ position: idx })
          .eq("id", id)
          .eq("user_id", context.userId),
      ),
    );
    return { ok: true };
  });
```

- Receives the full ordered array of task UUIDs after a drag-and-drop operation
- Uses `Promise.all` to update all positions concurrently
- Each task gets `position = idx` (its index in the new array)
- Each update is scoped to `user_id` for security

---

## 11. AI Pipeline — Refinement, Chat, Summary

**File**: `src/lib/ai.functions.ts`

### `parseAIJson<T>(raw: string): T`

Utility to extract JSON from raw Gemini output:
1. Finds the first `{` character in the string
2. Finds the last `}` character in the string
3. Extracts the substring between them (inclusive)
4. Parses with `JSON.parse()`
5. Returns typed result

This handles cases where Gemini wraps JSON in markdown fences or adds prose before/after the JSON object.

### `refineTasksWithAI` (POST) — Core AI Pipeline

This is the most complex server function. It orchestrates the complete task refinement cycle.

**Zod schemas**:
```ts
const RefinedTaskSchema = z.object({
  title: z.string(),
  description: z.string().default(""),
  priority: z.enum(["high", "medium", "low"]).default("medium"),
  tags: z.array(z.string()).default([]),
  due_date: z.string().nullable().optional(),
  ai_reason: z.string().default(""),
});

const RefineResponseSchema = z.object({
  summary: z.string().default(""),
  tasks: z.array(RefinedTaskSchema),
});
```

**Step-by-step execution**:

1. **Parallel data fetch**: Uses `Promise.all` to concurrently fetch:
   - All user tasks (ordered by position)
   - Last 20 chat messages (newest first)
   - All ready documents (names only)

2. **Build context strings**:
   - `chatContext`: Joins reversed messages as `"role: content"` lines
   - `taskContext`: Joins task titles

3. **RAG retrieval**: Calls `retrieveContext(supabase, query, 6)` with the combined chat + task context as query, retrieving the 6 most semantically similar document chunks

4. **Direct calendar/gmail chunk fetch**: Separately fetches the full content of `calendar!@#.txt` and `gmail!@#.txt` documents (if they exist) by:
   - Querying `documents` table for docs with those exact names
   - Fetching all `document_chunks` for those document IDs
   - Concatenating chunk content

   This guarantees Google integration data is always included in the prompt, even if RAG similarity search doesn't rank it highly enough.

5. **Build Gemini prompt**: Constructs a detailed system prompt containing:
   - Today's date
   - List of uploaded document names
   - Raw Google Calendar data
   - Raw Gmail data
   - Current tasks as JSON
   - RAG knowledge base excerpts
   - Last 20 chat messages
   - Detailed rules for the AI (keep user tasks, rewrite for clarity, adjust priorities, add new tasks only if implied, include `ai_reason` for every task, etc.)
   - Strict JSON output format specification

6. **Generate and validate**: Calls `generateGeminiText(prompt)`, parses the response with `parseAIJson`, validates with `RefineResponseSchema.parse()`

7. **Compute change stats**:
   - Compares before/after task titles (case-insensitive)
   - Counts `added` (new titles), `removed` (deleted titles), `kept` (unchanged titles)

8. **Replace task list**:
   - **Deletes ALL user tasks**: `DELETE FROM tasks WHERE user_id = ?`
   - **Inserts refined tasks**: Maps each task to a row with `created_by: "ai"`, `position: idx`
   - This is an atomic replacement, not a merge

9. **Returns**: `{ summary, count, changes: { added, removed, kept } }`

### `getTaskSummary` (GET)

Generates a 2-3 sentence natural language summary of the user's current tasks:

1. Fetches tasks with `title, priority, status, due_date, tags`
2. If no tasks, returns a static message
3. Otherwise, sends tasks as JSON to Gemini with a simple summarization prompt
4. Returns `{ summary: string }`

### `chat` (POST) — AI Chat with RAG

**Input**: `{ message: z.string() }`

**Execution flow**:

1. **Store user message**: Inserts into `chat_messages` with `role: "user"`

2. **Parallel fetch**: Gets current tasks and last 20 chat messages

3. **Build conversation history**: Reverses messages and joins as `"role: content"` lines

4. **RAG retrieval**: Calls `retrieveContext(supabase, data.message, 5)` — embeds the user's message and finds the 5 most similar document chunks

5. **Build prompt**: Includes current tasks JSON, knowledge base excerpts, conversation history, and instructions to:
   - Reply helpfully
   - Set `updateTasks: true` if the user asks to create/generate/update/refine tasks
   - Return strict JSON: `{ "answer": "...", "updateTasks": true|false }`

6. **Generate and validate**: Calls Gemini, parses with `parseAIJson`, validates with `ChatReplySchema`

7. **Store assistant response**: Inserts into `chat_messages` with `role: "assistant"`

8. **Returns**: `{ answer: string, updateTasks: boolean }`

The `updateTasks` flag tells the UI whether to automatically trigger a `refineTasksWithAI` call after the chat response.

#### `asksForTaskUpdate(message: string): boolean` (unused helper)

A regex-based heuristic to detect task-update intent:
```ts
/\b(create|generate|make|add|update|refine|organize|reorganize|plan|build)\b
[\s\S]{0,80}
\b(task|tasks|todo|to-do|list|schedule|plan)\b/i
```

This was originally used to force `updateTasks: true` when the user's message pattern matched, but it's currently commented out — the AI's own judgment is used instead.

### `listChatMessages` (GET)

- Returns up to 200 chat messages ordered by `created_at` ascending
- Simple query with RLS scoping

### `clearChat` (POST)

- Deletes all chat messages for the authenticated user
- `DELETE FROM chat_messages WHERE user_id = ?`

---

## 12. Document Processing Pipeline

**File**: `src/lib/documents.functions.ts`

### Constants

| Constant | Value | Description |
|---|---|---|
| `MAX_DOCS` | 10 | Maximum documents per user |
| `MAX_TEXT_CHARS` | 200,000 | Maximum extracted text length |
| `CHUNK_SIZE` | 4,000 | Characters per chunk |
| `CHUNK_OVERLAP` | 150 | Overlap between consecutive chunks |
| `EMBEDDING_BATCH_SIZE` | 100 | Chunks per embedding API call |
| `MAX_UPLOAD_MS` | 600,000 (10 min) | Maximum upload processing time |

### `normalizeText(text: string): string`

1. Replace `\r\n` with `\n` (Windows → Unix line endings)
2. Collapse 3+ consecutive newlines to `\n\n`
3. Trim whitespace

### `chunkText(text: string): string[]`

Sliding window chunker:

1. Normalizes input text
2. Iterates with a window of `CHUNK_SIZE` (4000) characters
3. Each chunk is trimmed; chunks shorter than 20 characters are discarded
4. Advances by `chunkLength + 1 - CHUNK_OVERLAP` (150 characters of overlap between consecutive chunks)
5. Returns array of chunk strings

The overlap ensures that sentences split across chunk boundaries are partially captured in both chunks, improving retrieval quality.

### `extractText(name: string, base64: string): Promise<string>`

Extracts plain text from a base64-encoded file:

1. Determines file extension from the filename
2. Decodes base64 → `Uint8Array` using `atob()`
3. **`.txt` / `.md`**: Decodes bytes as UTF-8 with `TextDecoder`
4. **`.pdf`**: Dynamically imports `unpdf`, calls `getDocumentProxy()` then `extractText()` with `mergePages: true`, joins pages with `\n\n`
5. **Other**: Throws unsupported file type error

### `uploadDocument` (POST) — Full Upload Pipeline

**Input validation**:
```ts
const UploadInput = z.object({
  name: z.string().min(1).max(255),
  base64: z.string().min(1),
  progressId: z.string().uuid(),
});
```

**Cooperative cancellation pattern**:

The upload uses a `progressId` to track status in the `upload_progress` database table. The client polls this table every 1 second. The server checks for cancellation between each batch:

```ts
const ensureNotCancelled = async () => {
  // Check timeout
  if (Date.now() - startedAt > MAX_UPLOAD_MS) { /* timeout error */ }
  // Check cancellation
  const status = await readUploadProgressStatus(supabase, progressId);
  if (status === "cancel_requested") { /* cancellation error */ }
};
```

**Full pipeline**:

1. **Initialize progress**: Set status to `"running"`, stage to `"starting"`
2. **Check cancellation**: `ensureNotCancelled()`
3. **Count check**: Query document count; error if `>= MAX_DOCS` (10)
4. **Duplicate check**: Query for existing document with the same name; error if found
5. **Extract text**: `extractText(name, base64)` → normalize
6. **Length check**: Error if text > `MAX_TEXT_CHARS` (200k)
7. **Chunk**: `chunkText(extractedText)` → error if 0 chunks
8. **Insert document record**: Status `"processing"`, chunk_count `0`
9. **Generate embeddings** (batched):
   - Dynamically imports `embedTexts` from `gemini.server`
   - Processes chunks in batches of `EMBEDDING_BATCH_SIZE` (100)
   - Calls `ensureNotCancelled()` before each batch
   - Updates progress with current/total counts
10. **Store chunks**: Inserts all chunks with embeddings into `document_chunks`
11. **Finalize**: Updates document status to `"ready"`, sets chunk_count
12. **Update progress**: Sets status to `"completed"`
13. **Returns**: `{ id, name, chunks: chunkCount }`

**Error handling**: Any error triggers `finalizeFailure()` which updates the progress table with failed/cancelled status and error message.

### `listDocuments` (GET)

Returns all user documents ordered by `created_at DESC`.

### `deleteDocument` (POST)

Deletes a document by ID. The `ON DELETE CASCADE` on `document_chunks.document_id` automatically deletes all associated chunks.

---

## 13. Gemini AI Client

**File**: `src/lib/gemini.server.ts`

### Constants

| Constant | Value | Description |
|---|---|---|
| `TEXT_MODEL` | `"gemini-3.1-flash-lite"` | Text generation model |
| `EMBEDDING_MODEL` | `"gemini-embedding-001"` | Embedding model |
| `EMBEDDING_DIMENSIONS` | `1536` | Vector dimensions (matches pgvector column) |

### `getAiClient(): GoogleGenAI`

Factory that reads `GEMINI_API_KEY` from environment and creates a `GoogleGenAI` instance. Throws if the key is missing.

### `generateGeminiText(prompt: string): Promise<string>`

1. Returns empty string for empty prompts
2. Creates the AI client
3. Calls `ai.models.generateContent({ model: TEXT_MODEL, contents: prompt })`
4. Extracts `response.text`
5. Throws if no text returned
6. Returns trimmed text

### `embedText(input: string): Promise<number[]>` (private)

1. Creates the AI client
2. Calls `ai.models.embedContent({ model: EMBEDDING_MODEL, contents: input, config: { outputDimensionality: 1536, taskType: "SEMANTIC_SIMILARITY" } })`
3. Extracts the embedding vector from `response.embeddings[0].values`
4. Validates the vector has exactly 1536 dimensions
5. Returns the vector as `number[]`

### `embedTexts(inputs: string[]): Promise<number[][]>`

Embeds multiple texts **sequentially** (one at a time):
- Iterates through each input
- Calls `embedText()` for each
- Logs progress: `"[gemini] embedding text { position: N, total: M }"`
- Returns array of vectors

Sequential processing is used to respect Gemini API rate limits on the free tier.

---

## 14. RAG (Retrieval-Augmented Generation)

**File**: `src/lib/rag.server.ts`

### `retrieveContext(supabase, query, matchCount = 5): Promise<string>`

The RAG retrieval function that powers contextual AI responses.

**Step-by-step**:

1. **Guard**: Returns empty string for empty queries
2. **Embed query**: Calls `embedTexts([query])` to get the query's 1536-dimensional vector
3. **Similarity search**: Calls the PostgreSQL RPC function:
   ```ts
   supabase.rpc("match_document_chunks", {
     query_embedding: vector,
     match_count: matchCount,
   });
   ```
   This calls the `match_document_chunks` function defined in Migration 2, which:
   - Filters chunks by `user_id = auth.uid()`
   - Computes cosine similarity: `1 - (chunk.embedding <=> query_embedding)`
   - Orders by similarity descending
   - Returns top `matchCount` results
4. **Format**: Maps results to numbered strings: `"[1] chunk content\n\n[2] chunk content..."}`
5. **Error handling**: Logs warnings but returns empty string (non-fatal) — the AI still works without RAG context

---

## 15. Google Calendar & Gmail Sync

**File**: `src/lib/google.functions.ts`

### Helper Functions

#### `removeDocIfExists(supabase, userId, filename)`

Removes a knowledge base document and its chunks:
1. Queries `documents` for matching `user_id` + `name`
2. If found: deletes chunks by `document_id`, then deletes the document

#### `saveDocToKB(supabase, userId, filename, content)`

Saves text content as a knowledge base document:
1. Calls `removeDocIfExists()` to remove any previous version
2. Chunks the content with `chunkText()`
3. Inserts a document record with status `"processing"`
4. Embeds all chunks with `embedTexts(chunks)`
5. Inserts all chunks with embeddings
6. Updates document status to `"ready"`

#### `getNextDayStr(dateStr: string): string`

Adds 1 day to a `YYYY-MM-DD` date string. Used for Google Calendar all-day event `end.date` (which is exclusive — a single-day event on July 2 needs `start: "2026-07-02"`, `end: "2026-07-03"`).

#### `pushTasksToGoogleCalendar(accessToken, tasks): Promise<number>`

Pushes dated, non-done tasks as Google Calendar events:
1. Filters tasks: `due_date != null && status != "done"`
2. For each task, creates an all-day event:
   ```json
   {
     "summary": "task title",
     "description": "task description",
     "start": { "date": "YYYY-MM-DD" },
     "end": { "date": "YYYY-MM-DD+1" },
     "extendedProperties": {
       "private": { "productivity_companion": "true", "task_id": "..." }
     }
   }
   ```
3. POSTs to `https://www.googleapis.com/calendar/v3/calendars/primary/events`
4. Logs success/failure for each event
5. Returns count of successfully pushed events

The `extendedProperties.private.productivity_companion` tag identifies events created by TaskBase, enabling future detection/deduplication.

### Server Functions

#### `removeIntegrationDoc` (POST)

Called when a user disconnects a service from the Permissions page:
- Takes `{ filename: string }`
- Calls `removeDocIfExists()` to clean up the KB file

#### `cleanOldIntegrationDocs` (POST)

One-time cleanup called on first home page visit:
- Removes both `"calendar!@#.txt"` and `"gmail!@#.txt"` from the KB
- Cleans up potentially stale data from previous sessions

#### `syncCalendar` (POST)

**Input**: `{ accessToken: string }` (Google OAuth access token)

**Pipeline**:
1. **Fetch events**: GET `https://www.googleapis.com/calendar/v3/calendars/primary/events` with `timeMin=now`, `maxResults=50`, `singleEvents=true`, `orderBy=startTime`
2. **Build KB text**: Formats events as human-readable text with event number, summary, start/end times, description
3. **Save to KB**: Calls `saveDocToKB()` with filename `"calendar!@#.txt"` — this replaces any previous version
4. **Run AI refinement**: Calls `refineTasksWithAI()` — the refinement prompt will now include the fresh calendar data
5. **Push tasks back**: Fetches all user tasks, calls `pushTasksToGoogleCalendar()` for dated non-done tasks
6. **Returns**: `{ success: true, refinement: result, pushedCount }`

#### `syncGmail` (POST)

**Input**: `{ accessToken: string }`

**Pipeline**:
1. **List messages**: GET `https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=20`
2. **Fetch metadata**: For each message ID, GET metadata with `format=metadata&metadataHeaders=Subject&metadataHeaders=From&metadataHeaders=Date`
3. **Extract fields**: Subject, From, Date from headers + `snippet` from message body
4. **Build KB text**: Formats as numbered emails with From, Subject, Date, Snippet
5. **Save to KB**: Calls `saveDocToKB()` with filename `"gmail!@#.txt"`
6. **Run AI refinement**: Calls `refineTasksWithAI()`
7. **Returns**: `{ success: true, refinement: result }`

#### `syncAll` (POST)

**Input**: `{ accessToken: string }`

Combined workflow that:
1. Fetches Calendar events (same as `syncCalendar` step 1-2)
2. Fetches Gmail messages (same as `syncGmail` step 1-4)
3. Saves BOTH to KB (two `saveDocToKB()` calls)
4. Runs refinement ONCE (with both data sources available)
5. Pushes tasks back to Google Calendar
6. Returns combined result

The key advantage over calling Calendar and Gmail sync separately is that refinement runs only once with both data sources, avoiding redundant AI calls.

---

## 16. Google Permissions (Client-Side)

**File**: `src/lib/google-permissions.ts`

This module manages client-side localStorage state for Google service connections.

### Storage Keys

```ts
const STORAGE_KEYS = {
  CALENDAR: "taskbase_google_calendar_connected",
  GMAIL: "taskbase_google_gmail_connected",
  PROMPT_SEEN: "hasSeenGooglePermissionPrompt",
};
```

### Functions

#### `getGooglePermissions(): GooglePermissions`
Returns `{ calendar: boolean, gmail: boolean }` from localStorage. Returns `{ false, false }` if localStorage is unavailable (SSR).

#### `setCalendarPermission(connected: boolean)`
Sets the Calendar connection flag in localStorage. Shows a success/info toast.

#### `setGmailPermission(connected: boolean)`
Sets the Gmail connection flag in localStorage. Shows a success/info toast.

#### `hasSeenPermissionPrompt(): boolean`
Returns whether the first-visit permission dialog has been shown.

#### `markPermissionPromptSeen()`
Sets the prompt-seen flag. Shows a confirmation toast.

#### `verifyGoogleTokenScopes(accessToken: string): Promise<boolean>`
(Detailed in Section 7 — Authentication Flow)

---

## 17. Routing & App Shell

### Root Layout (`src/routes/__root.tsx`)

The root of all routes. Provides:

1. **HTML shell** (`RootShell`): Basic `<html>`, `<head>` with charset/viewport meta, stylesheet link, and `<body>` with TanStack's `<Scripts />`

2. **Head configuration**: Sets page title "TaskBase", description meta, and links the app CSS

3. **Root component** (`RootComponent`):
   - Wraps the app in `<QueryClientProvider>`
   - Sets up `<Toaster>` for toast notifications (richColors, top-right position)
   - **Auth state listener**: Subscribes to `supabase.auth.onAuthStateChange()`:
     - On `SIGNED_IN`, `SIGNED_OUT`, or `USER_UPDATED`: Invalidates the router and all React Query queries
     - This ensures the UI immediately reflects auth state changes

4. **Error boundary** (`ErrorComponent`): Displays error message with a "Try again" button that invalidates the router and resets the error boundary

5. **404 page** (`NotFoundComponent`): Displays a "404 — This page wandered off" message with a home link

### Authenticated Layout (`src/routes/_authenticated/route.tsx`)

**File layout prefix**: `_authenticated` — all child routes require authentication.

#### `beforeLoad` Guard

```ts
beforeLoad: async () => {
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) {
    throw redirect({ to: "/auth" });
  }
  return { user: data.user };
}
```

- `ssr: false` — This layout never renders on the server (avoids SSR auth issues)
- Checks auth state before any child route loads
- Redirects to `/auth` if not authenticated
- Returns `user` object in route context

#### Navigation

Desktop nav (hidden on mobile):
```ts
const navItems = [
  { to: "/home", label: "Tasks", icon: ListTodo },
  { to: "/documents", label: "KnowledgeBase", icon: Brain },
  { to: "/chat", label: "Chat", icon: MessageCircle },
  { to: "/documentation", label: "Documentation", icon: FileText },
] as const;
```

Mobile nav: Uses shadcn `<Sheet>` (slide-in drawer from right side) with the same nav items.

#### Implementation Note Popover

The header includes an `<Info>` icon that opens a `<Popover>` explaining:
- The project uses a single free-tier Google AI API
- Free-tier limits may cause 503 errors during high demand
- Backend retries with exponential backoff (operations may take up to 10 minutes)

---

## 18. Home Page — Task Board UI

**File**: `src/routes/_authenticated/home.tsx`

This is the main page of the application — a fully interactive task board with AI integration.

### Section Filtering

```ts
type Section = "all" | "today" | "week" | "month" | "past";
```

#### `isPast(task: Task): boolean`

Returns `true` if a task has a `due_date` that is before the start of today AND the task is not `"done"`. Used to separate overdue tasks into the "Past" tab.

#### `filterTasks(tasks: Task[], section: Section): Task[]`

| Section | Logic |
|---|---|
| `all` | All tasks that are NOT past due |
| `today` | Tasks with `due_date` within `startOfDay(now)` to `endOfDay(now)` |
| `week` | Tasks with `due_date` within `startOfWeek(now)` to `endOfWeek(now)` |
| `month` | Tasks with `due_date` within `startOfMonth(now)` to `endOfMonth(now)` |
| `past` | Tasks that `isPast()` returns `true` for |

Uses `date-fns` interval functions for precise date range calculations.

### Summary Panels

Three `<SummaryPanel>` cards at the top:

1. **Workload**: Shows count of active non-done tasks, a progress bar showing overall completion percentage
2. **Top Priorities**: Lists top 3 non-done, non-past tasks sorted by priority (high → medium → low)
3. **Upcoming**: Lists top 3 non-done tasks with due dates, sorted chronologically

All computed with `useMemo` for performance.

### Drag-and-Drop

Uses `@dnd-kit`:

```ts
const sensors = useSensors(
  useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
  useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
);
```

- **PointerSensor**: Requires 6px of drag distance before activating (prevents accidental drags from clicks)
- **KeyboardSensor**: Supports keyboard-based reordering (accessibility)

#### `handleDragEnd(event: DragEndEvent)`

1. Gets `active.id` and `over.id` from the event
2. Finds their indices in the `visible` array
3. Calls `arrayMove(visible, oldIndex, newIndex)` to reorder
4. Merges visible and non-visible tasks: `[...reordered visible, ...non-visible tasks]`
5. **Optimistic update**: `queryClient.setQueryData(["tasks"], merged)` — immediately updates the UI
6. **Server sync**: `reorderMut.mutate(merged.map(t => t.id))` — sends new order to server

### Refine Dropdown

A `<DropdownMenu>` with 4 actions:

| Action | Function | Condition |
|---|---|---|
| Refine Tasks | `refineMut.mutate()` | Always available |
| Sync Calendar | `calendarSyncMut.mutate()` | Requires `connections.calendar` |
| Sync Gmail | `gmailSyncMut.mutate()` | Requires `connections.gmail` |
| Update All | `updateAllMut.mutate()` | Requires both connections |

Each action:
1. Sets `activeSyncAction` to control which AgentTimeline is shown
2. Gets the Google access token from `supabase.auth.getSession().provider_token`
3. Calls the appropriate server function
4. On success: invalidates queries, shows toast with change summary, updates the assistant summary panel

### AgentTimeline Integration

While any AI operation is running (`isBusy`), the Collapsible summary panel shows a live `<AgentTimeline>` with steps appropriate to the current action (REFINE_STEPS, CALENDAR_SYNC_STEPS, etc.).

### First-Visit Permission Prompt

On first visit (checked via `hasSeenPermissionPrompt()`):
- Shows a modal dialog with checkboxes for Google Calendar and Gmail
- **Save**: Stores permission preferences in localStorage, marks prompt as seen
- **Skip**: Sets both to false, marks prompt as seen

### One-Time KB Cleanup

On mount, checks `localStorage` for `kb_integration_cleaned_v1`:
- If not set: calls `cleanOldIntegrationDocs()` to remove stale `calendar!@#.txt` and `gmail!@#.txt`
- Sets the flag to prevent repeated cleanup

---

## 19. Chat Page

**File**: `src/routes/_authenticated/chat.tsx`

### Suggestion Cards

```ts
const SUGGESTIONS: string[] = [
  "I'm bored generate me different tasks to do for fun",
  "Tell me something to work on and break it down into smaller tasks...",
  "Add a task for finishing my Math homework",
  "Generate a summary for current tasks",
  "Summarise tasks from the uploaded docs",
];
```

Shown as clickable cards above the chat when messages are present (the condition `messages.length === 0 || 1` always evaluates to true, so suggestions are always visible).

### Chat Flow

#### `sendMut` — Send Message Mutation

1. Sets stage to `"Searching uploaded documents..."`
2. Calls `send({ data: { message } })` — the `chat` server function
3. On success:
   - Invalidates `["chat"]` query to refresh messages
   - If `result.updateTasks` is true:
     - Sets `refining = true`
     - Calls `refine()` (refineTasksWithAI)
     - Invalidates `["tasks"]` and `["task-summary"]`
     - Shows toast with change summary
   - Resets stage

#### `clearMut` — Clear Chat Mutation

Calls `clearChat()` server function and invalidates the chat query.

### UI Structure

- **Messages**: Rendered as bubbles — user messages right-aligned with primary background, assistant messages left-aligned with card background
- **Markdown rendering**: Assistant messages use `<ReactMarkdown>` with `remark-gfm` plugin for GitHub-flavored markdown (tables, strikethrough, etc.)
- **Loading indicator**: Shows a spinner with current stage text, plus `<AgentTimeline>` when refining
- **Auto-scroll**: Uses `requestAnimationFrame` + `scrollTo({ behavior: "smooth" })` on message count/stage changes
- **Input**: `<Textarea>` with Enter-to-send (Shift+Enter for newline)

---

## 20. Documents Page

**File**: `src/routes/_authenticated/documents.tsx`

### File Upload Flow

#### `fileToBase64(file: File): Promise<string>`

Converts a `File` to base64 string:
1. Reads file as `ArrayBuffer`
2. Converts to `Uint8Array`
3. Processes in chunks of `0x8000` (32KB) to avoid stack overflow with `String.fromCharCode`
4. Encodes with `btoa()`

#### `handleFiles(files: FileList | null)`

Full upload flow per file:

1. **Size check**: Rejects files > 8MB (`MAX_SIZE = 8 * 1024 * 1024`)
2. **Generate progress ID**: `crypto.randomUUID()`
3. **Get user**: Verifies auth state
4. **Insert progress row**: Creates `upload_progress` record in Supabase
5. **Start polling**: `startProgressPolling(progressId)` — polls every 1 second via `setInterval`
6. **Convert to base64**: `fileToBase64(file)`
7. **Upload**: Calls `uploadDocument` server function with `{ name, base64, progressId }`
8. **Auto-refine**: After successful upload, updates progress to "updating_tasks", calls `refineTasksWithAI()` to immediately incorporate the new document
9. **Cleanup**: Stops polling, resets upload state

#### `handleCancelUpload()`

Cooperative cancellation:
1. Updates the `upload_progress` row: sets `status: "cancel_requested"`, `stage: "cancel_requested"`, `message: "Cancel requested..."`
2. The server's `ensureNotCancelled()` checks this status between embedding batches

### Progress Display

Shows a live progress card with:
- Stage name (capitalized, underscores replaced with spaces)
- Status badges (completed → green, failed → red)
- Message text
- Progress bar (`current / total` percentage)
- Error message if present

### Document List

Displays all uploaded documents with:
- Name and upload date
- Status: Ready (green checkmark + chunk count), Processing (spinner), Failed (red alert + error message)
- Delete button per document

---

## 21. Permissions Page

**File**: `src/routes/_authenticated/permissions.tsx`

Manages Google service connections:

### `toggleCalendar()`

- **Connect**: Initiates OAuth flow with `calendar.readonly` and `calendar.events` scopes
- **Disconnect**: Sets localStorage flag to false, removes `calendar!@#.txt` from KB via `removeIntegrationDoc`

### `toggleGmail()`

- **Connect**: Initiates OAuth flow with `gmail.readonly` scope
- **Disconnect**: Sets localStorage flag to false, removes `gmail!@#.txt` from KB via `removeIntegrationDoc`

### UI

Two cards side-by-side:
- **Google Calendar**: Shows Connected/Not Connected badge, Connect/Disconnect button
- **Gmail Read Access**: Same pattern
- Info box explaining the workflow and security model

---

## 22. Documentation Page

**File**: `src/routes/_authenticated/documentation.tsx`

Renders the bundled documentation markdown file:

```ts
import documentation from "@/routes/_authenticated/content/documentation.md?raw";
```

- Uses Vite's `?raw` import to get the markdown as a raw string
- Renders with `<ReactMarkdown>` inside a `prose` class container
- The documentation covers project overview, usage instructions, features, tech stack, and architecture

---

## 23. Task Card Component

**File**: `src/components/tasks/task-card.tsx`

### `Task` Type

```ts
export type Task = {
  id: string;
  title: string;
  description: string;
  priority: "high" | "medium" | "low";
  tags: string[];
  status: "todo" | "done";
  position: number;
  due_date: string | null;
  created_by: "user" | "ai";
  ai_reason: string | null;
  created_at?: string;
  updated_at?: string;
};
```

### Priority Styles

```ts
const priorityStyles: Record<Task["priority"], string> = {
  high: "bg-red-100 text-red-800 border-red-200",
  medium: "bg-amber-100 text-amber-800 border-amber-200",
  low: "bg-emerald-100 text-emerald-800 border-emerald-200",
};
```

### Rendering

The `TaskCard` component has two modes:

#### Past Mode (`pastMode = true`)

Simplified card with:
- Strikethrough title (opacity 70%)
- Due date display
- Delete (X) button only
- No drag-and-drop (disabled via `useSortable({ disabled: pastMode })`)

#### Normal Mode

Full-featured card with:
- **Drag handle**: "Drag" text button with `useSortable` listeners. Custom `onPointerDown` sets `pressed` state for 50% opacity visual feedback during drag.
- **Checkbox**: Toggles task status (todo ↔ done)
- **Title**: Strikethrough when done
- **Priority badge**: Colored pill (red/amber/emerald)
- **AI badge**: Sparkle icon + "AI" label for AI-generated tasks
- **Left border accent**: `border-l-2 border-l-primary` for AI tasks
- **Description**: Hidden on mobile with expandable toggle, always visible on desktop
- **Due date**: Calendar icon + formatted date
- **Tags**: Rounded pill badges
- **AI reasoning**: Expandable section showing `ai_reason` text with creation/update timestamps
- **Action buttons**: Edit (pencil icon) and Delete (trash icon)

---

## 24. Task Editor Component

**File**: `src/components/tasks/task-editor.tsx`

### `TaskDraft` Type

```ts
export type TaskDraft = {
  id?: string;
  title: string;
  description: string;
  priority: "high" | "medium" | "low";
  tags: string[];
  due_date: string | null;
};
```

### Dialog Form

A shadcn `<Dialog>` containing a form with:
- **Title**: Required text input
- **Description**: Optional textarea (4 rows)
- **Priority**: Select dropdown (High / Medium / Low)
- **Due date**: Date input
- **Tags**: Comma-separated text input

### State Management

- Uses `useEffect` to populate form when `open` changes:
  - **Edit mode** (`initial` provided): Populates from the existing task
  - **Create mode**: Resets to defaults (empty title, medium priority, no tags)

### Tag Processing

Tags input is stored as a raw comma-separated string. On submit:
```ts
const tags = tagsInput.split(",").map(tag => tag.trim()).filter(Boolean);
```

---

## 25. Agent Timeline Component

**File**: `src/components/ai/agent-timeline.tsx`

### `AgentTimeline` Component

A live progress indicator that shows AI processing steps as a vertical timeline.

**Props**:
- `steps: TimelineStep[]` — Array of `{ label: string, minMs?: number }`
- `active: boolean` — Whether the operation is in progress
- `intervalMs: number` (default 700) — Time between step advances

**Behavior**:
- When `active = true`: Steps advance on a timer every 700ms. The last step never auto-completes while active (stays as "current").
- When `active` flips to `false`: All remaining steps immediately complete (marks everything as done).
- When `active` flips to `true`: Resets to step 0.

**Visual states per step**:
| State | Icon | Style |
|---|---|---|
| Done | Checkmark in primary-colored circle | Full opacity |
| Current | Spinning loader in primary-bordered circle | `drift-shimmer-text` animation |
| Pending | Small dot in bordered circle | 50% opacity |

### Predefined Step Sets

```ts
REFINE_STEPS = [
  "Reading uploaded documents",
  "Retrieving relevant knowledge",
  "Understanding existing tasks",
  "Prioritizing workload",
  "Generating refined task list",
  "Updating dashboard",
];

CALENDAR_SYNC_STEPS = [
  "Connecting Google Calendar API",
  "Fetching calendar events & reminders",
  "Generating calendar!@#.txt file",
  "Uploading refreshed file to Knowledge Base",
  "Running AI refinement pipeline",
  "Regenerating tasks on dashboard",
  "Pushing updated events to Google Calendar",
];

GMAIL_SYNC_STEPS = [
  "Connecting Gmail API",
  "Fetching recent 20 emails",
  "Generating gmail!@#.txt file",
  "Uploading refreshed file to Knowledge Base",
  "Running AI refinement pipeline",
  "Regenerating tasks on dashboard",
];

UPDATE_ALL_STEPS = [
  "Connecting Google APIs",
  "Fetching calendar events & reminders",
  "Fetching recent 20 emails",
  "Generating calendar!@#.txt & gmail!@#.txt",
  "Uploading refreshed files to Knowledge Base",
  "Running AI refinement pipeline",
  "Regenerating tasks on dashboard",
  "Pushing updated events to Google Calendar",
];
```

---

## 26. Styling & Design System

**File**: `src/styles.css`

### Tailwind CSS v4

Uses Tailwind v4's new syntax:
- `@import "tailwindcss" source(none)` — Imports Tailwind with no auto-source scanning
- `@plugin "@tailwindcss/typography"` — Typography plugin for prose styles
- `@source "../src"` — Scans `src/` directory for class names
- `@import "tw-animate-css"` — Animation utilities

### Color Palette — "Warm Beach Beige"

Uses **OKLCH color space** for perceptual uniformity:

| Token | Light Mode | Description |
|---|---|---|
| `--background` | `oklch(0.975 0.018 80)` | Warm cream background |
| `--foreground` | `oklch(0.28 0.03 50)` | Dark brown text |
| `--primary` | `oklch(0.52 0.08 55)` | Warm amber accent |
| `--sand` | `oklch(0.94 0.035 80)` | Light sand |
| `--ocean` | `oklch(0.62 0.07 220)` | Blue accent |
| `--coral` | `oklch(0.7 0.13 30)` | Coral accent |
| `--priority-high` | `oklch(0.62 0.17 25)` | Red |
| `--priority-medium` | `oklch(0.72 0.14 60)` | Amber |
| `--priority-low` | `oklch(0.65 0.11 145)` | Green |

Dark mode overrides all tokens with appropriate dark variants.

### Custom Utilities

#### `card-soft`
```css
@utility card-soft {
  background-color: var(--color-card);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  box-shadow: 0 1px 2px ..., 0 8px 24px ...;
}
```

#### Custom Animations

1. **`drift-fade-in`**: Fade in + 6px upward slide (0.35s ease-out)
2. **`drift-highlight`**: Pulse ring animation (coral color, 1.2s, single)
3. **`drift-shimmer-text`**: Shimmer gradient moving across text (2s linear infinite) — used on the "current" AgentTimeline step

### Background Gradients

```css
body {
  background-image:
    radial-gradient(at 12% 8%, oklch(0.93 0.05 75 / 0.5) 0px, transparent 50%),
    radial-gradient(at 88% 92%, oklch(0.9 0.05 200 / 0.35) 0px, transparent 50%);
  background-attachment: fixed;
}
```

Two fixed radial gradients create a subtle warm-to-cool ambience across the page.

---

## 27. Docker Deployment

**File**: `Dockerfile`

### Multi-Stage Build

#### Stage 1: Builder (`node:20-alpine`)

```dockerfile
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci || npm install
COPY . .
RUN npm run build
```

- Uses Alpine for minimal image size
- Copies package files first for Docker layer caching
- `npm ci || npm install` — Prefers clean install, falls back to regular install
- Builds the TanStack Start / Nitro application (output goes to `.output/`)

#### Stage 2: Production (`node:20-alpine`)

```dockerfile
FROM node:20-alpine AS runner
ENV NODE_ENV=production
WORKDIR /app
COPY --from=builder /app/.output ./.output
EXPOSE 3000
ENV PORT=3000
CMD ["node", ".output/server/index.mjs"]
```

- Only copies the `.output` directory (Nitro bundles everything needed)
- No `node_modules` in production image — Nitro bundles all dependencies
- Runs the server on port 3000
- Minimal attack surface (no dev dependencies, no source code)

---

## 28. Data Flow Diagrams

### Document Upload → Task Generation

```
User selects file → fileToBase64() → uploadDocument server function
  → extractText() [txt/md/pdf]
  → normalizeText()
  → chunkText() [4000 char windows, 150 overlap]
  → embedTexts() [Gemini API, sequential, batched by 100]
  → INSERT documents + document_chunks (with vectors)
  → refineTasksWithAI()
    → Fetch tasks + chat + documents
    → retrieveContext() [RAG: embed query → pgvector search → top 6 chunks]
    → Fetch calendar/gmail KB chunks directly
    → Build Gemini prompt (tasks + chat + RAG + calendar + gmail + rules)
    → generateGeminiText()
    → Parse + Zod validate
    → DELETE all user tasks
    → INSERT refined tasks (with ai_reason)
    → Return change summary
```

### Chat Message → Potential Task Update

```
User sends message → chat server function
  → INSERT user message to chat_messages
  → Fetch tasks + last 20 messages
  → retrieveContext() [RAG: embed message → top 5 chunks]
  → Build Gemini prompt (tasks + KB + conversation)
  → generateGeminiText()
  → Parse { answer, updateTasks }
  → INSERT assistant message to chat_messages
  → Return to client
  
If updateTasks === true:
  → Client triggers refineTasksWithAI()
  → (Same refinement pipeline as above)
```

### Google Calendar Sync

```
User clicks "Sync Calendar"
  → Get provider_token from Supabase session
  → syncCalendar server function
    → GET /calendar/v3/calendars/primary/events (50 events)
    → Format as human-readable text
    → saveDocToKB("calendar!@#.txt", text)
      → Remove old version
      → Chunk + embed + store
    → refineTasksWithAI() (now includes calendar context)
    → pushTasksToGoogleCalendar()
      → For each dated non-done task:
        → POST /calendar/v3/calendars/primary/events (all-day event)
```

---

## 29. Security Model

### Authentication

- **JWT-based**: Every server function validates the Supabase JWT
- **3-part structure validation**: Rejects tokens that don't look like JWTs
- **Claims verification**: `supabase.auth.getClaims()` cryptographically verifies the token
- **Per-request client**: A new Supabase client is created for each request with the user's token, ensuring RLS context

### Row Level Security (RLS)

Every table has RLS enabled with policies that scope all operations to `auth.uid() = user_id`:
- Users can only SELECT, INSERT, UPDATE, DELETE their own rows
- No cross-user data access is possible at the database level
- Server functions additionally filter by `user_id` as defense-in-depth

### OAuth Scope Enforcement

- Required scopes are verified after OAuth callback via Google's tokeninfo endpoint
- If any scope is missing, the user is signed out and redirected back to auth
- This prevents partial permission grants from causing runtime errors

### Input Validation

- All server function inputs are validated with Zod schemas
- AI outputs are validated with Zod before being used
- File size limits (8MB client, 200k chars server)
- Document count limits (10 per user)

### Token Handling

- Bearer tokens flow from client → server via Authorization header
- Google access tokens are read from the Supabase session's `provider_token`
- No tokens are stored in application code or localStorage (Supabase manages session storage)

---

## 30. Key Design Decisions & Trade-offs

### 1. Atomic Task Replacement vs. Merge

**Decision**: `refineTasksWithAI` deletes ALL user tasks and inserts the AI-refined set.

**Why**: Merging by title/ID is fragile — the AI may rewrite titles for clarity, split tasks, or consolidate duplicates. An atomic replace ensures the task list exactly matches the AI output. The trade-off is that any in-flight manual edits during a refinement cycle are lost.

### 2. Sequential Embedding (Not Batched API Call)

**Decision**: `embedTexts()` embeds one text at a time in a loop.

**Why**: The Gemini free tier has strict rate limits. Sequential calls with natural delays between them avoid hitting rate limits. For production with a paid tier, this could be replaced with parallel batch calls.

### 3. Implicit OAuth Flow (Not PKCE)

**Decision**: Uses `flowType: "implicit"` for Supabase Auth.

**Why**: The implicit flow returns the `provider_token` (Google access token) directly in the URL hash, which Supabase JS can parse immediately. This is needed because TaskBase uses the Google access token to call Calendar and Gmail APIs. With PKCE flow, the provider_token isn't as easily accessible on the client side.

### 4. Cooperative Upload Cancellation

**Decision**: Uses a database-polled cancellation flag instead of AbortController.

**Why**: The upload pipeline runs as a single long server function call. The client can't abort an in-flight fetch to a server function without losing the response. Instead, the client sets `status: "cancel_requested"` in the `upload_progress` table, and the server checks this between embedding batches. This gives clean cancellation with proper cleanup.

### 5. Special Filenames for Integration Docs

**Decision**: Calendar and Gmail data are stored as documents named `"calendar!@#.txt"` and `"gmail!@#.txt"`.

**Why**: Using special characters (`!@#`) in the filename makes collisions with user-uploaded files extremely unlikely. The refinement pipeline fetches these documents by exact name to guarantee their content is always included in the prompt, regardless of RAG similarity ranking.

### 6. Client-Side Permission State (localStorage)

**Decision**: Google Calendar/Gmail connection status is tracked in localStorage, not the database.

**Why**: The actual permission grant is managed by Google's OAuth system and Supabase Auth. The localStorage flags are UI convenience — they control which sync buttons are enabled and whether the first-visit prompt is shown. The actual access token availability is checked at sync time.

### 7. Lazy Proxy for Supabase Client

**Decision**: The exported `supabase` is a Proxy that lazily initializes the real client.

**Why**: Module-level initialization would fail during SSR (no `localStorage`, potentially no environment variables). The Proxy defers initialization to first access, which always happens in a context where the required APIs are available.

### 8. Free-Tier Gemini with Exponential Backoff

**Decision**: Uses `gemini-3.1-flash-lite` (free tier) as the only AI model.

**Why**: Cost optimization — the entire application runs on a single free-tier API key. The backend handles 503 errors with automatic retries and exponential backoff. Operations may take up to 10 minutes during high demand periods, which is documented in the in-app implementation note.
