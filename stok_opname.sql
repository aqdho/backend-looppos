BEGIN;

CREATE TABLE IF NOT EXISTS stock_opnames (
    id BIGSERIAL PRIMARY KEY,
    owner_id BIGINT NOT NULL,
    user_id BIGINT,
    total_items INTEGER NOT NULL DEFAULT 0,
    total_adjustments INTEGER NOT NULL DEFAULT 0,
    note TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS stock_opname_details (
    id BIGSERIAL PRIMARY KEY,
    opname_id BIGINT NOT NULL
        REFERENCES stock_opnames(id) ON DELETE CASCADE,
    product_id BIGINT NOT NULL,
    product_name TEXT NOT NULL,
    stock_system INTEGER NOT NULL,
    stock_physical INTEGER NOT NULL,
    difference INTEGER NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_stock_opnames_owner_created
    ON stock_opnames (owner_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_stock_opname_details_opname
    ON stock_opname_details (opname_id);

COMMIT;