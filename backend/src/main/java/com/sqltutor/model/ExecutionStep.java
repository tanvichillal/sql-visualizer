package com.sqltutor.model;

import java.util.List;

public record ExecutionStep(
        int stepNumber,
        String clause,
        String title,
        String explanation,
        String sqlFragment,
        List<String> columns,
        List<List<String>> rows,
        int rowCount,
        JoinMeta joinMeta
) {
    /** Convenience constructor for non-JOIN steps (joinMeta = null). */
    public ExecutionStep(int stepNumber, String clause, String title, String explanation,
                         String sqlFragment, List<String> columns, List<List<String>> rows, int rowCount) {
        this(stepNumber, clause, title, explanation, sqlFragment, columns, rows, rowCount, null);
    }
}
