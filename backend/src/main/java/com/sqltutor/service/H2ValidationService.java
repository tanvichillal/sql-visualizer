package com.sqltutor.service;

import com.sqltutor.model.ColumnDefinition;
import com.sqltutor.model.TableDefinition;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;

import java.util.List;

/**
 * Loads user-defined tables into H2 for query validation against a real SQL engine.
 */
@Service
public class H2ValidationService {

    private final JdbcTemplate jdbc;

    public H2ValidationService(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    public void loadTables(List<TableDefinition> tables) {
        jdbc.execute("DROP ALL OBJECTS");
        for (TableDefinition table : tables) {
            createTable(table);
            insertRows(table);
        }
    }

    public List<List<String>> executeQuery(String sql, List<String> columnNames) {
        return jdbc.query(sql, (rs, rowNum) -> {
            List<String> row = new java.util.ArrayList<>();
            for (String col : columnNames) {
                row.add(rs.getString(col));
            }
            return row;
        });
    }

    private void createTable(TableDefinition table) {
        StringBuilder ddl = new StringBuilder("CREATE TABLE ")
                .append(quote(table.name()))
                .append(" (");
        for (int i = 0; i < table.columns().size(); i++) {
            if (i > 0) {
                ddl.append(", ");
            }
            ColumnDefinition col = table.columns().get(i);
            ddl.append(quote(col.name())).append(" ").append(mapType(col.type()));
        }
        ddl.append(")");
        jdbc.execute(ddl.toString());
    }

    private void insertRows(TableDefinition table) {
        if (table.rows().isEmpty()) {
            return;
        }
        List<String> colNames = table.columns().stream().map(ColumnDefinition::name).toList();
        String placeholders = String.join(", ", colNames.stream().map(c -> "?").toList());
        String cols = String.join(", ", colNames.stream().map(this::quote).toList());
        String sql = "INSERT INTO " + quote(table.name()) + " (" + cols + ") VALUES (" + placeholders + ")";

        for (List<String> row : table.rows()) {
            jdbc.update(sql, ps -> {
                for (int i = 0; i < colNames.size(); i++) {
                    String val = i < row.size() ? row.get(i) : null;
                    if (val == null || val.isBlank()) {
                        ps.setObject(i + 1, null);
                    } else {
                        ps.setString(i + 1, val);
                    }
                }
            });
        }
    }

    private String mapType(String type) {
        if (type == null) {
            return "VARCHAR(255)";
        }
        return switch (type.toUpperCase()) {
            case "INTEGER", "INT" -> "INT";
            case "DECIMAL", "FLOAT", "DOUBLE", "NUMBER" -> "DOUBLE";
            case "BOOLEAN", "BOOL" -> "BOOLEAN";
            default -> "VARCHAR(255)";
        };
    }

    private String quote(String identifier) {
        return "\"" + identifier.replace("\"", "\"\"") + "\"";
    }
}
