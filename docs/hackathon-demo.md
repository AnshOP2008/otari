# TaskBase demo runbook

TaskBase turns an event handoff into a source-backed task plan, checks it against the time available, and lets the organizer choose what goes on the board and into Calendar.

## Before recording

1. Start TaskBase and sign in to the demo workspace. Upload [the repair café handoff](../examples/repair-cafe-handoff.md) in **KnowledgeBase**. Search for **safety briefing** and check that the result includes the November 12 deadline.
2. Run `node --env-file=.env scripts/check-otari.mjs`. Confirm the budget and model IDs, then check for usable hackathon credits or an authorized provider. Rehearse one short live draft before recording. A passing preflight uses no inference and cannot establish live model access. In free demo mode, leave optional research and code execution off.
3. For the Google segment, use synthetic messages and events. Prepare a relevant thread and an unrelated demo message. Check Gmail preview, Calendar free/busy, and Calendar write permissions separately. Use the uploaded handoff for the source segment if Google approval is pending.
4. Open TaskBase and the signed-in Otari workspace in separate tabs. Use the current branch for the recording and keep keys, personal inboxes, and account details out of view.

## Four-minute recording

| Time | Show on screen |
| --- | --- |
| 0:00–0:35 | Open Planning Desk. Explain the organizer's problem using the repair café handoff and its two deadlines. Briefly show the earlier source tag and the Otari integration commit. |
| 0:35–1:15 | Preview a synthetic Gmail thread and leave the unrelated message unchecked. In Planning Desk, replace the example with the briefing passage, then add the relevant Calendar passage. Review the editable text and both source labels. Use the repair café handoff if Google approval is pending. |
| 1:15–2:25 | Set a short planning window and run a live draft. Show the source quote, the deadline it supports, and the reviewer's hold or capacity decision. Enable the optional public research and capacity calculation only after confirming those gateway tools work. |
| 2:25–3:15 | Save one task and open its evidence on the board. Use **Schedule focus time** to see the estimate in Calendar. Show a conflict and later opening if free/busy is live. Confirm the time before sending, or demonstrate the calendar file if write permission is pending. |
| 3:15–4:00 | Expand **Otari run details**. Find the displayed session in Otari, or match its request IDs in Requests. Show the two served model IDs, the enforced key budget, and any tool, routing, or policy event you plan to claim. |

The participant records the screen and speaks in their own voice. Use the labeled example to rehearse the screens. Record a successful hosted run before presenting live Otari behavior.

## Submission

- Project name and one-line description, plus the participant's Otari sign-up email in the submission form.
- [Public repository](https://github.com/AnshOP2008/otari), [hackathon branch](https://github.com/AnshOP2008/otari/tree/otari-hackathon), and [first Otari commit](https://github.com/AnshOP2008/otari/commit/7d98391cda3714121a646fed70e2ec48e78158e6). Check that the final recording matches the published branch.
- Otari features demonstrated. Use served model IDs for model claims and gateway events for tool, routing, and guardrail claims. A Calendar API call is a Google integration. An Otari MCP claim requires its own gateway evidence.
- Links to any relevant Otari issues or PRs that were opened, a 3–5 minute participant-recorded demo, and written or participant-recorded feedback.

For written feedback, describe when calling a provider directly was tempting, what the app had to implement that you expected Otari to handle, and whether you would keep using Otari. Base the answers on your own experience with the demo and setup.

[DoraHacks brief](https://dorahacks.io/hackathon/2468/detail) · [Judging rubric](https://docs.google.com/document/d/1-spnCZ3f2SSki8cb6FnochjchdyttUsjjxfoE6aBnF4/edit) · [Otari session traces](https://github.com/mozilla-ai/otari/blob/main/docs/traces.md)
