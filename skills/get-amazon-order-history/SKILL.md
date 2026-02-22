---
name: get-amazon-order-history
description: Look up Amazon order history and specific orders for the user. Use when the user asks about Amazon purchases, orders, deliveries, or wants to check if a specific item was ordered. First searches Gmail for Amazon order emails, then falls back to the Amazon website via browser if email results are insufficient.
version: "0.1.0"
author: alyosha
dependencies:
  - gog (gmail)
  - browser (amazon)
---

# Get Amazon Order History

## Workflow

### Step 1: Search Gmail first

Use `gog gmail messages search` to find Amazon order emails. Check both accounts (pwg46@cornell.edu and pwgeske@gmail.com).

Useful search queries:
- Specific item: `from:amazon subject:<item keyword> newer_than:90d`
- Recent orders: `from:(auto-confirm@amazon.com OR order-update@amazon.com) newer_than:30d`
- Delivered items: `from:amazon subject:Delivered newer_than:30d`
- Specific order: `from:amazon subject:<order number>`

Example:
```bash
gog gmail messages search "from:amazon subject:HDMI newer_than:60d" --max 10 --account pwg46@cornell.edu --json
gog gmail messages search "from:amazon subject:HDMI newer_than:60d" --max 10 --account pwgeske@gmail.com --json
```

Email subjects from Amazon follow patterns like:
- `Ordered: "Product Name..."`
- `Shipped: "Product Name..."`
- `Delivered: "Product Name..."`

If the subject gives enough info (product name, date, order number), report it to the user. Read the full email body only if more detail is needed.

### Step 2: Fall back to browser if email is insufficient

If Gmail search doesn't yield the needed information, use the browser to check Amazon order history directly:

```
https://www.amazon.com/gp/your-account/order-history
```

Use `profile="chrome"` — the user should already be logged in. If Amazon redirects to a login page, ask the user to log in and attach the tab.

Navigate to specific orders as needed:
- Filter by time: use the dropdown on the orders page ("past 3 months", "past year", etc.)
- Search orders: use the search box on the orders page

### Step 3: Report findings

Present the order info clearly: product name, order date, status (ordered/shipped/delivered), and order number if available.
