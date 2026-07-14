package com.sqltutor.engine;

import com.sqltutor.model.ExecutionStep;
import com.sqltutor.model.JoinMeta;
import com.sqltutor.model.TableDefinition;
import net.sf.jsqlparser.expression.Expression;
import net.sf.jsqlparser.expression.Function;
import net.sf.jsqlparser.expression.LongValue;
import net.sf.jsqlparser.expression.CaseExpression;
import net.sf.jsqlparser.expression.WhenClause;
import net.sf.jsqlparser.expression.AnalyticExpression;
import net.sf.jsqlparser.expression.CastExpression;
import net.sf.jsqlparser.expression.operators.relational.EqualsTo;
import net.sf.jsqlparser.expression.operators.relational.GreaterThan;
import net.sf.jsqlparser.expression.operators.relational.GreaterThanEquals;
import net.sf.jsqlparser.expression.operators.relational.MinorThan;
import net.sf.jsqlparser.expression.operators.relational.MinorThanEquals;
import net.sf.jsqlparser.expression.Parenthesis;
import net.sf.jsqlparser.schema.Column;
import net.sf.jsqlparser.statement.select.*;
import net.sf.jsqlparser.expression.operators.relational.ExistsExpression;
import net.sf.jsqlparser.statement.Statement;
import net.sf.jsqlparser.statement.select.Select;
import org.springframework.stereotype.Component;

import java.util.*;
import java.util.stream.Collectors;

@Component
public class SqlVisualizationEngine {

    // Created per-request (via local variable in visualize/runSubquery) to avoid concurrency issues.
    // This field is kept for backward-compat with applyX helpers but set fresh per request.
    private final ThreadLocal<ExpressionEvaluator> evaluatorLocal = new ThreadLocal<>();

    private ExpressionEvaluator getEvaluator() {
        return evaluatorLocal.get();
    }

    public List<ExecutionStep> visualize(String sql, List<TableDefinition> tables) {
        if (sql == null || sql.isBlank())
            throw new IllegalArgumentException("SQL cannot be empty");
        if (tables == null || tables.isEmpty())
            throw new IllegalArgumentException("At least one table required");

        Map<String, TableDefinition> tableMap = tables.stream()
                .collect(Collectors.toMap(t -> t.name().toLowerCase(), t -> t, (a, b) -> a, LinkedHashMap::new));

        ExpressionEvaluator evaluator = new ExpressionEvaluator();
        evaluatorLocal.set(evaluator);
        evaluator.setEngine(this);
        evaluator.setQueryContext(new QueryContext(tableMap, null));
        _pendingSetOp.remove();

        PlainSelect select = parseSelect(sql);
        List<ExecutionStep> steps = new ArrayList<>();
        int stepNum = 1;

        // ── UNION / INTERSECT / EXCEPT ──────────────────────────────────────
        if (_pendingSetOp.get() != null) {
            SetOperationList sol = _pendingSetOp.get(); _pendingSetOp.remove(); return applySetOperation(sol, tableMap, steps);
        }

        DataTable current = loadFrom(select, tableMap, steps, stepNum++);
        current = applyJoins(select, sql, current, tableMap, steps, stepNum);
        stepNum = steps.size() + 1;
        current = applyWhere(select, current, steps, stepNum, tableMap);
        stepNum = steps.size() + 1;
        GroupResult gr = applyGroupBy(select, current, steps, stepNum);
        current = gr.table();
        stepNum = steps.size() + 1;
        current = applyHaving(select, current, steps, stepNum);
        stepNum = steps.size() + 1;
        current = applyWindowFunctions(select, current, steps, stepNum);
        stepNum = steps.size() + 1;
        current = applyOrderBy(select, current, steps, stepNum);
        stepNum = steps.size() + 1;
        current = applySelect(select, current, gr.hasGrouping(), steps, stepNum);
        stepNum = steps.size() + 1;
        current = applyDistinct(select, current, steps, stepNum);
        stepNum = steps.size() + 1;
        applyLimit(select, current, steps, stepNum);
        return steps;
    }

    /**
     * Headless execution for subqueries: runs the full pipeline silently
     * (no ExecutionStep recording) and returns just the final result rows.
     * Used for IN(SELECT...), scalar subqueries, and subqueries in FROM.
     * The optional outerRow enables correlated subqueries that reference
     * the outer query's columns inside their own WHERE clause.
     */
    public DataTable runSubquery(PlainSelect select, Map<String, TableDefinition> tableMap, Map<String, String> outerRow) {
        List<ExecutionStep> sink = new ArrayList<>(); // discarded
        ExpressionEvaluator ev = getEvaluator();
        // If called outside visualize() context (shouldn't happen, but guard)
        if (ev == null) return new DataTable(List.of(), List.of());
        QueryContext savedCtx = ev.getQueryContext();
        ev.setQueryContext(new QueryContext(tableMap, outerRow));
        try {
            DataTable current = loadFrom(select, tableMap, sink, 1);
            current = applyJoins(select, select.toString(), current, tableMap, sink, sink.size() + 1);
            current = applyWhere(select, current, sink, sink.size() + 1, tableMap);
            GroupResult gr = applyGroupBy(select, current, sink, sink.size() + 1);
            current = gr.table();
            current = applyHaving(select, current, sink, sink.size() + 1);
            current = applyWindowFunctions(select, current, sink, sink.size() + 1);
            current = applyOrderBy(select, current, sink, sink.size() + 1);
            current = applySelect(select, current, gr.hasGrouping(), sink, sink.size() + 1);
            current = applyDistinct(select, current, sink, sink.size() + 1);
            if (select.getLimit() != null) {
                Limit lim = select.getLimit();
                int count = lim.getRowCount() instanceof LongValue lv ? (int) lv.getValue()
                        : Integer.parseInt(lim.getRowCount().toString());
                int offset = lim.getOffset() instanceof LongValue ov ? (int) ov.getValue() : 0;
                var limited = current.getRows().stream().skip(offset).limit(count).collect(Collectors.toList());
                current = new DataTable(current.getColumnNames(), limited);
            }
            return current;
        } finally {
            ev.setQueryContext(savedCtx); // restore outer context
        }
    }

