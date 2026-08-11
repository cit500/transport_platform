package com.plantplatform.service;

import com.plantplatform.dto.AssetByRoadEdgesDTO;
import com.plantplatform.dto.AssetCreateDTO;
import com.plantplatform.dto.AssetDetailDTO;
import com.plantplatform.dto.AssetListDTO;
import com.plantplatform.dto.AssetSummaryDTO;
import com.plantplatform.dto.CandidateDetailDTO;
import com.plantplatform.dto.CandidateListDTO;
import com.plantplatform.model.*;
import com.plantplatform.repository.*;
import org.locationtech.jts.geom.GeometryFactory;
import org.locationtech.jts.geom.Coordinate;
import org.locationtech.jts.geom.Point;
import org.locationtech.jts.geom.PrecisionModel;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.LocalDateTime;
import java.util.*;
import java.util.concurrent.atomic.AtomicLong;
import java.util.stream.Collectors;
import java.util.HashMap;
import java.util.Map;

/**
 * 资产管理服务
 * 负责交通资产(桥梁/隧道)的查询、统计、详情获取
 */
@Service
public class AssetService {

    private static final Logger log = LoggerFactory.getLogger(AssetService.class);

    @Autowired
    private TransportAssetRepository assetRepository;

    @Autowired
    private BridgeAttributesRepository bridgeAttrRepository;

    @Autowired
    private TunnelAttributesRepository tunnelAttrRepository;

    @Autowired
    private AssetCurrentStatusRepository statusRepository;

    @Autowired
    private AssetRoadRelationRepository roadRelationRepository;

    @Autowired
    private AssetCandidateRepository candidateRepository;

    @Autowired
    private AssetCandidateEdgeRepository candidateEdgeRepository;

    @Autowired
    private AdministrativeDivisionRepository divisionRepository;

    @Autowired
    private RoadEdgeRepository roadEdgeRepository;

    /**
     * 分页查询资产列表
     */
    public Page<AssetListDTO> searchAssets(String assetType, Long divisionId, String keyword,
                                            String sourceType, String bindingStatus, Pageable pageable) {
        // 先查询资产主表
        Page<TransportAsset> assetPage = assetRepository.searchAssets(
                assetType, divisionId, keyword, sourceType, bindingStatus, pageable);

        // 批量查询关联的行政区名称
        Set<Long> divisionIds = new HashSet<>();
        Map<Long, String> divisionNameMap = new HashMap<>();
        for (TransportAsset asset : assetPage.getContent()) {
            if (asset.getDivision() != null) {
                divisionIds.add(asset.getDivision().getId());
            }
        }
        if (!divisionIds.isEmpty()) {
            List<AdministrativeDivision> divisions = divisionRepository.findAllById(divisionIds);
            for (AdministrativeDivision d : divisions) {
                divisionNameMap.put(d.getId(), d.getDisplayName());
            }
        }

        // 批量查询状态
        List<Long> assetIds = assetPage.getContent().stream()
                .map(TransportAsset::getId)
                .collect(Collectors.toList());
        Map<Long, AssetCurrentStatus> statusMap = new HashMap<>();
        if (!assetIds.isEmpty()) {
            List<AssetCurrentStatus> statuses = statusRepository.findAllById(assetIds);
            for (AssetCurrentStatus s : statuses) {
                statusMap.put(s.getAssetId(), s);
            }
        }

        // 批量查询桥梁属性（获取 structureType）
        Map<Long, String> bridgeTypeMap = new HashMap<>();
        if (!assetIds.isEmpty()) {
            List<BridgeAttributes> bridgeAttrs = bridgeAttrRepository.findAllById(assetIds);
            for (BridgeAttributes b : bridgeAttrs) {
                bridgeTypeMap.put(b.getAssetId(), b.getStructureType());
            }
        }

        // 转换为 DTO
        List<AssetListDTO> dtoList = assetPage.getContent().stream().map(asset -> {
            AssetListDTO dto = new AssetListDTO();
            dto.setId(asset.getId());
            dto.setAssetCode(asset.getAssetCode());
            dto.setAssetName(asset.getAssetName());
            dto.setAssetType(asset.getAssetType());
            dto.setDivisionId(asset.getDivision() != null ? asset.getDivision().getId() : null);
            dto.setDivisionName(divisionNameMap.get(asset.getDivision() != null ? asset.getDivision().getId() : null));
            dto.setStructureType(bridgeTypeMap.get(asset.getId()));
            dto.setNetworkBindingStatus(asset.getNetworkBindingStatus());
            dto.setSourceType(asset.getSourceType());

            AssetCurrentStatus status = statusMap.get(asset.getId());
            if (status != null) {
                dto.setHealthScore(status.getHealthScore());
                dto.setRiskLevel(status.getRiskLevel());
                dto.setPassStatus(status.getPassStatus());
            }

            return dto;
        }).collect(Collectors.toList());

        return new PageImpl<>(dtoList, assetPage.getPageable(), assetPage.getTotalElements());
    }

