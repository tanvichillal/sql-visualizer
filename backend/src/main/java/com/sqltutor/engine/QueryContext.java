package com.sqltutor.engine;

import com.sqltutor.model.TableDefinition;

import java.util.Map;

/**
 * Carries the table catalog and (optionally) the current outer row so that
 * subqueries — including correlated subqueries that reference the outer
 * query's columns — can be evaluated recursively.
 */
public class QueryContext {
    private final Map<String, TableDefinition> tableMap;
    private final Map<String, String> outerRow; // null when not inside a correlated subquery

    public QueryContext(Map<String, TableDefinition> tableMap, Map<String, String> outerRow) {
        this.tableMap = tableMap;
        this.outerRow = outerRow;
    }

    public Map<String, TableDefinition> getTableMap() {
        return tableMap;
    }

    public Map<String, String> getOuterRow() {
        return outerRow;
    }

    public QueryContext withOuterRow(Map<String, String> row) {
        return new QueryContext(tableMap, row);
    }
}