    // ── Parse ────────────────────────────────────────────────────────────────
    private PlainSelect parseSelect(String sql) {
        try {
            var stmt = net.sf.jsqlparser.parser.CCJSqlParserUtil.parse(sql.trim());
            // jsqlparser 5.x: PlainSelect and SetOperationList both implement Statement directly
            if (stmt instanceof PlainSelect ps)
                return ps;
            if (stmt instanceof SetOperationList sol)
                return wrapSetOperation(sol);
            // Also handle wrapped Select
            if (stmt instanceof Select s) {
                if (s.getPlainSelect() != null)
                    return s.getPlainSelect();
                if (s.getSetOperationList() != null)
                    return wrapSetOperation(s.getSetOperationList());
            }
            throw new IllegalArgumentException("Only SELECT supported");
        } catch (IllegalArgumentException e) {
            throw e;
        } catch (Exception e) {
            throw new IllegalArgumentException("Parse error: " + e.getMessage());
        }
    }

    private PlainSelect wrapSetOperation(SetOperationList sol) {
        _pendingSetOp.set(sol);
        try {
            var dummy = net.sf.jsqlparser.parser.CCJSqlParserUtil.parse("SELECT 1");
            if (dummy instanceof PlainSelect ps) return ps;
            if (dummy instanceof Select s && s.getPlainSelect() != null) return s.getPlainSelect();
            throw new RuntimeException("Cannot create dummy PlainSelect");
        } catch (Exception e) {
            throw new RuntimeException(e);
        }
    }

    // ThreadLocal so concurrent requests don't race on this field
    private final ThreadLocal<SetOperationList> _pendingSetOp = new ThreadLocal<>();

    // ── SET OPERATIONS: UNION / UNION ALL / INTERSECT / EXCEPT ──────────────
    private List<ExecutionStep> applySetOperation(
            net.sf.jsqlparser.statement.select.SetOperationList sol,
            Map<String, TableDefinition> tableMap,
            List<ExecutionStep> steps) {

        List<PlainSelect> branches = new ArrayList<>();
        for (var body : sol.getSelects()) {
            if (body instanceof PlainSelect ps) branches.add(ps);
            else if (body instanceof net.sf.jsqlparser.statement.select.ParenthesedSelect psel
                    && psel.getPlainSelect() != null) branches.add(psel.getPlainSelect());
        }
        if (branches.isEmpty()) throw new IllegalArgumentException("No SELECT branches found in set operation");

        // Materialise each branch
        List<DataTable> branchTables = branches.stream()
                .map(b -> runSubquery(b, tableMap, null)).collect(Collectors.toList());

        String opName = sol.getOperations().isEmpty() ? "UNION"
                : sol.getOperations().get(0).toString().toUpperCase();
        boolean isUnionAll = opName.contains("ALL");
        boolean isIntersect = opName.contains("INTERSECT");
        boolean isExcept = opName.contains("EXCEPT") || opName.contains("MINUS");

        DataTable first = branchTables.get(0);
        List<String> cols = first.getColumnNames();

        // Convert rows to string keys for set logic
        var rowToKey = (java.util.function.Function<Map<String,String>, String>) row ->
                cols.stream().map(c -> row.getOrDefault(c, "")).collect(Collectors.joining("\0"));

        List<Map<String, String>> result = new ArrayList<>(first.getRows());

        for (int i = 1; i < branchTables.size(); i++) {
            // Normalize column names of other branch to match first branch's column names
            // (e.g. "e.name" vs "p.name" → both mapped to first branch's "e.name")
            var otherBranch = branchTables.get(i);
            var otherOrigCols = otherBranch.getColumnNames();
            var other = otherBranch.getRows().stream().map(row -> {
                Map<String, String> normalized = new LinkedHashMap<>();
                for (int ci = 0; ci < cols.size() && ci < otherOrigCols.size(); ci++) {
                    normalized.put(cols.get(ci), row.getOrDefault(otherOrigCols.get(ci), ""));
                }
                return normalized;
            }).collect(Collectors.toList());
            if (isUnionAll) {
                result.addAll(other);
            } else if (isIntersect) {
                var otherKeys = other.stream().map(rowToKey).collect(Collectors.toSet());
                result = result.stream().filter(r -> otherKeys.contains(rowToKey.apply(r))).collect(Collectors.toList());
            } else if (isExcept) {
                var otherKeys = other.stream().map(rowToKey).collect(Collectors.toSet());
                result = result.stream().filter(r -> !otherKeys.contains(rowToKey.apply(r))).collect(Collectors.toList());
            } else {
                // UNION (deduplicated)
                var existingKeys = result.stream().map(rowToKey).collect(Collectors.toSet());
                for (var row : other) {
                    if (existingKeys.add(rowToKey.apply(row))) result.add(row);
                }
            }
        }

        // Remove duplicates for non-ALL set ops (UNION, INTERSECT, EXCEPT)
        if (!isUnionAll) {
            var seen = new LinkedHashSet<String>();
            result = result.stream().filter(r -> seen.add(rowToKey.apply(r))).collect(Collectors.toList());
        }

        DataTable finalTable = new DataTable(cols, result);
        // Record each branch as a step, then the merge
        for (int i = 0; i < branchTables.size(); i++) {
            DataTable bt = branchTables.get(i);
            steps.add(new ExecutionStep(i + 1, i == 0 ? "FROM" : opName,
                    "Branch " + (i + 1) + (i == 0 ? " (base query)" : " (" + opName + ")"),
                    "Branch " + (i + 1) + " produces **" + bt.rowCount() + "** row(s).",
                    branches.get(i).toString(),
                    bt.getColumnNames(), bt.toGrid(), bt.rowCount()));
        }
        steps.add(new ExecutionStep(branches.size() + 1, opName, "Merge " + opName,
                "**" + opName + "** combines branches into **" + result.size() + "** row(s).",
                opName, finalTable.getColumnNames(), finalTable.toGrid(), finalTable.rowCount()));
        steps.add(new ExecutionStep(branches.size() + 2, "RESULT", "Final result",
                "Query complete. **" + result.size() + "** row(s) returned.",
                "", finalTable.getColumnNames(), finalTable.toGrid(), finalTable.rowCount()));
        return steps;
    }

