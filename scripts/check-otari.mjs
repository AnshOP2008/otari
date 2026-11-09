const key = process.env.OTARI_API_KEY?.trim();
const planner = process.env.OTARI_PLANNER_MODEL?.trim();
const reviewer = process.env.OTARI_REVIEWER_MODEL?.trim();
const freeDemo = process.env.OTARI_FREE_DEMO === "true";

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
  const [budget, catalog] = await Promise.all([
    read("/key/budget"),
    freeDemo
      ? fetch("https://openrouter.ai/api/v1/models", {
          redirect: "error",
          signal: AbortSignal.timeout(10_000),
        }).then((response) => {
          if (!response.ok) throw new Error(`OpenRouter catalog returned HTTP ${response.status}.`);
          return response.json();
        })
      : read("/models"),
  ]);
  const remaining = budget?.remaining_usd;
  if (budget?.budgets_enforced !== true || !Number.isFinite(remaining) || remaining <= 0) {
    console.error("Set a positive enforced spending cap on the key or workspace.");
    process.exitCode = 1;
  } else {
    console.log(`Enforced budget remaining: $${remaining.toFixed(4)}`);
  }

  if (!Array.isArray(catalog?.data)) throw new Error("The provider returned an unexpected model catalog.");
  for (const [role, id] of [["Planner", planner], ["Reviewer", reviewer]]) {
    const explicitFreeId = /^openrouter:([a-z0-9._-]+\/[a-z0-9._-]+:free)$/.exec(id)?.[1];
    const entry = catalog.data.find((model) => model.id === (freeDemo ? explicitFreeId : id));
    if (!entry) {
      console.error(`${role} ${id} is absent from the catalog. Check the model ID or routing alias.`);
      process.exitCode = 1;
      continue;
    }
    if (
      freeDemo &&
      (Number(entry.pricing?.prompt) !== 0 ||
        Number(entry.pricing?.completion) !== 0 ||
        Number(entry.pricing?.request ?? 0) !== 0)
    ) {
      console.error(`${role} ${id} has no confirmed zero price in the OpenRouter catalog.`);
      process.exitCode = 1;
      continue;
    }
    console.log(`${role} ${freeDemo ? "zero-priced upstream route" : "catalog entry"}: ${id}`);
    const parameters = entry.supported_parameters;
    if (Array.isArray(parameters) && !parameters.includes("response_format")) {
      console.error(`${role} does not advertise structured responses.`);
      process.exitCode = 1;
    }
    if (!freeDemo && role === "Reviewer" && Array.isArray(parameters) && !parameters.includes("tools")) {
      console.warn("Reviewer does not advertise tool use. Leave optional tool steps off.");
    }
  }
  console.log("No model calls were made. Verify live gateway routing with a short synthetic brief.");
}

try {
  await check();
} catch (error) {
  console.error(error instanceof Error ? error.message : "Otari preflight failed.");
  process.exitCode = 1;
}
