package com.plantplatform.controller;

import com.plantplatform.service.DisasterService;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

@RestController
@RequestMapping("/api/disaster")
public class DisasterController {
    private final DisasterService service;
    public DisasterController(DisasterService service){this.service=service;}
    @GetMapping("/bootstrap") public Map<String,Object> bootstrap(){return service.bootstrap();}
    @PostMapping("/evaluate") public Map<String,Object> evaluate(@RequestBody Map<String,Object> input){return service.evaluate(input);}
    @GetMapping("/tasks/{id}") public Map<String,Object> result(@PathVariable long id){return service.result(id);}
    @ExceptionHandler(IllegalArgumentException.class)
    public ResponseEntity<Map<String,String>> badRequest(IllegalArgumentException e){return ResponseEntity.status(HttpStatus.BAD_REQUEST).body(Map.of("message",e.getMessage()));}
}
