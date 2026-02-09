-- RPC Functions for Bustly Mock Data Skill
--
-- Run this in Supabase SQL Editor to enable mock data insertion
--
-- This function allows the mock data generator to insert records
-- into data schema tables via RPC calls.

-- Simplified insert function using jsonb_to_recordset
CREATE OR REPLACE FUNCTION insert_mock_data(
  p_table_name TEXT,
  p_records JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sql TEXT;
  v_result JSONB;
BEGIN
  -- Build dynamic INSERT statement using jsonb_to_recordset
  v_sql := format(
    'INSERT INTO data.%I SELECT * FROM jsonb_to_recordset(%L) AS data(%s) RETURNING count(*)',
    p_table_name,
    p_records,
    build_column_definition(p_table_name)
  );

  EXECUTE v_sql INTO v_result;

  RETURN jsonb_build_object(
    'inserted', COALESCE((v_result->>0)::int, 0),
    'failed', 0
  );
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object(
    'inserted', 0,
    'failed', jsonb_array_length(p_records),
    'error', SQLERRM
  );
END;
$$;

-- Helper function to build column definition for jsonb_to_recordset
CREATE OR REPLACE FUNCTION build_column_definition(p_table_name TEXT)
RETURNS TEXT
LANGUAGE plpgsql
AS $$
DECLARE
  v_cols TEXT;
BEGIN
  SELECT string_agg(
    column_name || ' ' ||
    CASE
      WHEN udt_name = 'json' OR udt_name = 'jsonb' THEN 'jsonb'
      WHEN udt_name = 'timestamp' OR udt_name = 'timestamptz' THEN 'timestamptz'
      WHEN udt_name IN ('int2', 'int4', 'int8') THEN 'int8'
      WHEN udt_name = 'numeric' THEN 'numeric'
      WHEN udt_name = 'bool' THEN 'bool'
      ELSE 'text'
    END,
    ', '
  )
  INTO v_cols
  FROM information_schema.columns
  WHERE table_schema = 'data'
    AND table_name = p_table_name
  ORDER BY ordinal_position;

  RETURN v_cols;
END;
$$;

-- Grant permissions (service_role can bypass RLS)
GRANT EXECUTE ON FUNCTION insert_mock_data(TEXT, JSONB) TO service_role;
GRANT EXECUTE ON FUNCTION insert_mock_data(TEXT, JSONB) TO authenticated;

-- Allow function to bypass RLS
ALTER FUNCTION insert_mock_data(TEXT, JSONB) SECURITY DEFINER;

COMMENT ON FUNCTION insert_mock_data(TEXT, JSONB) IS
'Insert mock data into data schema tables. Used by bustly-mock-data skill.';
