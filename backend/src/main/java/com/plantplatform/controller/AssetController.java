package com.plantplatform.controller;

import com.plantplatform.dto.AssetByRoadEdgesDTO;
import com.plantplatform.dto.AssetCreateDTO;
import com.plantplatform.dto.AssetDetailDTO;
import com.plantplatform.dto.AssetListDTO;
import com.plantplatform.dto.AssetSummaryDTO;
import com.plantplatform.dto.CandidateDetailDTO;
import com.plantplatform.dto.CandidateListDTO;
import com.plantplatform.service.AssetService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * 资产管理 API
 * /api/assets/*
 */
@RestController
@RequestMapping("/api/assets")
public class AssetController {

    @Autowired
    private AssetService assetService;

    /**
     * 分页查询资产列表
     * GET /api/assets
     */
    @GetMapping
    public ResponseEntity<Page<AssetListDTO>> searchAssets(
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size,
            @RequestParam(required = false) String assetType,
            @RequestParam(required = false) Long divisionId,
            @RequestParam(required = false) String keyword,
            @RequestParam(required = false) String sourceType,
            @RequestParam(required = false) String bindingStatus) {

        return ResponseEntity.ok(assetService.searchAssets(
            assetType, divisionId, keyword, sourceType, bindingStatus,
            PageRequest.of(page, size)
        ));
    }

    /**
     * 创建资产
     * POST /api/assets
     */
    @PostMapping
    public ResponseEntity<?> createAsset(@RequestBody AssetCreateDTO request) {
        try {
            AssetDetailDTO dto = assetService.createAsset(request);
            return ResponseEntity.ok(dto);
        } catch (Exception e) {
            return ResponseEntity.badRequest().body(Map.of("error", e.getMessage()));
        }
    }

    /**
     * 更新资产
     * PUT /api/assets/{id}
     */
    @PutMapping("/{id}")
    public ResponseEntity<?> updateAsset(@PathVariable Long id, @RequestBody AssetCreateDTO request) {
        try {
            AssetDetailDTO dto = assetService.updateAsset(id, request);
            if (dto == null) {
                return ResponseEntity.notFound().build();
            }
            return ResponseEntity.ok(dto);
        } catch (Exception e) {
            return ResponseEntity.badRequest().body(Map.of("error", e.getMessage()));
        }
    }

    /**
     * 资产详情
     * GET /api/assets/{id}
     */
    @GetMapping("/{id}")
    public ResponseEntity<?> getAssetDetail(@PathVariable Long id) {
        AssetDetailDTO dto = assetService.getAssetDetail(id);
        if (dto == null) {
            return ResponseEntity.notFound().build();
        }
        return ResponseEntity.ok(dto);
    }

    /**
     * 资产统计摘要
     * GET /api/assets/summary
     */
    @GetMapping("/summary")
    public ResponseEntity<AssetSummaryDTO> getSummary() {
        return ResponseEntity.ok(assetService.getSummary());
    }

    /**
     * 获取正式资产 GeoJSON FeatureCollection
     * GET /api/assets/geojson
     * 
     * 只返回有 Geometry 的 active 正式 Asset
     * coordinates: [longitude, latitude]
     */
    @GetMapping("/geojson")
    public ResponseEntity<Map<String, Object>> getAssetsGeoJson() {
        return ResponseEntity.ok(assetService.getAssetsGeoJson());
    }

    /**
     * 获取资产绑定的道路
     * GET /api/assets/{id}/edges
     */
    @GetMapping("/{id}/edges")
    public ResponseEntity<?> getAssetEdges(@PathVariable Long id) {
        AssetDetailDTO dto = assetService.getAssetDetail(id);
        if (dto == null) {
            return ResponseEntity.notFound().build();
        }
        return ResponseEntity.ok(dto.getRoadRelations());
    }

