package com.sqltutor.model;

import java.util.List;

public record TableDefinition(String name, List<ColumnDefinition> columns, List<List<String>> rows) {
    public int size() { return rows == null ? 0 : rows.size(); }
}
