package com.example.clearkyc.domain;

import jakarta.persistence.*;
import org.hibernate.annotations.CreationTimestamp;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "audit_record")
public class AuditRecord {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    @Column(updatable = false, nullable = false)
    private UUID id;

    @OneToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "case_id", nullable = false, unique = true)
    private KybCase kybCase;

    @Column(name = "analyst_identity", nullable = false)
    private String analystIdentity;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private DecisionType decision;

    @CreationTimestamp
    @Column(name = "finalized_at", updatable = false, nullable = false)
    private Instant finalizedAt;

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(nullable = false)
    private String payload;

    protected AuditRecord() {
    }

    public AuditRecord(KybCase kybCase, String analystIdentity, DecisionType decision, String payload) {
        this.kybCase = kybCase;
        this.analystIdentity = analystIdentity;
        this.decision = decision;
        this.payload = payload;
    }

    public UUID getId() { return id; }
    public KybCase getKybCase() { return kybCase; }
    public String getAnalystIdentity() { return analystIdentity; }
    public DecisionType getDecision() { return decision; }
    public Instant getFinalizedAt() { return finalizedAt; }
    public String getPayload() { return payload; }
}
