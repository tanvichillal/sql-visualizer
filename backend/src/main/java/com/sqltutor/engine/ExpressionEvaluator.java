package com.sqltutor.engine;
import net.sf.jsqlparser.expression.*;
import net.sf.jsqlparser.expression.operators.arithmetic.*;
import net.sf.jsqlparser.expression.operators.conditional.AndExpression;
import net.sf.jsqlparser.expression.operators.conditional.OrExpression;
import net.sf.jsqlparser.expression.operators.relational.*;
import net.sf.jsqlparser.schema.Column;
import net.sf.jsqlparser.statement.select.ParenthesedSelect;
import net.sf.jsqlparser.statement.select.PlainSelect;
import net.sf.jsqlparser.statement.select.SelectItem;

import java.util.*;
import java.util.regex.Pattern;
import java.util.stream.Collectors;

/**
 * Evaluates SQL expressions against a single row context.
 */
public class ExpressionEvaluator {

    // Reference back to the engine so subqueries can be executed recursively,
    // and the current query context (table catalog + outer row for correlation).
    private SqlVisualizationEngine engine;
    private QueryContext queryContext;

    public void setEngine(SqlVisualizationEngine engine) {
        this.engine = engine;
    }

    public QueryContext getQueryContext() {
        return queryContext;
    }

    public void setQueryContext(QueryContext ctx) {
        this.queryContext = ctx;
    }

    /** Runs a subquery (correlated or not) and returns its result rows. */
    private DataTable runSubquery(PlainSelect subSelect) {
        if (engine == null || queryContext == null) {
            return new DataTable(List.of(), List.of());
        }
        return engine.runSubquery(subSelect, queryContext.getTableMap(), queryContext.getOuterRow());
    }

    /** Extracts the nested PlainSelect from a ParenthesedSelect subquery wrapper. */
    private PlainSelect extractSubSelect(Expression expr) {
        if (expr instanceof ParenthesedSelect ps && ps.getPlainSelect() != null) {
            return ps.getPlainSelect();
        }
        return null;
    }

