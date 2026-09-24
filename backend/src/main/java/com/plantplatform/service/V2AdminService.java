package com.plantplatform.service;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.support.GeneratedKeyHolder;
import org.springframework.jdbc.support.KeyHolder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.math.BigDecimal;
import java.sql.PreparedStatement;
import java.sql.Statement;
import java.sql.Timestamp;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;

@Service
public class V2AdminService {

    private final JdbcTemplate jdbc;
    private final ObjectMapper objectMapper;

    public V2AdminService(
            @Qualifier("v2JdbcTemplate") JdbcTemplate jdbc,
            ObjectMapper objectMapper) {
        this.jdbc = jdbc;
        this.objectMapper = objectMapper;
    }

    public Map<String, Object> summary() {
        Map<String, Object> result = new LinkedHashMap<>();
        result.putAll(Objects.requireNonNull(jdbc.queryForObject("""
            SELECT
              (SELECT COUNT(*) FROM region) regionCount,
              (SELECT COUNT(*) FROM road_node) roadNodeCount,
              (SELECT COUNT(*) FROM road_edge) roadEdgeCount,
              (SELECT ROUND(COALESCE(SUM(length_m), 0) / 1000, 2) FROM road_edge) roadLengthKm,
              (SELECT COUNT(*) FROM transport_asset WHERE asset_type='BRIDGE') bridgeCount,
              (SELECT COUNT(*) FROM transport_asset WHERE asset_type='TUNNEL') tunnelCount,
              (SELECT COUNT(*) FROM vehicle_profile) vehicleProfileCount,
              (SELECT COUNT(*) FROM earthquake_scenario) earthquakeScenarioCount,
              (SELECT COUNT(*) FROM debris_flow_scenario) debrisScenarioCount,
              (SELECT COUNT(*) FROM evaluation_task) taskCount,
              (SELECT COUNT(*) FROM dashboard_publication) publicationCount
            """, (rs, rowNum) -> {
            Map<String, Object> row = new LinkedHashMap<>();
            row.put("regionCount", rs.getLong("regionCount"));
            row.put("roadNodeCount", rs.getLong("roadNodeCount"));
            row.put("roadEdgeCount", rs.getLong("roadEdgeCount"));
            row.put("roadLengthKm", rs.getBigDecimal("roadLengthKm"));
            row.put("bridgeCount", rs.getLong("bridgeCount"));
            row.put("tunnelCount", rs.getLong("tunnelCount"));
            row.put("vehicleProfileCount", rs.getLong("vehicleProfileCount"));
            row.put("earthquakeScenarioCount", rs.getLong("earthquakeScenarioCount"));
            row.put("debrisScenarioCount", rs.getLong("debrisScenarioCount"));
            row.put("taskCount", rs.getLong("taskCount"));
            row.put("publicationCount", rs.getLong("publicationCount"));
            return row;
        })));
        result.put("quality", jdbc.queryForObject("""
            SELECT
              (SELECT COUNT(*) FROM road_edge WHERE region_code IS NULL) roadsWithoutRegion,
              (SELECT COUNT(*) FROM transport_asset a LEFT JOIN asset_road_relation r ON r.asset_id=a.id
                 WHERE r.asset_id IS NULL AND a.service_status <> 'CLOSED') assetsWithoutRoad,
              (SELECT COUNT(*) FROM transport_asset WHERE longitude IS NULL OR latitude IS NULL) assetsWithoutLocation,
              (SELECT COUNT(*) FROM evaluation_task WHERE status IN ('FAILED','PENDING_DATA')) problemTasks,
              (SELECT COUNT(*) FROM vehicle_profile WHERE is_default=TRUE) defaultVehicleCount,
              (SELECT COUNT(*) FROM earthquake_scenario WHERE is_default=TRUE) defaultEarthquakeCount,
              (SELECT COUNT(*) FROM debris_flow_scenario WHERE is_default=TRUE) defaultDebrisCount
            """, (rs, rowNum) -> Map.of(
                "roadsWithoutRegion", rs.getLong("roadsWithoutRegion"),
                "assetsWithoutRoad", rs.getLong("assetsWithoutRoad"),
                "assetsWithoutLocation", rs.getLong("assetsWithoutLocation"),
                "problemTasks", rs.getLong("problemTasks"),
                "defaultVehicleCount", rs.getLong("defaultVehicleCount"),
                "defaultEarthquakeCount", rs.getLong("defaultEarthquakeCount"),
                "defaultDebrisCount", rs.getLong("defaultDebrisCount")
            )));
        return result;
    }

    public List<Map<String, Object>> regions() {
        return jdbc.queryForList("""
            SELECT r.region_code regionCode, r.region_name regionName, r.area_km2 areaKm2,
                   r.center_longitude centerLongitude, r.center_latitude centerLatitude,
                   COALESCE(roads.road_count,0) roadCount, COALESCE(roads.road_length_km,0) roadLengthKm,
                   COALESCE(assets.bridge_count,0) bridgeCount, COALESCE(assets.tunnel_count,0) tunnelCount
            FROM region r
            LEFT JOIN (
              SELECT region_code,COUNT(*) road_count,ROUND(SUM(length_m)/1000,2) road_length_km
              FROM road_edge GROUP BY region_code
            ) roads ON roads.region_code=r.region_code
            LEFT JOIN (
              SELECT region_code,SUM(asset_type='BRIDGE') bridge_count,SUM(asset_type='TUNNEL') tunnel_count
              FROM transport_asset GROUP BY region_code
            ) assets ON assets.region_code=r.region_code
            ORDER BY r.region_code
            """);
    }

