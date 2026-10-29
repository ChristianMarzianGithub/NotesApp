package dev.notesapp;

import java.net.URI;
import java.net.http.*;
import java.time.Duration;

/** Container probe using only the JRE, with no shell HTTP utility dependency. */
public final class HealthCheck {
    private HealthCheck() {}
    public static void main(String[] args) {
        try (var client = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(2)).build()) {
            var request = HttpRequest.newBuilder(URI.create("http://127.0.0.1:8080/actuator/health"))
                    .timeout(Duration.ofSeconds(2)).GET().build();
            var response = client.send(request, HttpResponse.BodyHandlers.discarding());
            if (response.statusCode() != 200) System.exit(1);
        } catch (Exception ex) { System.exit(1); }
    }
}
