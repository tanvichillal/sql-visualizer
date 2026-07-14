package com.sqltutor.model;

import java.util.List;

public record VisualizeResponse(
        List<ExecutionStep> steps,
        boolean success,
        String error
) {}