    public Map<String, Object> roads(int page, int size, String query, String regionCode,
                                     String roadClass, Boolean bridgeFlag, Boolean tunnelFlag) {
        List<Object> args = new ArrayList<>();
        StringBuilder where = new StringBuilder(" WHERE 1=1");
        if (hasText(query)) {
            where.append(" AND (e.road_name LIKE ? OR e.road_ref LIKE ? OR CAST(e.id AS CHAR) LIKE ?)");
            String like = "%" + query.trim() + "%";
            args.add(like); args.add(like); args.add(like);
        }
        if (hasText(regionCode)) { where.append(" AND e.region_code=?"); args.add(regionCode); }
        if (hasText(roadClass)) { where.append(" AND e.road_class=?"); args.add(roadClass); }
        if (bridgeFlag != null) { where.append(" AND e.source_bridge_flag=?"); args.add(bridgeFlag); }
        if (tunnelFlag != null) { where.append(" AND e.source_tunnel_flag=?"); args.add(tunnelFlag); }
        long total = jdbc.queryForObject("SELECT COUNT(*) FROM road_edge e" + where, Long.class, args.toArray());
        List<Object> dataArgs = new ArrayList<>(args);
        dataArgs.add(size); dataArgs.add(page * size);
        List<Map<String, Object>> content = jdbc.queryForList("""
            SELECT e.id, e.road_name roadName, e.road_ref roadRef,
                   e.road_class roadClass, e.from_node_id fromNodeId, e.to_node_id toNodeId,
                   e.region_code regionCode, r.region_name regionName, e.length_m lengthM,
                   e.lane_count laneCount, e.design_speed_kmh designSpeedKmh, e.one_way oneWay,
                   e.source_bridge_flag sourceBridgeFlag, e.source_tunnel_flag sourceTunnelFlag,
                   COUNT(ar.asset_id) bindingCount
            FROM road_edge e
            JOIN region r ON r.region_code=e.region_code
            LEFT JOIN asset_road_relation ar ON ar.road_edge_id=e.id
            """ + where + """
             GROUP BY e.id, e.road_name, e.road_ref, e.road_class, e.from_node_id,
                     e.to_node_id, e.region_code, r.region_name, e.length_m, e.lane_count,
                     e.design_speed_kmh, e.one_way, e.source_bridge_flag, e.source_tunnel_flag
            ORDER BY e.id LIMIT ? OFFSET ?
            """, dataArgs.toArray());
        return page(content, page, size, total);
    }

    public Map<String, Object> road(long id) {
        Map<String, Object> result = queryOne("""
            SELECT e.id, e.road_name roadName, e.road_ref roadRef,
                   e.road_class roadClass, e.from_node_id fromNodeId, e.to_node_id toNodeId,
                   e.region_code regionCode, r.region_name regionName, e.length_m lengthM,
                   e.lane_count laneCount, e.design_speed_kmh designSpeedKmh, e.one_way oneWay,
                   e.source_bridge_flag sourceBridgeFlag, e.source_tunnel_flag sourceTunnelFlag,
                   ST_AsGeoJSON(e.geom, 6) geometry
            FROM road_edge e JOIN region r ON r.region_code=e.region_code WHERE e.id=?
            """, id);
        result.put("assets", jdbc.queryForList("""
            SELECT a.id, a.asset_code assetCode, a.asset_name assetName, a.asset_type assetType,
                   ar.relation_type relationType
            FROM asset_road_relation ar JOIN transport_asset a ON a.id=ar.asset_id
            WHERE ar.road_edge_id=? ORDER BY a.asset_type, a.asset_code
            """, id));
        return result;
    }

