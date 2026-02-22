# research checklist

## objective

Find the best product match for the user request with high confidence before adding to Amazon cart.

## source requirements

For non-exact product requests, gather all of the following:

1. **reddit signal**
   - Search relevant subreddits for real-user recommendations and anti-recommendations.
   - Prefer threads with concrete ownership/use context.

2. **non-reddit web signal**
   - Check at least one additional source (professional review, buyer guide, forum, or trusted publication).

3. **amazon market signal**
   - Confirm listing quality, rating level, review count, and availability.
   - Prefer items with stable review volume and recent activity.

## decision rules

- Respect hard constraints first (budget, size, compatibility, quantity, delivery needs).
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