    /**
     * 获取资产详情
     */
    @Transactional(readOnly = true)
    public AssetDetailDTO getAssetDetail(Long id) {
        Optional<TransportAsset> assetOpt = assetRepository.findById(id);
        if (assetOpt.isEmpty()) {
            return null;
        }

        TransportAsset asset = assetOpt.get();
        AssetDetailDTO dto = new AssetDetailDTO();

        // 基本信息
        dto.setId(asset.getId());
        dto.setAssetCode(asset.getAssetCode());
        dto.setAssetName(asset.getAssetName());
        dto.setAssetType(asset.getAssetType());
        dto.setDivisionId(asset.getDivision() != null ? asset.getDivision().getId() : null);
        dto.setDivisionName(asset.getDivision() != null ? asset.getDivision().getDisplayName() : null);
        dto.setLongitude(asset.getLongitude());
        dto.setLatitude(asset.getLatitude());
        dto.setNetworkBindingStatus(asset.getNetworkBindingStatus());
        dto.setSourceType(asset.getSourceType());
        dto.setSourceRef(asset.getSourceRef());
        dto.setIsActive(asset.getIsActive());
        dto.setCreatedAt(asset.getCreatedAt());
        dto.setUpdatedAt(asset.getUpdatedAt());
        
        // HOME-2: 图片路径
        dto.setImagePath(asset.getImagePath());

        // 桥梁/隧道属性
        if ("BRIDGE".equals(asset.getAssetType())) {
            bridgeAttrRepository.findByAssetId(id).ifPresent(attr -> {
                AssetDetailDTO.BridgeAttributesDTO bridgeDto = new AssetDetailDTO.BridgeAttributesDTO();
                bridgeDto.setStructureType(attr.getStructureType());
                bridgeDto.setTotalLengthM(attr.getTotalLengthM());
                bridgeDto.setMaxSpanM(attr.getMaxSpanM());
                bridgeDto.setSpanConfiguration(attr.getSpanConfiguration());
                bridgeDto.setDesignLoad(attr.getDesignLoad());
                bridgeDto.setDesignLoadT(attr.getDesignLoadT());
                bridgeDto.setDeckWidthM(attr.getDeckWidthM());
                bridgeDto.setDesignClearanceHeightM(attr.getDesignClearanceHeightM());
                bridgeDto.setDesignClearanceWidthM(attr.getDesignClearanceWidthM());
                bridgeDto.setConstructionYear(attr.getConstructionYear());
                dto.setBridgeAttributes(bridgeDto);
            });
        } else if ("TUNNEL".equals(asset.getAssetType())) {
            tunnelAttrRepository.findByAssetId(id).ifPresent(attr -> {
                AssetDetailDTO.TunnelAttributesDTO tunnelDto = new AssetDetailDTO.TunnelAttributesDTO();
                tunnelDto.setTunnelType(attr.getTunnelType());
                tunnelDto.setTunnelLengthM(attr.getTunnelLengthM());
                tunnelDto.setDesignClearanceHeightM(attr.getDesignClearanceHeightM());
                tunnelDto.setDesignClearanceWidthM(attr.getDesignClearanceWidthM());
                tunnelDto.setLaneCount(attr.getLaneCount());
                tunnelDto.setConstructionYear(attr.getConstructionYear());
                dto.setTunnelAttributes(tunnelDto);
            });
        }

        // 当前状态
        statusRepository.findByAssetId(id).ifPresent(status -> {
            AssetDetailDTO.CurrentStatusDTO statusDto = new AssetDetailDTO.CurrentStatusDTO();
            statusDto.setHealthScore(status.getHealthScore());
            statusDto.setRiskLevel(status.getRiskLevel());
            statusDto.setPassStatus(status.getPassStatus());
            statusDto.setCurrentLoadLimitT(status.getCurrentLoadLimitT());
            statusDto.setCurrentHeightLimitM(status.getCurrentHeightLimitM());
            statusDto.setCurrentWidthLimitM(status.getCurrentWidthLimitM());
            statusDto.setSourceType(status.getSourceType());
            statusDto.setSourceTaskId(status.getSourceTaskId());
            statusDto.setUpdatedAt(status.getUpdatedAt());
            dto.setCurrentStatus(statusDto);
        });

        // 道路关联
        List<AssetRoadRelation> relations = roadRelationRepository.findByAssetIdOrderBySequenceNo(id);
        List<AssetDetailDTO.RoadRelationDTO> relationDtos = relations.stream().map(r -> {
            AssetDetailDTO.RoadRelationDTO relDto = new AssetDetailDTO.RoadRelationDTO();
            relDto.setId(r.getId());
            relDto.setRoadEdgeId(r.getRoadEdge() != null ? r.getRoadEdge().getId() : null);
            relDto.setEdgeName(r.getRoadEdge() != null ? r.getRoadEdge().getName() : null);
            relDto.setEdgeRef(r.getRoadEdge() != null ? r.getRoadEdge().getRef() : null);
            relDto.setRelationType(r.getRelationType());
            relDto.setSequenceNo(r.getSequenceNo());
            return relDto;
        }).collect(Collectors.toList());
        dto.setRoadRelations(relationDtos);

        return dto;
    }

    /**
     * 获取资产统计摘要
     */
    public AssetSummaryDTO getSummary() {
        AssetSummaryDTO summary = new AssetSummaryDTO();

        // 总资产数
        long total = assetRepository.count();
        summary.setTotalAssets(total);

        // 按类型统计
        List<Object[]> typeStats = assetRepository.countByAssetType();
        long bridgeCount = 0;
        long tunnelCount = 0;
        for (Object[] row : typeStats) {
            String type = (String) row[0];
            Long count = (Long) row[1];
            if ("BRIDGE".equals(type)) {
                bridgeCount = count;
            } else if ("TUNNEL".equals(type)) {
                tunnelCount = count;
            }
        }
        summary.setBridgeCount(bridgeCount);
        summary.setTunnelCount(tunnelCount);

        // 按绑定状态统计
        List<Object[]> bindingStats = assetRepository.countByBindingStatus();
        Map<String, Long> byBindingStatus = new HashMap<>();
        for (Object[] row : bindingStats) {
            byBindingStatus.put((String) row[0], (Long) row[1]);
        }
        summary.setByBindingStatus(byBindingStatus);

        // 按来源类型统计
        List<Object[]> sourceStats = assetRepository.countBySourceType();
        Map<String, Long> bySourceType = new HashMap<>();
        for (Object[] row : sourceStats) {
            bySourceType.put((String) row[0], (Long) row[1]);
        }
        summary.setBySourceType(bySourceType);

        // 未绑定资产数
        summary.setUnboundCount(assetRepository.countUnboundAssets());

        // 待审核候选数
        summary.setPendingCandidateCount(candidateRepository.countPendingCandidates());

        // V1.4E: 统计高风险、受限、禁止通行、缺少Geometry的资产数量
        List<TransportAsset> allAssets = assetRepository.findByIsActiveTrue();
        long highRiskCount = 0;
        long restrictedCount = 0;
        long blockedCount = 0;
        long missingGeometryCount = 0;

        // 批量查询状态
        List<Long> assetIds = allAssets.stream()
                .map(TransportAsset::getId)
                .collect(Collectors.toList());
        Map<Long, AssetCurrentStatus> statusMap = new HashMap<>();
        if (!assetIds.isEmpty()) {
            List<AssetCurrentStatus> statuses = statusRepository.findAllById(assetIds);
            for (AssetCurrentStatus s : statuses) {
                statusMap.put(s.getAssetId(), s);
            }
        }

        for (TransportAsset asset : allAssets) {
            // 缺少Geometry
            if (asset.getGeom() == null || asset.getLongitude() == null || asset.getLatitude() == null) {
                missingGeometryCount++;
            }

            // 状态统计
            AssetCurrentStatus status = statusMap.get(asset.getId());
            if (status != null) {
                if ("HIGH".equals(status.getRiskLevel()) || "EXTREME".equals(status.getRiskLevel())) {
                    highRiskCount++;
                }
                if ("RESTRICTED".equals(status.getPassStatus())) {
                    restrictedCount++;
                }
                if ("BLOCKED".equals(status.getPassStatus())) {
                    blockedCount++;
                }
            }
        }

        summary.setHighRiskCount(highRiskCount);
        summary.setRestrictedCount(restrictedCount);
        summary.setBlockedCount(blockedCount);
        summary.setMissingGeometryCount(missingGeometryCount);

        // HOME-2: 按资产类型+状态统计
        long bridgeNormal = 0, bridgeRestricted = 0, bridgeBlocked = 0, bridgeUnknown = 0;
        long tunnelNormal = 0, tunnelRestricted = 0, tunnelBlocked = 0, tunnelUnknown = 0;

        for (TransportAsset asset : allAssets) {
            AssetCurrentStatus status = statusMap.get(asset.getId());
            String passStatus = status != null ? status.getPassStatus() : "UNKNOWN";
            boolean isBridge = "BRIDGE".equals(asset.getAssetType());

            if ("NORMAL".equals(passStatus)) {
                if (isBridge) bridgeNormal++; else tunnelNormal++;
            } else if ("RESTRICTED".equals(passStatus)) {
                if (isBridge) bridgeRestricted++; else tunnelRestricted++;
            } else if ("BLOCKED".equals(passStatus)) {
                if (isBridge) bridgeBlocked++; else tunnelBlocked++;
            } else {
                if (isBridge) bridgeUnknown++; else tunnelUnknown++;
            }
        }

        summary.setBridgeNormalCount(bridgeNormal);
        summary.setBridgeRestrictedCount(bridgeRestricted);
        summary.setBridgeBlockedCount(bridgeBlocked);
        summary.setBridgeUnknownCount(bridgeUnknown);
        summary.setTunnelNormalCount(tunnelNormal);
        summary.setTunnelRestrictedCount(tunnelRestricted);
        summary.setTunnelBlockedCount(tunnelBlocked);
        summary.setTunnelUnknownCount(tunnelUnknown);

        return summary;
    }