    public Map<String, Object> assets(int page, int size, String query, String regionCode,
                                      String assetType, String serviceStatus, Boolean bound) {
        List<Object> args = new ArrayList<>();
        StringBuilder where = new StringBuilder(" WHERE 1=1");
        if (hasText(query)) {
            where.append(" AND (a.asset_name LIKE ? OR a.asset_code LIKE ?)");
            String like = "%" + query.trim() + "%"; args.add(like); args.add(like);
        }
        if (hasText(regionCode)) { where.append(" AND a.region_code=?"); args.add(regionCode); }
        if (hasText(assetType)) { where.append(" AND a.asset_type=?"); args.add(assetType); }
        if (hasText(serviceStatus)) { where.append(" AND a.service_status=?"); args.add(serviceStatus); }
        if (bound != null) where.append(bound ? " AND EXISTS (SELECT 1 FROM asset_road_relation x WHERE x.asset_id=a.id)"
                                               : " AND NOT EXISTS (SELECT 1 FROM asset_road_relation x WHERE x.asset_id=a.id)");
        long total = jdbc.queryForObject("SELECT COUNT(*) FROM transport_asset a" + where,
            Long.class, args.toArray());
        List<Object> dataArgs = new ArrayList<>(args); dataArgs.add(size); dataArgs.add(page * size);
        List<Map<String, Object>> content = jdbc.queryForList("""
            SELECT a.id, a.asset_code assetCode, a.asset_name assetName, a.asset_type assetType,
                   a.region_code regionCode, r.region_name regionName, a.longitude, a.latitude,
                   a.construction_year constructionYear, a.design_grade designGrade,
                   a.service_status serviceStatus, COUNT(ar.road_edge_id) bindingCount,
                   CASE WHEN a.longitude IS NULL OR a.latitude IS NULL THEN 'INCOMPLETE'
                        WHEN a.asset_type='BRIDGE' AND b.asset_id IS NULL THEN 'INCOMPLETE'
                        WHEN a.asset_type='TUNNEL' AND t.asset_id IS NULL THEN 'INCOMPLETE'
                        ELSE 'COMPLETE' END completeness
            FROM transport_asset a
            LEFT JOIN region r ON r.region_code=a.region_code
            LEFT JOIN asset_road_relation ar ON ar.asset_id=a.id
            LEFT JOIN bridge_detail b ON b.asset_id=a.id
            LEFT JOIN tunnel_detail t ON t.asset_id=a.id
            """ + where + """
             GROUP BY a.id, a.asset_code, a.asset_name, a.asset_type, a.region_code, r.region_name,
                     a.longitude, a.latitude, a.construction_year, a.design_grade, a.service_status,
                     b.asset_id, t.asset_id
            ORDER BY a.asset_type, a.asset_code LIMIT ? OFFSET ?
            """, dataArgs.toArray());
        return page(content, page, size, total);
    }

    public Map<String, Object> asset(long id) {
        Map<String, Object> result = queryOne("""
            SELECT a.id, a.asset_code assetCode, a.asset_name assetName, a.asset_type assetType,
                   a.region_code regionCode, r.region_name regionName, a.longitude, a.latitude,
                   a.construction_year constructionYear, a.design_grade designGrade,
                   a.design_speed_kmh designSpeedKmh, a.baseline_condition_level baselineConditionLevel,
                   a.baseline_inspection_date baselineInspectionDate, a.service_status serviceStatus
            FROM transport_asset a LEFT JOIN region r ON r.region_code=a.region_code WHERE a.id=?
            """, id);
        String type = String.valueOf(result.get("assetType"));
        result.put("detail", "BRIDGE".equals(type)
            ? optionalOne("SELECT * FROM bridge_detail WHERE asset_id=?", id)
            : optionalOne("SELECT * FROM tunnel_detail WHERE asset_id=?", id));
        result.put("roads", jdbc.queryForList("""
            SELECT e.id, e.road_name roadName, e.road_ref roadRef,
                   r.region_name regionName, ar.relation_type relationType, ar.sequence_no sequenceNo,
                   ar.direction, ar.start_chainage startChainage, ar.end_chainage endChainage
            FROM asset_road_relation ar JOIN road_edge e ON e.id=ar.road_edge_id
            JOIN region r ON r.region_code=e.region_code WHERE ar.asset_id=?
            ORDER BY COALESCE(ar.sequence_no, 32767), e.id
            """, id));
        return result;
    }

    @Transactional("v2TransactionManager")
    public long saveAsset(Long id, Map<String, Object> body) {
        String assetCode = required(body, "assetCode");
        String assetName = required(body, "assetName");
        String assetType = required(body, "assetType");
        if (!List.of("BRIDGE", "TUNNEL").contains(assetType)) bad("设施类型必须是BRIDGE或TUNNEL");
        String regionCode = required(body, "regionCode");
        BigDecimal longitude = decimal(body.get("longitude"));
        BigDecimal latitude = decimal(body.get("latitude"));
        if (id == null) {
            KeyHolder key = new GeneratedKeyHolder();
            jdbc.update(connection -> {
                PreparedStatement ps = connection.prepareStatement("""
                    INSERT INTO transport_asset(asset_code,asset_name,asset_type,region_code,longitude,latitude,geom,
                      construction_year,design_grade,design_speed_kmh,baseline_condition_level,
                      baseline_inspection_date,service_status)
                    VALUES(?,?,?,?,?,?,CASE WHEN ? IS NULL OR ? IS NULL THEN NULL ELSE ST_SRID(Point(?,?),4326) END,
                      ?,?,?,?,?,?)
                    """, Statement.RETURN_GENERATED_KEYS);
                bind(ps, assetCode, assetName, assetType, regionCode, longitude, latitude,
                    longitude, latitude, longitude, latitude, integer(body.get("constructionYear")),
                    text(body.get("designGrade")), integer(body.get("designSpeedKmh")),
                    text(body.get("baselineConditionLevel")), dateText(body.get("baselineInspectionDate")),
                    defaultText(body.get("serviceStatus"), "IN_SERVICE"));
                return ps;
            }, key);
            id = Objects.requireNonNull(key.getKey()).longValue();
        } else {
            jdbc.update("""
                UPDATE transport_asset SET asset_code=?,asset_name=?,asset_type=?,region_code=?,longitude=?,latitude=?,
                  geom=CASE WHEN ? IS NULL OR ? IS NULL THEN NULL ELSE ST_SRID(Point(?,?),4326) END,
                  construction_year=?,design_grade=?,design_speed_kmh=?,baseline_condition_level=?,
                  baseline_inspection_date=?,service_status=? WHERE id=?
                """, assetCode, assetName, assetType, regionCode, longitude, latitude,
                longitude, latitude, longitude, latitude, integer(body.get("constructionYear")),
                text(body.get("designGrade")), integer(body.get("designSpeedKmh")),
                text(body.get("baselineConditionLevel")), dateText(body.get("baselineInspectionDate")),
                defaultText(body.get("serviceStatus"), "IN_SERVICE"), id);
        }
        saveAssetDetail(id, assetType, map(body.get("detail")));
        replaceAssetRoads(id, list(body.get("roads")));
        return id;
    }