    // ── FROM ─────────────────────────────────────────────────────────────────
    private DataTable loadFrom(PlainSelect select, Map<String, TableDefinition> tableMap,
            List<ExecutionStep> steps, int stepNum) {
        FromItem from = select.getFromItem();

        // ── Subquery in FROM: SELECT ... FROM (SELECT ...) sub ───────────────
        if (from instanceof ParenthesedSelect psel && psel.getPlainSelect() != null) {
            String alias = from.getAlias() != null ? from.getAlias().getName() : "subq";
            DataTable subResult = runSubquery(psel.getPlainSelect(), tableMap, null);
            // Prefix columns with alias
            List<String> cols = prefixCols(subResult.getColumnNames(), alias);
            List<Map<String, String>> rows = prefixRows(subResult.getRows(), subResult.getColumnNames(), alias);
            DataTable result = new DataTable(cols, rows);
            steps.add(new ExecutionStep(stepNum, "FROM", "Derived table (" + alias + ")",
                    "Executes subquery as derived table **" + alias + "**, producing **" + result.rowCount() + "** row(s).",
                    "FROM (" + psel.getPlainSelect() + ") " + alias,
                    result.getColumnNames(), result.toGrid(), result.rowCount()));
            return result;
        }

        // ── Standard table reference ─────────────────────────────────────────
        String tableName = tableName(from);
        String alias = alias(from, tableName);
        TableDefinition def = findTable(tableMap, tableName);
        DataTable t = DataTable.fromDefinition(def);
        List<String> cols = prefixCols(t.getColumnNames(), alias);
        List<Map<String, String>> rows = prefixRows(t.getRows(), t.getColumnNames(), alias);
        DataTable result = new DataTable(cols, rows);
        steps.add(new ExecutionStep(stepNum, "FROM", "Load " + def.name(),
                "Loads all **" + def.size() + "** rows from **" + def.name() + "**" +
                        (alias.equals(tableName) ? "" : " aliased as **" + alias + "**") + ".",
                "FROM " + tableName + (alias.equals(tableName) ? "" : " " + alias),
                result.getColumnNames(), result.toGrid(), result.rowCount()));
        return result;
    }

    // ── JOINs ────────────────────────────────────────────────────────────────
    private DataTable applyJoins(PlainSelect select, String sql, DataTable current,
            Map<String, TableDefinition> tableMap,
            List<ExecutionStep> steps, int stepNum) {
        if (select.getJoins() == null || select.getJoins().isEmpty())
            return current;

        String fromTbl = tableName(select.getFromItem());
        String leftAlias = alias(select.getFromItem(), fromTbl);

        for (Join join : select.getJoins()) {
            String rightTbl = tableName(join.getRightItem());
            String rightAlias = alias(join.getRightItem(), rightTbl);
            // Use JSqlParser flags first (most reliable), fall back to SQL string detection
            String joinType;
            if (join.isCross())
                joinType = "CROSS JOIN";
            else if (join.isFull())
                joinType = "FULL JOIN";
            else if (join.isRight())
                joinType = "RIGHT JOIN";
            else if (join.isLeft())
                joinType = "LEFT JOIN";
            else
                joinType = detectJoinType(sql, rightTbl, rightAlias, fromTbl);

            TableDefinition rightDef = findTable(tableMap, rightTbl);
            DataTable right = DataTable.fromDefinition(rightDef);
            List<String> rightCols = prefixCols(right.getColumnNames(), rightAlias);

            List<String> newCols = new ArrayList<>(current.getColumnNames());
            newCols.addAll(rightCols);

            Expression on = getJoinOnExpression(join);
            List<Map<String, String>> newRows = new ArrayList<>();

            switch (joinType) {
                case "CROSS JOIN" -> {
                    for (var lr : current.getRows())
                        for (var rr : right.getRows())
                            newRows.add(merge(lr, rr, right.getColumnNames(), rightCols));
                }
                case "LEFT JOIN" -> {
                    for (var lr : current.getRows()) {
                        boolean matched = false;
                        for (var rr : right.getRows()) {
                            var combined = merge(lr, rr, right.getColumnNames(), rightCols);
                            if (on == null || getEvaluator().evaluate(on, combined)) {
                                newRows.add(combined);
                                matched = true;
                            }
                        }
                        if (!matched)
                            newRows.add(mergeNull(lr, rightCols));
                    }
                }
                case "RIGHT JOIN" -> {
                    for (var rr : right.getRows()) {
                        boolean matched = false;
                        for (var lr : current.getRows()) {
                            var combined = merge(lr, rr, right.getColumnNames(), rightCols);
                            if (on == null || getEvaluator().evaluate(on, combined)) {
                                newRows.add(combined);
                                matched = true;
                            }
                        }
                        if (!matched)
                            newRows.add(mergeNullLeft(current.getColumnNames(), rr, right.getColumnNames(), rightCols));
                    }
                }
                case "FULL JOIN" -> {
                    Set<Integer> matched = new HashSet<>();
                    for (var lr : current.getRows()) {
                        boolean found = false;
                        for (int ri = 0; ri < right.getRows().size(); ri++) {
                            var rr = right.getRows().get(ri);
                            var combined = merge(lr, rr, right.getColumnNames(), rightCols);
                            if (on == null || getEvaluator().evaluate(on, combined)) {
                                newRows.add(combined);
                                matched.add(ri);
                                found = true;
                            }
                        }
                        if (!found)
                            newRows.add(mergeNull(lr, rightCols));
                    }
                    for (int ri = 0; ri < right.getRows().size(); ri++)
                        if (!matched.contains(ri))
                            newRows.add(mergeNullLeft(current.getColumnNames(), right.getRows().get(ri),
                                    right.getColumnNames(), rightCols));
                }
                default -> { // INNER JOIN, SELF JOIN
                    for (var lr : current.getRows())
                        for (var rr : right.getRows()) {
                            var combined = merge(lr, rr, right.getColumnNames(), rightCols);
                            if (on == null || getEvaluator().evaluate(on, combined))
                                newRows.add(combined);
                        }
                }
            }

            current = new DataTable(newCols, newRows);
            JoinMeta meta = new JoinMeta(leftAlias, rightAlias,
                    on != null ? on.toString() : null, extractKeys(on));

            steps.add(new ExecutionStep(stepNum++, joinType,
                    joinType + " with " + rightDef.name(),
                    joinDesc(joinType, rightDef.name(), on, current.rowCount()),
                    joinType + " " + rightTbl + (rightAlias.equals(rightTbl) ? "" : " " + rightAlias)
                            + (on != null ? " ON " + on : ""),
                    current.getColumnNames(), current.toGrid(), current.rowCount(), meta));

            leftAlias = rightAlias;
        }
        return current;
    }

