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
  try {
    const result = await client.query(
      `INSERT INTO stock_movements (
        owner_id, product_id, user_id, movement_type,
        quantity, stock_before, stock_after,
        source_type, source_id, note
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      RETURNING id, owner_id, product_id, movement_type, source_id`,
      [
        ownerId, productId, userId, type,
        quantity, stockBefore, stockAfter,
        sourceType, sourceId, note
      ]
    );

    console.log("[RIWAYAT STOK TERSIMPAN]", result.rows[0]);
    return result.rows[0];
  } catch (error) {
    console.error("[RIWAYAT STOK GAGAL]", {
      message: error.message,
      code: error.code,
      detail: error.detail,
      table: error.table,
      column: error.column,
      ownerId,
      productId,
      sourceType,
      sourceId
    });
    throw error;
  }
}

module.exports = { recordStockMovement };