    private void saveAssetDetail(long id, String assetType, Map<String, Object> detail) {
        jdbc.update("DELETE FROM bridge_detail WHERE asset_id=?", id);
        jdbc.update("DELETE FROM tunnel_detail WHERE asset_id=?", id);
        if ("BRIDGE".equals(assetType)) {
            jdbc.update("""
                INSERT INTO bridge_detail(asset_id,bridge_type,total_length_m,deck_width_m,span_count,max_span_m,
                  pier_count,representative_pier_height_m,pier_section_type,pier_section_width_m,pier_section_height_m,
                  concrete_strength_mpa,steel_strength_mpa,reinforcement_ratio,bearing_type,bearing_count,
                  bearing_stiffness_kn_m,has_restrainer,design_load_grade,design_load_ton,vertical_clearance_m,horizontal_clearance_m)
                VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
                """, id, text(detail.get("bridgeType")), decimal(detail.get("totalLengthM")),
                decimal(detail.get("deckWidthM")), integer(detail.get("spanCount")), decimal(detail.get("maxSpanM")),
                integer(detail.get("pierCount")), decimal(detail.get("representativePierHeightM")),
                text(detail.get("pierSectionType")), decimal(detail.get("pierSectionWidthM")),
                decimal(detail.get("pierSectionHeightM")), decimal(detail.get("concreteStrengthMpa")),
                decimal(detail.get("steelStrengthMpa")), decimal(detail.get("reinforcementRatio")),
                text(detail.get("bearingType")), integer(detail.get("bearingCount")),
                decimal(detail.get("bearingStiffnessKnM")), bool(detail.get("hasRestrainer")),
                text(detail.get("designLoadGrade")), decimal(detail.get("designLoadTon")),
                decimal(detail.get("verticalClearanceM")), decimal(detail.get("horizontalClearanceM")));
        } else {
            jdbc.update("""
                INSERT INTO tunnel_detail(asset_id,tunnel_type,total_length_m,diameter_m,buried_depth_m,section_type,
                  lining_thickness_cm,concrete_strength_mpa,steel_strength_mpa,elastic_modulus_gpa,
                  surrounding_rock_grade,groundwater_level,site_category,vertical_clearance_m,
                  horizontal_clearance_m,lane_count)
                VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
                """, id, text(detail.get("tunnelType")), decimal(detail.get("totalLengthM")),
                decimal(detail.get("diameterM")), decimal(detail.get("buriedDepthM")), text(detail.get("sectionType")),
                decimal(detail.get("liningThicknessCm")), decimal(detail.get("concreteStrengthMpa")),
                decimal(detail.get("steelStrengthMpa")), decimal(detail.get("elasticModulusGpa")),
                text(detail.get("surroundingRockGrade")), text(detail.get("groundwaterLevel")),
                text(detail.get("siteCategory")), decimal(detail.get("verticalClearanceM")),
                decimal(detail.get("horizontalClearanceM")), integer(detail.get("laneCount")));
        }
    }

    private void replaceAssetRoads(long assetId, List<Map<String, Object>> roads) {
        jdbc.update("DELETE FROM asset_road_relation WHERE asset_id=?", assetId);
        int sequence = 1;
        for (Map<String, Object> road : roads) {
            Long roadId = longValue(road.get("roadEdgeId"));
            if (roadId == null) continue;
            jdbc.update("""
                INSERT INTO asset_road_relation(asset_id,road_edge_id,relation_type,sequence_no,direction,start_chainage,end_chainage)
                VALUES(?,?,?,?,?,?,?)
                """, assetId, roadId, defaultText(road.get("relationType"), sequence == 1 ? "PRIMARY" : "ADJACENT"),
                integerOr(road.get("sequenceNo"), sequence), text(road.get("direction")),
                decimal(road.get("startChainage")), decimal(road.get("endChainage")));
            sequence++;
        }
    }

    public void closeAsset(long id) {
        if (jdbc.update("UPDATE transport_asset SET service_status='CLOSED' WHERE id=?", id) == 0) notFound();
    }

