# TaskBase — Project Documentation

## 1. Project Overview

### What it does

TaskBase is an AI-native productivity task manager. Users sign in with Google, upload study/work documents (syllabi, briefs, notes), and the assistant transforms them into a prioritized, drag-and-drop task board. A built-in AI chat assistant has retrieval access to the user's uploaded documents and current tasks, while a one-click **Refine with AI** action can regenerate the entire board with explicit reasoning for every decision. Furthermore, TaskBase optionally integrates with Google Calendar and Gmail to sync your schedule and communications into actionable tasks.

### Problem Solved

Generic to-do applications don't understand what users actually need to accomplish, while LLM chat applications don't maintain structured, persistent work. TaskBase bridges both worlds by ingesting source documents, extracting actionable tasks with priorities and deadlines, and explaining every AI-generated decision by referencing the supporting document or conversation. The result is an agentic planner that continuously restructures work based on the user's goals, instructions, schedule, and inbox.

---

## 2. How to Use

1. Open the application and sign in using **Continue with Google**.
2. Grant Google Calendar and Gmail permissions when prompted during sign-in to enable ecosystem syncing.
3. Navigate to **Documents** and upload `.txt`, `.md`, or `.pdf` files.
4. Wait until uploaded documents finish processing (`Ready` status).
5. Use the **Sync & Refine** actions (Sync Calendar, Sync Gmail, or Update All) to ingest your latest emails and calendar events.
6. Click **Refine with AI** to generate an optimized task board based on your documents, calendar, and emails.
7. Review the AI summary, tags and individual reasoning for each generated task.
8. Edit, reorder, complete, or delete tasks manually at any time. Any tasks with a due date will be automatically pushed back to your Google Calendar as all-day events.
9. Open **Chat** to ask questions about your workload or request planning assistance. If the AI determines the board should change, it signals the UI to offer a task refinement.
10. Drag and drop task cards to reorder them or toggle their completion status using the checkbox.

---

## 3. Core Features

1. **Google Authentication & Permission Scopes**
   - Secure sign-in using Supabase Auth.
   - Strict OAuth scope validation ensuring required permissions (Calendar Read/Write, Gmail Read) are granted before allowing access.

2. **Google Ecosystem Integrations**
   - **Sync Calendar**: Fetches upcoming Google Calendar events, adds them to the AI's Knowledge Base, runs the AI Refinement pipeline, and automatically pushes any dated tasks back to Google Calendar.
   - **Sync Gmail**: Fetches the 20 most recent emails (including metadata and snippets), adds them to the AI's Knowledge Base, and extracts actionable items via the AI Refinement pipeline.
   - **Update All**: A combined workflow that synchronizes both Calendar and Gmail simultaneously and refines existing tasks.

3. **Interactive Task Board**
   - Create, edit, complete, delete, and reorder tasks.
   - Drag-and-drop powered by `@dnd-kit`.
   - Workload summary, Top Priorities, and Upcoming sections.

4. **Refine with AI**
   - Regenerates the task board using the current tasks, recent conversation history, Google ecosystem data, and relevant document context.
   - Returns a narrated first-person summary together with per-task AI reasoning.

5. **AI Chat Assistant**
   - Persistent conversation history.
   - Context-aware responses using Retrieval-Augmented Generation (RAG).
   - Can recommend regenerating the task board when appropriate.

6. **Knowledge Base**
   - Upload `.txt`, `.md`, and `.pdf` documents.
   - Automatic document parsing, chunking, embedding generation, and indexing.
   - Live processing status (`Processing`, `Ready`, `Failed`).

7. **Semantic Search (RAG)**
   - Retrieves the most relevant document chunks using vector similarity search before every AI interaction.

8. **Agent Experience**
   - Live Agent Timeline showing each reasoning stage.
   - First-person AI summaries.
   - Per-task explanations (`ai_reason`) describing why every task exists.

---

## 4. Tech Stack

1. **Frontend**
   - React
   - TanStack Router (SSR)
   - TanStack Query
   - Tailwind CSS
   - shadcn/ui
   - Lucide Icons
   - Sonner
   - `@dnd-kit/core`
   - `@dnd-kit/sortable`
   - `date-fns`

2. **Backend**
   - TanStack Start Server Functions (`createServerFn`)
   - Google APIs (Calendar API , Gmail API , Gemini API)
   - `unpdf` for PDF parsing
   - Zod for AI response validation

3. **Database**
   - Supabase PostgreSQL
   - `pgvector`

4. **Authentication**
   - Supabase Auth (Implicit flow)
   - Google OAuth
   - RLS-protected server functions

5. **Artificial Intelligence**
   - Gemini models for creating embeddings and refining tasks

6. **Build**
   - Vite

---

## 5. System Architecture

```text
Browser (React + TanStack Router SSR)
          │
    Bearer Token & Google Provider Token
          │
          ▼
TanStack Start Server Functions
          │
          ├── Authentication & Scope Middleware
          ├── Task Services
          ├── Google Sync Services (Calendar/Gmail)
          ├── Document Services
          ├── AI Services
          └── Retrieval Services
          │
    ┌─────┴─────┬───────────┐
    ▼           ▼           ▼
Gemini API   Google APIs   Supabase Auth
 (LLM)    (Cal/Gmail)       │
                            ▼
               Supabase Postgres (pgvector)
```