    public boolean evaluate(Expression expr, Map<String, String> row) {
        if (expr == null) {
            return true;
        }
        if (expr instanceof AndExpression and) {
            return evaluate(and.getLeftExpression(), row) && evaluate(and.getRightExpression(), row);
        }
        if (expr instanceof OrExpression or) {
            return evaluate(or.getLeftExpression(), row) || evaluate(or.getRightExpression(), row);
        }
        @SuppressWarnings("deprecation")
        boolean isParens = expr instanceof Parenthesis;
        if (isParens) {
            return evaluate(((Parenthesis) expr).getExpression(), row);
        }
        if (expr instanceof NotExpression not) {
            return !evaluate(not.getExpression(), row);
        }
        if (expr instanceof EqualsTo eq) {
            // Check for ANY/ALL subquery on right side: val = ANY(SELECT ...)
            if (eq.getRightExpression() instanceof AnyComparisonExpression ace) {
                return evaluateAnyAll(eq.getLeftExpression(), "=", ace, row);
            }
            return compare(eq.getLeftExpression(), eq.getRightExpression(), row) == 0;
        }
        if (expr instanceof NotEqualsTo neq) {
            if (neq.getRightExpression() instanceof AnyComparisonExpression ace) {
                return evaluateAnyAll(neq.getLeftExpression(), "!=", ace, row);
            }
            return compare(neq.getLeftExpression(), neq.getRightExpression(), row) != 0;
        }
        if (expr instanceof GreaterThan gt) {
            if (gt.getRightExpression() instanceof AnyComparisonExpression ace) {
                return evaluateAnyAll(gt.getLeftExpression(), ">", ace, row);
            }
            return compare(gt.getLeftExpression(), gt.getRightExpression(), row) > 0;
        }
        if (expr instanceof GreaterThanEquals gte) {
            if (gte.getRightExpression() instanceof AnyComparisonExpression ace) {
                return evaluateAnyAll(gte.getLeftExpression(), ">=", ace, row);
            }
            return compare(gte.getLeftExpression(), gte.getRightExpression(), row) >= 0;
        }
        if (expr instanceof MinorThan lt) {
            if (lt.getRightExpression() instanceof AnyComparisonExpression ace) {
                return evaluateAnyAll(lt.getLeftExpression(), "<", ace, row);
            }
            return compare(lt.getLeftExpression(), lt.getRightExpression(), row) < 0;
        }
        if (expr instanceof MinorThanEquals lte) {
            if (lte.getRightExpression() instanceof AnyComparisonExpression ace) {
                return evaluateAnyAll(lte.getLeftExpression(), "<=", ace, row);
            }
            return compare(lte.getLeftExpression(), lte.getRightExpression(), row) <= 0;
        }
        if (expr instanceof LikeExpression like) {
            String left = resolveValue(like.getLeftExpression(), row);
            String right = resolveValue(like.getRightExpression(), row);
            if (right == null) {
                return false;
            }
            // Escape regex metacharacters in literal parts before substituting wildcards
            String escaped = right
                .replace("\\", "\\\\")
                .replace(".", "\\.")
                .replace("(", "\\(").replace(")", "\\)")
                .replace("[", "\\[").replace("]", "\\]")
                .replace("{", "\\{").replace("}", "\\}")
                .replace("+", "\\+").replace("?", "\\?")
                .replace("^", "\\^").replace("$", "\\$")
                .replace("|", "\\|");
            String pattern = escaped.replace("%", ".*").replace("_", ".");
            boolean matches = Pattern.compile("^" + pattern + "$", Pattern.CASE_INSENSITIVE).matcher(left == null ? "" : left).matches();
            return like.isNot() ? !matches : matches;
        }
        if (expr instanceof InExpression in) {
            String left = resolveValue(in.getLeftExpression(), row);
            Expression right = in.getRightExpression();
            // IN (val1, val2, ...) — literal list
            // Handle jsqlparser 5.x: ExpressionList, ParenthesedExpressionList, or legacy Parenthesis
            if (right instanceof ExpressionList<?> list) {
                boolean found = list.stream()
                        .map(e -> resolveValue((Expression) e, row))
                        .anyMatch(v -> Objects.equals(left, v));
                return in.isNot() ? !found : found;
            }
            if (right instanceof net.sf.jsqlparser.expression.operators.relational.ParenthesedExpressionList<?> pel) {
                boolean found = pel.stream()
                        .map(e -> resolveValue((Expression) e, row))
                        .anyMatch(v -> Objects.equals(left, v));
                return in.isNot() ? !found : found;
            }
            @SuppressWarnings("deprecation")
            boolean legacyMatch = right instanceof Parenthesis p2 && p2.getExpression() instanceof ExpressionList<?> ll
                    && ll.stream().map(e -> resolveValue((Expression) e, row)).anyMatch(v -> Objects.equals(left, v));
            if (right instanceof Parenthesis) {
                return in.isNot() ? !legacyMatch : legacyMatch;
            }
            // IN (SELECT ...) — subquery
            PlainSelect sub = extractSubSelect(right);
            if (sub != null) {
                queryContext = queryContext.withOuterRow(row);
                DataTable subResult = runSubquery(sub);
                boolean found = subResult.getRows().stream()
                        .anyMatch(r -> subResult.getColumnNames().size() > 0
                                && Objects.equals(left, r.get(subResult.getColumnNames().get(0))));
                return in.isNot() ? !found : found;
            }
            return false;
        }
        // ── EXISTS (SELECT ...) ──────────────────────────────────────────────────
        if (expr instanceof ExistsExpression exists) {
            PlainSelect sub = extractSubSelect(exists.getRightExpression());
            if (sub != null) {
                queryContext = queryContext.withOuterRow(row);
                DataTable subResult = runSubquery(sub);
                boolean has = !subResult.getRows().isEmpty();
                return exists.isNot() ? !has : has;
            }
            return false;
        }
        if (expr instanceof IsNullExpression isNull) {
            String val = resolveValue(isNull.getLeftExpression(), row);
            boolean nullVal = val == null || val.isEmpty();
            return isNull.isNot() ? !nullVal : nullVal;
        }
        if (expr instanceof Between between) {
            String val = resolveValue(between.getLeftExpression(), row);
            String start = resolveValue(between.getBetweenExpressionStart(), row);
            String end = resolveValue(between.getBetweenExpressionEnd(), row);
            int c1 = compareStrings(val, start);
            int c2 = compareStrings(val, end);
            boolean inRange = c1 >= 0 && c2 <= 0;
            return between.isNot() ? !inRange : inRange;
        }
        return true;
    }