    /**
     * 分页查询候选列表
     */
    public Page<CandidateListDTO> searchCandidates(String status, String candidateType, Pageable pageable) {
        Page<AssetCandidate> candidatePage = candidateRepository.findByReviewStatusWithDivision(
                status, candidateType, pageable);

        List<CandidateListDTO> dtoList = candidatePage.getContent().stream().map(c -> {
            CandidateListDTO dto = new CandidateListDTO();
            dto.setId(c.getId());
            dto.setCandidateType(c.getCandidateType());
            dto.setCandidateName(c.getCandidateName());
            dto.setDivisionId(c.getDivision() != null ? c.getDivision().getId() : null);
            dto.setDivisionName(c.getDivision() != null ? c.getDivision().getDisplayName() : null);
            dto.setRoadName(c.getRoadName());
            dto.setRoadRef(c.getRoadRef());
            dto.setEdgeCount(c.getEdgeCount());
            dto.setTotalEdgeLengthM(c.getTotalEdgeLengthM());
            dto.setConfidence(c.getConfidence());
            dto.setReviewStatus(c.getReviewStatus());
            dto.setSourceRule(c.getSourceRule());
            dto.setCreatedAssetId(c.getCreatedAssetId());
            dto.setCreatedAt(c.getCreatedAt());
            dto.setReviewedAt(c.getReviewedAt());
            return dto;
        }).collect(Collectors.toList());

        return new PageImpl<>(dtoList, candidatePage.getPageable(), candidatePage.getTotalElements());
    }

    /**
     * 获取待审核候选统计
     */
    public Map<String, Long> getCandidateStats() {
        Map<String, Long> stats = new HashMap<>();
        stats.put("totalPending", candidateRepository.countPendingCandidates());

        List<Object[]> byType = candidateRepository.countPendingByType();
        for (Object[] row : byType) {
            stats.put("pending" + row[0], (Long) row[1]);
        }

        return stats;
    }

    // ============================================================
    // V1.4C: 创建/更新/道路绑定
    // ============================================================

    private static final GeometryFactory geometryFactory = new GeometryFactory(new PrecisionModel(), 4326);
    private static final AtomicLong assetCodeCounter = new AtomicLong(1);

    /**
     * 生成唯一资产编码
     */
    private String generateAssetCode(String assetType) {
        String prefix = "BRIDGE".equals(assetType) ? "BR" : "TN";
        long counter = assetCodeCounter.incrementAndGet();
        return String.format("%s-CQ-%04d", prefix, counter);
    }

    /**
     * V1.4F: 标准化资产名称（trim + 合并多余空格）
     */
    private String normalizeAssetName(String name) {
        if (name == null) return null;
        return name.trim().replaceAll("\\s+", " ");
    }

    /**
     * V1.4F: 根据同类型同名查找已有资产
     * @return 已存在的活跃资产或已停用资产
     */
    public Map<String, Object> checkDuplicateAsset(String assetType, String assetName) {
        String normalizedName = normalizeAssetName(assetName);
        if (normalizedName == null || normalizedName.isEmpty()) {
            return null;
        }

        Map<String, Object> result = new HashMap<>();
        
        // 查找活跃的同名资产
        Optional<TransportAsset> existing = assetRepository.findByAssetTypeAndAssetName(assetType, normalizedName);
        if (existing.isPresent()) {
            result.put("exists", true);
            result.put("isActive", existing.get().getIsActive());
            result.put("id", existing.get().getId());
            result.put("assetCode", existing.get().getAssetCode());
            return result;
        }

        result.put("exists", false);
        return result;
    }

    /**
     * 创建正式资产 (事务)
     */
    @Transactional
    public AssetDetailDTO createAsset(AssetCreateDTO request) {
        // V1.4F: 标准化名称
        String normalizedName = normalizeAssetName(request.getAssetName());
        request.setAssetName(normalizedName);

        // V1.4F: 检查同名资产
        Map<String, Object> duplicateCheck = checkDuplicateAsset(request.getAssetType(), normalizedName);
        if (duplicateCheck != null && (Boolean) duplicateCheck.get("exists")) {
            Boolean isActive = (Boolean) duplicateCheck.get("isActive");
            if (isActive) {
                throw new RuntimeException("该资产已存在（资产编号: " + duplicateCheck.get("assetCode") + "），请编辑已有记录");
            } else {
                throw new RuntimeException("该资产档案已存在但处于停用状态（资产编号: " + duplicateCheck.get("assetCode") + "），请恢复后编辑");
            }
        }

        // 1. 生成唯一编码
        String assetCode = generateAssetCode(request.getAssetType());

        // 2. 创建主记录
        TransportAsset asset = new TransportAsset();
        asset.setAssetCode(assetCode);
        asset.setAssetType(request.getAssetType());
        asset.setAssetName(request.getAssetName());
        asset.setSourceType("MANUAL");
        asset.setIsActive(true);
        asset.setCreatedAt(LocalDateTime.now());
        asset.setUpdatedAt(LocalDateTime.now());
        asset.setNetworkBindingStatus("UNBOUND");

        // 设置行政区
        if (request.getDivisionId() != null) {
            divisionRepository.findById(request.getDivisionId()).ifPresent(asset::setDivision);
        }

        // 设置坐标
        if (request.getLongitude() != null && request.getLatitude() != null) {
            asset.setLongitude(request.getLongitude());
            asset.setLatitude(request.getLatitude());
            Point point = geometryFactory.createPoint(new Coordinate(request.getLatitude(), request.getLongitude()));
            asset.setGeom(point);
        }

        asset = assetRepository.save(asset);
        Long assetId = asset.getId();

        // 3. 保存属性
        if ("BRIDGE".equals(request.getAssetType()) && request.getBridgeAttributes() != null) {
            BridgeAttributes attr = new BridgeAttributes();
            attr.setAssetId(assetId);
            attr.setAsset(asset);
            copyBridgeAttributes(request.getBridgeAttributes(), attr);
            bridgeAttrRepository.save(attr);
        } else if ("TUNNEL".equals(request.getAssetType()) && request.getTunnelAttributes() != null) {
            TunnelAttributes attr = new TunnelAttributes();
            attr.setAssetId(assetId);
            attr.setAsset(asset);
            copyTunnelAttributes(request.getTunnelAttributes(), attr);
            tunnelAttrRepository.save(attr);
        }

        // 4. 保存当前状态
        if (request.getCurrentStatus() != null) {
            AssetCurrentStatus status = new AssetCurrentStatus();
            status.setAssetId(assetId);
            status.setAsset(asset);
            copyCurrentStatus(request.getCurrentStatus(), status);
            status.setSourceType("MANUAL");
            status.setUpdatedAt(LocalDateTime.now());
            statusRepository.save(status);
        }

        // 5. 绑定道路
        if (request.getEdgeIds() != null && !request.getEdgeIds().isEmpty()) {
            bindRoadEdges(asset, request.getEdgeIds());
        }

        // 6. 同步绑定状态
        syncBindingStatus(assetId);

        return getAssetDetail(assetId);
    }

