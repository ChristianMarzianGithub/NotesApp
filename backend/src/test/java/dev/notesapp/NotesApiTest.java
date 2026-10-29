package dev.notesapp;

import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.*;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.client.TestRestTemplate;
import org.springframework.http.*;
import org.springframework.test.context.ActiveProfiles;
import static org.assertj.core.api.Assertions.assertThat;

@ActiveProfiles("test")
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
class NotesApiTest {
    @Autowired TestRestTemplate http;
    @Autowired NoteRepository repository;
    String base = "/api/v1/notes";
    @BeforeEach void reset() { repository.deleteAll(); }

    Map<?, ?> create(String title, String body) {
        var response = http.postForEntity(base, Map.of("title", title, "body", body), Map.class);
        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.CREATED);
        assertThat(response.getHeaders().getLocation()).isNotNull();
        return response.getBody();
    }
    @Test void createsAndRetrievesPersistedNote() {
        var note = create("First", "line one\nline two");
        var id = UUID.fromString(note.get("id").toString());
        assertThat(repository.findById(id)).isPresent();
        assertThat(http.getForObject(base + "/" + id, Map.class)).containsEntry("body", "line one\nline two");
        assertThat(note.get("createdAt")).isNotNull();
        assertThat(note.get("updatedAt")).isNotNull();
        assertThat(note.get("version")).isEqualTo(0);
        assertThat(http.getForObject(base, Object[].class)).hasSize(1);
    }
    @Test void updatesAndRejectsStaleWrites() {
        var note = create("Old", "Draft");
        String url = base + "/" + note.get("id");
        var payload = Map.of("title", "New", "body", "Saved", "version", note.get("version"));
        var updated = http.exchange(url, HttpMethod.PUT, new HttpEntity<>(payload), Map.class);
        assertThat(updated.getStatusCode()).isEqualTo(HttpStatus.OK);
        assertThat(updated.getBody()).containsEntry("title", "New");
        assertThat(updated.getBody().get("version")).isNotEqualTo(note.get("version"));
        assertThat(http.exchange(url, HttpMethod.PUT, new HttpEntity<>(payload), Map.class).getStatusCode()).isEqualTo(HttpStatus.CONFLICT);
        assertThat(http.getForObject(url, Map.class)).containsEntry("body", "Saved");
    }
    @Test void concurrentUpdatesCannotSilentlyOverwriteEachOther() {
        var note = create("Concurrent", "Original");
        String url = base + "/" + note.get("id");
        var one = java.util.concurrent.CompletableFuture.supplyAsync(() -> http.exchange(url, HttpMethod.PUT,
                new HttpEntity<>(Map.of("title", "One", "body", "A", "version", 0)), Map.class).getStatusCode());
        var two = java.util.concurrent.CompletableFuture.supplyAsync(() -> http.exchange(url, HttpMethod.PUT,
                new HttpEntity<>(Map.of("title", "Two", "body", "B", "version", 0)), Map.class).getStatusCode());
        assertThat(java.util.List.of(one.join(), two.join()))
                .containsExactlyInAnyOrder(HttpStatus.OK, HttpStatus.CONFLICT);
        assertThat(http.getForObject(url, Map.class)).containsEntry("version", 1);
    }

    @Test void searchesTitleAndBodyCaseInsensitivelyAndLiterally() {
        create("Shopping", "Milk 100%_fresh");
        create("Work", "Meeting notes");
        assertThat(http.getForObject(base + "?q=SHOP", Object[].class)).hasSize(1);
        assertThat(http.getForObject(base + "?q=meeting", Object[].class)).hasSize(1);
        assertThat(http.getForObject(base + "?q=_", Object[].class)).hasSize(1);
        assertThat(http.getForObject(base + "?q=absent", Object[].class)).isEmpty();
    }
    @Test void deletesAndReportsMissingResource() {
        var note = create("Delete", "Me");
        String url = base + "/" + note.get("id");
        assertThat(http.exchange(url, HttpMethod.DELETE, HttpEntity.EMPTY, Void.class).getStatusCode()).isEqualTo(HttpStatus.NO_CONTENT);
        assertThat(http.getForEntity(url, Map.class).getStatusCode()).isEqualTo(HttpStatus.NOT_FOUND);
        assertThat(http.exchange(url, HttpMethod.DELETE, HttpEntity.EMPTY, Map.class).getStatusCode()).isEqualTo(HttpStatus.NOT_FOUND);
        assertThat(repository.count()).isZero();
    }
    @Test void validatesRequestsAndMalformedIdentifiers() {
        assertThat(http.postForEntity(base, Map.of("title", "x"), Map.class).getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
        assertThat(http.postForEntity(base, Map.of("title", "x".repeat(201), "body", ""), Map.class).getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
        assertThat(http.postForEntity(base, Map.of("title", "", "body", "x".repeat(200001)), Map.class).getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
        assertThat(http.getForEntity(base + "/invalid", Map.class).getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
        String missing = base + "/" + UUID.randomUUID();
        assertThat(http.exchange(missing, HttpMethod.PUT, new HttpEntity<>(Map.of("title", "", "body", "", "version", 0)), Map.class).getStatusCode()).isEqualTo(HttpStatus.NOT_FOUND);
        assertThat(http.exchange(missing, HttpMethod.PUT, new HttpEntity<>(Map.of("title", "", "body", "")), Map.class).getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
    }
}
