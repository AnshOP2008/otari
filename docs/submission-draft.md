# TaskBase submission draft

## Project fields

### Name

TaskBase

### One-line description

TaskBase turns handoff notes, selected Gmail threads, and Calendar events into a source-backed task plan you can review and schedule.

### Project description

An event organizer can find a deadline in their saved sources, build a brief from the relevant passages, and send it through hosted Otari. One open-weight model proposes tasks with verbatim evidence. A second reviews the proposals against the time available. The organizer chooses what to save and can take a task’s estimate into Calendar or export it as a calendar file.

### Repository and branch

[AnshOP2008/otari](https://github.com/AnshOP2008/otari) · [otari-hackathon](https://github.com/AnshOP2008/otari/tree/otari-hackathon)

### First Otari commit

[`7d98391`](https://github.com/AnshOP2008/otari/commit/7d98391cda3714121a646fed70e2ec48e78158e6)

### Starting version

[`pre-otari`](https://github.com/AnshOP2008/otari/tree/pre-otari)

## Otari capabilities to show

- **Two open-weight models with distinct roles.** Liquid LFM2.5 2.6B drafts tasks from the brief. NVIDIA Nemotron 3.5 Super VL reviews their source evidence and capacity. The verified run used two explicit free OpenRouter routes through hosted Otari. [Liquid model release](https://www.liquid.ai/blog/lfm2-5-2-6b) · [NVIDIA model release](https://research.nvidia.com/labs/nemotron/Nemotron-3.5-Super-and-Lightning/)
- **Spending limits.** The gateway enforces a dedicated $0.10 cap with no reset. The verified planner and reviewer calls each reported $0.00.
- **Request evidence.** In Planning Desk, expand **Otari run details** to show the session label, model IDs, costs, and request IDs. Match the calls in the Otari dashboard.

Claim the capabilities visible in your recording. Free model mode disables optional web research and code execution. Live Google permissions still need verification. Use the saved synthetic handoff and calendar file for the demo if that access is pending.

## Feedback notes for the participant

- **Provider friction.** Otari listed zero-priced Gemma variants, but both returned upstream rate-limit errors during setup. Switching to explicit Liquid and NVIDIA free selectors made both model roles work through the same gateway.
- **Work done in TaskBase.** We validate that each proposed task quotes the brief, show the model traces alongside the plan, and run a read-only check for current provider pricing and the key cap before recording.
- **What to say about continued use.** Add your own judgment. The observed tradeoff was centralized limits and request evidence, with extra work to distinguish a listed model from a route that could actually serve requests.

## Complete in DoraHacks

1. Enter the participant’s Otari sign-up email privately in the form.
2. Add a shareable link to the participant’s 3–5 minute screen recording with their own narration. Follow the [recording runbook](hackathon-demo.md).
3. Add your written feedback or participant-recorded feedback. Include links to any relevant Otari PRs or issues you opened.
4. Check the published branch, first-commit link, and video visibility from a signed-out browser before submitting.

[DoraHacks submission requirements](https://dorahacks.io/hackathon/2468/detail) · [Judging rubric](https://docs.google.com/document/d/1-spnCZ3f2SSki8cb6FnochjchdyttUsjjxfoE6aBnF4/edit)
