-- Add extraction_data column to store extraction results for ANALYZED cases
ALTER TABLE kyb_case ADD COLUMN IF NOT EXISTS extraction_data JSONB;
