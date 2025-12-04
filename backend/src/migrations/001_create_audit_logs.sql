-- Migration: 001_create_audit_logs
-- Description: Create audit log table for tracking all user actions
-- Author: Production Improvements
-- Date: 2025-12-02

-- Create audit log table for comprehensive action tracking
CREATE TABLE IF NOT EXISTS audit_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id VARCHAR(255) NOT NULL,
    action VARCHAR(100) NOT NULL, -- e.g., 'receipt_upload', 'cart_review', 'order_placed', 'inventory_update'
    resource_type VARCHAR(50), -- e.g., 'receipt', 'cart', 'order', 'inventory'
    resource_id UUID, -- ID of the affected resource
    status VARCHAR(20) NOT NULL, -- 'success', 'failure', 'pending'
    
    -- Request details
    ip_address INET,
    user_agent TEXT,
    request_method VARCHAR(10),
    request_path TEXT,
    
    -- Detailed metadata as JSONB for flexibility
    metadata JSONB,
    
    -- Error tracking
    error_message TEXT,
    error_stack TEXT,
    
    -- Timing information
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    execution_time_ms INTEGER
);

-- Indexes for efficient querying
CREATE INDEX IF NOT EXISTS idx_audit_user_id ON audit_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_action ON audit_logs(action);
CREATE INDEX IF NOT EXISTS idx_audit_resource ON audit_logs(resource_type, resource_id);
CREATE INDEX IF NOT EXISTS idx_audit_created_at ON audit_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_status ON audit_logs(status);

-- GIN index for JSONB metadata searches
CREATE INDEX IF NOT EXISTS idx_audit_metadata ON audit_logs USING GIN (metadata);

-- Add comment to table
COMMENT ON TABLE audit_logs IS 'Comprehensive audit trail for all user actions and system events';
COMMENT ON COLUMN audit_logs.action IS 'Type of action performed (receipt_upload, cart_review, order_placed, etc.)';
COMMENT ON COLUMN audit_logs.metadata IS 'Flexible JSONB field for action-specific details';