    /**
     * 更新资产绑定的道路
     * PUT /api/assets/{id}/edges
     */
    @PutMapping("/{id}/edges")
    public ResponseEntity<?> updateAssetEdges(@PathVariable Long id, @RequestBody Map<String, List<Long>> request) {
        List<Long> edgeIds = request.get("edgeIds");
        if (edgeIds == null) {
            edgeIds = List.of();
        }
        try {
            AssetDetailDTO dto = assetService.updateRoadEdges(id, edgeIds);
            if (dto == null) {
                return ResponseEntity.notFound().build();
            }
            return ResponseEntity.ok(dto);
        } catch (Exception e) {
            return ResponseEntity.badRequest().body(Map.of("error", e.getMessage()));
        }
    }

    /**
     * 分页查询待审核候选
     * GET /api/assets/candidates
     */
    @GetMapping("/candidates")
    public ResponseEntity<Page<CandidateListDTO>> searchCandidates(
            @RequestParam(defaultValue = "PENDING") String status,
            @RequestParam(required = false) String candidateType,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size) {

        return ResponseEntity.ok(assetService.searchCandidates(
            status, candidateType, PageRequest.of(page, size)
        ));
    }

    /**
     * 候选统计
     * GET /api/assets/candidates/stats
     */
    @GetMapping("/candidates/stats")
    public ResponseEntity<Map<String, Long>> getCandidateStats() {
        return ResponseEntity.ok(assetService.getCandidateStats());
    }

    /**
     * 提取候选
     * POST /api/assets/candidates/extract
     */
    @PostMapping("/candidates/extract")
    public ResponseEntity<?> extractCandidates(@RequestBody Map<String, Object> request) {
        try {
            String candidateType = (String) request.get("candidateType");
            Long divisionId = request.get("divisionId") != null ? Long.valueOf(request.get("divisionId").toString()) : null;
            String roadRef = (String) request.get("roadRef");

            AssetService.ExtractResult result = assetService.extractCandidates(candidateType, divisionId, roadRef);
            return ResponseEntity.ok(result);
        } catch (Exception e) {
            return ResponseEntity.badRequest().body(Map.of("error", e.getMessage()));
        }
    }

    /**
     * 获取候选详情
     * GET /api/assets/candidates/{id}
     */
    @GetMapping("/candidates/{id}")
    public ResponseEntity<?> getCandidateDetail(@PathVariable Long id) {
        CandidateDetailDTO dto = assetService.getCandidateDetail(id);
        if (dto == null) {
            return ResponseEntity.notFound().build();
        }
        return ResponseEntity.ok(dto);
    }

    /**
     * 确认候选 → 创建正式 Asset
     * POST /api/assets/candidates/{id}/confirm
     */
    @PostMapping("/candidates/{id}/confirm")
    public ResponseEntity<?> confirmCandidate(@PathVariable Long id, @RequestBody AssetCreateDTO request) {
        try {
            AssetDetailDTO dto = assetService.confirmCandidate(id, request);
            return ResponseEntity.ok(dto);
        } catch (Exception e) {
            return ResponseEntity.badRequest().body(Map.of("error", e.getMessage()));
        }
    }

    /**
     * 忽略候选
     * POST /api/assets/candidates/{id}/ignore
     */
    @PostMapping("/candidates/{id}/ignore")
    public ResponseEntity<?> ignoreCandidate(@PathVariable Long id) {
        try {
            assetService.ignoreCandidate(id);
            return ResponseEntity.ok(Map.of("success", true));
        } catch (Exception e) {
            return ResponseEntity.badRequest().body(Map.of("error", e.getMessage()));
        }
    }

    // ============================================================
    // HOME-2: 资产图片上传
    // ============================================================

    @Value("${app.upload.dir:uploads/assets}")
    private String uploadDir;

