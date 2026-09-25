package com.plantplatform.controller;

import com.plantplatform.service.AdminService;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

/** 仅管理稳定的基础数据，不暴露尚未定型的业务配置表。 */
@RestController
@RequestMapping("/api/admin")
public class AdminController {
    private final AdminService service;

    public AdminController(AdminService service) { this.service = service; }

    @GetMapping("/summary") public Map<String,Object> summary(){return service.summary();}
    @GetMapping("/regions") public Object regions(){return service.regions();}
    @GetMapping("/roads")
    public Object roads(@RequestParam(defaultValue="0") int page,
                        @RequestParam(defaultValue="20") int size,
                        @RequestParam(required=false) String q){
        return service.roads(Math.max(0,page),Math.min(Math.max(size,1),100),q);
    }
    @GetMapping("/roads/{id}") public Object road(@PathVariable long id){return service.road(id);}
    @GetMapping("/assets")
    public Object assets(@RequestParam(defaultValue="0") int page,
                         @RequestParam(defaultValue="20") int size,
                         @RequestParam(required=false) String q){
        return service.assets(Math.max(0,page),Math.min(Math.max(size,1),100),q);
    }
    @GetMapping("/assets/{id}") public Object asset(@PathVariable long id){return service.asset(id);}
    @PostMapping("/assets") public Object createAsset(@RequestBody Map<String,Object> body){return Map.of("id",service.saveAsset(null,body));}
    @PutMapping("/assets/{id}") public Object updateAsset(@PathVariable long id,@RequestBody Map<String,Object> body){return Map.of("id",service.saveAsset(id,body));}
    @DeleteMapping("/assets/{id}") public Object closeAsset(@PathVariable long id){service.closeAsset(id);return Map.of("success",true);}

    @ExceptionHandler(DataIntegrityViolationException.class)
    public ResponseEntity<Map<String,String>> dataConflict(DataIntegrityViolationException exception){
        return ResponseEntity.status(HttpStatus.CONFLICT).body(Map.of("message","数据冲突，请检查设施编号、行政区编码和道路绑定。"));
    }
}