    // ── WHERE ────────────────────────────────────────────────────────────────
    private DataTable applyWhere(PlainSelect select, DataTable current,
            List<ExecutionStep> steps, int stepNum, Map<String, TableDefinition> tableMap) {
        if (select.getWhere() == null)
            return current;
        Expression where = select.getWhere();
        var rows = current.getRows().stream().filter(r -> {
            getEvaluator().setQueryContext(getEvaluator().getQueryContext().withOuterRow(r));
            return getEvaluator().evaluate(where, r);
        }).collect(Collectors.toList());
        var result = new DataTable(current.getColumnNames(), rows);
        steps.add(new ExecutionStep(stepNum, "WHERE", "Filter rows",
                "**WHERE** `" + where + "` keeps " + rows.size() + " of " + current.rowCount() + " rows.",
                "WHERE " + where, result.getColumnNames(), result.toGrid(), result.rowCount()));
        return result;
    }

    // ── GROUP BY ─────────────────────────────────────────────────────────────
    private record GroupResult(DataTable table, boolean hasGrouping) {
    }

    private GroupResult applyGroupBy(PlainSelect select, DataTable current,
            List<ExecutionStep> steps, int stepNum) {
        GroupByElement gb = select.getGroupBy();
        List<Expression> groupExprs = groupExpressions(gb);
        if (groupExprs.isEmpty())
            return new GroupResult(current, false);

        List<String> groupCols = groupExprs.stream().map(Object::toString).toList();

        Map<String, List<Map<String, String>>> groups = new LinkedHashMap<>();
        for (var row : current.getRows()) {
            String key = groupCols.stream().map(c -> resolve(row, c)).collect(Collectors.joining("|"));
            groups.computeIfAbsent(key, k -> new ArrayList<>()).add(row);
        }

        List<String> outCols = new ArrayList<>();
        List<Map<String, String>> outRows = new ArrayList<>();

        // Collect all aggregate functions from SELECT + HAVING so we pre-compute them all
        List<Function> allAggFuncs = new ArrayList<>();
        for (SelectItem<?> item : select.getSelectItems()) {
            if (item.getExpression() instanceof Function func)
                allAggFuncs.add(func);
        }
        // Extract aggregate functions from HAVING expression
        if (select.getHaving() != null) {
            collectFunctions(select.getHaving(), allAggFuncs);
        }

        for (var entry : groups.entrySet()) {
            var groupRows = entry.getValue();
            Map<String, String> outRow = new LinkedHashMap<>();
            for (String gc : groupCols) {
                outRow.put(gc, resolve(groupRows.get(0), gc));
                if (!outCols.contains(gc))
                    outCols.add(gc);
            }
            // Compute all aggregate functions (SELECT + HAVING)
            Set<String> computedFuncKeys = new HashSet<>();
            for (SelectItem<?> item : select.getSelectItems()) {
                if (item.getExpression() instanceof Function func) {
                    String aliasName = item.getAlias() != null ? item.getAlias().getName() : func.toString();
                    String funcKey = func.toString();
                    Expression param = firstParam(func);
                    boolean distinct = func.isDistinct();
                    String val = getEvaluator().aggregateDistinct(func.getName(), groupRows, param, groupCols, distinct);
                    outRow.put(aliasName, val);
                    if (!outCols.contains(aliasName))
                        outCols.add(aliasName);
                    // Also store under original function string for HAVING lookup
                    outRow.put(funcKey, val);
                    computedFuncKeys.add(funcKey.toUpperCase());
                }
            }
            // Also compute any HAVING aggregates not already in SELECT
            for (Function func : allAggFuncs) {
                String funcKey = func.toString();
                if (!computedFuncKeys.contains(funcKey.toUpperCase())) {
                    Expression param = firstParam(func);
                    boolean distinct = func.isDistinct();
                    String val = getEvaluator().aggregateDistinct(func.getName(), groupRows, param, groupCols, distinct);
                    outRow.put(funcKey, val);
                    computedFuncKeys.add(funcKey.toUpperCase());
                }
            }
            outRows.add(outRow);
        }

        var result = new DataTable(outCols, outRows);
        steps.add(new ExecutionStep(stepNum, "GROUP BY", "Group & aggregate",
                "Groups rows by **" + String.join(", ", groupCols) + "**, producing **" + groups.size()
                        + "** group(s).",
                "GROUP BY " + String.join(", ", groupCols),
                result.getColumnNames(), result.toGrid(), result.rowCount()));
        return new GroupResult(result, true);
    }

