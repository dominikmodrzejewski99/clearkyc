package com.example.clearkyc.domain;

import jakarta.persistence.*;
import org.hibernate.annotations.CreationTimestamp;
import org.hibernate.annotations.UpdateTimestamp;

import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "kyb_case")
public class KybCase {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    @Column(updatable = false, nullable = false)
    private UUID id;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private CaseStatus status;

    @CreationTimestamp
    @Column(name = "created_at", updatable = false, nullable = false)
    private Instant createdAt;

    @UpdateTimestamp
    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;

    @Column(name = "locked_at")
    private Instant lockedAt;

    @Column(name = "entity_name")
    private String entityName;

    @Column(name = "pdf_data")
    private byte[] pdfData;

    @Column(name = "analyst_identity", nullable = false)
    private String analystIdentity;

    @org.hibernate.annotations.JdbcTypeCode(org.hibernate.type.SqlTypes.JSON)
    @Column(name = "extraction_data")
    private String extractionData;

    protected KybCase() {
    }

    public KybCase(CaseStatus status, String entityName, String analystIdentity) {
        this.status = status;
        this.entityName = entityName;
        this.analystIdentity = analystIdentity;
    }

    public UUID getId() { return id; }
    public CaseStatus getStatus() { return status; }
    public void setStatus(CaseStatus status) { this.status = status; }
    public Instant getCreatedAt() { return createdAt; }
    public Instant getUpdatedAt() { return updatedAt; }
    public Instant getLockedAt() { return lockedAt; }
    public void setLockedAt(Instant lockedAt) { this.lockedAt = lockedAt; }
    public String getEntityName() { return entityName; }
    public void setEntityName(String entityName) { this.entityName = entityName; }
    public byte[] getPdfData() { return pdfData; }
    public void setPdfData(byte[] pdfData) { this.pdfData = pdfData; }
    public String getAnalystIdentity() { return analystIdentity; }
    public String getExtractionData() { return extractionData; }
    public void setExtractionData(String extractionData) { this.extractionData = extractionData; }
}
