package com.plantplatform.service;

import com.plantplatform.model.AdministrativeDivision;
import com.plantplatform.model.AdministrativeDivisionAlias;
import com.plantplatform.repository.AdministrativeDivisionAliasRepository;
import com.plantplatform.repository.AdministrativeDivisionRepository;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import java.util.List;
import java.util.Optional;

/**
 * 行政区划主数据服务
 *
 * 提供行政区的查询和名称解析能力。
 * 业务关联统一使用 division_id，不以 district_name 作为正式主键。
 */
@Service
public class AdministrativeDivisionService {

    @Autowired
    private AdministrativeDivisionRepository divisionRepository;

    @Autowired
    private AdministrativeDivisionAliasRepository aliasRepository;

    /**
     * 查询所有行政区（含非活跃区）
     */
    public List<AdministrativeDivision> findAll() {
        return divisionRepository.findAll();
    }

    /**
     * 查询所有活跃行政区
     */
    public List<AdministrativeDivision> findAllActive() {
        return divisionRepository.findByIsActiveTrue();
    }

    /**
     * 根据主键 ID 查询
     */
    public Optional<AdministrativeDivision> findById(Long id) {
        return divisionRepository.findById(id);
    }

    /**
     * 根据 division_key 查询
     */
    public Optional<AdministrativeDivision> findByDivisionKey(String divisionKey) {
        return divisionRepository.findByDivisionKey(divisionKey);
    }

    /**
     * 根据名称解析行政区
     *
     * 按优先级匹配：
     * 1. canonical_name（官方全称）
     * 2. display_name（显示简称）
     * 3. alias_name（别名表）
     *
     * @param name 任意名称（全称、简称、别名均可）
     * @return 匹配的行政区（Optional）
     */
    public Optional<AdministrativeDivision> resolveByName(String name) {
        if (name == null || name.isBlank()) {
            return Optional.empty();
        }

        String trimmed = name.trim();

        // 1. 尝试 canonical_name
        Optional<AdministrativeDivision> result = divisionRepository.findByCanonicalName(trimmed);
        if (result.isPresent()) return result;

        // 2. 尝试 display_name
        result = divisionRepository.findByDisplayName(trimmed);
        if (result.isPresent()) return result;

        // 3. 尝试 alias_name
        Optional<AdministrativeDivisionAlias> alias = aliasRepository.findByAliasName(trimmed);
        if (alias.isPresent()) {
            return divisionRepository.findById(alias.get().getDivisionId());
        }

        return Optional.empty();
    }

    /**
     * 查询行政区的所有别名
     */
    public List<AdministrativeDivisionAlias> findAliasesByDivisionId(Long divisionId) {
        return aliasRepository.findByDivisionId(divisionId);
    }

    /**
     * 查询所有别名
     */
    public List<AdministrativeDivisionAlias> findAllAliases() {
        return aliasRepository.findAll();
    }
}
