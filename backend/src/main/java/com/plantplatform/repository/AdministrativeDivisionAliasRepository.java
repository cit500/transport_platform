package com.plantplatform.repository;

import com.plantplatform.model.AdministrativeDivisionAlias;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

@Repository
public interface AdministrativeDivisionAliasRepository extends JpaRepository<AdministrativeDivisionAlias, Long> {

    Optional<AdministrativeDivisionAlias> findByAliasName(String aliasName);

    List<AdministrativeDivisionAlias> findByDivisionId(Long divisionId);

    boolean existsByAliasName(String aliasName);
}
