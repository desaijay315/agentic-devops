package com.infraflow.healing.knowledge.node;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;
import org.springframework.data.neo4j.core.schema.GeneratedValue;
import org.springframework.data.neo4j.core.schema.Id;
import org.springframework.data.neo4j.core.schema.Node;

@Node("Fix")
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class FixNode {

    @Id
    @GeneratedValue
    private Long id;

    private String fixType;           // CODE_CHANGE, CONFIG_UPDATE, etc.
    private String explanation;       // Human-readable explanation
    private String fileChangesJson;   // Serialized List<FileChange>
    private Double initialConfidence; // Confidence from LLM when generated
    private String language;
    private String buildTool;
    private Long healingSessionId;    // Link back to the PostgreSQL session
    private String repoName;          // Which repo this was first found in
    private String createdAt;
}