    /**
     * 上传资产图片
     * POST /api/assets/{id}/image
     * 
     * Content-Type: multipart/form-data
     * 参数: file
     * 支持: jpg, jpeg, png, webp
     * 限制: ≤10MB
     */
    @PostMapping("/{id}/image")
    public ResponseEntity<?> uploadAssetImage(
            @PathVariable Long id,
            @RequestParam("file") MultipartFile file) {
        try {
            // 验证文件类型
            String originalFilename = file.getOriginalFilename();
            String extension = "";
            if (originalFilename != null && originalFilename.contains(".")) {
                extension = originalFilename.substring(originalFilename.lastIndexOf(".") + 1).toLowerCase();
            }
            
            if (!extension.matches("jpg|jpeg|png|webp")) {
                return ResponseEntity.badRequest().body(Map.of("error", "不支持的文件类型，仅支持 jpg, jpeg, png, webp"));
            }

            // 验证文件大小 (≤10MB)
            if (file.getSize() > 10 * 1024 * 1024) {
                return ResponseEntity.badRequest().body(Map.of("error", "文件大小超过限制（最大10MB）"));
            }

            // 生成唯一文件名
            String uniqueFilename = UUID.randomUUID().toString() + "." + extension;
            
            // 确保上传目录存在
            Path uploadPath = Paths.get(uploadDir);
            if (!Files.exists(uploadPath)) {
                Files.createDirectories(uploadPath);
            }

            // 保存文件
            Path filePath = uploadPath.resolve(uniqueFilename);
            file.transferTo(filePath.toFile());

            // 构建相对URL路径
            String imagePath = "/uploads/assets/" + uniqueFilename;

            // 更新数据库
            assetService.updateImagePath(id, imagePath);

            return ResponseEntity.ok(Map.of(
                "success", true,
                "imagePath", imagePath
            ));
        } catch (IOException e) {
            return ResponseEntity.badRequest().body(Map.of("error", "文件上传失败: " + e.getMessage()));
        } catch (Exception e) {
            return ResponseEntity.badRequest().body(Map.of("error", e.getMessage()));
        }
    }

    // ============================================================
    // V1.4F: 按 Road Edge 查询正式 Asset
    // ============================================================

    /**
     * 按 Road Edge ID 列表查询关联的正式资产
     * POST /api/assets/by-road-edges
     * 
     * 请求: { "edgeIds": [1, 2, 3] }
     * 返回: 去重后的 active 正式 Asset 列表
     */
    @PostMapping("/by-road-edges")
    public ResponseEntity<List<AssetByRoadEdgesDTO>> getAssetsByRoadEdges(
            @RequestBody Map<String, List<Long>> request) {
        List<Long> edgeIds = request.get("edgeIds");
        if (edgeIds == null) {
            edgeIds = List.of();
        }
        return ResponseEntity.ok(assetService.getAssetsByRoadEdges(edgeIds));
    }

    // ============================================================
    // V1.4F: 软删除/恢复资产
    // ============================================================

    /**
     * 软删除资产（设置 is_active = false）
     * DELETE /api/assets/{id}
     */
    @DeleteMapping("/{id}")
    public ResponseEntity<?> softDeleteAsset(@PathVariable Long id) {
        boolean success = assetService.softDeleteAsset(id);
        if (!success) {
            return ResponseEntity.notFound().build();
        }
        return ResponseEntity.ok(Map.of("success", true, "message", "已停用该资产"));
    }

    /**
     * 恢复已停用的资产
     * POST /api/assets/{id}/restore
     */
    @PostMapping("/{id}/restore")
    public ResponseEntity<?> restoreAsset(@PathVariable Long id) {
        boolean success = assetService.restoreAsset(id);
        if (!success) {
            return ResponseEntity.notFound().build();
        }
        return ResponseEntity.ok(Map.of("success", true, "message", "已恢复该资产"));
    }

    /**
     * V1.4F: 检查同类型同名资产是否存在
     * GET /api/assets/check-duplicate?assetType=BRIDGE&assetName=xxx
     */
    @GetMapping("/check-duplicate")
    public ResponseEntity<Map<String, Object>> checkDuplicate(
            @RequestParam String assetType,
            @RequestParam String assetName) {
        Map<String, Object> result = assetService.checkDuplicateAsset(assetType, assetName);
        return ResponseEntity.ok(result);
    }
}