    /**
     * 更新正式资产 (事务)
     */
    @Transactional
    public AssetDetailDTO updateAsset(Long id, AssetCreateDTO request) {
        Optional<TransportAsset> assetOpt = assetRepository.findById(id);
        if (assetOpt.isEmpty()) {
            return null;
        }

        TransportAsset asset = assetOpt.get();

        // 更新基本信息
        asset.setAssetName(request.getAssetName());
        asset.setUpdatedAt(LocalDateTime.now());

        if (request.getDivisionId() != null) {
            divisionRepository.findById(request.getDivisionId()).ifPresent(asset::setDivision);
        } else {
            asset.setDivision(null);
        }

        if (request.getLongitude() != null && request.getLatitude() != null) {
            asset.setLongitude(request.getLongitude());
            asset.setLatitude(request.getLatitude());
            Point point = geometryFactory.createPoint(new Coordinate(request.getLatitude(), request.getLongitude()));
            asset.setGeom(point);
        }

        asset = assetRepository.save(asset);
        Long assetId = asset.getId();

        // 更新属性
        if ("BRIDGE".equals(asset.getAssetType()) && request.getBridgeAttributes() != null) {
            BridgeAttributes attr = bridgeAttrRepository.findByAssetId(assetId)
                    .orElse(new BridgeAttributes());
            attr.setAssetId(assetId);
            attr.setAsset(asset);
            copyBridgeAttributes(request.getBridgeAttributes(), attr);
            bridgeAttrRepository.save(attr);
        } else if ("TUNNEL".equals(asset.getAssetType()) && request.getTunnelAttributes() != null) {
            TunnelAttributes attr = tunnelAttrRepository.findByAssetId(assetId)
                    .orElse(new TunnelAttributes());
            attr.setAssetId(assetId);
            attr.setAsset(asset);
            copyTunnelAttributes(request.getTunnelAttributes(), attr);
            tunnelAttrRepository.save(attr);
        }

        // 更新当前状态
        if (request.getCurrentStatus() != null) {
            AssetCurrentStatus status = statusRepository.findByAssetId(assetId)
                    .orElse(new AssetCurrentStatus());
            status.setAssetId(assetId);
            status.setAsset(asset);
            copyCurrentStatus(request.getCurrentStatus(), status);
            status.setSourceType("MANUAL");
            status.setUpdatedAt(LocalDateTime.now());
            statusRepository.save(status);
        }

        // 更新道路绑定
        if (request.getEdgeIds() != null) {
            // 删除旧绑定
            roadRelationRepository.deleteByAssetId(assetId);
            // 创建新绑定
            if (!request.getEdgeIds().isEmpty()) {
                bindRoadEdges(asset, request.getEdgeIds());
            }
        }

        // 同步绑定状态
        syncBindingStatus(assetId);

        return getAssetDetail(assetId);
    }

    /**
     * 更新道路绑定
     */
    @Transactional
    public AssetDetailDTO updateRoadEdges(Long assetId, List<Long> edgeIds) {
        Optional<TransportAsset> assetOpt = assetRepository.findById(assetId);
        if (assetOpt.isEmpty()) {
            return null;
        }

        TransportAsset asset = assetOpt.get();

        // 删除旧绑定
        roadRelationRepository.deleteByAssetId(assetId);

        // 创建新绑定
        if (edgeIds != null && !edgeIds.isEmpty()) {
            bindRoadEdges(asset, edgeIds);
        }

        // 同步绑定状态
        syncBindingStatus(assetId);

        return getAssetDetail(assetId);
    }

    /**
     * 绑定道路边
     */
    private void bindRoadEdges(TransportAsset asset, List<Long> edgeIds) {
        for (int i = 0; i < edgeIds.size(); i++) {
            Long edgeId = edgeIds.get(i);
            RoadEdge edge = roadEdgeRepository.findById(edgeId).orElse(null);
            if (edge != null) {
                AssetRoadRelation relation = new AssetRoadRelation();
                relation.setAsset(asset);
                relation.setRoadEdge(edge);
                relation.setRelationType("PRIMARY");
                relation.setSequenceNo(i + 1);
                relation.setCreatedAt(LocalDateTime.now());
                roadRelationRepository.save(relation);
            }
        }
    }

    /**
     * 同步绑定状态
     */
    private void syncBindingStatus(Long assetId) {
        long relationCount = roadRelationRepository.countByAssetId(assetId);
        String newStatus = relationCount > 0 ? "BOUND" : "UNBOUND";

        assetRepository.findById(assetId).ifPresent(asset -> {
            if (!newStatus.equals(asset.getNetworkBindingStatus())) {
                asset.setNetworkBindingStatus(newStatus);
                asset.setUpdatedAt(LocalDateTime.now());
                assetRepository.save(asset);
            }
        });
    }

