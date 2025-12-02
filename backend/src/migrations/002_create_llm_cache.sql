-- Migration: 002_create_llm_cache
-- Description: Create LLM response cache table to reduce API costs and improve performance
-- Author: Production Improvements
-- Date: 2025-12-02

-- Create LLM cache table for storing and reusing LLM responses
CREATE TABLE IF NOT EXISTS llm_cache (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    
    -- Cache key (hash of system prompt + user prompt + model + temperature)
    cache_key VARCHAR(64) NOT NULL UNIQUE,
    
    -- LLM configuration
    model VARCHAR(100) NOT NULL,
    temperature DECIMAL(3, 2),
    
    -- Prompts (hashed for cache key, stored for debugging)
    system_prompt_hash VARCHAR(64) NOT NULL,
    user_prompt_hash VARCHAR(64) NOT NULL,
    
    -- Store actual prompts for cache invalidation and debugging (optional)
    system_prompt TEXT,
    user_prompt TEXT,
    
    -- Response
    response TEXT NOT NULL,
    
    -- Metadata
    tokens_used INTEGER,
    response_time_ms INTEGER,
    
    -- Cache statistics
    hit_count INTEGER DEFAULT 1,
    last_used_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    -- TTL: expire cache entries after certain time
    expires_at TIMESTAMP
);

-- Indexes for efficient cache lookups
CREATE INDEX IF NOT EXISTS idx_llm_cache_key ON llm_cache(cache_key);
CREATE INDEX IF NOT EXISTS idx_llm_cache_model ON llm_cache(model);
CREATE INDEX IF NOT EXISTS idx_llm_cache_created_at ON llm_cache(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_llm_cache_expires_at ON llm_cache(expires_at) WHERE expires_at IS NOT NULL;

-- Partial index for active cache entries
CREATE INDEX IF NOT EXISTS idx_llm_cache_active ON llm_cache(cache_key) 
WHERE expires_at IS NULL OR expires_at > CURRENT_TIMESTAMP;

-- Add comments
COMMENT ON TABLE llm_cache IS 'Cache for LLM API responses to reduce costs and improve performance';
COMMENT ON COLUMN llm_cache.cache_key IS 'SHA-256 hash of system_prompt + user_prompt + model + temperature';
COMMENT ON COLUMN llm_cache.hit_count IS 'Number of times this cached response was returned';
COMMENT ON COLUMN llm_cache.expires_at IS 'Optional expiration timestamp for cache invalidation';

-- Function to clean up expired cache entries
CREATE OR REPLACE FUNCTION cleanup_expired_llm_cache()
RETURNS INTEGER AS $$
DECLARE
    deleted_count INTEGER;
BEGIN
    DELETE FROM llm_cache 
    WHERE expires_at IS NOT NULL AND expires_at < CURRENT_TIMESTAMP;
    
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION cleanup_expired_llm_cache() IS 'Remove expired LLM cache entries';
