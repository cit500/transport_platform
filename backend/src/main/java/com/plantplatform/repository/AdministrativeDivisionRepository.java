package com.plantplatform.repository;

import com.plantplatform.model.AdministrativeDivision;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

@Repository
public interface AdministrativeDivisionRepository extends JpaRepository<AdministrativeDivision, Long> {

    Optional<AdministrativeDivision> findByDivisionKey(String divisionKey);

    Optional<AdministrativeDivision> findByCanonicalName(String canonicalName);

    Optional<AdministrativeDivision> findByDisplayName(String displayName);

    List<AdministrativeDivision> findByIsActiveTrue();

    boolean existsByDivisionKey(String divisionKey);

    boolean existsByCanonicalName(String canonicalName);
}