    /**
     * 复制桥梁属性
     */
    private void copyBridgeAttributes(AssetCreateDTO.BridgeAttributesDTO src, BridgeAttributes dest) {
        dest.setStructureType(src.getStructureType());
        dest.setTotalLengthM(src.getTotalLengthM());
        dest.setMaxSpanM(src.getMaxSpanM());
        dest.setSpanConfiguration(src.getSpanConfiguration());
        dest.setDesignLoad(src.getDesignLoad());
        dest.setDesignLoadT(src.getDesignLoadT());
        dest.setDeckWidthM(src.getDeckWidthM());
        dest.setDesignClearanceHeightM(src.getDesignClearanceHeightM());
        dest.setDesignClearanceWidthM(src.getDesignClearanceWidthM());
        dest.setConstructionYear(src.getConstructionYear());
    }

    /**
     * 复制隧道属性
     */
    private void copyTunnelAttributes(AssetCreateDTO.TunnelAttributesDTO src, TunnelAttributes dest) {
        dest.setTunnelType(src.getTunnelType());
        dest.setTunnelLengthM(src.getTunnelLengthM());
        dest.setDesignClearanceHeightM(src.getDesignClearanceHeightM());
        dest.setDesignClearanceWidthM(src.getDesignClearanceWidthM());
        dest.setLaneCount(src.getLaneCount());
        dest.setConstructionYear(src.getConstructionYear());
    }

    /**
     * 复制当前状态
     */
    private void copyCurrentStatus(AssetCreateDTO.CurrentStatusDTO src, AssetCurrentStatus dest) {
        dest.setHealthScore(src.getHealthScore());
        dest.setRiskLevel(src.getRiskLevel());
        dest.setPassStatus(src.getPassStatus());
        dest.setCurrentLoadLimitT(src.getCurrentLoadLimitT());
        dest.setCurrentHeightLimitM(src.getCurrentHeightLimitM());
        dest.setCurrentWidthLimitM(src.getCurrentWidthLimitM());
    }

    // ============================================================
    // V1.4E: Asset GeoJSON API
    // ============================================================

    /**
     * 获取正式资产 GeoJSON FeatureCollection
     * GET /api/assets/geojson
     * 
     * 只返回有 Geometry 的 active 正式 Asset
     * coordinates: [longitude, latitude]
     */
    @Transactional(readOnly = true)
    public Map<String, Object> getAssetsGeoJson() {
        Map<String, Object> geoJson = new HashMap<>();
        geoJson.put("type", "FeatureCollection");

        List<TransportAsset> assets = assetRepository.findByIsActiveTrue();

        // 批量查询状态
        List<Long> assetIds = assets.stream()
                .map(TransportAsset::getId)
                .collect(Collectors.toList());
        Map<Long, AssetCurrentStatus> statusMap = new HashMap<>();
        if (!assetIds.isEmpty()) {
            List<AssetCurrentStatus> statuses = statusRepository.findAllById(assetIds);
            for (AssetCurrentStatus s : statuses) {
                statusMap.put(s.getAssetId(), s);
            }
        }

        // 批量查询行政区名称
        Set<Long> divisionIds = new HashSet<>();
        Map<Long, String> divisionNameMap = new HashMap<>();
        for (TransportAsset asset : assets) {
            if (asset.getDivision() != null) {
                divisionIds.add(asset.getDivision().getId());
            }
        }
        if (!divisionIds.isEmpty()) {
            List<AdministrativeDivision> divisions = divisionRepository.findAllById(divisionIds);
            for (AdministrativeDivision d : divisions) {
                divisionNameMap.put(d.getId(), d.getDisplayName());
            }
        }

        List<Map<String, Object>> features = new ArrayList<>();
        for (TransportAsset asset : assets) {
            // 只返回有 Geometry 的资产
            if (asset.getGeom() == null || asset.getLongitude() == null || asset.getLatitude() == null) {
                continue;
            }

            Map<String, Object> feature = new HashMap<>();
            feature.put("type", "Feature");

            // Geometry: Point [longitude, latitude]
            Map<String, Object> geometry = new HashMap<>();
            geometry.put("type", "Point");
            geometry.put("coordinates", new Double[]{asset.getLongitude(), asset.getLatitude()});
            feature.put("geometry", geometry);

            // Properties
            Map<String, Object> properties = new HashMap<>();
            properties.put("assetId", asset.getId());
            properties.put("assetCode", asset.getAssetCode());
            properties.put("assetName", asset.getAssetName());
            properties.put("assetType", asset.getAssetType());
            properties.put("divisionId", asset.getDivision() != null ? asset.getDivision().getId() : null);
            properties.put("divisionName", divisionNameMap.get(asset.getDivision() != null ? asset.getDivision().getId() : null));
            properties.put("networkBindingStatus", asset.getNetworkBindingStatus());
            properties.put("sourceType", asset.getSourceType());

            // 从 statusMap 获取状态信息
            AssetCurrentStatus status = statusMap.get(asset.getId());
            if (status != null) {
                properties.put("healthScore", status.getHealthScore());
                properties.put("riskLevel", status.getRiskLevel());
                properties.put("passStatus", status.getPassStatus());
            }

            feature.put("properties", properties);
            features.add(feature);
        }

        geoJson.put("features", features);
        return geoJson;
    }

    // ============================================================
    // HOME-2: 更新资产图片路径
    // ============================================================

    /**
     * 更新资产图片路径
     * @param assetId 资产ID
     * @param imagePath 图片相对路径
     */
    @Transactional
    public void updateImagePath(Long assetId, String imagePath) {
        Optional<TransportAsset> optional = assetRepository.findById(assetId);
        if (optional.isPresent()) {
            TransportAsset asset = optional.get();
            asset.setImagePath(imagePath);
            asset.setUpdatedAt(LocalDateTime.now());
            assetRepository.save(asset);
            log.info("Asset {} image path updated to {}", assetId, imagePath);
        } else {
            throw new RuntimeException("Asset not found: " + assetId);
        }
    }

    // ============================================================
    // V1.4D: 候选提取 (Topology First)
    // ============================================================

    /**
     * 提取候选结果
     */
    public static class ExtractResult {
        private String candidateType;
        private long sourceEdgeCount;
        private long generatedCount;
        private long skippedExistingCount;
        private long pendingCount;

        public ExtractResult(String candidateType) {
            this.candidateType = candidateType;
        }

        public String getCandidateType() { return candidateType; }
        public long getSourceEdgeCount() { return sourceEdgeCount; }
        public void setSourceEdgeCount(long v) { this.sourceEdgeCount = v; }
        public long getGeneratedCount() { return generatedCount; }
        public void setGeneratedCount(long v) { this.generatedCount = v; }
        public long getSkippedExistingCount() { return skippedExistingCount; }
        public void setSkippedExistingCount(long v) { this.skippedExistingCount = v; }
        public long getPendingCount() { return pendingCount; }
        public void setPendingCount(long v) { this.pendingCount = v; }
    }

