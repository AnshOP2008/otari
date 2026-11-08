# TaskBase

TaskBase turns notes, a Gmail snapshot, and upcoming Calendar events into a task plan you can verify. Search the sources, ask a grounded question, review a two-model Otari plan, and save the tasks you choose.

## Run locally

Requires Node.js 22.12+, the Supabase CLI, and Docker Desktop.

1. Run `npm ci` and `supabase start`. The local stack applies `supabase/migrations` to a fresh database. For an existing local database, run `supabase migration up --local`.
2. Copy `.env.example` to `.env` if the file does not exist. Run `supabase status` and use the local API URL and publishable key for both the server and `VITE_` Supabase settings. Keep `.env` private.
3. Run `npm run dev -- --host 127.0.0.1`. The landing-page example works without an account or an AI key. Choose **Sign in** and **Create local account** to use a separate, local workspace.
4. In **KnowledgeBase**, upload `examples/repair-cafe-handoff.md`, then search for **volunteer briefings**. Try a text PDF, Markdown file, or plain text file under 8 MB. Scanned PDFs need a text layer.

Uploads and source search use PostgreSQL and spend no model credits. Existing ready sources can be searched without re-uploading or regenerating embeddings. Local accounts and data are separate from the original hosted Supabase project.

## Enable Google integrations

