package com.sqltutor.service;

import com.sqltutor.engine.SqlVisualizationEngine;
import com.sqltutor.model.ExecutionStep;
import com.sqltutor.model.VisualizeRequest;
import com.sqltutor.model.VisualizeResponse;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.util.List;

@Service
public class VisualizeService {

    private static final Logger log = LoggerFactory.getLogger(VisualizeService.class);
    private final SqlVisualizationEngine engine;

    public VisualizeService(SqlVisualizationEngine engine) {
        this.engine = engine;
    }

    public VisualizeResponse visualize(VisualizeRequest request) {
        try {
            log.info("Visualizing SQL: {}", request.sql());
            List<ExecutionStep> steps = engine.visualize(request.sql(), request.tables());
            log.info("Success: {} steps", steps.size());
            return new VisualizeResponse(steps, true, null);
        } catch (Exception e) {
            log.error("Visualization failed: {}", e.getMessage(), e);
            return new VisualizeResponse(List.of(), false, e.getMessage());
        }
    }
}