    public List<Map<String, Object>> vehicles() {
        return jdbc.queryForList("""
            SELECT id,profile_name profileName,gross_weight_ton grossWeightTon,vehicle_length_m vehicleLengthM,
                   vehicle_width_m vehicleWidthM,vehicle_height_m vehicleHeightM,axle_count axleCount,
                   axle_loads_json axleLoadsJson,axle_spacings_json axleSpacingsJson,
                   planned_speed_kmh plannedSpeedKmh,minimum_turning_radius_m minimumTurningRadiusM,is_default isDefault
            FROM vehicle_profile ORDER BY is_default DESC,id
            """);
    }

    @Transactional("v2TransactionManager")
    public long saveVehicle(Long id, Map<String, Object> body) {
        boolean makeDefault = Boolean.TRUE.equals(bool(body.get("isDefault")));
        if (makeDefault) jdbc.update("UPDATE vehicle_profile SET is_default=FALSE");
        Object[] values = {required(body,"profileName"), decimal(body.get("grossWeightTon")),
            decimal(body.get("vehicleLengthM")), decimal(body.get("vehicleWidthM")), decimal(body.get("vehicleHeightM")),
            integer(body.get("axleCount")), json(body.get("axleLoads")), json(body.get("axleSpacings")),
            integer(body.get("plannedSpeedKmh")), decimal(body.get("minimumTurningRadiusM")), makeDefault};
        if (id == null) {
            KeyHolder key = new GeneratedKeyHolder();
            jdbc.update(connection -> {
                PreparedStatement ps = connection.prepareStatement("""
                    INSERT INTO vehicle_profile(profile_name,gross_weight_ton,vehicle_length_m,vehicle_width_m,
                      vehicle_height_m,axle_count,axle_loads_json,axle_spacings_json,planned_speed_kmh,
                      minimum_turning_radius_m,is_default) VALUES(?,?,?,?,?,?,?,?,?,?,?)
                    """, Statement.RETURN_GENERATED_KEYS);
                bind(ps, values); return ps;
            }, key);
            id = Objects.requireNonNull(key.getKey()).longValue();
        } else {
            jdbc.update("""
                UPDATE vehicle_profile SET profile_name=?,gross_weight_ton=?,vehicle_length_m=?,vehicle_width_m=?,
                  vehicle_height_m=?,axle_count=?,axle_loads_json=?,axle_spacings_json=?,planned_speed_kmh=?,
                  minimum_turning_radius_m=?,is_default=? WHERE id=?
                """, append(values, id));
        }
        ensureVehicleDefault(id);
        return id;
    }

    @Transactional("v2TransactionManager")
    public void setDefaultVehicle(long id) {
        jdbc.update("UPDATE vehicle_profile SET is_default=FALSE");
        if (jdbc.update("UPDATE vehicle_profile SET is_default=TRUE WHERE id=?", id) == 0) notFound();
    }

    public void deleteVehicle(long id) { if (jdbc.update("DELETE FROM vehicle_profile WHERE id=?", id) == 0) notFound(); }

    private void ensureVehicleDefault(long preferredId) {
        Integer count = jdbc.queryForObject("SELECT COUNT(*) FROM vehicle_profile WHERE is_default=TRUE", Integer.class);
        if (count != null && count == 0) jdbc.update("UPDATE vehicle_profile SET is_default=TRUE WHERE id=?", preferredId);
    }

    public List<Map<String, Object>> earthquakeScenarios() {
        return jdbc.queryForList("""
            SELECT s.id,s.scenario_name scenarioName,s.event_time eventTime,s.region_code regionCode,
                   r.region_name regionName,s.longitude,s.latitude,s.description,s.seismic_intensity seismicIntensity,
                   s.pga_g pgaG,s.intensity_measure_type intensityMeasureType,
                   s.intensity_measure_value intensityMeasureValue,s.duration_s durationS,s.magnitude,
                   s.source_distance_km sourceDistanceKm,s.site_category siteCategory,
                   s.wave_file_path waveFilePath,s.is_default isDefault
            FROM earthquake_scenario s JOIN region r ON r.region_code=s.region_code
            ORDER BY s.is_default DESC,s.id
            """);
    }

    @Transactional("v2TransactionManager")
    public long saveEarthquake(Long id, Map<String, Object> b) {
        boolean isDefault = Boolean.TRUE.equals(bool(b.get("isDefault")));
        if (isDefault) jdbc.update("UPDATE earthquake_scenario SET is_default=FALSE");
        Object[] values = {required(b,"scenarioName"), timestamp(b.get("eventTime")), required(b,"regionCode"),
            decimal(b.get("longitude")),decimal(b.get("latitude")),text(b.get("description")),
            required(b,"seismicIntensity"),decimal(b.get("pgaG")),defaultText(b.get("intensityMeasureType"),"PGA"),
            decimal(b.get("intensityMeasureValue")),decimal(b.get("durationS")),decimal(b.get("magnitude")),
            decimal(b.get("sourceDistanceKm")),text(b.get("siteCategory")),text(b.get("waveFilePath")),isDefault};
        return saveScenario(id, "earthquake_scenario", """
            scenario_name,event_time,region_code,longitude,latitude,description,seismic_intensity,pga_g,
            intensity_measure_type,intensity_measure_value,duration_s,magnitude,source_distance_km,
            site_category,wave_file_path,is_default
            """, values);
    }

