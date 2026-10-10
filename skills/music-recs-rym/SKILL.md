---
name: music-recs-rym
description: Use when Philip asks for album or song recommendations through RateYourMusic (RYM). Covers how to browse RYM in Brave without getting blocked and how to turn his request into ranked picks.
---

# Music Recommendations via RateYourMusic

## Browsing RYM

RYM has no API or data dump. Headless browsers get a Cloudflare challenge page. This method works:

1. Open Brave as a visible, dedicated browser (it does not touch his normal profile):
   `browser.open({ name: "rym", app: { path: "/Applications/Brave Browser.app/Contents/MacOS/Brave Browser", tern: false }, headed: true, persist: true, url: <chart URL> })`.
   He uses Brave, not Chrome. If the page title is "Just a moment...", ask him to tick the checkbox in the window, then continue.
2. **Never go straight to a release (album) URL.** Direct navigation to `/release/...` returns HTTP 503. Load a chart page, then follow the album link from it, the way a person clicks through.
3. Navigate and click with in-page JavaScript, for example `tab.evaluate('location.href = "<chart>"')` and `tab.evaluate('document.querySelector(\'a.page_charts_section_charts_item_link.release[href*="<slug>"]\').click()')`. Puppeteer `tab.click` can hang on this window.
4. Wait about 14 seconds after each page load. About ten album pages in one run went fine at that pace.
5. Read only. Never rate, post, or change anything on the account. Close the window afterwards with `browser.close({ name: "rym", kill: true })`.

### Chart URLs

- One genre: `https://rateyourmusic.com/charts/top/album/all-time/g:chamber-pop/`
- Must contain all of several genres: `.../all-time/g:all,chamber%2dpop,indie%2drock/`
- Period: replace `all-time` with a year or decade, such as `2020s`.
- Adding `d:<descriptor>` to the URL is silently ignored. Filter by mood after reading album pages instead.

### Parsing

- Chart items: `.page_charts_section_charts_item`. Inside it are `.page_charts_section_charts_item_title`, `..._genres_primary a`, `..._genres_secondary a`, and `a.page_charts_section_charts_item_link.release` (with `href`). Charts don't show descriptors.
- Album page text (`tab.text("body")`): `Genres\t\n<primary>\n<secondary>\n`, `Descriptors\t\n<comma list>\n`, `RYM Rating\t<x / 5.0 from N ratings>`.

## Process

1. Turn his request into genre filters and target moods. If he names albums he likes, open their RYM pages first and collect the descriptors they share. Those become the target moods.
2. Build candidates from a few chart pages that combine the relevant genres. Skip genres that clash with what he described.
3. Open each shortlisted album page through the chart and read its descriptors.
4. Rank candidates by how many target moods they share. Genre tags alone describe style or instruments, not mood.
5. Reply with a short table: album, how close it is, and the matching moods. Point out tags that conflict with what he asked for.
