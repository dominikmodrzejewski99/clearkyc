package com.example.clearkyc.repository;

import com.example.clearkyc.domain.KybCase;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.UUID;

public interface KybCaseRepository extends JpaRepository<KybCase, UUID> {
}
