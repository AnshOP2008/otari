const key = process.env.OTARI_API_KEY?.trim();
const planner = process.env.OTARI_PLANNER_MODEL?.trim();
const reviewer = process.env.OTARI_REVIEWER_MODEL?.trim();

async function check() {
  if (!key || !planner || !reviewer || planner === reviewer) {
    throw new Error("Set an Otari key and two distinct model IDs in .env.");
  }
  const base = (process.env.OTARI_BASE_URL || "https://api.otari.ai/api/v1").replace(/\/+$/, "");
  async function read(path) {
    const response = await fetch(base + path, {
      headers: { Authorization: "Bearer " + key },
      redirect: "error",
      signal: AbortSignal.timeout(10_000),
    }).catch(() => {
      throw new Error(`Could not reach Otari at ${path}. Check the gateway URL and connection.`);
    });
    if (!response.ok) throw new Error(`Otari ${path} returned HTTP ${response.status}.`);
    return response.json();
  }
  const [budget, catalog] = await Promise.all([read("/key/budget"), read("/models")]);
  const remaining = budget?.remaining_usd;
  if (budget?.budgets_enforced !== true || !Number.isFinite(remaining) || remaining <= 0) {
    console.error("Set a positive enforced spending cap on the key or workspace.");
    process.exitCode = 1;
  } else {
    console.log(`Enforced budget remaining: $${remaining.toFixed(4)}`);
  }

  if (!Array.isArray(catalog?.data)) throw new Error("Otari returned an unexpected model catalog.");
  for (const [role, id] of [["Planner", planner], ["Reviewer", reviewer]]) {
    const entry = catalog.data.find((model) => model.id === id);
    if (!entry) {
      console.error(`${role} ${id} is absent from the catalog. Check the model ID or routing alias.`);
      process.exitCode = 1;
      continue;
    }
    console.log(`${role} catalog entry: ${id}`);
    const parameters = entry.supported_parameters;
    if (Array.isArray(parameters) && !parameters.includes("response_format")) {
      console.error(`${role} does not advertise structured responses.`);
      process.exitCode = 1;
    }
    if (role === "Reviewer" && Array.isArray(parameters) && !parameters.includes("tools")) {
      console.warn("Reviewer does not advertise tool use. Leave optional tool steps off.");
    }
  }
  console.log("No model calls were made. Verify wallet credit or provider access separately.");
}

try {
  await check();
} catch (error) {
  console.error(error instanceof Error ? error.message : "Otari preflight failed.");
  process.exitCode = 1;
}
