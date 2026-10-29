package dev.notesapp;

import jakarta.persistence.*;
import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "notes")
class Note {
    @Id UUID id;
    @Column(nullable = false, length = 200) String title;
    @Column(nullable = false, columnDefinition = "text") String body;
    @Column(nullable = false, updatable = false) Instant createdAt;
    @Column(nullable = false) Instant updatedAt;
    @Version Long version;

    protected Note() {}
    Note(String title, String body) {
        id = UUID.randomUUID();
        this.title = title;
        this.body = body;
        createdAt = updatedAt = Instant.now();
    }
}