    /**
     * 拓扑提取候选
     * POST /api/assets/candidates/extract
     */
    @Transactional
    public ExtractResult extractCandidates(String candidateType, Long divisionId, String roadRef) {
        ExtractResult result = new ExtractResult(candidateType);

        // 1. 加载目标 Road Edge
        List<RoadEdge> edges;
        if ("BRIDGE".equals(candidateType)) {
            edges = roadEdgeRepository.findByIsBridgeTrue();
        } else {
            edges = roadEdgeRepository.findByIsTunnelTrue();
        }

        // 可选: 按 divisionId / roadRef 过滤
        if (divisionId != null) {
            edges = edges.stream()
                .filter(e -> e.getDivision() != null && divisionId.equals(e.getDivision().getId()))
                .collect(Collectors.toList());
        }
        if (roadRef != null && !roadRef.isEmpty()) {
            edges = edges.stream()
                .filter(e -> roadRef.equals(e.getRef()))
                .collect(Collectors.toList());
        }

        result.setSourceEdgeCount(edges.size());

        if (edges.isEmpty()) {
            result.setPendingCount(candidateRepository.countPendingCandidates());
            return result;
        }

        // 2. 构建无向拓扑图 (source_u_osmid <-> source_v_osmid)
        // key: osmid, value: set of connected osmid
        Map<Long, Set<Long>> adjacency = new HashMap<>();
        // edgeId -> RoadEdge
        Map<Long, RoadEdge> edgeMap = new HashMap<>();

        for (RoadEdge edge : edges) {
            edgeMap.put(edge.getId(), edge);
            Long u = edge.getSourceUOsmid();
            Long v = edge.getSourceVOsmid();

            adjacency.computeIfAbsent(u, k -> new HashSet<>()).add(v);
            adjacency.computeIfAbsent(v, k -> new HashSet<>()).add(u);
        }

        // 3. 寻找 Connected Components (BFS)
        Set<Long> visited = new HashSet<>();
        List<List<RoadEdge>> components = new ArrayList<>();

        for (RoadEdge edge : edges) {
            Long startU = edge.getSourceUOsmid();
            if (visited.contains(startU)) continue;

            // BFS
            List<RoadEdge> component = new ArrayList<>();
            Queue<Long> queue = new LinkedList<>();
            Set<Long> componentNodes = new HashSet<>();

            queue.add(startU);
            componentNodes.add(startU);
            visited.add(startU);

            while (!queue.isEmpty()) {
                Long current = queue.poll();
                Set<Long> neighbors = adjacency.getOrDefault(current, Collections.emptySet());
                for (Long neighbor : neighbors) {
                    if (!visited.contains(neighbor)) {
                        visited.add(neighbor);
                        componentNodes.add(neighbor);
                        queue.add(neighbor);
                    }
                }
            }

            // 收集该 Component 的所有 Edge
            for (RoadEdge e : edges) {
                if (componentNodes.contains(e.getSourceUOsmid()) || componentNodes.contains(e.getSourceVOsmid())) {
                    component.add(e);
                }
            }

            if (!component.isEmpty()) {
                components.add(component);
            }
        }

        // 4. 为每个 Component 生成 Candidate
        for (List<RoadEdge> component : components) {
            // 生成 candidateKey: TYPE:<hash of sorted edgeIds>
            List<Long> edgeIds = component.stream()
                .map(RoadEdge::getId)
                .sorted()
                .collect(Collectors.toList());
            String candidateKey = generateCandidateKey(candidateType, edgeIds);

            // 幂等检查
            if (candidateRepository.existsByCandidateKey(candidateKey)) {
                result.setSkippedExistingCount(result.getSkippedExistingCount() + 1);
                continue;
            }

            // 创建 Candidate
            AssetCandidate candidate = new AssetCandidate();
            candidate.setCandidateType(candidateType);
            candidate.setCandidateKey(candidateKey);
            candidate.setSourceRule("TOPOLOGY_V1");
            candidate.setReviewStatus("PENDING");
            candidate.setEdgeCount(component.size());

            // 计算总长度
            BigDecimal totalLength = component.stream()
                .map(e -> BigDecimal.valueOf(e.getLengthM() != null ? e.getLengthM() : 0))
                .reduce(BigDecimal.ZERO, BigDecimal::add);
            candidate.setTotalEdgeLengthM(totalLength);

            // 确定行政区: 所有 Edge 同一 division → 该 division, 否则 NULL
            Set<Long> divisionIds = component.stream()
                .filter(e -> e.getDivision() != null)
                .map(e -> e.getDivision().getId())
                .collect(Collectors.toSet());
            if (divisionIds.size() == 1) {
                Long divId = divisionIds.iterator().next();
                divisionRepository.findById(divId).ifPresent(candidate::setDivision);
            }

            // 确定名称和道路信息
            determineCandidateName(candidate, component);

            // 计算 confidence
            candidate.setConfidence(calculateConfidence(component));

            candidate = candidateRepository.save(candidate);

            // 保存 Edge 关联 (保留全部 directed edges)
            int seq = 1;
            for (RoadEdge edge : component) {
                AssetCandidateEdge ce = new AssetCandidateEdge();
                ce.setCandidate(candidate);
                ce.setRoadEdge(edge);
                ce.setSequenceNo(seq++);
                candidateEdgeRepository.save(ce);
            }

            result.setGeneratedCount(result.getGeneratedCount() + 1);
        }

        result.setPendingCount(candidateRepository.countPendingCandidates());
        return result;
    }

    /**
     * 生成候选唯一键
     */
    private String generateCandidateKey(String candidateType, List<Long> edgeIds) {
        String raw = candidateType + ":" + edgeIds.stream()
            .map(String::valueOf)
            .collect(Collectors.joining(","));
        try {
            MessageDigest md = MessageDigest.getInstance("SHA-256");
            byte[] hash = md.digest(raw.getBytes(StandardCharsets.UTF_8));
            StringBuilder sb = new StringBuilder();
            for (int i = 0; i < Math.min(hash.length, 16); i++) {
                sb.append(String.format("%02x", hash[i]));
            }
            return candidateType.substring(0, Math.min(6, candidateType.length())) + ":" + sb.toString();
        } catch (Exception e) {
            return candidateType + ":" + edgeIds.hashCode();
        }
    }

    /**
     * 确定候选名称
     */
    private void determineCandidateName(AssetCandidate candidate, List<RoadEdge> edges) {
        // 查找包含设施名称的 Edge
        String facilityName = null;
        String roadName = null;
        String roadRef = null;

        for (RoadEdge edge : edges) {
            String name = edge.getName();
            if (name != null) {
                if (name.contains("桥") || name.contains("隧道") || name.contains("高架")) {
                    facilityName = name;
                }
                if (roadName == null) roadName = name;
            }
            if (roadRef == null && edge.getRef() != null) {
                roadRef = edge.getRef();
            }
        }

        candidate.setRoadName(roadName);
        candidate.setRoadRef(roadRef);

        if (facilityName != null) {
            candidate.setCandidateName(facilityName);
        } else {
            String prefix = roadRef != null ? roadRef : (roadName != null ? roadName : "未知道路");
            String typeLabel = "BRIDGE".equals(candidate.getCandidateType()) ? "桥梁候选" : "隧道候选";
            candidate.setCandidateName(prefix + " " + typeLabel);
        }
    }