    public String resolveValue(Expression expr, Map<String, String> row) {
        if (expr == null) {
            return null;
        }
        if (expr instanceof StringValue sv) {
            return sv.getValue();
        }
        if (expr instanceof LongValue lv) {
            return String.valueOf(lv.getValue());
        }
        if (expr instanceof DoubleValue dv) {
            return String.valueOf(dv.getValue());
        }
        if (expr instanceof NullValue) {
            return null;
        }
        if (expr instanceof Column col) {
            String key = col.getColumnName();
            if (col.getTable() != null && col.getTable().getName() != null) {
                String prefixed = col.getTable().getName() + "." + key;
                if (row.containsKey(prefixed)) {
                    return row.get(prefixed);
                }
            }
            if (row.containsKey(key)) {
                return row.get(key);
            }
            // case-insensitive match, also try ignoring table prefix
            for (Map.Entry<String, String> e : row.entrySet()) {
                if (e.getKey().equalsIgnoreCase(key) || e.getKey().toLowerCase().endsWith("." + key.toLowerCase())) {
                    return e.getValue();
                }
            }
            // try stripping table prefix from key and matching bare column name
            String bareKey = key.contains(".") ? key.substring(key.lastIndexOf('.') + 1) : key;
            for (Map.Entry<String, String> e : row.entrySet()) {
                String bareEntry = e.getKey().contains(".") ? e.getKey().substring(e.getKey().lastIndexOf('.') + 1) : e.getKey();
                if (bareEntry.equalsIgnoreCase(bareKey)) {
                    return e.getValue();
                }
            }
            return "";
        }
        if (expr instanceof Function func) {
            // HAVING context: aggregate functions like COUNT(e.id), AVG(salary) etc.
            // The GROUP BY step already computed these and stored them by alias or function string.
            // Try to find the stored value by matching the function expression string against row keys.
            String funcStr = func.toString(); // e.g. "COUNT(e.id)"

            // 1. Direct key match (alias was set to function string)
            if (row.containsKey(funcStr)) {
                return row.get(funcStr);
            }
            // 2. Case-insensitive match
            for (Map.Entry<String, String> e : row.entrySet()) {
                if (e.getKey().equalsIgnoreCase(funcStr)) {
                    return e.getValue();
                }
            }
            // 3. Match by function name prefix: COUNT(...) matches any key starting with "COUNT"
            String funcName = func.getName().toUpperCase();
            for (Map.Entry<String, String> e : row.entrySet()) {
                // Match stored aggregate columns like "headcount", "avg_salary" etc.
                // by checking if the row has a key that was produced by the same function type
                // We look for keys produced by aggregate functions of the same type
                String rowKey = e.getKey().toUpperCase();
                if (rowKey.startsWith(funcName) || isAggregateAlias(rowKey, funcName)) {
                    return e.getValue();
                }
            }
            // 4. Fallback: evaluate inline (works for scalar functions like UPPER, LOWER etc.)
            return evaluateFunction(func, row);
        }
        // ── Scalar subquery: (SELECT AVG(salary) FROM employees) ────────────────
        if (expr instanceof ParenthesedSelect) {
            PlainSelect sub = extractSubSelect(expr);
            if (sub != null && queryContext != null) {
                queryContext = queryContext.withOuterRow(row);
                DataTable subResult = runSubquery(sub);
                if (!subResult.getRows().isEmpty() && !subResult.getColumnNames().isEmpty()) {
                    return subResult.getRows().get(0).get(subResult.getColumnNames().get(0));
                }
            }
            return null;
        }
        @SuppressWarnings("deprecation")
        boolean isParensR = expr instanceof Parenthesis;
        if (isParensR) {
            return resolveValue(((Parenthesis) expr).getExpression(), row);
        }
        if (expr instanceof SignedExpression signed) {
            String val = resolveValue(signed.getExpression(), row);
            if (val == null) {
                return null;
            }
            try {
                return String.valueOf(-Double.parseDouble(val));
            } catch (NumberFormatException e) {
                return val;
            }
        }
        // ── CASE WHEN ... THEN ... [ELSE ...] END ──────────────────────────────
        if (expr instanceof CaseExpression caseExpr) {
            return evaluateCase(caseExpr, row);
        }
        // ── CAST(expr AS TYPE) ───────────────────────────────────────────────────
        if (expr instanceof CastExpression cast) {
            String val = resolveValue(cast.getLeftExpression(), row);
            // jsqlparser 5.x: only getColDataType() exists on CastExpression
            String typeName = cast.getColDataType() != null ? cast.getColDataType().toString() : "";
            return castValue(val, typeName);
        }
        // ── Window function: NAME(...) OVER (PARTITION BY ... ORDER BY ...) ─────
        if (expr instanceof AnalyticExpression analytic) {
            // Window functions are resolved as a pre-pass before SELECT (see applyWindowFunctions).
            // If we reach here directly it means the value was already computed and stored
            // under the analytic expression's string key on the row.
            String key = analytic.toString();
            if (row.containsKey(key)) {
                return row.get(key);
            }
            return "";
        }
        // ── Arithmetic: + - * / % ────────────────────────────────────────────────
        if (expr instanceof Addition add) {
            return arith(add.getLeftExpression(), add.getRightExpression(), row, (a, b) -> a + b);
        }
        if (expr instanceof Subtraction sub) {
            return arith(sub.getLeftExpression(), sub.getRightExpression(), row, (a, b) -> a - b);
        }
        if (expr instanceof Multiplication mul) {
            return arith(mul.getLeftExpression(), mul.getRightExpression(), row, (a, b) -> a * b);
        }
        if (expr instanceof Division div) {
            return arith(div.getLeftExpression(), div.getRightExpression(), row, (a, b) -> b == 0 ? 0 : a / b);
        }
        if (expr instanceof Modulo mod) {
            return arith(mod.getLeftExpression(), mod.getRightExpression(), row, (a, b) -> b == 0 ? 0 : a % b);
        }
        return expr.toString();
    }

