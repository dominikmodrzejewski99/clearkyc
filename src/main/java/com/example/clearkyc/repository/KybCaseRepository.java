package com.example.clearkyc.repository;

import com.example.clearkyc.domain.KybCase;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface KybCaseRepository extends JpaRepository<KybCase, UUID> {

    List<KybCase> findAllByAnalystIdentityOrderByCreatedAtDesc(String analystIdentity);

    Optional<KybCase> findByIdAndAnalystIdentity(UUID id, String analystIdentity);
}
