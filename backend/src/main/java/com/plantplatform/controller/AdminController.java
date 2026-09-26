package com.plantplatform.controller;

import com.plantplatform.service.AdminService;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

/** 基础数据只读；桥隧设施与分析任务提供管理入口。 */
@RestController
@RequestMapping("/api/admin")
public class AdminController {
    private final AdminService service;

    public AdminController(AdminService service) { this.service = service; }

    @GetMapping("/summary") public Map<String,Object> summary(){return service.summary();}
    @GetMapping("/regions") public Object regions(){return service.regions();}
    @GetMapping("/road-nodes")
    public Object roadNodes(@RequestParam(defaultValue="0") int page,
                            @RequestParam(defaultValue="20") int size,
                            @RequestParam(required=false) String q){
        return service.roadNodes(Math.max(0,page),Math.min(Math.max(size,1),100),q);
    }
    @GetMapping("/roads")
    public Object roads(@RequestParam(defaultValue="0") int page,
                        @RequestParam(defaultValue="20") int size,
                        @RequestParam(required=false) String q){
        return service.roads(Math.max(0,page),Math.min(Math.max(size,1),100),q);
    }
    @GetMapping("/roads/{id}") public Object road(@PathVariable long id){return service.road(id);}
    @GetMapping("/road-options")
    public Object roadOptions(@RequestParam(required=false) String q,
                              @RequestParam(defaultValue="30") int limit){
        return service.roadOptions(q,Math.min(Math.max(limit,1),100));
    }
    @GetMapping("/assets")
    public Object assets(@RequestParam(defaultValue="0") int page,
                         @RequestParam(defaultValue="20") int size,
                         @RequestParam(required=false) String q,
                         @RequestParam(required=false) String type){
        return service.assets(Math.max(0,page),Math.min(Math.max(size,1),100),q,type);
    }
    @GetMapping("/assets/{id}") public Object asset(@PathVariable long id){return service.asset(id);}
    @PostMapping("/assets") public Object createAsset(@RequestBody Map<String,Object> body){return Map.of("id",service.saveAsset(null,body));}
    @PutMapping("/assets/{id}") public Object updateAsset(@PathVariable long id,@RequestBody Map<String,Object> body){return Map.of("id",service.saveAsset(id,body));}
    @PutMapping("/assets/{id}/status") public Object updateAssetStatus(@PathVariable long id,@RequestBody Map<String,Object> body){service.updateAssetStatus(id,body.get("serviceStatus"));return Map.of("success",true);}
    @DeleteMapping("/assets/{id}") public Object deleteAsset(@PathVariable long id){service.deleteAsset(id);return Map.of("success",true);}

    @GetMapping("/analysis-tasks")
    public Object analysisTasks(@RequestParam(defaultValue="0") int page,
                                @RequestParam(defaultValue="20") int size,
                                @RequestParam(required=false) String q,
                                @RequestParam(required=false) String type){
        return service.analysisTasks(Math.max(0,page),Math.min(Math.max(size,1),100),q,type);
    }
    @GetMapping("/analysis-tasks/{id}")
    public Object analysisTask(@PathVariable long id,
                               @RequestParam(defaultValue="0") int page,
                               @RequestParam(defaultValue="50") int size){
        return service.analysisTask(id,Math.max(0,page),Math.min(Math.max(size,1),100));
    }
    @DeleteMapping("/analysis-tasks/{id}")
    public Object deleteAnalysisTask(@PathVariable long id){service.deleteAnalysisTask(id);return Map.of("success",true);}

    @ExceptionHandler(DataIntegrityViolationException.class)
    public ResponseEntity<Map<String,String>> dataConflict(DataIntegrityViolationException exception){
        return ResponseEntity.status(HttpStatus.CONFLICT).body(Map.of("message","数据冲突，请检查设施编号、行政区编码和道路绑定。"));
    }
}