    // ── ALL / ANY subquery comparison ────────────────────────────────────────
    private boolean evaluateAnyAll(Expression leftExpr, String op, AnyComparisonExpression ace, Map<String, String> row) {
        String leftVal = resolveValue(leftExpr, row);
        // jsqlparser 5.x: AnyComparisonExpression.getSelect() returns the Select object
        PlainSelect sub = null;
        try {
            var sel = ace.getSelect();
            if (sel instanceof PlainSelect ps) sub = ps;
            else if (sel instanceof net.sf.jsqlparser.statement.select.Select s && s.getPlainSelect() != null) sub = s.getPlainSelect();
            else if (sel instanceof ParenthesedSelect ps) sub = ps.getPlainSelect();
        } catch (Exception ignored) {}
        if (sub == null || engine == null || queryContext == null) return false;
        DataTable subResult = engine.runSubquery(sub, queryContext.getTableMap(), queryContext.getOuterRow());
        if (subResult.getRows().isEmpty() || subResult.getColumnNames().isEmpty()) return false;
        String firstCol = subResult.getColumnNames().get(0);
        List<String> subVals = subResult.getRows().stream()
                .map(r -> r.getOrDefault(firstCol, "")).collect(Collectors.toList());

        boolean isAll = ace.getAnyType() != null && ace.getAnyType().toString().equalsIgnoreCase("ALL");

        if (isAll) {
            // ALL: condition must be true for every value in subquery
            return subVals.stream().allMatch(rv -> cmpOp(compareStrings(leftVal, rv), op));
        } else {
            // ANY / SOME: condition must be true for at least one value
            return subVals.stream().anyMatch(rv -> cmpOp(compareStrings(leftVal, rv), op));
        }
    }

    private boolean cmpOp(int cmp, String op) {
        return switch (op) {
            case ">"  -> cmp > 0;
            case ">=" -> cmp >= 0;
            case "<"  -> cmp < 0;
            case "<=" -> cmp <= 0;
            case "="  -> cmp == 0;
            case "!=" -> cmp != 0;
            default -> false;
        };
    }
    private String castValue(String val, String targetType) {
        if (val == null) return null;
        String t = targetType.toUpperCase();
        try {
            if (t.contains("INT")) {
                return String.valueOf((long) Double.parseDouble(val));
            }
            if (t.contains("DECIMAL") || t.contains("FLOAT") || t.contains("DOUBLE") || t.contains("NUMERIC") || t.contains("REAL")) {
                return formatNumber(Double.parseDouble(val));
            }
            if (t.contains("CHAR") || t.contains("TEXT") || t.contains("VARCHAR")) {
                return val;
            }
        } catch (NumberFormatException e) {
            return val;
        }
        return val;
    }

