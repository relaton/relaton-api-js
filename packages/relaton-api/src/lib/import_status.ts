// relaton-api-js#190: while a D1 import runs, every read on the database
// fails with this one error. Consumers (the MCP server, the site islands,
// contract CI) must be able to tell "back off for a minute" apart from
// "the service is down" — so the marker is classified in exactly one
// place and both the error path and /v3/status share it.
export const IMPORT_PROBLEM_TYPE = "https://api.relaton.org/problems/importing";
export const IMPORT_RETRY_AFTER_SECONDS = 60;

export function isImportError(message: string): boolean {
  return /long-running import|import is in progress/i.test(message ?? "");
}

export function importProblem() {
  return {
    type: IMPORT_PROBLEM_TYPE,
    title: "Dataset import in progress",
    status: 503,
    detail:
      "Reads are briefly unavailable while an ingest import runs into the dataset. Retry shortly.",
  };
}
