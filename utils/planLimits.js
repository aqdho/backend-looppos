const PLAN_LIMITS = {
  free: { products: 20, cashiers: 1 },
  trial: { products: 1000, cashiers: 10 },
  starter: { products: 100, cashiers: 3 },
  pro: { products: 1000, cashiers: 10 },
  enterprise: { products: Infinity, cashiers: 30 },
};

async function getPlanUsage(db, ownerId) { 
    const subscriptionResult = await db.query( 
        `SELECT plan, status, expires_at,
            (expires_at > NOW()) AS is_current
     FROM subscriptions
     WHERE owner_id = $1
     LIMIT 1`,
    [ownerId]
  );

  const subscription = subscriptionResult.rows[0]; 
  let plan = "free";

  if ( 
    subscription?.is_current && 
    subscription.status === "trialing" && 
    subscription.plan === "trial"
  ) { 
    plan = "trial";
  } else if ( 
    subscription?.is_current && 
    subscription.status === "active" && 
    ["starter", "pro", "enterprise"].includes(subscription.plan)
  ) { 
    plan = subscription.plan;
  }

  const [productsResult, cashierResult] = await Promise.all([ 
    db.query( 
        `SELECT COUNT(*)::int AS total
       FROM products
       WHERE user_id = $1 AND aktif = TRUE`,
      [ownerId]
    ),
    db.query( 
        `SELECT COUNT(*)::int AS total
       FROM users
       WHERE owner_id = $1
         AND role = 'kasir'
         AND aktif = TRUE`,
      [ownerId]
    ), 
  ]);

  return { 
    plan, 
    limits: PLAN_LIMITS[plan],
    productCount: productsResult.rows[0].total, 
    cashierCount: cashiersResult.rows[0].total,
  };
}

module.exports = { PLAN_LIMITS, getPlanUsage };