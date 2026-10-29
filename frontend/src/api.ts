export interface Note {
  id: string;
  title: string;
  body: string;
  createdAt: string;
  updatedAt: string;
  version: number;
}
export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}
async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch("/api/v1/notes" + path, init);
  } catch {
    throw new Error(
      "Cannot reach the server. Your edits are still here. Try again.",
    );
  }
  if (!response.ok) {
    const problem = await response.json().catch(() => ({}));
    throw new ApiError(
      problem.detail || `Request failed (${response.status}). Try again.`,
      response.status,
    );
  }
  return response.status === 204 ? (undefined as T) : response.json();
}
const json = (method: string, body: unknown): RequestInit => ({
  method,
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
});
export const api = {
  list: (query = "", signal?: AbortSignal) =>
    request<Note[]>("?q=" + encodeURIComponent(query), { signal }),
  get: (id: string) => request<Note>("/" + id),
  create: () => request<Note>("", json("POST", { title: "", body: "" })),
  save: (note: Note) =>
    request<Note>(
      "/" + note.id,
      json("PUT", {
        title: note.title,
        body: note.body,
        version: note.version,
      }),
    ),
  remove: (id: string) => request<void>("/" + id, { method: "DELETE" }),
};
