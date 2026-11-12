package com.plantplatform.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import java.util.*;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

class HeavySimulationServiceTest {
    private final AdminService admin=mock(AdminService.class);
    private final AnalysisStore store=mock(AnalysisStore.class);
    private final Map<String,Object> asset=new LinkedHashMap<>(Map.of("id",7L,"assetName","测试桥","assetType","BRIDGE",
            "detail",Map.of("design_load_ton",100)));
    private final Map<String,Object> vehicle=Map.of("profileName","测试车辆","grossWeightTon",100,"vehicleLengthM",18,
            "vehicleWidthM",3.2,"vehicleHeightM",4.5,"axleCount",6,"plannedSpeedKmh",30);
    private HeavySimulationService service() {
        when(admin.asset(7)).thenReturn(asset); when(store.start(anyString(),anyString(),anyMap())).thenReturn(42L);
        var service=spy(new HeavySimulationService(admin,store,new ObjectMapper()));
        doReturn("BLOCKED").when(service).evaluateParameters(anyMap(),anyMap()); return service;
    }
    private Map<String,Object> saveInput(Map<String,Object> draft) {
        return new LinkedHashMap<>(Map.of("draftToken",draft.get("draftToken"),"scenarioId","scenario-test-1","vehicle",vehicle));
    }
    @Test void draftIsReadOnlyAndSavedOverrideIsIsolatedFromOfficialHeavyResults() {
        var service=service();
        var draft=service.assess(7,Map.of("vehicle",vehicle,"scenarioId","scenario-test-1"));
        assertEquals("BLOCKED",draft.get("algorithmStatus")); assertEquals(true,draft.get("simulated"));
        verifyNoInteractions(store);
        var input=saveInput(draft); input.put("overrideStatus","PASS"); input.put("overrideReason","演示人工调整");
        var saved=service.save(input);
        assertEquals("BLOCKED",saved.get("algorithmStatus")); assertEquals("PASS",saved.get("effectiveStatus"));
        assertEquals("MANUAL_SIMULATION",saved.get("source")); assertEquals(42L,saved.get("savedAssessmentId"));
        verify(store).start(eq("OTHER"),anyString(),anyMap());
        verify(store).addResult(eq(42L),eq("ASSET"),eq("HEAVY_SIMULATION"),eq("7"),eq("PASS"),isNull(),anyMap());
    }
    @Test void rejectsTamperedDraftChangedVehicleAndMissingManualReason() {
        var service=service(); var draft=service.assess(7,Map.of("vehicle",vehicle,"scenarioId","scenario-test-1"));
        var invalid=saveInput(draft); invalid.put("draftToken",draft.get("draftToken")+"bad");
        assertThrows(IllegalArgumentException.class,()->service.save(invalid));
        var changed=saveInput(draft); var newVehicle=new LinkedHashMap<>(vehicle); newVehicle.put("grossWeightTon",120); changed.put("vehicle",newVehicle);
        assertThrows(IllegalArgumentException.class,()->service.save(changed));
        var manual=saveInput(draft); manual.put("overrideStatus","PASS");
        assertThrows(IllegalArgumentException.class,()->service.save(manual)); verifyNoInteractions(store);
    }
    @Test void rejectsChangedAssetAndWrongScenario() {
        var service=service();var draft=service.assess(7,Map.of("vehicle",vehicle,"scenarioId","scenario-test-1"));
        var wrong=saveInput(draft);wrong.put("scenarioId","scenario-test-2");
        assertThrows(IllegalArgumentException.class,()->service.save(wrong));
        asset.put("detail",Map.of("design_load_ton",120));
        assertThrows(IllegalArgumentException.class,()->service.save(saveInput(draft)));verifyNoInteractions(store);
    }
    @Test void restoringSavedResultRetainsOriginalAndCreatesHistory() {
        var service=service();var draft=service.assess(7,Map.of("vehicle",vehicle,"scenarioId","scenario-test-1"));
        var manual=saveInput(draft);manual.put("overrideStatus","PASS");manual.put("overrideReason","演示调整");
        var first=service.save(manual);when(store.result(42,"OTHER")).thenReturn(first);
        var restored=service.save(Map.of("savedAssessmentId",42,"scenarioId","scenario-test-1","vehicle",vehicle));
        assertEquals("BLOCKED",restored.get("effectiveStatus"));assertEquals("RANDOM_SIMULATION",restored.get("source"));
        assertEquals(42L,restored.get("parentAssessmentId"));assertEquals("PASS",first.get("effectiveStatus"));
    }
    @Test void validatesVehicleAndRandomOutputDomain() {
        assertThrows(IllegalArgumentException.class,()->HeavySimulationService.normalizeVehicle(Map.of("axleCount",1.5)));
        var real=new HeavySimulationService(admin,store,new ObjectMapper());
        for(int i=0;i<20;i++)assertTrue(HeavySimulationService.STATUSES.contains(real.evaluateParameters(asset,vehicle)));
        verifyNoInteractions(store);
    }
    @Test void reusesOnlySavedResultsWithMatchingScenarioVehicleAndAssetVersion() {
        var service=service();
        var draft=service.assess(7,Map.of("vehicle",vehicle,"scenarioId","scenario-test-1"));
        var saved=service.save(saveInput(draft));
        when(store.result(42,"OTHER")).thenReturn(saved);
        var input=new LinkedHashMap<String,Object>(Map.of("vehicle",vehicle,"scenarioId","scenario-test-1",
                "savedAssessmentIds",List.of(42)));
        assertEquals(List.of(42L),service.validateSaved(input).get("validAssessmentIds"));
        input.put("scenarioId","scenario-test-2");
        assertEquals(List.of(),service.validateSaved(input).get("validAssessmentIds"));
        input.put("scenarioId","scenario-test-1");
        var changedVehicle=new LinkedHashMap<>(vehicle);changedVehicle.put("grossWeightTon",120);
        input.put("vehicle",changedVehicle);
        assertEquals(List.of(),service.validateSaved(input).get("validAssessmentIds"));
        input.put("vehicle",vehicle);asset.put("detail",Map.of("design_load_ton",120));
        assertEquals(List.of(),service.validateSaved(input).get("validAssessmentIds"));
    }
}