    // ── CASE WHEN evaluator ──────────────────────────────────────────────────────
    private String evaluateCase(CaseExpression caseExpr, Map<String, String> row) {
        Expression switchExpr = caseExpr.getSwitchExpression(); // for "CASE col WHEN val THEN ..." form
        for (WhenClause when : caseExpr.getWhenClauses()) {
            Expression cond = when.getWhenExpression();
            boolean matched;
            if (switchExpr != null) {
                // simple CASE: compare switchExpr to the WHEN value
                String left = resolveValue(switchExpr, row);
                String right = resolveValue(cond, row);
                matched = Objects.equals(left, right) || compareStrings(left, right) == 0;
            } else {
                // searched CASE: WHEN is a boolean condition
                matched = evaluate(cond, row);
            }
            if (matched) {
                return resolveValue(when.getThenExpression(), row);
            }
        }
        Expression elseExpr = caseExpr.getElseExpression();
        return elseExpr != null ? resolveValue(elseExpr, row) : null;
    }

    // ── Arithmetic helper ────────────────────────────────────────────────────────
    private interface DoubleOp { double apply(double a, double b); }
    private String arith(Expression left, Expression right, Map<String, String> row, DoubleOp op) {
        String lv = resolveValue(left, row);
        String rv = resolveValue(right, row);
        try {
            double result = op.apply(Double.parseDouble(lv), Double.parseDouble(rv));
            return formatNumber(result);
        } catch (NumberFormatException | NullPointerException e) {
            return "";
        }
    }

    // Helper: check if a row key is likely an alias for a given aggregate function
    private boolean isAggregateAlias(String rowKey, String funcName) {
        return switch (funcName) {
            case "COUNT" -> rowKey.contains("COUNT") || rowKey.contains("HEADCOUNT") || rowKey.contains("NUM") || rowKey.contains("TOTAL");
            case "AVG"   -> rowKey.contains("AVG") || rowKey.contains("AVERAGE");
            case "SUM"   -> rowKey.contains("SUM") || rowKey.contains("TOTAL");
            case "MAX"   -> rowKey.contains("MAX");
            case "MIN"   -> rowKey.contains("MIN");
            default -> false;
        };
    }

