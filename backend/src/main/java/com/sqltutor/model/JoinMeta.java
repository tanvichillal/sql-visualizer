package com.sqltutor.model;

import java.util.List;

/**
 * Metadata emitted for JOIN steps so the frontend can render a join diagram.
 *
 * @param leftTable   alias or name of the left-hand table
 * @param rightTable  alias or name of the right-hand table
 * @param condition   the ON condition as a string (null for CROSS JOIN)
 * @param joinKeys    column names used in the ON clause, highlighted in the result grid
 */
public record JoinMeta(
        String leftTable,
        String rightTable,
        String condition,
        List<String> joinKeys
) {}
