-- Add indexes for case listing performance
CREATE INDEX IF NOT EXISTS idx_kyb_case_analyst_identity ON kyb_case(analyst_identity);
CREATE INDEX IF NOT EXISTS idx_kyb_case_created_at ON kyb_case(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_kyb_case_analyst_created ON kyb_case(analyst_identity, created_at DESC);
