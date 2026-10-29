import { useEffect, useRef, useState } from "react";
import { api, ApiError, type Note } from "./api";
import { Editor, type EditorHandle } from "./Editor";
import "./styles.css";

export default function App() {
  const [notes, setNotes] = useState<Note[]>([]);
  const [selected, setSelected] = useState<Note | null>(null);
  const [query, setQuery] = useState("");
  const [revision, setRevision] = useState(0);
  const [generation, setGeneration] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const transitioning = useRef(false);
  const editor = useRef<EditorHandle>(null);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    const timer = setTimeout(() => {
      api
        .list(query, controller.signal)
        .then((result) => {
          if (!controller.signal.aborted) {
            setNotes(result);
            setError("");
          }
        })
        .catch((e) => {
          if (!controller.signal.aborted) setError(e.message);
        })
        .finally(() => {
          if (!controller.signal.aborted) setLoading(false);
        });
    }, 150);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query, revision]);

  async function act(action: () => Promise<void>, save = true) {
    if (transitioning.current) return;
    transitioning.current = true;
    setBusy(true);
    setError("");
    try {
      if (!save || !editor.current || (await editor.current.save()))
        await action();
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Something went wrong. Try again.",
      );
    } finally {
      transitioning.current = false;
      setBusy(false);
    }
  }
  function open(note: Note) {
    if (note.id !== selected?.id)
      void act(async () => {
        setSelected(await api.get(note.id));
      });
  }
  function create() {
    void act(async () => {
      const note = await api.create();
      setQuery("");
      setSelected(note);
      setRevision((n) => n + 1);
    });
  }
  function remove() {
    if (
      !selected ||
      !window.confirm(
        `Delete “${selected.title || "Untitled note"}”? This cannot be undone.`,
      )
    )
      return;
    const id = selected.id;
    void act(async () => {
      await api.remove(id);
      setSelected(null);
      setRevision((n) => n + 1);
    });
  }
  function reload() {
    void act(async () => {
      if (!selected) return;
      try {
        setSelected(await api.get(selected.id));
        setGeneration((n) => n + 1);
      } catch (e) {
        if (e instanceof ApiError && e.status === 404) setSelected(null);
        else throw e;
      }
      setRevision((n) => n + 1);
    }, false);
  }

  return (
    <div className={"workspace " + (selected ? "has-selection" : "")}>
      <aside aria-label="Notes sidebar">
        <header className="brand">
          <span className="brand-icon">
            N<span>·</span>
          </span>
          <div>
            NotesApp<small>A LITTLE SPACE TO THINK</small>
          </div>
        </header>
        <button className="new-note" onClick={create} disabled={busy}>
          <span>＋</span> New note <kbd>✎</kbd>
        </button>
        <label className="search">
          <span aria-hidden="true">⌕</span>
          <input
            aria-label="Search notes"
            placeholder="Search your notes…"
            maxLength={200}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </label>
        <div className="list-heading">
          <span>{query ? "SEARCH RESULTS" : "YOUR NOTES"}</span>
          <span>{notes.length}</span>
        </div>
        <nav aria-label="Notes list" aria-busy={loading}>
          {loading && (
            <p className="list-message" role="status">
              Loading notes…
            </p>
          )}
          {!loading && notes.length === 0 && (
            <p className="list-message">
              {query
                ? "No matching notes."
                : "Your next idea starts here. Create your first note."}
            </p>
          )}
          {notes.map((note) => (
            <button
              key={note.id}
              className={
                "note-card " + (selected?.id === note.id ? "selected" : "")
              }
              aria-current={selected?.id === note.id ? "page" : undefined}
              onClick={() => open(note)}
              disabled={busy}
            >
              <strong>{note.title || "Untitled note"}</strong>
              <p>{note.body || "Nothing written yet"}</p>
              <time dateTime={note.updatedAt}>
                {new Date(note.updatedAt).toLocaleDateString(undefined, {
                  month: "short",
                  day: "numeric",
                })}
              </time>
            </button>
          ))}
        </nav>
        <div className="sidebar-footer">
          <span className="local-dot" /> Your personal workspace{" "}
          <small>Stored on your local server</small>
        </div>
      </aside>
      <main>
        <div className="toolbar">
          <button
            className="back"
            onClick={() =>
              void act(async () => {
                setSelected(null);
              })
            }
            disabled={busy}
          >
            ← All notes
          </button>
          <span className="breadcrumb">
            Workspace <span>/</span> {selected ? "Note" : "Welcome"}
          </span>
          <div className="toolbar-actions">
            {selected && (
              <>
                <button
                  onClick={() => void editor.current?.save()}
                  disabled={busy}
                  title="Save (Ctrl or Command + S)"
                >
                  Save
                </button>
                <button className="delete" onClick={remove} disabled={busy}>
                  Delete note
                </button>
              </>
            )}
          </div>
        </div>
        {error && (
          <div className="global-error error" role="alert">
            {error}{" "}
            <button onClick={() => setRevision((n) => n + 1)}>
              Retry list
            </button>
          </div>
        )}
        {selected ? (
          <Editor
            locked={busy}
            ref={editor}
            key={selected.id + ":" + generation}
            note={selected}
            onSaved={(note) => {
              setSelected(note);
              setRevision((n) => n + 1);
            }}
            onReload={reload}
          />
        ) : (
          <div className="welcome">
            <div className="paper-icon">✎</div>
            <p className="eyebrow">A CLEAR PAGE, A FRESH START</p>
            <h1>
              Good ideas need
              <br />a place to land.
            </h1>
            <p>
              Capture a thought, make a list, or just start writing.
              <br />
              Your notes will be right here when you need them.
            </p>
            <button onClick={create} disabled={busy}>
              ＋ Create a note
            </button>
            <small>Simple by design. Yours to fill.</small>
          </div>
        )}
      </main>
    </div>
  );
}
