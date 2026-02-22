package com.infraflow.healing.knowledge.node;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;
import org.springframework.data.neo4j.core.schema.RelationshipId;
import org.springframework.data.neo4j.core.schema.RelationshipProperties;
import org.springframework.data.neo4j.core.schema.TargetNode;

@RelationshipProperties
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class FixRelationship {

    @RelationshipId
    private Long id;

    @TargetNode
    private FixNode fix;

    private Double confidence;       // 0.0 - 1.0, updated based on outcomes
    private Long appliedCount;       // Total times applied
    private Long successCount;       // Times pipeline passed after applying
    private Long failureCount;       // Times pipeline still failed
    private String lastAppliedAt;
}
