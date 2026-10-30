package dev.notesapp;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;

@SpringBootApplication
public class NotesApplication {
    public static void main(String[] args) {
        var application = new SpringApplication(NotesApplication.class);
        if (java.util.Arrays.asList(args).contains("--migrate-only")) {
            application.setWebApplicationType(org.springframework.boot.WebApplicationType.NONE);
            try (var context = application.run(args)) {
                // Flyway completes during initialization; close resources and exit successfully.
            }
        } else {
            application.run(args);
        }
    }
}
