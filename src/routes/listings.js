const PAGE_SIZE = 20;

export function registerListingsRoute(app, db) {
  app.get("/api/listings", async (req, res) => {
    try {
      const city =
        typeof req.query.city === "string"
          ? req.query.city.trim()
          : "";

      const page = Number.parseInt(req.query.page ?? "1", 10);

      if (!city) {
        return res.status(400).json({
          error: "city is required",
        });
      }

      if (!Number.isInteger(page) || page < 1) {
        return res.status(400).json({
          error: "page must be a positive integer",
        });
      }

      const offset = (page - 1) * PAGE_SIZE;

      const listingsResult = await db.query(
        `
          SELECT
            id,
            title,
            price,
            city,
            agency_id,
            created_at
          FROM listings
          WHERE city = $1
          ORDER BY created_at DESC, id DESC
          LIMIT $2 OFFSET $3
        `,
        [city, PAGE_SIZE, offset]
      );

      const listings = listingsResult.rows;

      if (listings.length === 0) {
        return res.json([]);
      }

      const agencyIds = [
        ...new Set(
          listings
            .map((listing) => listing.agency_id)
            .filter((id) => id != null)
        ),
      ];

      const listingIds = listings.map((listing) => listing.id);

      const [agenciesResult, photosResult] = await Promise.all([
        agencyIds.length > 0
          ? db.query(
              `
                SELECT *
                FROM agencies
                WHERE id = ANY($1::int[])
              `,
              [agencyIds]
            )
          : Promise.resolve({ rows: [] }),

        db.query(
          `
            SELECT listing_id, url
            FROM photos
            WHERE listing_id = ANY($1::int[])
          `,
          [listingIds]
        ),
      ]);

      const agenciesById = new Map(
        agenciesResult.rows.map((agency) => [
          agency.id,
          agency,
        ])
      );

      const photosByListingId = new Map();

      for (const photo of photosResult.rows) {
        const photos =
          photosByListingId.get(photo.listing_id) ?? [];

        photos.push({
          url: photo.url,
        });

        photosByListingId.set(photo.listing_id, photos);
      }

      const response = listings.map((listing) => ({
        ...listing,
        agency:
          agenciesById.get(listing.agency_id) ?? null,
        photos:
          photosByListingId.get(listing.id) ?? [],
      }));

      return res.json(response);
    } catch (error) {
      console.error("Failed to fetch listings", {
        message: error.message,
      });

      return res.status(500).json({
        error: "Unable to fetch listings",
      });
    }
  });
}