package com.sqltutor.model;

import java.util.List;

public record VisualizeRequest(
        String problemStatement,
        List<TableDefinition> tables,
        String sql
) {}
