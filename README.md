# Tech Landscape

An interactive map of the software and AI infrastructure landscape, laid out as one big poster (like a VC market map). Every company is visible at once.

- **Click a company** to see what it does, its status (public, private, acquired), its market cap or valuation, and your notes.
- **Click a vertical or subvertical title** to see what that category is and its **top 3 players by market cap**.
- **− / + / Fit** zoom the whole map (Fit shows everything at once). Ctrl/⌘ + scroll also zooms.
- **Tree view** switches to an expandable mind map if you prefer that.

**Live site:** https://fahsaipibul.github.io/tech-landscape/

## What's inside

There are two branches:

**AI**: AI Compute & Hardware (chips, memory, networking, data centers, power, GPU clouds) → AI Models (frontier labs, generative media, model hubs) → AI Infrastructure (training data, MLOps, inference, vector DBs, frameworks, agent infra, evals, AI security) → AI Applications & Agents (assistants, AI coding tools, support agents, enterprise search)

**Software**: Cloud & Infrastructure · Data Infrastructure · Developer Tools & DevOps · Cybersecurity · Enterprise Applications · Vertical Software

The colored dot on each company shows its status: 🟢 public · 🟣 private · 🔴 acquired or owned by PE · 🟠 pending deal or IPO · 🟪 open source · ⚪ part of a larger company.

## Notes

Click **Notes** in the top bar to write general views, theses and anything else you want to keep. Notes save to GitHub with **Save to GitHub**, just like map edits. They're stored in this public repo, so anyone with the link can read them.

## Editing (no code needed)

1. Click **Edit** in the top bar.
2. **Add a company:** click the dashed **＋ Add** tile in any box. It drops into that box automatically.
3. **Move things around:** drag a company into another box, or onto another company to put it before that one. Drag a subvertical's title to move the whole box.
4. Click any category or company. The side panel becomes a form where you can:
   - change the name, website, status, market cap / valuation, description or your notes
   - **+ Add company** or **+ Add subcategory** inside the selected category
   - **Move to** another category, or **Delete**
5. Click **Save to GitHub**. The change is committed to this repo and the live site updates in about a minute.

Logos load automatically from the company's website, so typing `coreweave.com` in the Website field is enough. If the logo is wrong, paste an image link into "Custom logo URL".

Your edits are also kept as a draft in your browser. If you close the tab before saving, the site offers to restore them next time.

### One-time setup for saving

The first time you click **Save to GitHub**, it asks for a GitHub token:

1. Go to [GitHub → Settings → Developer settings → Fine-grained tokens](https://github.com/settings/personal-access-tokens/new) and generate a new token.
2. Under **Repository access**, choose **Only select repositories**, then pick `tech-landscape`.
3. Under **Permissions → Repository**, set **Contents** to **Read and write**.
4. Paste the token into the site's ⚙ settings.

The token is stored only in your browser and is sent only to GitHub.

## Files

- `data/landscape.json`: all the content (this is the file the site edits)
- `index.html`, `styles.css`, `app.js`: the site itself (uses [D3](https://d3js.org))

Public market caps come from companiesmarketcap.com (Nov 21, 2026). Private companies show their last reported valuation with its date, and products owned by a bigger company (Azure, Looker…) carry the parent's market cap and only fill the top 3 when there aren't three independent companies with a value. Statuses for the major 2025–26 deals were checked in November 2026. Treat the rest as a starting point and verify them before using them in interviews.
