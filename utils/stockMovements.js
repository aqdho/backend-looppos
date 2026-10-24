async function recordStockMovement(client, {
  ownerId,
  productId,
  userId = null,
  type,
  quantity,
  stockBefore,
  stockAfter,
  sourceType,
  sourceId = null,
  note = null
}) {
  await client.query(
    `INSERT INTO stock_movements (
      owner_id, product_id, user_id, movement_type,
      quantity, stock_before, stock_after,
      source_type, source_id, note
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
    [
      ownerId, productId, userId, type,
      quantity, stockBefore, stockAfter,
      sourceType, sourceId, note
    ]
  );
}

module.exports = { recordStockMovement };
