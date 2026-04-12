---
name: shopping-research
description: Research products before buying. Use when the user wants help finding a good product, comparing options, narrowing a category, or figuring out what to buy. Start by clarifying the brief, then run parallel sub-agent research across Reddit, X/Twitter, Amazon, and trusted category-specific sources before returning explainable picks.
version: "0.1.0"
author: alyosha
manual_only: true
dependencies:
  - sub-agent
  - browser
  - twitter
---

# shopping-research

Use this skill to turn a vague or broad shopping request into a well-supported recommendation.

This skill is for research and recommendation. It does not place orders or add items to a cart.

## Core Rules

- Start with clarification unless the user already gave a precise brief.
- Ask focused follow-up questions until the product category, budget, style, constraints, and deal-breakers are clear enough to research.
- Run source gathering in parallel sub-agents whenever possible.
- Treat recency as a first-class signal. Recent evidence should outweigh old popularity.
- Prefer category-specific trusted sources over generic SEO roundup sites.
- Be explicit about confidence. If the evidence is weak or split, say so.

## Phase 1: Clarify The Brief

Before researching, gather the minimum details needed to avoid solving the wrong problem.

Ask about:

- use case and environment
- budget or acceptable price bands
- size, fit, or form-factor constraints
- style or aesthetic preferences
- must-have and must-avoid features
- brands to prefer or avoid
- timing constraints such as needing fast shipping or buying during a sale
- region or store constraints if relevant

Examples:

- shoulder bag: sling vs messenger, office vs streetwear, laptop size, material, budget
- TV: room brightness, size, gaming vs movies, budget, wall mount, OLED tolerance
- headphones: wired vs wireless, ANC, comfort, microphone needs, platform compatibility

If the user gives a broad request like "find me a good shoulder bag," ask targeted questions first instead of researching immediately.

Once the brief is clear enough, restate it in one short block so the user can confirm the target.

## Phase 2: Parallel Research

Launch parallel sub-agents for the strongest available source types.

Required source lanes for most categories:

1. Reddit
   - Search relevant subreddits for owner experience, repeated recommendations, and anti-recommendations.
   - Prefer concrete usage reports over one-line endorsements.

2. X/Twitter
   - Use the `twitter` skill for X lookups.
   - Look for recent hands-on sentiment, complaints, release chatter, and durability or support issues.
   - Treat X as a secondary signal, not the sole basis for a recommendation.

3. Amazon
   - Check current listings, price, rating, review depth, review recency, availability, and obvious red flags.
   - Use Amazon as a strong market signal, but not as proof of product quality by itself.

4. Trusted category sources
   - Use category-specific reputable sources when available.
   - See `references/source-guidelines.md` for examples and source quality rules.

Additional optional lanes when useful:

- manufacturer specs for hard compatibility questions
- specialist forums for niche categories
- YouTube only when the creator is clearly credible and current
- retailer listings outside Amazon when pricing or availability matters

## Recency Policy

Prefer recent evidence unless the category moves slowly.

- Reddit and X: strongly prefer the last 3 to 6 months; treat 6 to 12 months as supporting; use older discussion only for slow-moving or niche categories
- review sites and buyer guides: prefer the last 12 months; stretch to 18 months only when the category is stable
- Amazon: require current listing checks and recent review activity when possible
- if a product is older but still commonly recommended, verify it is still sold, still competitive, and not superseded

If the best available evidence is old, lower confidence and say the recommendation may be stale.

## Source Quality Rules

- Prefer repeated consensus over one viral mention.
- Downweight affiliate SEO listicles and generic "best X of 2026" pages with shallow testing.
- Downweight obviously astroturfed Reddit threads or suspicious review patterns.
- Prefer sources that explain tradeoffs, testing conditions, or real-world ownership context.
- For technical categories, prefer sources with measurements or comparative methodology.

## Category Mode

Adjust the research mix and evaluation criteria by category.

- TVs and monitors: prioritize measured testing sources such as RTINGS and current model-year comparisons
- bags and luggage: prioritize owner durability feedback, carry comfort, organization, and material quality from enthusiast communities and specialist review sites
- audio gear: prioritize comfort, tuning, ANC, latency, microphone quality, and device compatibility
- kitchen gear: prioritize durability, cleaning, warranty, and long-term owner feedback
- niche enthusiast gear: favor specialist forums and category experts over broad lifestyle sites

## Decision Framework

Score candidates using these dimensions:

- fit for the user's stated constraints
- source consensus
- recency of support
- Amazon market signal
- value at the current price

Do not optimize for the single "best" item in the abstract. Optimize for the user's actual brief.

## Output Format

Return a concise recommendation set with explainable reasoning.

Default structure:

- Best overall
- Best value
- Best premium

For each pick, include:

- product name
- current price or price band if available
- why it fits the user's brief
- what sources supported it
- key caveat or tradeoff

Also include:

- a short statement of what the user asked for
- a confidence rating: high, medium, or low
- a one-line explanation of why the top pick won
- if useful, a note on where Amazon is overpriced or not the best place to buy

If no product clearly stands out, say that directly and present the top contenders with the tradeoff.

## Execution Notes For Agents

- Use sub-agents for independent research lanes and synthesize the results centrally.
- Do not skip clarification just to move faster.
- Do not pretend certainty when the evidence is thin.
- When the user seems under-specified, keep asking short targeted questions until the brief is actionable.
- Keep the final answer short, but make the reasoning legible.