    public List<Map<String, Object>> debrisScenarios() {
        return jdbc.queryForList("""
            SELECT s.id,s.scenario_name scenarioName,s.event_time eventTime,s.region_code regionCode,
                   r.region_name regionName,s.longitude,s.latitude,s.description,
                   s.rainfall_duration_h rainfallDurationH,s.average_rainfall_mm_h averageRainfallMmH,
                   s.accumulated_rainfall_mm accumulatedRainfallMm,s.antecedent_rainfall_mm antecedentRainfallMm,
                   s.catchment_area_km2 catchmentAreaKm2,s.average_slope_degree averageSlopeDegree,
                   s.channel_condition channelCondition,s.loose_material_level looseMaterialLevel,
                   s.soil_moisture_level soilMoistureLevel,s.is_default isDefault
            FROM debris_flow_scenario s JOIN region r ON r.region_code=s.region_code
            ORDER BY s.is_default DESC,s.id
            """);
    }

    @Transactional("v2TransactionManager")
    public long saveDebris(Long id, Map<String, Object> b) {
        boolean isDefault = Boolean.TRUE.equals(bool(b.get("isDefault")));
        if (isDefault) jdbc.update("UPDATE debris_flow_scenario SET is_default=FALSE");
        Object[] values = {required(b,"scenarioName"),timestamp(b.get("eventTime")),required(b,"regionCode"),
            decimal(b.get("longitude")),decimal(b.get("latitude")),text(b.get("description")),
            decimal(b.get("rainfallDurationH")),decimal(b.get("averageRainfallMmH")),
            decimal(b.get("accumulatedRainfallMm")),decimal(b.get("antecedentRainfallMm")),
            decimal(b.get("catchmentAreaKm2")),decimal(b.get("averageSlopeDegree")),
            text(b.get("channelCondition")),text(b.get("looseMaterialLevel")),
            text(b.get("soilMoistureLevel")),isDefault};
        return saveScenario(id, "debris_flow_scenario", """
            scenario_name,event_time,region_code,longitude,latitude,description,rainfall_duration_h,
            average_rainfall_mm_h,accumulated_rainfall_mm,antecedent_rainfall_mm,catchment_area_km2,
            average_slope_degree,channel_condition,loose_material_level,soil_moisture_level,is_default
            """, values);
    }

    private long saveScenario(Long id, String table, String columns, Object[] values) {
        String[] names = columns.replace("\n", "").replace(" ", "").split(",");
        String placeholders = String.join(",", java.util.Collections.nCopies(names.length, "?"));
        if (id == null) {
            KeyHolder key = new GeneratedKeyHolder();
            jdbc.update(connection -> {
                PreparedStatement ps = connection.prepareStatement(
                    "INSERT INTO " + table + "(" + String.join(",", names) + ") VALUES(" + placeholders + ")",
                    Statement.RETURN_GENERATED_KEYS);
                bind(ps, values); return ps;
            }, key);
            id = Objects.requireNonNull(key.getKey()).longValue();
        } else {
            List<String> assignments = new ArrayList<>();
            for (String name : names) assignments.add(name + "=?");
            jdbc.update("UPDATE " + table + " SET " + String.join(",", assignments) + " WHERE id=?", append(values,id));
        }
        Integer defaults = jdbc.queryForObject("SELECT COUNT(*) FROM " + table + " WHERE is_default=TRUE", Integer.class);
        if (defaults != null && defaults == 0) jdbc.update("UPDATE " + table + " SET is_default=TRUE WHERE id=?", id);
        return id;
    }

    @Transactional("v2TransactionManager")
    public void setDefaultScenario(String type, long id) {
        String table = scenarioTable(type);
        jdbc.update("UPDATE " + table + " SET is_default=FALSE");
        if (jdbc.update("UPDATE " + table + " SET is_default=TRUE WHERE id=?", id) == 0) notFound();
    }

    public void deleteScenario(String type, long id) {
        String table = scenarioTable(type);
        Boolean wasDefault = jdbc.query("SELECT is_default FROM " + table + " WHERE id=?", rs -> rs.next() ? rs.getBoolean(1) : null, id);
        if (wasDefault == null) notFound();
        jdbc.update("DELETE FROM " + table + " WHERE id=?", id);
        if (wasDefault) jdbc.update("UPDATE " + table + " SET is_default=TRUE ORDER BY id LIMIT 1");
    }

