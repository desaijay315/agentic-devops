package com.infraflow.healing.knowledge.node;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;
import org.springframework.data.neo4j.core.schema.GeneratedValue;
import org.springframework.data.neo4j.core.schema.Id;
import org.springframework.data.neo4j.core.schema.Node;
import org.springframework.data.neo4j.core.schema.Relationship;

import java.util.ArrayList;
import java.util.List;

@Node("FailurePattern")
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class FailurePatternNode {

    @Id
    @GeneratedValue
    private Long id;

    private String failureType;      // BUILD_COMPILE, TEST_FAILURE, etc.
    private String language;         // Java, Python, Go
    private String buildTool;        // Maven, Gradle, npm
    private String errorSignature;   // MD5 hash of normalized error message
    private String sampleError;      // First 500 chars of the error
    private Long hitCount;           // How many times this pattern was seen
    private String createdAt;        // ISO string
    private String updatedAt;

    @Relationship(type = "HAS_FIX", direction = Relationship.Direction.OUTGOING)
    @Builder.Default
    private List<FixRelationship> fixes = new ArrayList<>();
}
