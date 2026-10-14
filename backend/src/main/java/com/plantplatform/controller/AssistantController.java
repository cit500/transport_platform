package com.plantplatform.controller;

import com.plantplatform.service.AssistantService;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

/** 数字人助手对话接口；大模型不可用时返回 502 与明确原因，前端自动回退预置问答。 */
@RestController
@RequestMapping("/api/assistant")
public class AssistantController {
    private final AssistantService service;

    public AssistantController(AssistantService service) { this.service = service; }

    @PostMapping("/chat")
    public Map<String,Object> chat(@RequestBody Map<String,Object> body) throws Exception {
        String question = body.get("question") == null ? "" : String.valueOf(body.get("question")).trim();
        if (question.isEmpty()) throw new IllegalArgumentException("问题不能为空");
        @SuppressWarnings("unchecked")
        List<Map<String,Object>> history = (List<Map<String,Object>>) body.getOrDefault("history", List.of());
        return Map.of("answer", service.chat(question, history), "model", service.model());
    }

    @ExceptionHandler(Exception.class)
    public ResponseEntity<Map<String,String>> assistantFailure(Exception exception) {
        String message = exception.getMessage() == null ? "助手服务暂时不可用" : exception.getMessage();
        return ResponseEntity.status(HttpStatus.BAD_GATEWAY).body(Map.of("message", message));
    }
}
