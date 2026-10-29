import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import { api, ApiError, type Note } from "./api";

export interface EditorHandle {
  save: () => Promise<boolean>;
}
interface Props {
  note: Note;
  onSaved: (note: Note) => void;
  onReload: () => void;
  locked?: boolean;
}
const sameText = (a: Note, b: Note) => a.title === b.title && a.body === b.body;

export const Editor = forwardRef<EditorHandle, Props>(function Editor(
  { note, onSaved, onReload, locked },
  ref,
) {
  const [draft, setDraft] = useState(note);
  const [status, setStatus] = useState("Saved");
  const [error, setError] = useState("");
  const [conflict, setConflict] = useState(false);
  const latest = useRef(note);
  const saved = useRef(note);
  const running = useRef<Promise<boolean> | null>(null);
  const mounted = useRef(true);
  const callback = useRef(onSaved);
  callback.current = onSaved;

  function change(field: "title" | "body", value: string) {
    latest.current = { ...latest.current, [field]: value };
    setDraft(latest.current);
    setStatus("Unsaved changes");
  }

  function save(): Promise<boolean> {
    if (running.current) return running.current;
    if (sameText(latest.current, saved.current)) return Promise.resolve(true);
    if (conflict) return Promise.resolve(false);
    const task = (async () => {
      setError("");
      try {
        while (!sameText(latest.current, saved.current)) {
          setStatus("Saving…");
          const snapshot = {
            ...latest.current,
            version: saved.current.version,
          };
          const result = await api.save(snapshot);
          saved.current = result;
          if (!mounted.current) return true;
          callback.current(result);
        }
        if (mounted.current) setStatus("Saved");
        return true;
      } catch (e) {
        if (mounted.current) {
          setError(e instanceof Error ? e.message : "Save failed. Try again.");
          setConflict(
            e instanceof ApiError && (e.status === 409 || e.status === 404),
          );
          setStatus("Not saved");
        }
        return false;
      } finally {
        running.current = null;
      }
    })();
    running.current = task;
    return task;
  }

  useImperativeHandle(ref, () => ({ save }));
  useEffect(() => {
    const timer = setTimeout(() => {
      void save();
    }, 600);
    return () => clearTimeout(timer);
  }, [draft.title, draft.body]); // Save snapshots are serialized; later edits are drained by the active request.
  useEffect(() => {
    mounted.current = true;
    const unload = (event: BeforeUnloadEvent) => {
      if (!sameText(latest.current, saved.current)) {
        event.preventDefault();
        event.returnValue = "";
      }
    };
    const keyboard = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") {
        event.preventDefault();
        void save();
      }
    };
    window.addEventListener("beforeunload", unload);
    window.addEventListener("keydown", keyboard);
    return () => {
      mounted.current = false;
      window.removeEventListener("beforeunload", unload);
      window.removeEventListener("keydown", keyboard);
    };
  }, [conflict]);

  return (
    <div className="editor-content">
      <div className="document-meta">
        <span>PLAIN TEXT</span>
        <span role="status" className={status === "Saved" ? "saved" : ""}>
          {status === "Saved" ? "● " : ""}
          {status}
        </span>
      </div>
      {error && (
        <div className="error" role="alert">
          {error}{" "}
          {conflict ? (
            <button
              onClick={() => {
                if (
                  window.confirm(
                    "Discard your unsaved edits and reload this note?",
                  )
                )
                  onReload();
              }}
            >
              Discard edits and reload
            </button>
          ) : (
            <button onClick={() => void save()}>Retry save</button>
          )}
        </div>
      )}
      <input
        className="title-input"
        disabled={locked}
        aria-label="Note title"
        placeholder="Untitled note"
        maxLength={200}
        value={draft.title}
        onChange={(e) => change("title", e.target.value)}
      />
      <div className="modified">
        Edited {new Date(saved.current.updatedAt).toLocaleString()}
      </div>
      <textarea
        disabled={locked}
        aria-label="Note body"
        placeholder="Start writing. Make room for a thought…"
        maxLength={200000}
        value={draft.body}
        onChange={(e) => change("body", e.target.value)}
        spellCheck
      />
      <footer>
        <span>
          {draft.body.trim() ? draft.body.trim().split(/\s+/u).length : 0} words
          · {draft.body.length.toLocaleString()} characters
        </span>
        <span>Plain text · UTF-8</span>
      </footer>
    </div>
  );
});