    private String scenarioTable(String type) {
        return switch (type) {
            case "earthquake" -> "earthquake_scenario";
            case "debris" -> "debris_flow_scenario";
            default -> throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "未知场景类型");
        };
    }

    public Map<String, Object> tasks(int page, int size, String moduleType, String status, String query) {
        List<Object> args = new ArrayList<>();
        StringBuilder where = new StringBuilder(" WHERE 1=1");
        if (hasText(moduleType)) { where.append(" AND t.module_type=?"); args.add(moduleType); }
        if (hasText(status)) { where.append(" AND t.status=?"); args.add(status); }
        if (hasText(query)) { where.append(" AND (t.task_name LIKE ? OR t.task_code LIKE ?)"); String like="%"+query.trim()+"%";args.add(like);args.add(like); }
        long total=jdbc.queryForObject("SELECT COUNT(*) FROM evaluation_task t"+where,Long.class,args.toArray());
        List<Object> dataArgs=new ArrayList<>(args);dataArgs.add(size);dataArgs.add(page*size);
        List<Map<String,Object>> content=jdbc.queryForList("""
            SELECT t.id,t.task_code taskCode,t.task_name taskName,t.module_type moduleType,t.status,
              t.algorithm_mode algorithmMode,t.algorithm_version algorithmVersion,t.vehicle_profile_id vehicleProfileId,
              v.profile_name vehicleProfileName,t.created_at createdAt,t.started_at startedAt,t.completed_at completedAt,
              t.created_by createdBy,t.error_message errorMessage,
              GROUP_CONCAT(p.module_code ORDER BY p.module_code) publishedModules
            FROM evaluation_task t LEFT JOIN vehicle_profile v ON v.id=t.vehicle_profile_id
            LEFT JOIN dashboard_publication p ON p.published_task_id=t.id
            """+where+" GROUP BY t.id,v.profile_name ORDER BY t.created_at DESC,t.id DESC LIMIT ? OFFSET ?",dataArgs.toArray());
        return page(content,page,size,total);
    }

    public Map<String,Object> task(long id){
        Map<String,Object> result=queryOne("""
            SELECT t.id,t.task_code taskCode,t.task_name taskName,t.module_type moduleType,t.status,
              t.algorithm_mode algorithmMode,t.algorithm_version algorithmVersion,t.vehicle_profile_id vehicleProfileId,
              v.profile_name vehicleProfileName,t.input_snapshot_json inputSnapshotJson,t.created_at createdAt,
              t.started_at startedAt,t.completed_at completedAt,t.created_by createdBy,t.error_message errorMessage
            FROM evaluation_task t LEFT JOIN vehicle_profile v ON v.id=t.vehicle_profile_id WHERE t.id=?
            """,id);
        result.put("heavyResultCount",jdbc.queryForObject("SELECT COUNT(*) FROM heavy_passage_result WHERE task_id=?",Long.class,id));
        result.put("regionResultCount",jdbc.queryForObject("SELECT COUNT(*) FROM region_assessment_result WHERE task_id=?",Long.class,id));
        result.put("publications",jdbc.queryForList("SELECT module_code moduleCode,published_at publishedAt FROM dashboard_publication WHERE published_task_id=?",id));
        return result;
    }

    public List<Map<String,Object>> publications(){
        return jdbc.queryForList("""
            SELECT p.module_code moduleCode,p.published_task_id publishedTaskId,p.published_at publishedAt,
              t.task_code taskCode,t.task_name taskName,t.module_type moduleType,t.completed_at completedAt
            FROM dashboard_publication p JOIN evaluation_task t ON t.id=p.published_task_id ORDER BY p.module_code
            """);
    }

    public void publish(String moduleCode,long taskId){
        moduleCode=requiredText(moduleCode,"模块编码不能为空");
        if(!List.of("HEAVY_PASSAGE","REGION_ASSESSMENT").contains(moduleCode))bad("不支持的发布模块");
        String status=jdbc.query("SELECT status FROM evaluation_task WHERE id=?",rs->rs.next()?rs.getString(1):null,taskId);
        if(status==null)notFound();
        if(!"SUCCESS".equals(status))bad("只有成功任务可以发布到首页");
        String resultTable="HEAVY_PASSAGE".equals(moduleCode)?"heavy_passage_result":"region_assessment_result";
        Long resultCount=jdbc.queryForObject("SELECT COUNT(*) FROM "+resultTable+" WHERE task_id=?",Long.class,taskId);
        if(resultCount==null||resultCount==0)bad("该任务没有对应模块的评估结果，不能发布");
        jdbc.update("""
            INSERT INTO dashboard_publication(module_code,published_task_id,published_at) VALUES(?,?,NOW())
            ON DUPLICATE KEY UPDATE published_task_id=VALUES(published_task_id),published_at=NOW()
            """,moduleCode,taskId);
    }

    public List<Map<String,Object>> notices(){
        return jdbc.queryForList("""
            SELECT n.id,n.event_time eventTime,n.region_code regionCode,r.region_name regionName,
              n.hazard_type hazardType,n.warning_level warningLevel,n.content
            FROM hazard_notice n JOIN region r ON r.region_code=n.region_code ORDER BY n.event_time DESC,n.id DESC
            """);
    }

    public long saveNotice(Long id,Map<String,Object>b){
        Object[] values={timestamp(b.get("eventTime")),required(b,"regionCode"),required(b,"hazardType"),required(b,"warningLevel"),required(b,"content")};
        if(id==null){
            KeyHolder key=new GeneratedKeyHolder();
            jdbc.update(c->{PreparedStatement ps=c.prepareStatement("INSERT INTO hazard_notice(event_time,region_code,hazard_type,warning_level,content) VALUES(?,?,?,?,?)",Statement.RETURN_GENERATED_KEYS);bind(ps,values);return ps;},key);
            return Objects.requireNonNull(key.getKey()).longValue();
        }
        if(jdbc.update("UPDATE hazard_notice SET event_time=?,region_code=?,hazard_type=?,warning_level=?,content=? WHERE id=?",append(values,id))==0)notFound();
        return id;
    }

    public void deleteNotice(long id){if(jdbc.update("DELETE FROM hazard_notice WHERE id=?",id)==0)notFound();}

    public List<Map<String,Object>> questions(){
        return jdbc.queryForList("SELECT question_code questionCode,question_text questionText,answer_text answerText,display_order displayOrder FROM assistant_qa ORDER BY display_order");
    }

    public void saveQuestion(String originalCode,Map<String,Object>b){
        String code=required(b,"questionCode");
        if(originalCode==null){
            jdbc.update("INSERT INTO assistant_qa(question_code,question_text,answer_text,display_order) VALUES(?,?,?,?)",code,required(b,"questionText"),required(b,"answerText"),integer(b.get("displayOrder")));
        }else if(jdbc.update("UPDATE assistant_qa SET question_code=?,question_text=?,answer_text=?,display_order=? WHERE question_code=?",code,required(b,"questionText"),required(b,"answerText"),integer(b.get("displayOrder")),originalCode)==0)notFound();
    }

    public void deleteQuestion(String code){if(jdbc.update("DELETE FROM assistant_qa WHERE question_code=?",code)==0)notFound();}

    private Map<String,Object> page(List<Map<String,Object>> content,int page,int size,long total){
        return Map.of("content",content,"page",page,"size",size,"totalElements",total,"totalPages",(total+size-1)/size);
    }
    private Map<String,Object> queryOne(String sql,Object...args){List<Map<String,Object>> rows=jdbc.queryForList(sql,args);if(rows.isEmpty())notFound();return new LinkedHashMap<>(rows.get(0));}
    private Map<String,Object> optionalOne(String sql,Object...args){List<Map<String,Object>> rows=jdbc.queryForList(sql,args);return rows.isEmpty()?new LinkedHashMap<>():new LinkedHashMap<>(rows.get(0));}
    private static boolean hasText(String s){return s!=null&&!s.isBlank();}
    private static String required(Map<String,Object>b,String key){return requiredText(text(b.get(key)),key+"不能为空");}
    private static String requiredText(String value,String message){if(!hasText(value))throw new ResponseStatusException(HttpStatus.BAD_REQUEST,message);return value.trim();}
    private static String text(Object v){return v==null||String.valueOf(v).isBlank()?null:String.valueOf(v).trim();}
    private static String defaultText(Object v,String fallback){String s=text(v);return s==null?fallback:s;}
    private static BigDecimal decimal(Object v){String s=text(v);return s==null?null:new BigDecimal(s);}
    private static Integer integer(Object v){String s=text(v);return s==null?null:new BigDecimal(s).intValue();}
    private static Integer integerOr(Object v,int fallback){Integer n=integer(v);return n==null?fallback:n;}
    private static Long longValue(Object v){String s=text(v);return s==null?null:new BigDecimal(s).longValue();}
    private static Boolean bool(Object v){if(v==null)return null;if(v instanceof Boolean b)return b;return "true".equalsIgnoreCase(String.valueOf(v))||"1".equals(String.valueOf(v));}
    private static Timestamp timestamp(Object v){String s=text(v);if(s==null)return null;s=s.replace('T',' ');if(s.length()==16)s+=":00";return Timestamp.valueOf(s);}
    private static java.sql.Date dateText(Object v){String s=text(v);return s==null?null:java.sql.Date.valueOf(s);}
    @SuppressWarnings("unchecked") private static Map<String,Object> map(Object v){return v instanceof Map<?,?>?(Map<String,Object>)v:new LinkedHashMap<>();}
    @SuppressWarnings("unchecked") private static List<Map<String,Object>> list(Object v){return v instanceof List<?>?(List<Map<String,Object>>)v:new ArrayList<>();}
    private String json(Object value){if(value==null)return null;if(value instanceof String s)return s;try{return objectMapper.writeValueAsString(value);}catch(JsonProcessingException e){bad("JSON参数格式错误");return null;}}
    private static Object[] append(Object[] values,Object last){Object[] result=java.util.Arrays.copyOf(values,values.length+1);result[values.length]=last;return result;}
    private static void bind(PreparedStatement ps,Object...values)throws java.sql.SQLException{for(int i=0;i<values.length;i++)ps.setObject(i+1,values[i]);}
    private static void bad(String message){throw new ResponseStatusException(HttpStatus.BAD_REQUEST,message);}
    private static void notFound(){throw new ResponseStatusException(HttpStatus.NOT_FOUND,"数据不存在");}
}
