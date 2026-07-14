package com.sqltutor.engine;

import com.sqltutor.model.ColumnDefinition;
import com.sqltutor.model.ExecutionStep;
import com.sqltutor.model.TableDefinition;
import org.junit.jupiter.api.Test;

import java.util.List;

import static org.junit.jupiter.api.Assertions.*;

public class SqlVisualizationEngineCrossJoinTest {

  @Test
  public void crossJoinProducesCartesianProduct() {
    var engine = new SqlVisualizationEngine();

    var employees = new TableDefinition(
        "employees",
        List.of(new ColumnDefinition("id", "INTEGER"), new ColumnDefinition("name", "TEXT")),
        List.of(List.of("1", "Alice"), List.of("2", "Bob")));

    var departments = new TableDefinition(
        "departments",
        List.of(new ColumnDefinition("id", "INTEGER"), new ColumnDefinition("name", "TEXT")),
        List.of(List.of("10", "Engineering"), List.of("20", "Sales"), List.of("30", "Marketing")));

    String sql = "SELECT e.name, d.name AS department\nFROM employees e\nCROSS JOIN departments d";

    List<ExecutionStep> steps = engine.visualize(sql, List.of(employees, departments));

    ExecutionStep joinStep = steps.stream()
        .filter(s -> s.clause().equalsIgnoreCase("CROSS JOIN"))
        .findFirst()
        .orElse(null);

    assertNotNull(joinStep, "CROSS JOIN step should exist");
    assertEquals(6, joinStep.rowCount(), "Expected 2*3 rows");
    assertNotNull(joinStep.joinMeta(), "Join metadata should be present");
    assertNull(joinStep.joinMeta().condition(), "CROSS JOIN should have no ON condition");
    assertTrue(joinStep.joinMeta().joinKeys().isEmpty(), "CROSS JOIN should not have join keys");
  }

  @Test
  public void qualifiedSelectColumnsPreserveBothNames() {
    var engine = new SqlVisualizationEngine();

    var employees = new TableDefinition(
        "employees",
        List.of(new ColumnDefinition("id", "INTEGER"), new ColumnDefinition("name", "TEXT")),
        List.of(List.of("1", "Alice"), List.of("2", "Bob")));

    var departments = new TableDefinition(
        "departments",
        List.of(new ColumnDefinition("id", "INTEGER"), new ColumnDefinition("name", "TEXT")),
        List.of(List.of("10", "Engineering"), List.of("20", "Sales"), List.of("30", "Marketing")));

    String sql = "SELECT e.name, d.name FROM employees e CROSS JOIN departments d";

    List<ExecutionStep> steps = engine.visualize(sql, List.of(employees, departments));

    ExecutionStep selectStep = steps.stream()
        .filter(s -> s.clause().equalsIgnoreCase("SELECT"))
        .findFirst()
        .orElse(null);

    assertNotNull(selectStep, "SELECT step should exist");
    assertEquals(6, selectStep.rowCount(), "SELECT should produce 6 rows from the cartesian product");
    assertEquals(List.of("e.name", "d.name"), selectStep.columns());
  }
}