    private String evaluateFunction(Function func, Map<String, String> row) {
        String name = func.getName().toUpperCase();
        List<?> params;
        // jsqlparser 5.x: ExpressionList extends List<Expression> directly
        // getExpressions() does NOT exist — cast directly to List
        try {
            params = func.getParameters() != null ? (List<?>) func.getParameters() : List.of();
        } catch (Exception e) {
            params = List.of();
        }

        return switch (name) {
            case "UPPER" -> {
                String v = resolveValue(single(params), row);
                yield v != null ? v.toUpperCase() : null;
            }
            case "LOWER" -> {
                String v = resolveValue(single(params), row);
                yield v != null ? v.toLowerCase() : null;
            }
            case "LENGTH", "LEN", "CHAR_LENGTH" -> {
                String v = resolveValue(single(params), row);
                yield v != null ? String.valueOf(v.length()) : "0";
            }
            case "TRIM" -> {
                String v = resolveValue(single(params), row);
                yield v != null ? v.trim() : null;
            }
            case "LTRIM" -> {
                String v = resolveValue(single(params), row);
                yield v != null ? v.replaceAll("^\\s+", "") : null;
            }
            case "RTRIM" -> {
                String v = resolveValue(single(params), row);
                yield v != null ? v.replaceAll("\\s+$", "") : null;
            }
            case "CONCAT" -> {
                StringBuilder sb = new StringBuilder();
                for (Object obj : params) {
                    Expression p = (Expression) obj;
                    String v = resolveValue(p, row);
                    if (v != null) {
                        sb.append(v);
                    }
                }
                yield sb.toString();
            }
            case "SUBSTR", "SUBSTRING" -> {
                if (params.size() < 2) yield resolveValue(single(params), row);
                String v = resolveValue((Expression) params.get(0), row);
                if (v == null) yield null;
                int start = (int) parseDoubleOrZero(resolveValue((Expression) params.get(1), row));
                int from = Math.max(0, start - 1); // SQL is 1-indexed
                if (from >= v.length()) yield "";
                if (params.size() >= 3) {
                    int len = (int) parseDoubleOrZero(resolveValue((Expression) params.get(2), row));
                    int to = Math.min(v.length(), from + len);
                    yield v.substring(from, Math.max(from, to));
                }
                yield v.substring(from);
            }
            case "REPLACE" -> {
                if (params.size() < 3) yield resolveValue(single(params), row);
                String v = resolveValue((Expression) params.get(0), row);
                String target = resolveValue((Expression) params.get(1), row);
                String replacement = resolveValue((Expression) params.get(2), row);
                if (v == null || target == null) yield v;
                yield v.replace(target, replacement == null ? "" : replacement);
            }
            case "COALESCE" -> {
                for (Object obj : params) {
                    String v = resolveValue((Expression) obj, row);
                    if (v != null && !v.isEmpty()) yield v;
                }
                yield null;
            }
            case "IFNULL", "NVL" -> {
                if (params.size() < 2) yield resolveValue(single(params), row);
                String v = resolveValue((Expression) params.get(0), row);
                if (v != null && !v.isEmpty()) yield v;
                yield resolveValue((Expression) params.get(1), row);
            }
            case "NULLIF" -> {
                if (params.size() < 2) yield resolveValue(single(params), row);
                String a = resolveValue((Expression) params.get(0), row);
                String b = resolveValue((Expression) params.get(1), row);
                yield Objects.equals(a, b) ? null : a;
            }
            case "ROUND" -> {
                String v = resolveValue((Expression) params.get(0), row);
                int places = params.size() > 1 ? (int) parseDoubleOrZero(resolveValue((Expression) params.get(1), row)) : 0;
                try {
                    double d = Double.parseDouble(v);
                    double factor = Math.pow(10, places);
                    double rounded = Math.round(d * factor) / factor;
                    yield places <= 0 ? String.valueOf((long) rounded) : String.format(Locale.US, "%." + places + "f", rounded);
                } catch (Exception e) { yield v; }
            }
            case "ABS" -> {
                try { yield formatNumber(Math.abs(Double.parseDouble(resolveValue(single(params), row)))); }
                catch (Exception e) { yield resolveValue(single(params), row); }
            }
            case "FLOOR" -> {
                try { yield String.valueOf((long) Math.floor(Double.parseDouble(resolveValue(single(params), row)))); }
                catch (Exception e) { yield resolveValue(single(params), row); }
            }
            case "CEIL", "CEILING" -> {
                try { yield String.valueOf((long) Math.ceil(Double.parseDouble(resolveValue(single(params), row)))); }
                catch (Exception e) { yield resolveValue(single(params), row); }
            }
            case "MOD" -> {
                if (params.size() < 2) yield resolveValue(single(params), row);
                try {
                    double a = Double.parseDouble(resolveValue((Expression) params.get(0), row));
                    double b = Double.parseDouble(resolveValue((Expression) params.get(1), row));
                    yield b == 0 ? "0" : formatNumber(a % b);
                } catch (Exception e) { yield ""; }
            }
            case "POWER", "POW" -> {
                if (params.size() < 2) yield resolveValue(single(params), row);
                try {
                    double a = Double.parseDouble(resolveValue((Expression) params.get(0), row));
                    double b = Double.parseDouble(resolveValue((Expression) params.get(1), row));
                    yield formatNumber(Math.pow(a, b));
                } catch (Exception e) { yield ""; }
            }
            case "SQRT" -> {
                try { yield formatNumber(Math.sqrt(Double.parseDouble(resolveValue(single(params), row)))); }
                catch (Exception e) { yield resolveValue(single(params), row); }
            }
            case "CAST" -> {
                // CAST(expr AS TYPE) — jsqlparser models this as CastExpression, not Function;
                // included here defensively in case it arrives as a Function.
                yield resolveValue(single(params), row);
            }
            case "NOW", "CURRENT_TIMESTAMP", "CURDATE", "CURRENT_DATE" -> {
                yield java.time.LocalDate.now().toString();
            }
            case "YEAR" -> {
                String v = resolveValue(single(params), row);
                yield extractDatePart(v, java.time.temporal.ChronoField.YEAR);
            }
            case "MONTH" -> {
                String v = resolveValue(single(params), row);
                yield extractDatePart(v, java.time.temporal.ChronoField.MONTH_OF_YEAR);
            }
            case "DAY", "DAYOFMONTH" -> {
                String v = resolveValue(single(params), row);
                yield extractDatePart(v, java.time.temporal.ChronoField.DAY_OF_MONTH);
            }
            default -> func.toString();
        };
    }

