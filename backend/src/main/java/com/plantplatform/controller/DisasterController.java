package com.plantplatform.controller;

import com.plantplatform.service.DisasterService;
import com.plantplatform.service.DebrisFlowService;
import com.plantplatform.service.GroundMotionParser;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.LinkedHashMap;
import java.util.Map;

@RestController
@RequestMapping("/api/disaster")
public class DisasterController {

    private final DisasterService service;
    private final DebrisFlowService debris;

    public DisasterController(DisasterService service, DebrisFlowService debris) {
        this.service = service;
        this.debris = debris;
    }

    @GetMapping("/bootstrap")
    public Map<String,Object> bootstrap() { return service.bootstrap(); }

    @PostMapping("/evaluate")
    public Map<String,Object> evaluate(@RequestBody Map<String,Object> input) { return service.evaluate(input); }

    /** 保存评估结果（评估本身不落库，唯一持久化入口）。 */
    @PostMapping("/save")
    public Map<String,Object> save(@RequestBody Map<String,Object> body) { return service.save(body); }

    @GetMapping("/tasks/{id}")
    public Map<String,Object> result(@PathVariable long id) { return service.result(id); }

    /** 易损性曲线采样，供前端绘图。 */
    @GetMapping("/models/{id}/curves")
    public Map<String,Object> curves(@PathVariable long id,
                                     @RequestParam(defaultValue = "401") int points) {
        return service.curves(id, points);
    }

    /**
     * 泥石流环境参数：由大模型按固定 JSON 结构给出降雨、地形与物源条件。
     * 模型不可用或解析失败时返回 FALLBACK 与默认参数，并在 message 中说明原因。
     */
    @PostMapping("/debris-context")
    public Map<String,Object> debrisContext(@RequestBody(required = false) Map<String,Object> body) {
        Map<String,Object> input = body == null ? Map.of() : body;
        String regionName = input.get("regionName") == null ? null : String.valueOf(input.get("regionName"));
        Double longitude = input.get("longitude") == null ? null : toDouble(input.get("longitude"));
        Double latitude = input.get("latitude") == null ? null : toDouble(input.get("latitude"));
        int hours = input.get("hours") == null ? 6 : (int) Math.round(toDouble(input.get("hours")));
        return debris.context(regionName, longitude, latitude, hours);
    }

    /** 地震动记录解析：返回 PGA、持时与解析告警，不落库。 */
    @PostMapping("/parse-ground-motion")
    public Map<String,Object> parseGroundMotion(@RequestBody Map<String,Object> body) {
        String filename = String.valueOf(body.getOrDefault("filename", "record.txt"));
        String content = String.valueOf(body.getOrDefault("content", ""));
        String unit = body.get("unit") == null ? null : String.valueOf(body.get("unit"));
        Double dt = body.get("dt") == null ? null : toDouble(body.get("dt"));
        GroundMotionParser.GroundMotion parsed = GroundMotionParser.parse(content, filename, unit, dt);
        Map<String,Object> out = new LinkedHashMap<>();
        out.put("filename", parsed.filename());
        out.put("format", parsed.format());
        out.put("npts", parsed.npts());
        out.put("dt", parsed.dt());
        out.put("durationS", parsed.durationS());
        out.put("pgaG", parsed.pgaG());
        out.put("unit", parsed.unitOriginal());
        out.put("warnings", parsed.warnings());
        return out;
    }

    private static double toDouble(Object v) {
        try { return Double.parseDouble(String.valueOf(v)); } catch (Exception e) { return Double.NaN; }
    }

    @ExceptionHandler(IllegalArgumentException.class)
    public ResponseEntity<Map<String,String>> badRequest(IllegalArgumentException e) {
        return ResponseEntity.status(HttpStatus.BAD_REQUEST).body(Map.of("message", e.getMessage()));
    }

    @ExceptionHandler(IllegalStateException.class)
    public ResponseEntity<Map<String,String>> conflict(IllegalStateException e) {
        return ResponseEntity.status(HttpStatus.BAD_REQUEST).body(Map.of("message", e.getMessage()));
    }
}
