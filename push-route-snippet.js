/**
 * push-route-snippet.js
 *
 * ADD THIS to routes/ops-routes.js inside the module.exports function,
 * alongside the other router.* declarations.
 *
 * BEFORE deploying:
 *  1. npm install web-push
 *  2. npx web-push generate-vapid-keys
 *  3. Add to .env:
 *       VAPID_PUBLIC_KEY=...
 *       VAPID_PRIVATE_KEY=...
 *       VAPID_EMAIL=ops@flowguard.ng
 *  4. Paste VAPID_PUBLIC_KEY into CONFIG.VAPID_KEY in field.html
 *  5. Run the CREATE TABLE block below once (or add to a migration)
 *  6. pm2 restart flowguard-api
 */

// ── DB: run once to create push_subscriptions table ──────────────
// psql -U flowguard_user -d flowguard_prod -h localhost
// CREATE TABLE IF NOT EXISTS push_subscriptions (
//   id            SERIAL PRIMARY KEY,
//   user_id       INTEGER REFERENCES users(id) ON DELETE CASCADE,
//   endpoint      TEXT NOT NULL UNIQUE,
//   subscription  JSONB NOT NULL,
//   created_at    TIMESTAMP DEFAULT NOW(),
//   updated_at    TIMESTAMP DEFAULT NOW()
// );
// CREATE INDEX IF NOT EXISTS idx_push_user ON push_subscriptions(user_id);


// ── Add to the top of the module.exports(pool, authenticateToken) function ──

const webpush = require('web-push');

webpush.setVapidDetails(
    `mailto:${process.env.VAPID_EMAIL || 'ops@flowguard.ng'}`,
    process.env.VAPID_PUBLIC_KEY,
    process.env.VAPID_PRIVATE_KEY
);


// ── POST /api/v1/push/subscribe ─────────────────────────────────
// Called by field.html after push permission is granted
router.post('/push/subscribe', authenticateToken, async (req, res) => {
    try {
        const { subscription, user_id } = req.body;

        if (!subscription || !subscription.endpoint) {
            return res.status(400).json({ success: false, error: 'Invalid subscription object' });
        }

        // Ensure table exists (idempotent safety net — remove after first deploy)
        await pool.query(`
            CREATE TABLE IF NOT EXISTS push_subscriptions (
                id           SERIAL PRIMARY KEY,
                user_id      INTEGER REFERENCES users(id) ON DELETE CASCADE,
                endpoint     TEXT NOT NULL UNIQUE,
                subscription JSONB NOT NULL,
                created_at   TIMESTAMP DEFAULT NOW(),
                updated_at   TIMESTAMP DEFAULT NOW()
            )
        `);

        // Upsert — one subscription record per endpoint
        await pool.query(`
            INSERT INTO push_subscriptions (user_id, endpoint, subscription, updated_at)
            VALUES ($1, $2, $3, NOW())
            ON CONFLICT (endpoint) DO UPDATE
              SET subscription = EXCLUDED.subscription,
                  user_id      = EXCLUDED.user_id,
                  updated_at   = NOW()
        `, [user_id || req.user.id, subscription.endpoint, JSON.stringify(subscription)]);

        res.json({ success: true, message: 'Push subscription saved' });

    } catch (error) {
        console.error('Push subscribe error:', error);
        res.status(500).json({ success: false, error: 'Failed to save push subscription' });
    }
});


// ── Helper: send push to a specific user ────────────────────────
// Call this from your dispatch logic (e.g. when creating a ticket):
//
//   await sendPushToUser(pool, userId, {
//     title:    'FlowGuard Field',
//     body:     `New job: ${alertType} at ${siteName}`,
//     severity: alert.severity,
//     alertId:  alert.alert_id
//   });

async function sendPushToUser(pool, userId, payload) {
    try {
        const result = await pool.query(
            'SELECT subscription FROM push_subscriptions WHERE user_id = $1',
            [userId]
        );

        const sends = result.rows.map(async row => {
            try {
                await webpush.sendNotification(
                    row.subscription,
                    JSON.stringify(payload)
                );
            } catch (err) {
                // 410 Gone = subscription expired; clean it up
                if (err.statusCode === 410) {
                    await pool.query(
                        'DELETE FROM push_subscriptions WHERE subscription->>\'endpoint\' = $1',
                        [row.subscription.endpoint]
                    ).catch(() => {});
                }
            }
        });

        await Promise.allSettled(sends);
    } catch (error) {
        console.error('sendPushToUser error:', error);
    }
}

// Export helper so it can be used in ticket dispatch routes:
// const { sendPushToUser } = require('./ops-routes');  ← adjust if needed
// Or attach to app: app.set('sendPushToUser', sendPushToUser);


// ── POST /api/v1/tickets — UPDATED to send push on dispatch ─────
// Replace your existing tickets route with this version,
// which sends a push notification to all team members when a job is dispatched.
//
// (Only the new block marked NEW is added — the rest is identical to your
//  existing tickets route in ops-routes.js)

router.post('/tickets-with-push', authenticateToken, async (req, res) => {
    try {
        const { alert_id, assigned_team, client_id, title, description } = req.body;
        const ticket_id = 'TKT-' + Math.floor(Math.random() * 9000 + 1000);

        const result = await pool.query(`
            INSERT INTO tickets (ticket_id, alert_id, assigned_team, client_id, title, description, status, created_at, assigned_at)
            VALUES ($1,$2,$3,$4,$5,$6,'assigned',NOW(),NOW()) RETURNING *
        `, [ticket_id, alert_id, assigned_team, client_id, title, description]);

        if (alert_id && assigned_team) {
            await pool.query(
                `UPDATE alerts SET assigned_team=$1, status='dispatched', updated_at=NOW() WHERE alert_id=$2`,
                [assigned_team, alert_id]
            ).catch(e => console.error('Alert update failed:', e));
        }

        // ── NEW: Push notification to all team members ──────────
        if (assigned_team) {
            // Get team member user IDs
            const membersResult = await pool.query(`
                SELECT tm.user_id
                FROM teams t
                JOIN team_members tm ON t.team_id = tm.team_id
                WHERE t.name = $1
            `, [assigned_team]).catch(() => ({ rows: [] }));

            // Get alert details for the notification body
            const alertResult = await pool.query(
                'SELECT alert_type, severity FROM alerts WHERE alert_id = $1',
                [alert_id]
            ).catch(() => ({ rows: [] }));

            const alertDetail = alertResult.rows[0] || {};

            for (const member of membersResult.rows) {
                await sendPushToUser(pool, member.user_id, {
                    title:    'FlowGuard Field — Job Dispatched',
                    body:     `${alertDetail.alert_type || title || 'New job'} dispatched to ${assigned_team}`,
                    severity: alertDetail.severity || 'high',
                    alertId:  alert_id
                });
            }
        }
        // ── END NEW ─────────────────────────────────────────────

        res.status(201).json({ success: true, data: result.rows[0] });

    } catch (error) {
        console.error('Create ticket error:', error);
        res.status(500).json({ success: false, error: 'Failed to create ticket' });
    }
});