    /** Recursively collect all Function nodes from an expression tree */
    private void collectFunctions(Expression expr, List<Function> out) {
        if (expr == null) return;
        if (expr instanceof Function f) {
            out.add(f);
        } else if (expr instanceof net.sf.jsqlparser.expression.operators.conditional.AndExpression and) {
            collectFunctions(and.getLeftExpression(), out);
            collectFunctions(and.getRightExpression(), out);
        } else if (expr instanceof net.sf.jsqlparser.expression.operators.conditional.OrExpression or) {
            collectFunctions(or.getLeftExpression(), out);
            collectFunctions(or.getRightExpression(), out);
        } else if (expr instanceof GreaterThan gt) {
            collectFunctions(gt.getLeftExpression(), out);
            collectFunctions(gt.getRightExpression(), out);
        } else if (expr instanceof GreaterThanEquals gte) {
            collectFunctions(gte.getLeftExpression(), out);
            collectFunctions(gte.getRightExpression(), out);
        } else if (expr instanceof MinorThan lt) {
            collectFunctions(lt.getLeftExpression(), out);
            collectFunctions(lt.getRightExpression(), out);
        } else if (expr instanceof MinorThanEquals lte) {
            collectFunctions(lte.getLeftExpression(), out);
            collectFunctions(lte.getRightExpression(), out);
        } else if (expr instanceof EqualsTo eq) {
            collectFunctions(eq.getLeftExpression(), out);
            collectFunctions(eq.getRightExpression(), out);
        } else if (expr instanceof Parenthesis) {
            @SuppressWarnings("deprecation") var p2 = (Parenthesis) expr;
            collectFunctions(p2.getExpression(), out);
        } else if (expr instanceof CaseExpression caseExpr) {
            for (WhenClause wc : caseExpr.getWhenClauses()) {
                collectFunctions(wc.getWhenExpression(), out);
                collectFunctions(wc.getThenExpression(), out);
            }
            collectFunctions(caseExpr.getElseExpression(), out);
        } else if (expr instanceof net.sf.jsqlparser.expression.operators.arithmetic.Addition a) {
            collectFunctions(a.getLeftExpression(), out);
            collectFunctions(a.getRightExpression(), out);
        } else if (expr instanceof net.sf.jsqlparser.expression.operators.arithmetic.Subtraction s) {
            collectFunctions(s.getLeftExpression(), out);
            collectFunctions(s.getRightExpression(), out);
        } else if (expr instanceof net.sf.jsqlparser.expression.operators.arithmetic.Multiplication m) {
            collectFunctions(m.getLeftExpression(), out);
            collectFunctions(m.getRightExpression(), out);
        } else if (expr instanceof net.sf.jsqlparser.expression.operators.arithmetic.Division d) {
            collectFunctions(d.getLeftExpression(), out);
            collectFunctions(d.getRightExpression(), out);
        }
    }

    // ── HAVING ───────────────────────────────────────────────────────────────
    private DataTable applyHaving(PlainSelect select, DataTable current,
            List<ExecutionStep> steps, int stepNum) {
        if (select.getHaving() == null)
            return current;
        Expression having = select.getHaving();
        var rows = current.getRows().stream().filter(r -> getEvaluator().evaluate(having, r)).collect(Collectors.toList());
        var result = new DataTable(current.getColumnNames(), rows);
        steps.add(new ExecutionStep(stepNum, "HAVING", "Filter groups",
                "**HAVING** `" + having + "` keeps " + rows.size() + " group(s).",
                "HAVING " + having, result.getColumnNames(), result.toGrid(), result.rowCount()));
        return result;
    }