    private String extractDatePart(String dateStr, java.time.temporal.TemporalField field) {
        if (dateStr == null || dateStr.isEmpty()) return "";
        try {
            java.time.LocalDate d = java.time.LocalDate.parse(dateStr.length() > 10 ? dateStr.substring(0, 10) : dateStr);
            return String.valueOf(d.get(field));
        } catch (Exception e) {
            return "";
        }
    }

    private Expression single(List<?> params) {
    if (params.isEmpty()) {
        return new NullValue();
    }
    return (Expression) params.get(0);
}

    private int compare(Expression left, Expression right, Map<String, String> row) {
        return compareStrings(resolveValue(left, row), resolveValue(right, row));
    }

    int compareStrings(String a, String b) {
        if (a == null && b == null) {
            return 0;
        }
        if (a == null) {
            return -1;
        }
        if (b == null) {
            return 1;
        }
        try {
            double da = Double.parseDouble(a);
            double db = Double.parseDouble(b);
            return Double.compare(da, db);
        } catch (NumberFormatException e) {
            return a.compareToIgnoreCase(b);
        }
    }

    public String aggregate(String functionName, List<Map<String, String>> rows, Expression expr, List<String> groupCols) {
        return aggregateDistinct(functionName, rows, expr, groupCols, false);
    }

    public String aggregateDistinct(String functionName, List<Map<String, String>> rows, Expression expr, List<String> groupCols, boolean distinct) {
        String fn = functionName.toUpperCase();
        return switch (fn) {
            case "COUNT" -> {
                if (expr != null && "*".equals(expr.toString())) {
                    yield String.valueOf(rows.size());
                }
                java.util.stream.Stream<String> vals = rows.stream()
                        .map(r -> resolveValue(expr, r))
                        .filter(v -> v != null && !v.isEmpty());
                if (distinct) vals = vals.distinct();
                yield String.valueOf(vals.count());
            }
            case "SUM" -> {
                java.util.stream.Stream<String> vals = rows.stream()
                        .map(r -> resolveValue(expr, r))
                        .filter(Objects::nonNull);
                if (distinct) vals = vals.distinct();
                double sum = vals.mapToDouble(this::parseDoubleOrZero).sum();
                yield formatNumber(sum);
            }
            case "AVG" -> {
                java.util.stream.Stream<String> vals = rows.stream()
                        .map(r -> resolveValue(expr, r))
                        .filter(Objects::nonNull);
                if (distinct) vals = vals.distinct();
                OptionalDouble avg = vals.mapToDouble(this::parseDoubleOrZero).average();
                yield avg.isPresent() ? formatNumber(avg.getAsDouble()) : "0";
            }
            case "MIN" -> rows.stream()
                    .map(r -> resolveValue(expr, r))
                    .filter(Objects::nonNull)
                    .min(this::compareStrings)
                    .orElse("");
            case "MAX" -> rows.stream()
                    .map(r -> resolveValue(expr, r))
                    .filter(Objects::nonNull)
                    .max(this::compareStrings)
                    .orElse("");
            default -> "";
        };
    }

    private double parseDoubleOrZero(String v) {
        try {
            return Double.parseDouble(v);
        } catch (NumberFormatException e) {
            return 0;
        }
    }

    private String formatNumber(double d) {
        if (d == Math.floor(d) && !Double.isInfinite(d)) {
            return String.valueOf((long) d);
        }
        return String.format(Locale.US, "%.2f", d);
    }
}
