package com.plantplatform.controller;

import com.plantplatform.service.V2AdminService;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.Map;

@RestController
@RequestMapping("/api/v2/admin")
public class V2AdminController {

    private final V2AdminService service;

    public V2AdminController(V2AdminService service) {
        this.service = service;
    }

    @GetMapping("/summary") public Map<String,Object> summary(){return service.summary();}
    @GetMapping("/regions") public Object regions(){return service.regions();}

    @GetMapping("/roads")
    public Object roads(@RequestParam(defaultValue="0")int page,@RequestParam(defaultValue="20")int size,
                        @RequestParam(required=false)String q,@RequestParam(required=false)String regionCode,
                        @RequestParam(required=false)String roadClass,@RequestParam(required=false)Boolean bridgeFlag,
                        @RequestParam(required=false)Boolean tunnelFlag){
        return service.roads(Math.max(0,page),Math.min(Math.max(size,1),100),q,regionCode,roadClass,bridgeFlag,tunnelFlag);
    }
    @GetMapping("/roads/{id}") public Object road(@PathVariable long id){return service.road(id);}

    @GetMapping("/assets")
    public Object assets(@RequestParam(defaultValue="0")int page,@RequestParam(defaultValue="20")int size,
                         @RequestParam(required=false)String q,@RequestParam(required=false)String regionCode,
                         @RequestParam(required=false)String assetType,@RequestParam(required=false)String serviceStatus,
                         @RequestParam(required=false)Boolean bound){
        return service.assets(Math.max(0,page),Math.min(Math.max(size,1),100),q,regionCode,assetType,serviceStatus,bound);
    }
    @GetMapping("/assets/{id}") public Object asset(@PathVariable long id){return service.asset(id);}
    @PostMapping("/assets") public Object createAsset(@RequestBody Map<String,Object> body){return Map.of("id",service.saveAsset(null,body));}
    @PutMapping("/assets/{id}") public Object updateAsset(@PathVariable long id,@RequestBody Map<String,Object> body){return Map.of("id",service.saveAsset(id,body));}
    @DeleteMapping("/assets/{id}") public Object closeAsset(@PathVariable long id){service.closeAsset(id);return Map.of("success",true);}

    @GetMapping("/vehicles") public Object vehicles(){return service.vehicles();}
    @PostMapping("/vehicles") public Object createVehicle(@RequestBody Map<String,Object> body){return Map.of("id",service.saveVehicle(null,body));}
    @PutMapping("/vehicles/{id}") public Object updateVehicle(@PathVariable long id,@RequestBody Map<String,Object> body){return Map.of("id",service.saveVehicle(id,body));}
    @PutMapping("/vehicles/{id}/default") public Object defaultVehicle(@PathVariable long id){service.setDefaultVehicle(id);return Map.of("success",true);}
    @DeleteMapping("/vehicles/{id}") public Object deleteVehicle(@PathVariable long id){service.deleteVehicle(id);return Map.of("success",true);}

    @GetMapping("/scenarios/earthquake") public Object earthquakes(){return service.earthquakeScenarios();}
    @PostMapping("/scenarios/earthquake") public Object createEarthquake(@RequestBody Map<String,Object>b){return Map.of("id",service.saveEarthquake(null,b));}
    @PutMapping("/scenarios/earthquake/{id}") public Object updateEarthquake(@PathVariable long id,@RequestBody Map<String,Object>b){return Map.of("id",service.saveEarthquake(id,b));}
    @GetMapping("/scenarios/debris") public Object debris(){return service.debrisScenarios();}
    @PostMapping("/scenarios/debris") public Object createDebris(@RequestBody Map<String,Object>b){return Map.of("id",service.saveDebris(null,b));}
    @PutMapping("/scenarios/debris/{id}") public Object updateDebris(@PathVariable long id,@RequestBody Map<String,Object>b){return Map.of("id",service.saveDebris(id,b));}
    @PutMapping("/scenarios/{type}/{id}/default") public Object defaultScenario(@PathVariable String type,@PathVariable long id){service.setDefaultScenario(type,id);return Map.of("success",true);}
    @DeleteMapping("/scenarios/{type}/{id}") public Object deleteScenario(@PathVariable String type,@PathVariable long id){service.deleteScenario(type,id);return Map.of("success",true);}

    @GetMapping("/tasks") public Object tasks(@RequestParam(defaultValue="0")int page,@RequestParam(defaultValue="20")int size,
        @RequestParam(required=false)String moduleType,@RequestParam(required=false)String status,@RequestParam(required=false)String q){
        return service.tasks(Math.max(0,page),Math.min(Math.max(size,1),100),moduleType,status,q);
    }
    @GetMapping("/tasks/{id}") public Object task(@PathVariable long id){return service.task(id);}
    @GetMapping("/publications") public Object publications(){return service.publications();}
    @PutMapping("/publications/{moduleCode}") public Object publish(@PathVariable String moduleCode,@RequestBody Map<String,Object>b){
        service.publish(moduleCode,Long.parseLong(String.valueOf(b.get("taskId"))));return Map.of("success",true);
    }

    @GetMapping("/notices") public Object notices(){return service.notices();}
    @PostMapping("/notices") public Object createNotice(@RequestBody Map<String,Object>b){return Map.of("id",service.saveNotice(null,b));}
    @PutMapping("/notices/{id}") public Object updateNotice(@PathVariable long id,@RequestBody Map<String,Object>b){return Map.of("id",service.saveNotice(id,b));}
    @DeleteMapping("/notices/{id}") public Object deleteNotice(@PathVariable long id){service.deleteNotice(id);return Map.of("success",true);}

    @GetMapping("/questions") public Object questions(){return service.questions();}
    @PostMapping("/questions") public Object createQuestion(@RequestBody Map<String,Object>b){service.saveQuestion(null,b);return Map.of("success",true);}
    @PutMapping("/questions/{code}") public Object updateQuestion(@PathVariable String code,@RequestBody Map<String,Object>b){service.saveQuestion(code,b);return Map.of("success",true);}
    @DeleteMapping("/questions/{code}") public Object deleteQuestion(@PathVariable String code){service.deleteQuestion(code);return Map.of("success",true);}

    @ExceptionHandler(DataIntegrityViolationException.class)
    public ResponseEntity<Map<String,String>> dataConflict(DataIntegrityViolationException exception){
        return ResponseEntity.status(HttpStatus.CONFLICT).body(Map.of(
            "message","数据与已有记录冲突，或仍被历史任务引用，请检查唯一编号、默认顺序和关联关系。"));
    }
}