    // ── WINDOW FUNCTIONS ─────────────────────────────────────────────────────
    private DataTable applyWindowFunctions(PlainSelect select, DataTable current,
            List<ExecutionStep> steps, int stepNum) {
        List<AnalyticExpression> windowFuncs = new ArrayList<>();
        for (SelectItem<?> item : select.getSelectItems()) {
            if (item.getExpression() instanceof AnalyticExpression ae) {
                windowFuncs.add(ae);
            }
        }
        if (windowFuncs.isEmpty())
            return current;

        List<Map<String, String>> rows = current.getRows().stream()
                .map(LinkedHashMap::new).collect(Collectors.toList());

        for (AnalyticExpression ae : windowFuncs) {
            if (ae.getName() == null) continue;
            String funcName = ae.getName().toUpperCase();
            String key = ae.toString();

            // Partition rows by PARTITION BY columns (or one big partition if none)
            List<Expression> partitionExprs = ae.getPartitionExpressionList() != null
                    ? toExprList(ae.getPartitionExpressionList())
                    : List.of();
            Map<String, List<Map<String, String>>> partitions = new LinkedHashMap<>();
            for (var row : rows) {
                String pk = partitionExprs.stream().map(e -> resolve(row, e.toString())).collect(Collectors.joining("|"));
                partitions.computeIfAbsent(pk, k -> new ArrayList<>()).add(row);
            }

            // Sort each partition by its ORDER BY clause (defaults to insertion order if absent)
            var orderElems = ae.getOrderByElements();
            for (var partRows : partitions.values()) {
                if (orderElems != null && !orderElems.isEmpty()) {
                    partRows.sort((a, b) -> {
                        for (var ob : orderElems) {
                            String col = ob.getExpression().toString();
                            int cmp = cmpValues(resolve(a, col), resolve(b, col));
                            if (cmp != 0) return ob.isAsc() ? cmp : -cmp;
                        }
                        return 0;
                    });
                }

                switch (funcName) {
                    case "ROW_NUMBER" -> {
                        int rn = 1;
                        for (var r : partRows) r.put(key, String.valueOf(rn++));
                    }
                    case "RANK" -> {
                        int rank = 1, idx = 1;
                        String prevKey = null;
                        for (var r : partRows) {
                            String orderKey = orderElems == null ? "" :
                                    orderElems.stream().map(ob -> resolve(r, ob.getExpression().toString())).collect(Collectors.joining("|"));
                            if (prevKey != null && !orderKey.equals(prevKey)) rank = idx;
                            r.put(key, String.valueOf(rank));
                            prevKey = orderKey;
                            idx++;
                        }
                    }
                    case "DENSE_RANK" -> {
                        int rank = 0;
                        String prevKey = null;
                        for (var r : partRows) {
                            String orderKey = orderElems == null ? "" :
                                    orderElems.stream().map(ob -> resolve(r, ob.getExpression().toString())).collect(Collectors.joining("|"));
                            if (prevKey == null || !orderKey.equals(prevKey)) rank++;
                            r.put(key, String.valueOf(rank));
                            prevKey = orderKey;
                        }
                    }
                    case "NTILE" -> {
                        int buckets = 1;
                        try {
                            // NTILE(n) — n is stored in getExpression() in jsqlparser 5.x
                            Expression ntileExpr = ae.getExpression();
                            if (ntileExpr != null) {
                                buckets = Integer.parseInt(ntileExpr.toString());
                            }
                        } catch (Exception ignored) {}
                        int total = partRows.size();
                        int b = Math.max(1, buckets);
                        for (int i = 0; i < total; i++) {
                            int bucket = (i * b) / total + 1;
                            partRows.get(i).put(key, String.valueOf(bucket));
                        }
                    }
                    case "LEAD" -> {
                        Expression colExpr = analyticParam(ae, 0);
                        int offset = analyticIntParam(ae, 1, 1);
                        for (int i = 0; i < partRows.size(); i++) {
                            int target = i + offset;
                            String val = (target < partRows.size() && colExpr != null)
                                    ? resolve(partRows.get(target), colExpr.toString()) : "";
                            partRows.get(i).put(key, val);
                        }
                    }
                    case "LAG" -> {
                        Expression colExpr = analyticParam(ae, 0);
                        int offset = analyticIntParam(ae, 1, 1);
                        for (int i = 0; i < partRows.size(); i++) {
                            int target = i - offset;
                            String val = (target >= 0 && colExpr != null)
                                    ? resolve(partRows.get(target), colExpr.toString()) : "";
                            partRows.get(i).put(key, val);
                        }
                    }
                    case "FIRST_VALUE" -> {
                        Expression colExpr = analyticParam(ae, 0);
                        String val = !partRows.isEmpty() && colExpr != null ? resolve(partRows.get(0), colExpr.toString()) : "";
                        for (var r : partRows) r.put(key, val);
                    }
                    case "LAST_VALUE" -> {
                        Expression colExpr = analyticParam(ae, 0);
                        String val = !partRows.isEmpty() && colExpr != null ? resolve(partRows.get(partRows.size() - 1), colExpr.toString()) : "";
                        for (var r : partRows) r.put(key, val);
                    }
                    case "SUM", "AVG", "COUNT", "MIN", "MAX" -> {
                        // Windowed aggregate: e.g. SUM(salary) OVER (PARTITION BY dept_id)
                        Expression colExpr = analyticParam(ae, 0);
                        String val = getEvaluator().aggregate(funcName, partRows, colExpr, List.of());
                        for (var r : partRows) r.put(key, val);
                    }
                    default -> {
                        for (var r : partRows) r.put(key, "");
                    }
                }
            }
        }

        List<String> outCols = new ArrayList<>(current.getColumnNames());
        for (AnalyticExpression ae : windowFuncs) {
            String key = ae.toString();
            if (!outCols.contains(key)) outCols.add(key);
        }
        var result = new DataTable(outCols, rows);
        String desc = windowFuncs.stream().map(AnalyticExpression::toString).collect(Collectors.joining(", "));
        steps.add(new ExecutionStep(stepNum, "WINDOW", "Apply window function(s)",
                "Computes **" + desc + "** over partitions defined by PARTITION BY / ORDER BY.",
                desc, result.getColumnNames(), result.toGrid(), result.rowCount()));
        return result;
    }

    private Expression analyticParam(AnalyticExpression ae, int idx) {
        // jsqlparser 5.x: AnalyticExpression stores the primary expression in getExpression().
        // For LEAD(col, n) / LAG(col, n) / NTILE(n) the extra args are in getFuncOrderBy()
        // (the function-level order by list used as an arg list).
        if (idx == 0) return ae.getExpression();
        try {
            var extra = ae.getFuncOrderBy();
            if (extra != null && extra.size() > idx - 1)
                return extra.get(idx - 1).getExpression();
        } catch (Exception ignored) {}
        return null;
    }

    private int analyticIntParam(AnalyticExpression ae, int idx, int fallback) {
        Expression e = analyticParam(ae, idx);
        if (e == null) return fallback;
        try { return Integer.parseInt(e.toString()); }
        catch (Exception ignored) { return fallback; }
    }

    private List<Expression> toExprList(Object partitionList) {
        List<Expression> result = new ArrayList<>();
        if (partitionList instanceof List<?> list) {
            for (Object o : list) {
                if (o instanceof Expression e) result.add(e);
            }
        }
        return result;
    }


    private DataTable applyOrderBy(PlainSelect select, DataTable current,
            List<ExecutionStep> steps, int stepNum) {
        if (select.getOrderByElements() == null || select.getOrderByElements().isEmpty())
            return current;
        var orderBy = select.getOrderByElements();
        var sorted = new ArrayList<>(current.getRows());
        sorted.sort((a, b) -> {
            for (var ob : orderBy) {
                String col = ob.getExpression().toString();
                int cmp = cmpValues(resolve(a, col), resolve(b, col));
                if (cmp != 0)
                    return ob.isAsc() ? cmp : -cmp;
            }
            return 0;
        });
        var result = new DataTable(current.getColumnNames(), sorted);
        String desc = orderBy.stream().map(o -> o.getExpression() + (o.isAsc() ? " ASC" : " DESC"))
                .collect(Collectors.joining(", "));
        steps.add(new ExecutionStep(stepNum, "ORDER BY", "Sort results",
                "Sorts rows by **" + desc + "**.",
                "ORDER BY " + desc, result.getColumnNames(), result.toGrid(), result.rowCount()));
        return result;
    }

