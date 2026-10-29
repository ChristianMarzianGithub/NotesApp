import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { vi, describe, it, expect, beforeEach } from "vitest";
import App from "./App";
import { api, ApiError, type Note } from "./api";
vi.mock("./api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./api")>();
  return {
    ...actual,
    api: {
      list: vi.fn(),
      get: vi.fn(),
      create: vi.fn(),
      save: vi.fn(),
      remove: vi.fn(),
    },
  };
});
const first: Note = {
  id: "a",
  title: "First thought",
  body: "An idea",
  version: 0,
  createdAt: "2026-10-29T10:00:00Z",
  updatedAt: "2026-10-29T10:00:00Z",
};
const second: Note = { ...first, id: "b", title: "Another thought" };
async function open() {
  render(<App />);
  await userEvent.click(
    await screen.findByRole("button", { name: /First thought/ }),
  );
  return screen.findByRole("textbox", { name: "Note body" });
}
beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(api.list).mockResolvedValue([first, second]);
  vi.mocked(api.get).mockImplementation(async (id) =>
    id === "a" ? first : second,
  );
  vi.mocked(api.create).mockResolvedValue({
    ...first,
    id: "new",
    title: "",
    body: "",
  });
  vi.mocked(api.save).mockImplementation(async (n) => ({
    ...n,
    version: n.version + 1,
  }));
  vi.mocked(api.remove).mockResolvedValue(undefined);
});
describe("Notes workspace", () => {
  it("creates and autosaves title and body", async () => {
    render(<App />);
    await userEvent.click(screen.getByRole("button", { name: /New note/ }));
    const title = await screen.findByRole("textbox", { name: "Note title" });
    fireEvent.change(title, { target: { value: "A new title" } });
    fireEvent.change(screen.getByRole("textbox", { name: "Note body" }), {
      target: { value: "A long thought" },
    });
    await waitFor(
      () =>
        expect(api.save).toHaveBeenCalledWith(
          expect.objectContaining({
            id: "new",
            title: "A new title",
            body: "A long thought",
          }),
        ),
      { timeout: 2000 },
    );
    expect(await screen.findByText("● Saved")).toBeInTheDocument();
  });
  it("searches on the server and shows an empty result", async () => {
    render(<App />);
    await screen.findByRole("button", { name: /First thought/ });
    vi.mocked(api.list).mockResolvedValue([]);
    await userEvent.type(
      screen.getByRole("textbox", { name: "Search notes" }),
      "missing",
    );
    expect(await screen.findByText("No matching notes.")).toBeInTheDocument();
    expect(api.list).toHaveBeenLastCalledWith(
      "missing",
      expect.any(AbortSignal),
    );
  });
  it("keeps edits when save fails, blocks navigation, and retries", async () => {
    const body = await open();
    vi.mocked(api.save).mockRejectedValue(new Error("Server unavailable"));
    fireEvent.change(body, { target: { value: "Keep this draft" } });
    await userEvent.click(
      screen.getByRole("button", { name: /Another thought/ }),
    );
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Server unavailable",
    );
    expect(body).toHaveValue("Keep this draft");
    vi.mocked(api.save).mockImplementation(async (n) => ({ ...n, version: 1 }));
    await userEvent.click(screen.getByRole("button", { name: "Retry save" }));
    expect(await screen.findByText("● Saved")).toBeInTheDocument();
  });
  it("serializes edits made during a save and uses the returned version", async () => {
    const body = await open();
    let finish!: (n: Note) => void;
    vi.mocked(api.save).mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    fireEvent.change(body, { target: { value: "First edit" } });
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    fireEvent.change(body, { target: { value: "Second edit" } });
    finish({ ...first, body: "First edit", version: 1 });
    await waitFor(() =>
      expect(api.save).toHaveBeenLastCalledWith(
        expect.objectContaining({ body: "Second edit", version: 1 }),
      ),
    );
    expect(await screen.findByText("● Saved")).toBeInTheDocument();
    expect(body).toHaveValue("Second edit");
  });
  it("preserves a conflicting draft until reload is confirmed", async () => {
    const body = await open();
    vi.mocked(api.save).mockRejectedValue(
      new ApiError("Changed elsewhere", 409),
    );
    fireEvent.change(body, { target: { value: "Local draft" } });
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Changed elsewhere",
    );
    vi.spyOn(window, "confirm").mockReturnValue(false);
    await userEvent.click(
      screen.getByRole("button", { name: "Discard edits and reload" }),
    );
    expect(body).toHaveValue("Local draft");
    vi.mocked(window.confirm).mockReturnValue(true);
    await userEvent.click(
      screen.getByRole("button", { name: "Discard edits and reload" }),
    );
    await waitFor(() =>
      expect(screen.getByRole("textbox", { name: "Note body" })).toHaveValue(
        "An idea",
      ),
    );
  });
  it("recovers when a conflicting note was deleted elsewhere", async () => {
    const body = await open();
    vi.mocked(api.save).mockRejectedValue(new ApiError("Note not found", 404));
    fireEvent.change(body, { target: { value: "Deleted-note draft" } });
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    await screen.findByRole("alert");
    vi.mocked(api.get).mockRejectedValue(new ApiError("Note not found", 404));
    vi.spyOn(window, "confirm").mockReturnValue(true);
    await userEvent.click(screen.getByRole("button", { name: "Discard edits and reload" }));
    expect(await screen.findByRole("heading", { name: /Good ideas/ })).toBeInTheDocument();
  });

  it("requires confirmation before deleting", async () => {
    await open();
    vi.spyOn(window, "confirm").mockReturnValue(false);
    await userEvent.click(screen.getByRole("button", { name: "Delete note" }));
    expect(api.remove).not.toHaveBeenCalled();
    vi.mocked(window.confirm).mockReturnValue(true);
    await userEvent.click(screen.getByRole("button", { name: "Delete note" }));
    await waitFor(() => expect(api.remove).toHaveBeenCalledWith("a"));
    expect(
      await screen.findByRole("heading", { name: /Good ideas/ }),
    ).toBeInTheDocument();
  });
  it("saves via keyboard shortcut", async () => {
    const body = await open();
    fireEvent.change(body, { target: { value: "Keyboard draft" } });
    fireEvent.keyDown(window, { key: "s", ctrlKey: true });
    await waitFor(() =>
      expect(api.save).toHaveBeenCalledWith(
        expect.objectContaining({ body: "Keyboard draft" }),
      ),
    );
  });
});