For a hosted build, apply all migrations to the intended Supabase project, enable Google as a sign-in provider, and configure the Google Calendar and Gmail APIs for the OAuth client. Add the hosted app's `/auth/callback` URL to Supabase's allowed redirects. The Google consent screen must allow the account you're using. Follow [Supabase's Google configuration guide](https://supabase.com/docs/guides/auth/social-login/auth-google).

To test Google locally, use `http://127.0.0.1:54321/auth/v1/callback` as the OAuth client's redirect URI, then add the following to your local `supabase/config.toml`. Use the port where TaskBase is running. Put the client ID and secret in the ignored `.env` and restart the local Supabase stack. TaskBase reads the local provider setting and enables Google sign-in once it is available.

```toml
[auth]
additional_redirect_urls = ["http://127.0.0.1:3218/auth/callback"]

[auth.external.google]
enabled = true
client_id = "env(SUPABASE_AUTH_EXTERNAL_GOOGLE_CLIENT_ID)"
secret = "env(SUPABASE_AUTH_EXTERNAL_GOOGLE_CLIENT_SECRET)"
```

Set the public Supabase URL and publishable key before building. Set the server-side environment variables on the host at runtime. Run `npm run build` and start the output with `node .output/server/index.mjs`.

For Docker, export the browser variables before building and supply the server settings when the container starts:

```sh
docker build --build-arg VITE_SUPABASE_URL --build-arg VITE_SUPABASE_KEY -t taskbase .
docker run --rm -p 3000:3000 -e SUPABASE_URL -e SUPABASE_PUBLISHABLE_KEY -e OTARI_API_KEY -e OTARI_BASE_URL -e OTARI_PLANNER_MODEL -e OTARI_REVIEWER_MODEL taskbase
```

Use the Supabase publishable key for the build argument. Keep Google and Otari secrets in server-side runtime settings. When Supabase runs on the Docker Desktop host, the browser URL can be `http://127.0.0.1:54321` while the container's `SUPABASE_URL` is `http://host.docker.internal:54321`. A build without browser settings still opens the public Planning Desk example.

In **Integrations**, grant Calendar read access for event imports and Gmail read access for inbox previews. Calendar can look ahead 7–60 days on your primary calendar or a shared calendar you select. Gmail supports an unread-only filter, a 5–20 message limit, and Gmail search expressions. Open a preview, expand the captured text, and select the entries to save. Importing replaces that source's saved snapshot. If a selected entry changes after the preview, refresh the preview and review it again. You can remove saved snapshots from TaskBase. Chat citations are stored with their replies.

For an outbound action, select **All-day due date** or **Timed focus block**. A focus block can use any open task and leaves the task's due date intact. Review the event time and choose whether to include task notes. **Send selected task** writes to your primary Calendar after you grant write access. Sending the same task again updates its event. **Prepare calendar file** makes the same event available as an .ics download without Google OAuth.

For a focus block, use **Check this time** after granting free/busy access. If the block looks free, TaskBase checks again immediately before writing it. If Calendar reports a conflict, choose another time or explicitly send despite the conflict. The check includes any existing copy of this task's event.

In **Planning Desk**, open **Use Calendar availability** to check a work window on your primary calendar. Grant **Allow free/busy access** in Integrations if you only need availability. Planning Desk shows total free time and the longest uninterrupted block. If you apply the result, the reviewer receives those two durations and the app flags tasks that need to be split or deferred. Event details and timestamps are excluded from that AI request.

## Enable Otari

1. Use a workspace with hackathon credits or an already authorized provider. The app needs a usable, enforced dollar ceiling. Read-only access to the models catalog does not establish that inference is funded.
2. Keep a dedicated key in `OTARI_API_KEY`. Set `OTARI_BASE_URL` to the URL for your region. The default is `https://api.otari.ai/api/v1`.
3. Set `OTARI_PLANNER_MODEL` and `OTARI_REVIEWER_MODEL` to distinct JSON-capable open-weight models or approved routing aliases. Choose a reviewer with tool support for the optional steps. Verify served models in the gateway trace.
4. Set a dollar limit on the key or workspace covering all providers. The app checks the budget before generation and stops if the limit is absent or exhausted. Web research and code execution require their workspace tools to be enabled.

Chat can search all ready sources, one source, or run with retrieval off. It shows the exact retrieved excerpts associated with cited answers. **Find New Tasks** checks model suggestions against verbatim source evidence and adds only new titles. Planning Desk lets you load a saved source into the brief, inspect the text before sending it, then select which proposals to save.

## Project history

The `pre-otari` tag records the older TaskBase source recovered from a separate local copy. It used Gemini for text and embeddings and bundled Google imports with AI updates. The `otari-hackathon` branch adds the hosted Otari workflow, source-grounded retrieval, and explicit Google controls. The import commit records the recovered starting state. It does not recreate the previous repository's commit history.

## Record the submission

Use the same repair café example from upload through planning. With Google OAuth available, use a demo inbox or calendar and show one relevant entry selected while a personal entry stays unselected. Show the search result and chat citation, load the source into Planning Desk, review the proposed deadline and capacity, save one task, and open it on the board. Expand **Otari run details** and match request IDs to the gateway's Requests view. For any tool, routing, or fallback you claim, show its actual gateway record.

The [DoraHacks brief](https://dorahacks.io/hackathon/2468/detail) asks for a public repository, hackathon branch, first Otari commit link, a 3–5 minute participant-recorded demo, and feedback. The [judging rubric](https://docs.google.com/document/d/1-spnCZ3f2SSki8cb6FnochjchdyttUsjjxfoE6aBnF4/edit) gives credit for capabilities demonstrated in the working app.

The demo design takes inspiration from [SalesShortcut](https://cloud.google.com/blog/products/ai-machine-learning/adk-hackathon-results-winners-and-highlights?hl=en), which connects multiple agent roles around one concrete workflow, and [Engagement Hub](https://devblogs.microsoft.com/powerplatform/agent-academy-hackathon-winners/), which combines structured evidence, human review, and duplicate-safe actions. [Metis](https://addons.mozilla.org/en-US/firefox/addon/metis/) informed the separate controls for Google reads and writes.

## Checks

Run `npx tsc --noEmit`, `npm run build`, and `node src/lib/__tests__/run-tests.js`. The public example is labeled as an example and uses no model calls. To demonstrate hosted inference, use a funded, capped Otari workspace and capture its real request IDs.
