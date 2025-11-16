-- Add quality scoring fields to documents table
ALTER TABLE documents 
ADD COLUMN quality_score NUMERIC DEFAULT NULL,
ADD COLUMN needs_review BOOLEAN DEFAULT FALSE,
ADD COLUMN extraction_metrics JSONB DEFAULT NULL;

-- Add index for faster queries on needs_review
CREATE INDEX idx_documents_needs_review ON documents(needs_review) WHERE needs_review = true;

-- Add index for quality score ordering
CREATE INDEX idx_documents_quality_score ON documents(quality_score DESC) WHERE quality_score IS NOT NULL;

-- Add comment explaining the fields
COMMENT ON COLUMN documents.quality_score IS 'Quality score from 0-100 based on extraction completeness and validation';
COMMENT ON COLUMN documents.needs_review IS 'Flag indicating document extraction needs manual review';
COMMENT ON COLUMN documents.extraction_metrics IS 'Detailed metrics: total_questions, complete_questions, incomplete_questions, validation_issues';