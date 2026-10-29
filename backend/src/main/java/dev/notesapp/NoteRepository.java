package dev.notesapp;

import java.util.List;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

interface NoteRepository extends JpaRepository<Note, UUID> {
    @Query("select n from Note n where locate(lower(:q), lower(n.title)) > 0 or locate(lower(:q), lower(n.body)) > 0 order by n.updatedAt desc, n.id")
    List<Note> search(@Param("q") String query);
}
