import com.sqltutor.engine.SqlVisualizationEngine;
import com.sqltutor.model.TableDefinition;
import com.sqltutor.model.ColumnDefinition;
import java.util.List;

public class Repro {
    public static void main(String[] args) {
        var engine = new SqlVisualizationEngine();
        var employees = new TableDefinition(
            "employees",
            List.of(new ColumnDefinition("id", "INTEGER"), new ColumnDefinition("name", "TEXT")),
            List.of(List.of("1", "Alice"), List.of("2", "Bob"))
        );
        var departments = new TableDefinition(
            "departments",
            List.of(new ColumnDefinition("id", "INTEGER"), new ColumnDefinition("name", "TEXT")),
            List.of(List.of("10", "Engineering"), List.of("20", "Sales"), List.of("30", "Marketing"))
        );
        var steps = engine.visualize(
            "SELECT e.name, d.name FROM employees e CROSS JOIN departments d",
            List.of(employees, departments)
        );
        System.out.println("steps=" + steps.size());
        for (var step : steps) {
            System.out.println(step.clause() + ": " + step.rowCount() + " cols=" + step.columnNames());
        }
    }
}
