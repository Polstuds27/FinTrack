// Shared sync protocol contract between web client and api server.
// Implementation lives in web/src/sync and api/apps/sync in later phases.

export type MutationOp = "create" | "update" | "delete";

export interface SyncMutation {
  client_mutation_id: string; // UUID, idempotency key
  entity: string;
  entity_id: string; // UUID
  op: MutationOp;
  base_version: number;
  client_timestamp: string; // ISO 8601
  payload: Record<string, unknown>;
}

export interface MutationResult {
  client_mutation_id: string;
  status: "accepted" | "conflict" | "rejected";
  server_version?: number;
  error?: { code: string; message: string };
}

export interface SyncPullResponse {
  server_seq: number;
  changes: Array<{
    entity: string;
    entity_id: string;
    version: number;
    op: MutationOp;
    payload: Record<string, unknown>;
  }>;
}
