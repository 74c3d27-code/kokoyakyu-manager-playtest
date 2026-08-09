/// <reference lib="webworker" />
import { runBatchSimulation } from "../../../packages/baseball-engine/src/index.js";
import { HIGH_SCHOOL_RULES_2026 } from "../../../packages/baseball-engine/src/rules.js";
import { SCHOOL_PROFILES } from "../../../packages/highschool-data/src/index.js";
import { HIGH_SCHOOL_SEASON_SCHEDULE } from "../../../packages/highschool-calendar/src/index.js";
self.addEventListener("message", (event) => {
    if (event.data.type !== "run")
        return;
    try {
        const result = runBatchSimulation(SCHOOL_PROFILES, HIGH_SCHOOL_RULES_2026, HIGH_SCHOOL_SEASON_SCHEDULE, event.data.options, (completed, total) => {
            self.postMessage({ type: "progress", completed, total });
        });
        self.postMessage({ type: "result", result });
    }
    catch (error) {
        self.postMessage({
            type: "error",
            message: error instanceof Error ? error.message : String(error),
        });
    }
});
