package dev.notesapp;

import jakarta.validation.Valid;
import jakarta.validation.constraints.*;
import java.net.URI;
import java.time.Instant;
import java.util.List;
import java.util.UUID;
import org.springframework.http.*;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

@RestController
@RequestMapping("/api/v1/notes")
class NoteController {
    private final NoteRepository notes;
    NoteController(NoteRepository notes) { this.notes = notes; }

    record CreateNote(@NotNull @Size(max = 200) String title,
                      @NotNull @Size(max = 200000) String body) {}
    record UpdateNote(@NotNull @Size(max = 200) String title,
                      @NotNull @Size(max = 200000) String body,
                      @NotNull @Min(0) Long version) {}
    record NoteDto(UUID id, String title, String body, Instant createdAt, Instant updatedAt, Long version) {
        static NoteDto from(Note n) { return new NoteDto(n.id, n.title, n.body, n.createdAt, n.updatedAt, n.version); }
    }

    private Note find(UUID id) {
        return notes.findById(id).orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Note not found"));
    }

    @GetMapping
    List<NoteDto> list(@RequestParam(defaultValue = "") String q) {
        if (q.length() > 200) throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Search must be at most 200 characters");
        return notes.search(q).stream().map(NoteDto::from).toList();
    }

    @GetMapping("/{id}")
    NoteDto get(@PathVariable UUID id) { return NoteDto.from(find(id)); }

    @PostMapping
    ResponseEntity<NoteDto> create(@Valid @RequestBody CreateNote input) {
        Note note = notes.saveAndFlush(new Note(input.title(), input.body()));
        return ResponseEntity.created(URI.create("/api/v1/notes/" + note.id)).body(NoteDto.from(note));
    }

    @PutMapping("/{id}")
    @Transactional
    NoteDto update(@PathVariable UUID id, @Valid @RequestBody UpdateNote input) {
        Note note = find(id);
        if (!note.version.equals(input.version()))
            throw new ResponseStatusException(HttpStatus.CONFLICT, "This note changed elsewhere. Reload before editing.");
        note.title = input.title();
        note.body = input.body();
        note.updatedAt = Instant.now();
        notes.flush();
        return NoteDto.from(note);
    }

    @DeleteMapping("/{id}")
    @Transactional
    ResponseEntity<Void> delete(@PathVariable UUID id) {
        notes.delete(find(id));
        notes.flush();
        return ResponseEntity.noContent().build();
    }
}