    // ── SELECT ───────────────────────────────────────────────────────────────
    private DataTable applySelect(PlainSelect select, DataTable current, boolean hasGrouping,
            List<ExecutionStep> steps, int stepNum) {
        var items = select.getSelectItems();
        boolean star = items.stream().anyMatch(i -> "*".equals(i.getExpression().toString()));
        List<String> outCols = new ArrayList<>();
        List<Map<String, String>> outRows = new ArrayList<>();

        if (star) {
            outCols.addAll(current.getColumnNames());
            outRows = current.getRows().stream().map(LinkedHashMap::new).collect(Collectors.toList());
        } else {
            for (var row : current.getRows()) {
                Map<String, String> outRow = new LinkedHashMap<>();
                for (var item : items) {
                    String name = selectName(item);
                    String val = selectVal(item, row, hasGrouping);
                    outRow.put(name, val);
                    if (!outCols.contains(name))
                        outCols.add(name);
                }
                outRows.add(outRow);
            }
        }

        var result = new DataTable(outCols, outRows);
        steps.add(new ExecutionStep(stepNum, "SELECT", "Project columns",
                "Picks columns: **" + items.stream().map(Object::toString).collect(Collectors.joining(", ")) + "**.",
                "SELECT " + items.stream().map(Object::toString).collect(Collectors.joining(", ")),
                result.getColumnNames(), result.toGrid(), result.rowCount()));
        return result;
    }

    // ── DISTINCT ─────────────────────────────────────────────────────────────
    private DataTable applyDistinct(PlainSelect select, DataTable current,
            List<ExecutionStep> steps, int stepNum) {
        if (select.getDistinct() == null)
            return current;
        Set<String> seen = new LinkedHashSet<>();
        var unique = current.getRows().stream().filter(r -> seen.add(
                current.getColumnNames().stream().map(c -> r.getOrDefault(c, "")).collect(Collectors.joining("|"))))
                .collect(Collectors.toList());
        var result = new DataTable(current.getColumnNames(), unique);
        steps.add(new ExecutionStep(stepNum, "DISTINCT", "Remove duplicates",
                "Removed duplicates: **" + unique.size() + "** unique rows remain.",
                "SELECT DISTINCT", result.getColumnNames(), result.toGrid(), result.rowCount()));
        return result;
    }

    // ── LIMIT ────────────────────────────────────────────────────────────────
    private void applyLimit(PlainSelect select, DataTable current,
            List<ExecutionStep> steps, int stepNum) {
        if (select.getLimit() == null) {
            steps.add(new ExecutionStep(stepNum, "RESULT", "Final result",
                    "Query complete. **" + current.rowCount() + "** row(s) returned.",
                    "", current.getColumnNames(), current.toGrid(), current.rowCount()));
            return;
        }
        Limit lim = select.getLimit();
        int count = lim.getRowCount() instanceof LongValue lv ? (int) lv.getValue()
                : Integer.parseInt(lim.getRowCount().toString());
        int offset = lim.getOffset() instanceof LongValue ov ? (int) ov.getValue() : 0;
        var limited = current.getRows().stream().skip(offset).limit(count).collect(Collectors.toList());
        var result = new DataTable(current.getColumnNames(), limited);
        steps.add(new ExecutionStep(stepNum, "LIMIT", "Restrict rows",
                "Returns at most **" + count + "** row(s)" + (offset > 0 ? " from offset " + offset : "") + ".",
                "LIMIT " + count + (offset > 0 ? " OFFSET " + offset : ""),
                result.getColumnNames(), result.toGrid(), result.rowCount()));
    }

    // ── Helpers ──────────────────────────────────────────────────────────────

    private String tableName(FromItem item) {
        if (item instanceof net.sf.jsqlparser.schema.Table t)
            return t.getName();
        String raw = item.toString();
        if (item.getAlias() != null) {
            String a = item.getAlias().toString().trim();
            int idx = raw.lastIndexOf(a);
            if (idx > 0)
                raw = raw.substring(0, idx).trim();
        }
        return raw.trim();
    }

    private String alias(FromItem item, String fallback) {
        return item.getAlias() != null ? item.getAlias().getName() : fallback;
    }

    private TableDefinition findTable(Map<String, TableDefinition> map, String name) {
        var def = map.get(name.toLowerCase());
        if (def == null)
            throw new IllegalArgumentException("Table not found: " + name);
        return def;
    }

    private List<String> prefixCols(List<String> cols, String alias) {
        return cols.stream().map(c -> alias + "." + c).toList();
    }

    private List<Map<String, String>> prefixRows(List<Map<String, String>> rows, List<String> cols, String alias) {
        return rows.stream().map(row -> {
            Map<String, String> m = new LinkedHashMap<>();
            for (String c : cols)
                m.put(alias + "." + c, row.get(c));
            return m;
        }).collect(Collectors.toList());
    }

    private Map<String, String> merge(Map<String, String> left, Map<String, String> rightRow,
            List<String> rightOrigCols, List<String> rightPrefixedCols) {
        Map<String, String> m = new LinkedHashMap<>(left);
        for (int i = 0; i < rightOrigCols.size(); i++)
            m.put(rightPrefixedCols.get(i), rightRow.get(rightOrigCols.get(i)));
        return m;
    }

    private Map<String, String> mergeNull(Map<String, String> left, List<String> rightCols) {
        Map<String, String> m = new LinkedHashMap<>(left);
        for (String c : rightCols)
            m.put(c, "");
        return m;
    }

    private Map<String, String> mergeNullLeft(List<String> leftCols, Map<String, String> rightRow,
            List<String> rightOrigCols, List<String> rightPrefixedCols) {
        Map<String, String> m = new LinkedHashMap<>();
        for (String c : leftCols)
            m.put(c, "");
        for (int i = 0; i < rightOrigCols.size(); i++)
            m.put(rightPrefixedCols.get(i), rightRow.get(rightOrigCols.get(i)));
        return m;
    }

    private String resolve(Map<String, String> row, String col) {
        if (row.containsKey(col))
            return row.get(col);
        for (var e : row.entrySet()) {
            if (e.getKey().equalsIgnoreCase(col))
                return e.getValue();
            if (e.getKey().toLowerCase().endsWith("." + col.toLowerCase()))
                return e.getValue();
        }
        return "";
    }

