package com.plantplatform.controller;

import com.plantplatform.service.HeavyService;
import com.plantplatform.service.RoadPlanService;
import com.plantplatform.service.HeavySimulationService;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

@RestController
@RequestMapping("/api/heavy")
public class HeavyController {
    private final HeavyService service;
    private final RoadPlanService planner;
    private final HeavySimulationService simulation;
    public HeavyController(HeavyService service, RoadPlanService planner, HeavySimulationService simulation) {
        this.service = service; this.planner = planner; this.simulation = simulation;
    }
    @GetMapping("/assets/{id}/context") public Map<String,Object> context(@PathVariable long id) { return simulation.context(id); }
    @PostMapping("/assets/{id}/assess") public Map<String,Object> assess(@PathVariable long id, @RequestBody Map<String,Object> input) { return simulation.assess(id,input); }
    @PostMapping("/assessment-saves") public Map<String,Object> saveAssessment(@RequestBody Map<String,Object> input) { return simulation.save(input); }
    @PostMapping("/assessment-validations") public Map<String,Object> validateAssessments(@RequestBody Map<String,Object> input) { return simulation.validateSaved(input); }
    @PostMapping("/plan") public Map<String,Object> plan(@RequestBody Map<String,Object> input) { return planner.plan(input); }
    @PostMapping("/evaluate") public Map<String,Object> evaluate(@RequestBody Map<String,Object> input) { return service.evaluate(input); }
    @GetMapping("/tasks/{id}") public Map<String,Object> result(@PathVariable long id) { return service.result(id); }
    @ExceptionHandler(IllegalArgumentException.class)
    public ResponseEntity<Map<String,String>> badRequest(IllegalArgumentException e) {
        return ResponseEntity.status(HttpStatus.BAD_REQUEST).body(Map.of("message", e.getMessage()));
    }
    @ExceptionHandler(IllegalStateException.class)
    public ResponseEntity<Map<String,String>> unavailable(IllegalStateException e) {
        return ResponseEntity.status(HttpStatus.SERVICE_UNAVAILABLE).body(Map.of("message", e.getMessage()));
    }
}
