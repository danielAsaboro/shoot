export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs" && process.env.ADRENA_API_KEY) {
    const { AdrenaWsConsumer } = await import("./lib/adrena/ws-consumer");
    const consumer = AdrenaWsConsumer.getInstance();
    consumer.start();
    console.log("[Instrumentation] Adrena WebSocket consumer started");

    // Validate hardcoded size multiplier table against live API
    validateSizeMultiplier().catch(() => {});
  }
}

async function validateSizeMultiplier() {
  try {
    const { calculateSizeMultiplier } = await import("./lib/adrena/client");
    const { computeMutagenSizeMultiplier } = await import(
      "./lib/competition/mutagen"
    );

    const result = await calculateSizeMultiplier(75_000);
    const local = computeMutagenSizeMultiplier(75_000);

    if (Math.abs(result.multiplier - local) > 0.001) {
      console.warn(
        `[Instrumentation] Size multiplier table may be outdated! ` +
          `API says $75K = ${result.multiplier}x, local says ${local}x`
      );
    } else {
      console.log("[Instrumentation] Size multiplier table validated (OK)");
    }
  } catch (err) {
    console.warn("[Instrumentation] Could not validate size multiplier:", err);
  }
}
