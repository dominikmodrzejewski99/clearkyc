package com.example.clearkyc.repository;

import com.example.clearkyc.domain.KybCase;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface KybCaseRepository extends JpaRepository<KybCase, UUID> {

    Optional<KybCase> findByIdAndAnalystIdentity(UUID id, String analystIdentity);

    @Query("""
            select c.id, c.status, c.createdAt, c.entityName, ar.decision
            from KybCase c left join AuditRecord ar on ar.kybCase = c
            where c.analystIdentity = :analystIdentity
            order by c.createdAt desc
            limit 20
            """)
    List<Object[]> findCaseSummaryRows(@Param("analystIdentity") String analystIdentity);
}
