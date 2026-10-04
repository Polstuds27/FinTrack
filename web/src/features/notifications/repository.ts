/**
 * Notification cache.
 *
 * Notifications are a REST-only resource (they are not part of the sync
 * protocol), so they are fetched when online and written into IndexedDB for
 * offline reading. Every mutation updates the local row first, then the
 * server — the page stays responsive with no connection.
 */
import { apiFetch, ApiError } from "../../api/client";
import { db } from "../../db";
import type { LocalNotification } from "../../db/types";

interface NotificationPayload {
  id: string;
  kind: string;
  title: string;
  body: string;
  level: "info" | "warning" | "critical";
  is_read: boolean;
  created_at: string;
}

interface ListResponse {
  count?: number;
  next?: string | null;
  results?: NotificationPayload[];
}

function normalise(raw: NotificationPayload): LocalNotification {
  return {
    id: String(raw.id),
    kind: raw.kind,
    title: raw.title,
    body: raw.body,
    level: raw.level,
    is_read: Boolean(raw.is_read),
    created_at: raw.created_at,
  };
}

/** Pull the latest page from the server and merge it into the local cache. */
export async function refreshNotifications(): Promise<LocalNotification[]> {
  const data = await apiFetch<ListResponse | NotificationPayload[]>("/notifications/");
  const rows = Array.isArray(data) ? data : (data.results ?? []);
  const cached = await db.notifications.toArray();
  const merged = new Map(cached.map((row) => [row.id, row]));
  for (const row of rows) merged.set(String(row.id), normalise(row));
  const list = [...merged.values()].sort((a, b) => b.created_at.localeCompare(a.created_at));
  await db.notifications.bulkPut(list);
  return list;
}

/** Mark one as read locally, then confirm with the server when it answers. */
export async function markRead(id: string): Promise<void> {
  await db.notifications.update(id, { is_read: true });
  try {
    const payload = await apiFetch<NotificationPayload>(`/notifications/${id}/read/`, {
      method: "POST",
      body: JSON.stringify({}),
    });
    await db.notifications.put(normalise(payload));
  } catch (error) {
    // Offline or expired session: the local flag still drives the UI, and the
    // server will be told on the next successful attempt.
    if (!(error instanceof ApiError)) return;
    if (error.status === 401 || error.status === 404) {
      if (error.status === 404) await db.notifications.delete(id);
    }
  }
}

/** Mark everything as read; no-op locally if there is nothing to clear. */
export async function markAllRead(): Promise<void> {
  const rows = (await db.notifications.toArray()).filter((row) => !row.is_read);
  if (rows.length > 0) {
    await db.notifications.bulkPut(rows.map((row) => ({ ...row, is_read: true })));
  }
  try {
    await apiFetch("/notifications/read-all/", { method: "POST", body: JSON.stringify({}) });
  } catch {
    /* local state already reflects the intent */
  }
}

export async function clearNotifications(): Promise<void> {
  await db.notifications.clear();
}