    /**
     * 计算置信度 (简单三级规则)
     */
    private BigDecimal calculateConfidence(List<RoadEdge> edges) {
        double score = 0.5; // 基础分

        // 有明确设施名称 +0.2
        boolean hasFacilityName = edges.stream().anyMatch(e -> {
            String name = e.getName();
            return name != null && (name.contains("桥") || name.contains("隧道") || name.contains("高架"));
        });
        if (hasFacilityName) score += 0.2;

        // Edge 数量适中 (2-50) +0.1
        if (edges.size() >= 2 && edges.size() <= 50) score += 0.1;

        // name/ref 一致性 +0.1
        Set<String> names = edges.stream()
            .map(RoadEdge::getName)
            .filter(Objects::nonNull)
            .collect(Collectors.toSet());
        if (names.size() <= 2) score += 0.1;

        return BigDecimal.valueOf(Math.min(1.0, score));
    }

    /**
     * 获取候选详情
     */
    @Transactional(readOnly = true)
    public CandidateDetailDTO getCandidateDetail(Long id) {
        Optional<AssetCandidate> candidateOpt = candidateRepository.findById(id);
        if (candidateOpt.isEmpty()) {
            return null;
        }

        AssetCandidate c = candidateOpt.get();
        CandidateDetailDTO dto = new CandidateDetailDTO();
        dto.setId(c.getId());
        dto.setCandidateType(c.getCandidateType());
        dto.setCandidateName(c.getCandidateName());
        dto.setDivisionId(c.getDivision() != null ? c.getDivision().getId() : null);
        dto.setDivisionName(c.getDivision() != null ? c.getDivision().getDisplayName() : null);
        dto.setRoadName(c.getRoadName());
        dto.setRoadRef(c.getRoadRef());
        dto.setEdgeCount(c.getEdgeCount());
        dto.setTotalEdgeLengthM(c.getTotalEdgeLengthM());
        dto.setConfidence(c.getConfidence());
        dto.setReviewStatus(c.getReviewStatus());
        dto.setSourceRule(c.getSourceRule());
        dto.setCandidateKey(c.getCandidateKey());
        dto.setCreatedAssetId(c.getCreatedAssetId());
        dto.setCreatedAt(c.getCreatedAt());
        dto.setReviewedAt(c.getReviewedAt());

        // 加载 Edge 列表
        List<AssetCandidateEdge> candidateEdges = candidateEdgeRepository.findByCandidateIdOrderBySequenceNo(id);
        List<CandidateDetailDTO.CandidateEdgeDTO> edgeDtos = candidateEdges.stream().map(ce -> {
            RoadEdge edge = ce.getRoadEdge();
            CandidateDetailDTO.CandidateEdgeDTO edgeDto = new CandidateDetailDTO.CandidateEdgeDTO();
            edgeDto.setEdgeId(edge.getId());
            edgeDto.setName(edge.getName());
            edgeDto.setRef(edge.getRef());
            edgeDto.setLengthM(edge.getLengthM());
            edgeDto.setSourceUOsmid(edge.getSourceUOsmid());
            edgeDto.setSourceVOsmid(edge.getSourceVOsmid());
            edgeDto.setEdgeKey(edge.getEdgeKey());
            edgeDto.setDivisionId(edge.getDivision() != null ? edge.getDivision().getId() : null);
            edgeDto.setDivisionName(edge.getDivision() != null ? edge.getDivision().getDisplayName() : null);
            edgeDto.setSequenceNo(ce.getSequenceNo());
            return edgeDto;
        }).collect(Collectors.toList());
        dto.setEdges(edgeDtos);

        return dto;
    }

    /**
     * 确认候选 → 创建正式 Asset
     */
    @Transactional
    public AssetDetailDTO confirmCandidate(Long candidateId, AssetCreateDTO request) {
        Optional<AssetCandidate> candidateOpt = candidateRepository.findById(candidateId);
        if (candidateOpt.isEmpty()) {
            throw new RuntimeException("候选不存在: " + candidateId);
        }

        AssetCandidate candidate = candidateOpt.get();
        if (!"PENDING".equals(candidate.getReviewStatus())) {
            throw new RuntimeException("候选状态不是 PENDING，无法确认");
        }

        // 1. 创建正式 Asset
        String assetCode = generateAssetCode(candidate.getCandidateType());

        TransportAsset asset = new TransportAsset();
        asset.setAssetCode(assetCode);
        asset.setAssetType(candidate.getCandidateType());
        asset.setAssetName(request.getAssetName() != null ? request.getAssetName() : candidate.getCandidateName());
        asset.setSourceType("ROAD_CANDIDATE");
        asset.setSourceRef(candidate.getCandidateKey());
        asset.setIsActive(true);
        asset.setCreatedAt(LocalDateTime.now());
        asset.setUpdatedAt(LocalDateTime.now());
        asset.setNetworkBindingStatus("UNBOUND");

        // 行政区
        if (request.getDivisionId() != null) {
            divisionRepository.findById(request.getDivisionId()).ifPresent(asset::setDivision);
        } else if (candidate.getDivision() != null) {
            asset.setDivision(candidate.getDivision());
        }

        // 坐标
        if (request.getLongitude() != null && request.getLatitude() != null) {
            asset.setLongitude(request.getLongitude());
            asset.setLatitude(request.getLatitude());
            Point point = geometryFactory.createPoint(new Coordinate(request.getLatitude(), request.getLongitude()));
            asset.setGeom(point);
        }

        asset = assetRepository.save(asset);
        Long assetId = asset.getId();

        // 2. 保存属性
        if ("BRIDGE".equals(candidate.getCandidateType()) && request.getBridgeAttributes() != null) {
            BridgeAttributes attr = new BridgeAttributes();
            attr.setAssetId(assetId);
            attr.setAsset(asset);
            copyBridgeAttributes(request.getBridgeAttributes(), attr);
            bridgeAttrRepository.save(attr);
        } else if ("TUNNEL".equals(candidate.getCandidateType()) && request.getTunnelAttributes() != null) {
            TunnelAttributes attr = new TunnelAttributes();
            attr.setAssetId(assetId);
            attr.setAsset(asset);
            copyTunnelAttributes(request.getTunnelAttributes(), attr);
            tunnelAttrRepository.save(attr);
        }

        // 3. 保存当前状态
        if (request.getCurrentStatus() != null) {
            AssetCurrentStatus status = new AssetCurrentStatus();
            status.setAssetId(assetId);
            status.setAsset(asset);
            copyCurrentStatus(request.getCurrentStatus(), status);
            status.setSourceType("ROAD_CANDIDATE");
            status.setUpdatedAt(LocalDateTime.now());
            statusRepository.save(status);
        }

        // 4. 复制 Candidate Edge → asset_road_relations
        List<AssetCandidateEdge> candidateEdges = candidateEdgeRepository.findByCandidateIdOrderBySequenceNo(candidateId);
        for (AssetCandidateEdge ce : candidateEdges) {
            RoadEdge edge = ce.getRoadEdge();
            AssetRoadRelation relation = new AssetRoadRelation();
            relation.setAsset(asset);
            relation.setRoadEdge(edge);
            relation.setRelationType("PRIMARY");
            relation.setSequenceNo(ce.getSequenceNo());
            relation.setCreatedAt(LocalDateTime.now());
            roadRelationRepository.save(relation);
        }

        // 5. 同步绑定状态
        syncBindingStatus(assetId);

        // 6. 更新 Candidate 状态
        candidate.setReviewStatus("CONFIRMED");
        candidate.setCreatedAssetId(assetId);
        candidate.setReviewedAt(LocalDateTime.now());
        candidateRepository.save(candidate);

        return getAssetDetail(assetId);
    }

