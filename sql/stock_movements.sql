CREATE TABLE IF NOT EXISTS stock_movements (
    id BIGSERIAL PRIMARY KEY,
    owner_id BIGINT NOT NULL,
    product_id BIGINT NOT NULL,
    user_id BIGINT,
    movement_type VARCHAR(40) NOT NULL,
    quantity NUMERIC(14, 3) NOT NULL,
    stock_before NUMERIC(14, 3) NOT NULL,
    stock_after NUMERIC(14, 3) NOT NULL,
    source_type VARCHAR(40) NOT NULL,
    source_id TEXT,
    note TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_stock_movements_owner_created
    ON stock_movements (owner_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_stock_movements_product_created
    ON stock_movements (product_id, created_at DESC);