    private String selectName(SelectItem<?> item) {
        if (item.getAlias() != null)
            return item.getAlias().getName();
        var expr = item.getExpression();
        if (expr instanceof Column c) {
            if (c.getTable() != null && c.getTable().getName() != null && !c.getTable().getName().isBlank())
                return c.toString();
            return c.getColumnName();
        }
        if (expr instanceof CaseExpression) {
            return "case_result";
        }
        if (expr instanceof AnalyticExpression ae) {
            return ae.getName() != null ? ae.getName().toLowerCase() : "window_result";
        }
        return expr.toString();
    }

    private static final Set<String> AGGREGATE_FUNCS = Set.of("COUNT", "SUM", "AVG", "MIN", "MAX");

    private String selectVal(SelectItem<?> item, Map<String, String> row, boolean hasGrouping) {
        var expr = item.getExpression();
        if (expr instanceof AnalyticExpression ae) {
            // Window function result was already computed and stored under its string key
            // by applyWindowFunctions(), which runs before applySelect().
            String key = ae.toString();
            return row.getOrDefault(key, "");
        }
        if (expr instanceof Function func && AGGREGATE_FUNCS.contains(func.getName().toUpperCase())) {
            // If we already grouped, the aggregate value was pre-computed and stored
            // under the function-string key during GROUP BY — just look it up.
            if (hasGrouping) {
                String funcKey = func.toString();
                if (row.containsKey(funcKey)) return row.get(funcKey);
            }
            // No GROUP BY: aggregate over the entire current result set (e.g. SELECT COUNT(*) FROM t)
            Expression param = firstParam(func);
            return getEvaluator().aggregateDistinct(func.getName(), List.of(row), param, List.of(), func.isDistinct());
        }
        // Everything else — plain columns, CASE WHEN, arithmetic, scalar functions
        // (UPPER, ROUND, CONCAT, COALESCE, etc.) — resolved directly against the row.
        getEvaluator().setQueryContext(getEvaluator().getQueryContext().withOuterRow(row));
        return getEvaluator().resolveValue(expr, row);
    }

    private Expression firstParam(Function func) {
        try {
            var params = func.getParameters();
            if (params == null)
                return null;
            // JSqlParser 5.x: ExpressionList is in operators.relational and extends
            // List<Expression>
            if (params instanceof net.sf.jsqlparser.expression.operators.relational.ExpressionList<?> el) {
                return el.isEmpty() ? null : (Expression) el.get(0);
            }
            // fallback: treat as list directly
            if (!params.isEmpty())
                return (Expression) params.get(0);
            return null;
        } catch (Exception e) {
            return null;
        }
    }

    private List<Expression> groupExpressions(GroupByElement gb) {
        if (gb == null)
            return List.of();
        try {
            var list = gb.getGroupByExpressionList();
            if (list == null)
                return List.of();
            // JSqlParser 5.x: ExpressionList extends List<Expression> directly, just
            // iterate it
            List<Expression> result = new ArrayList<>();
            for (Object e : list)
                result.add((Expression) e);
            return result;
        } catch (Exception e) {
            return List.of();
        }
    }

    private String detectJoinType(String sql, String rightTable, String rightAlias, String fromTable) {
        if (rightTable.equalsIgnoreCase(fromTable) && !rightAlias.equalsIgnoreCase(fromTable))
            return "SELF JOIN";
        String upper = sql.toUpperCase();
        int fromIdx = upper.indexOf("FROM");
        if (fromIdx < 0)
            fromIdx = 0;
        int tblIdx = upper.indexOf(rightTable.toUpperCase(), fromIdx);
        if (tblIdx < 0)
            return "INNER JOIN";
        String before = upper.substring(fromIdx, tblIdx);
        if (before.contains("CROSS JOIN"))
            return "CROSS JOIN";
        if (before.contains("FULL OUTER JOIN") || before.contains("FULL JOIN"))
            return "FULL JOIN";
        if (before.contains("RIGHT OUTER JOIN") || before.contains("RIGHT JOIN"))
            return "RIGHT JOIN";
        if (before.contains("LEFT OUTER JOIN") || before.contains("LEFT JOIN"))
            return "LEFT JOIN";
        return "INNER JOIN";
    }

    private Expression getJoinOnExpression(Join join) {
        var onExpressions = join.getOnExpressions();
        if (onExpressions != null && !onExpressions.isEmpty()) {
            return (Expression) onExpressions.iterator().next();
        }
        return null;
    }

    private List<String> extractKeys(Expression on) {
        if (on == null)
            return List.of();
        List<String> keys = new ArrayList<>();
        var m = java.util.regex.Pattern.compile("\\b(\\w+\\.\\w+|\\w+)\\b").matcher(on.toString());
        while (m.find()) {
            String t = m.group(1);
            if (!t.matches("\\d+") && !t.equalsIgnoreCase("AND") && !t.equalsIgnoreCase("OR")) {
                keys.add(t);
                if (t.contains("."))
                    keys.add(t.substring(t.lastIndexOf('.') + 1));
            }
        }
        return keys;
    }

    private String joinDesc(String type, String table, Expression on, int rows) {
        return switch (type) {
            case "CROSS JOIN" ->
                "**CROSS JOIN** combines every row from both tables (Cartesian product). " + rows + " row(s) produced.";
            case "LEFT JOIN" -> "**LEFT JOIN** keeps all left rows; right columns are NULL where no match.";
            case "RIGHT JOIN" -> "**RIGHT JOIN** keeps all right rows; left columns are NULL where no match.";
            case "FULL JOIN" -> "**FULL JOIN** keeps all rows from both sides; NULLs fill unmatched columns.";
            case "SELF JOIN" -> "**SELF JOIN** joins the table to itself using aliases. " + rows + " row(s) matched.";
            default -> "**INNER JOIN** with **" + table + "**" + (on != null ? " ON `" + on + "`" : "") + ". " + rows
                    + " row(s) matched.";
        };
    }

    private int cmpValues(String a, String b) {
        if (a == null)
            a = "";
        if (b == null)
            b = "";
        try {
            return Double.compare(Double.parseDouble(a), Double.parseDouble(b));
        } catch (NumberFormatException e) {
            return a.compareToIgnoreCase(b);
        }
    }
}