CREATE TABLE kyb_case (
    id          UUID                     PRIMARY KEY,
    status      TEXT                     NOT NULL
                    CHECK (status IN ('CREATED', 'ANALYZING', 'ANALYZED', 'LOCKED')),
    created_at  TIMESTAMP WITH TIME ZONE NOT NULL,
    updated_at  TIMESTAMP WITH TIME ZONE NOT NULL,
    locked_at   TIMESTAMP WITH TIME ZONE
);

CREATE TABLE audit_record (
    id               UUID                     PRIMARY KEY,
    case_id          UUID                     NOT NULL UNIQUE
                         REFERENCES kyb_case(id),
    analyst_identity TEXT                     NOT NULL,
    decision         TEXT                     NOT NULL
                         CHECK (decision IN ('APPROVE', 'REJECT', 'ESCALATE')),
    finalized_at     TIMESTAMP WITH TIME ZONE NOT NULL,
    payload          JSONB                    NOT NULL
);
