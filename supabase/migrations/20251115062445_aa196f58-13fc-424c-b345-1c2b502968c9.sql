-- Add processing_status column to documents table
ALTER TABLE documents 
ADD COLUMN processing_status TEXT DEFAULT 'pending' CHECK (processing_status IN ('pending', 'processing', 'completed', 'failed'));

-- Add error_message column to store failure details
ALTER TABLE documents 
ADD COLUMN error_message TEXT;

-- Update existing documents to 'completed' if processed is true
UPDATE documents 
SET processing_status = CASE 
  WHEN processed = true THEN 'completed'
  ELSE 'pending'
END;

-- Enable realtime for documents table
ALTER TABLE documents REPLICA IDENTITY FULL;