package com.sqltutor.controller;

import com.sqltutor.model.VisualizeRequest;
import com.sqltutor.model.VisualizeResponse;
import com.sqltutor.service.VisualizeService;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api")
public class VisualizeController {

    private final VisualizeService visualizeService;

    public VisualizeController(VisualizeService visualizeService) {
        this.visualizeService = visualizeService;
    }

    @PostMapping("/visualize")
    public VisualizeResponse visualize(@RequestBody VisualizeRequest request) {
        return visualizeService.visualize(request);
    }

    @GetMapping("/health")
    public String health() {
        return "OK";
    }
}
