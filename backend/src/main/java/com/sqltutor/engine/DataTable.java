package com.sqltutor.engine;

import com.sqltutor.model.TableDefinition;

import java.util.*;

/**
 * In-memory row representation used throughout the visualization pipeline.
 */
public class DataTable {
    private final List<String> columnNames;
    private final List<Map<String, String>> rows;

    public DataTable(List<String> columnNames, List<Map<String, String>> rows) {
        this.columnNames = new ArrayList<>(columnNames);
        this.rows = new ArrayList<>(rows);
    }

    public static DataTable fromDefinition(TableDefinition table) {
        List<String> cols = table.columns().stream().map(c -> c.name()).toList();
        List<Map<String, String>> rows = new ArrayList<>();
        for (List<String> row : table.rows()) {
            Map<String, String> map = new LinkedHashMap<>();
            for (int i = 0; i < cols.size(); i++) {
                map.put(cols.get(i), i < row.size() ? nullToEmpty(row.get(i)) : "");
            }
            rows.add(map);
        }
        return new DataTable(cols, rows);
    }

    public static DataTable copy(DataTable source) {
        List<Map<String, String>> copied = new ArrayList<>();
        for (Map<String, String> row : source.rows) {
            copied.add(new LinkedHashMap<>(row));
        }
        return new DataTable(source.columnNames, copied);
    }

    private static String nullToEmpty(String v) {
        return v == null ? "" : v;
    }

    public List<String> getColumnNames() {
        return columnNames;
    }

    public List<Map<String, String>> getRows() {
        return rows;
    }

    public int rowCount() {
        return rows.size();
    }

    public List<List<String>> toGrid() {
        List<List<String>> grid = new ArrayList<>();
        for (Map<String, String> row : rows) {
            List<String> line = new ArrayList<>();
            for (String col : columnNames) {
                line.add(row.getOrDefault(col, ""));
            }
            grid.add(line);
        }
        return grid;
    }

    public DataTable withColumns(List<String> newColumns, List<Map<String, String>> newRows) {
        return new DataTable(newColumns, newRows);
    }
}
