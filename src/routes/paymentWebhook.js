export function registerPaymentWebhookRoute(app, db) {
  app.post("/webhooks/payment", async (req, res) => {
    const event = req.body;

    if (!event?.id || !event?.type) {
      return res.status(400).json({
        error: "Invalid webhook event",
      });
    }

    if (event.type !== "payment.succeeded") {
      return res.status(200).send("ok");
    }

    if (!event.booking_id || !event.customer_email) {
      return res.status(400).json({
        error: "Missing payment information",
      });
    }

    const client = await db.connect();

    try {
      await client.query("BEGIN");

      const eventResult = await client.query(
        `
          INSERT INTO webhook_events (event_id, event_type)
          VALUES ($1, $2)
          ON CONFLICT (event_id) DO NOTHING
          RETURNING event_id
        `,
        [event.id, event.type]
      );

      if (eventResult.rowCount === 0) {
        await client.query("ROLLBACK");
        return res.status(200).send("ok");
      }

      const bookingResult = await client.query(
        `
          UPDATE bookings
          SET status = $1
          WHERE id = $2
          RETURNING id
        `,
        ["paid", event.booking_id]
      );

      if (bookingResult.rowCount === 0) {
        await client.query("ROLLBACK");

        return res.status(404).json({
          error: "Booking not found",
        });
      }

      await client.query(
        `
          INSERT INTO payment_outbox
            (event_id, task_type, payload)
          VALUES
            ($1, $2, $3),
            ($1, $4, $3)
        `,
        [
          event.id,
          "SEND_PAYMENT_EMAIL",
          JSON.stringify(event),
          "NOTIFY_CRM",
        ]
      );

      await client.query("COMMIT");

      return res.status(200).send("ok");
    } catch (error) {
      await client.query("ROLLBACK");

      console.error("Payment webhook failed", {
        eventId: event?.id,
        message: error.message,
      });

      return res.status(500).json({
        error: "Webhook processing failed",
      });
    } finally {
      client.release();
    }
  });
}