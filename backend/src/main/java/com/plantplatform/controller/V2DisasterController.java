package com.plantplatform.controller;

import com.plantplatform.service.V2DisasterService;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.Map;

@RestController
@RequestMapping("/api/v2/disaster")
public class V2DisasterController {

    private final V2DisasterService service;

    public V2DisasterController(V2DisasterService service) {
        this.service = service;
    }

    @GetMapping("/bootstrap")
    public Map<String, Object> bootstrap() {
        return service.bootstrap();
    }

    @PostMapping("/evaluate")
    public Map<String, Object> evaluate(@RequestBody Map<String, Object> input) {
        return service.evaluate(input);
    }

    @GetMapping("/tasks/{taskId}")
    public Map<String, Object> result(@PathVariable long taskId) {
        return service.result(taskId);
    }

    @ExceptionHandler(IllegalArgumentException.class)
    public ResponseEntity<Map<String, String>> badRequest(IllegalArgumentException exception) {
        return ResponseEntity.status(HttpStatus.BAD_REQUEST).body(Map.of("message", exception.getMessage()));
    }
}