    /**
     * 忽略候选
     */
    @Transactional
    public void ignoreCandidate(Long candidateId) {
        Optional<AssetCandidate> candidateOpt = candidateRepository.findById(candidateId);
        if (candidateOpt.isEmpty()) {
            throw new RuntimeException("候选不存在: " + candidateId);
        }

        AssetCandidate candidate = candidateOpt.get();
        if (!"PENDING".equals(candidate.getReviewStatus())) {
            throw new RuntimeException("候选状态不是 PENDING，无法忽略");
        }

        candidate.setReviewStatus("IGNORED");
        candidate.setReviewedAt(LocalDateTime.now());
        candidateRepository.save(candidate);
    }

    // ============================================================
    // V1.4F: 按 Road Edge 查询正式 Asset
    // ============================================================

    /**
     * 按 Road Edge ID 列表查询关联的正式资产
     * POST /api/assets/by-road-edges
     * 
     * 通过 asset_road_relations → transport_assets → asset_current_status 查询
     * 返回去重后的 active 正式 Asset
     */
    @Transactional(readOnly = true)
    public List<AssetByRoadEdgesDTO> getAssetsByRoadEdges(List<Long> edgeIds) {
        if (edgeIds == null || edgeIds.isEmpty()) {
            return List.of();
        }

        // 1. 查询关联的 asset_road_relations (去重 asset_id)
        Set<Long> assetIds = new LinkedHashSet<>();
        // 2. 记录每个 asset 关联的 edgeIds
        Map<Long, List<Long>> assetEdgeMap = new HashMap<>();

        for (Long edgeId : edgeIds) {
            List<AssetRoadRelation> relations = roadRelationRepository.findByRoadEdgeId(edgeId);
            for (AssetRoadRelation relation : relations) {
                Long assetId = relation.getAsset().getId();
                assetIds.add(assetId);
                assetEdgeMap.computeIfAbsent(assetId, k -> new ArrayList<>()).add(edgeId);
            }
        }

        if (assetIds.isEmpty()) {
            return List.of();
        }

        // 2. 批量查询 transport_assets (只返回 active)
        List<TransportAsset> assets = assetRepository.findAllById(assetIds);
        assets = assets.stream()
                .filter(a -> Boolean.TRUE.equals(a.getIsActive()))
                .collect(Collectors.toList());

        // 3. 批量查询 asset_current_status
        List<Long> activeAssetIds = assets.stream()
                .map(TransportAsset::getId)
                .collect(Collectors.toList());
        Map<Long, AssetCurrentStatus> statusMap = new HashMap<>();
        if (!activeAssetIds.isEmpty()) {
            List<AssetCurrentStatus> statuses = statusRepository.findAllById(activeAssetIds);
            for (AssetCurrentStatus s : statuses) {
                statusMap.put(s.getAssetId(), s);
            }
        }

        // 4. 构建响应 DTO (去重)
        List<AssetByRoadEdgesDTO> result = new ArrayList<>();
        Set<Long> processedAssetIds = new HashSet<>();

        for (TransportAsset asset : assets) {
            if (processedAssetIds.contains(asset.getId())) {
                continue;
            }
            processedAssetIds.add(asset.getId());

            AssetByRoadEdgesDTO dto = new AssetByRoadEdgesDTO();
            dto.setAssetId(asset.getId());
            dto.setAssetCode(asset.getAssetCode());
            dto.setAssetName(asset.getAssetName());
            dto.setAssetType(asset.getAssetType());
            dto.setLongitude(asset.getLongitude());
            dto.setLatitude(asset.getLatitude());

            // 关联的 road edge IDs (取交集)
            List<Long> assetEdges = assetEdgeMap.getOrDefault(asset.getId(), List.of());
            dto.setRoadEdgeIds(assetEdges);

            // 当前状态
            AssetCurrentStatus status = statusMap.get(asset.getId());
            if (status != null) {
                dto.setHealthScore(status.getHealthScore());
                dto.setRiskLevel(status.getRiskLevel());
                dto.setPassStatus(status.getPassStatus());
                dto.setCurrentLoadLimitT(status.getCurrentLoadLimitT());
                dto.setCurrentHeightLimitM(status.getCurrentHeightLimitM());
                dto.setCurrentWidthLimitM(status.getCurrentWidthLimitM());
            }

            result.add(dto);
        }

        return result;
    }

    // ============================================================
    // V1.4F: 软删除资产
    // ============================================================

    /**
     * 软删除资产（设置 is_active = false）
     * @param id 资产 ID
     * @return 是否成功
     */
    @Transactional
    public boolean softDeleteAsset(Long id) {
        Optional<TransportAsset> assetOpt = assetRepository.findById(id);
        if (assetOpt.isEmpty()) {
            return false;
        }

        TransportAsset asset = assetOpt.get();
        asset.setIsActive(false);
        asset.setUpdatedAt(LocalDateTime.now());
        assetRepository.save(asset);
        return true;
    }

    /**
     * 恢复已停用的资产
     * @param id 资产 ID
     * @return 是否成功
     */
    @Transactional
    public boolean restoreAsset(Long id) {
        Optional<TransportAsset> assetOpt = assetRepository.findById(id);
        if (assetOpt.isEmpty()) {
            return false;
        }

        TransportAsset asset = assetOpt.get();
        asset.setIsActive(true);
        asset.setUpdatedAt(LocalDateTime.now());
        assetRepository.save(asset);
        return true;
    }
}
