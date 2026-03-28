# research checklist

## objective

Find the best product match for the user request with high confidence before adding to Amazon cart.

## source requirements

For non-exact product requests, gather all of the following:

1. **reddit signal**
   - Search relevant subreddits for real-user recommendations and anti-recommendations.
   - Prefer threads with concrete ownership/use context.
   - Prefer sources from the last 12 months; allow up to 24 months only for niche products with limited recent discussion.

2. **non-reddit web signal**
   - Check at least one additional source (professional review, buyer guide, forum, or trusted publication).
   - Prefer sources from the last 18 months.

3. **amazon market signal**
   - Confirm listing quality, rating level, review count, and availability.
   - Capture current effective price, including coupons, lightning deals, promo discounts, and subscribe-and-save effects (if relevant).
   - Require meaningful recent review activity in the last 90 days.

4. **recent-proof requirement**
   - Require at least one supporting source from the last 6–12 months for the final recommendation.
   - If no recent support exists, lower confidence and explicitly note stale-source risk.

## decision rules

- Respect hard constraints first (budget, size, compatibility, quantity, delivery needs).
- Rank using value, not sticker price alone: quality/performance divided by current effective price.
- If two products are similarly strong, prefer the cheaper effective-price option.
- If the better product is on deal and becomes equal/cheaper (or close enough for a clear quality gain), prefer the better product.
- Re-check prices/deals right before the final recommendation.
- Favor consistency across sources over one-off hype.
- Avoid low-confidence listings with poor review depth or obvious quality red flags.
- Keep one fallback candidate.

## output requirements

When presenting the result, include:

- chosen product name
- reason it won
- quick confidence statement (high/medium/low)
- price snapshot
- action taken (added to cart vs external link)
