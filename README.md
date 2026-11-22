# Tech Landscape

An interactive map of the software and AI infrastructure landscape. Click a vertical (for example "Data Infrastructure") to open its subverticals, click a subvertical to see the companies in it, and click a company to read what it does, its status (public, private, acquired) and your own notes.

**Live site:** https://fahsaipibul.github.io/tech-landscape/

## What's inside

There are two branches:

**AI**: AI Compute & Hardware (chips, memory, networking, data centers, power, GPU clouds) → AI Models (frontier labs, generative media, model hubs) → AI Infrastructure (training data, MLOps, inference, vector DBs, frameworks, agent infra, evals, AI security) → AI Applications & Agents (assistants, AI coding tools, support agents, enterprise search)

**Software**: Cloud & Infrastructure · Data Infrastructure · Developer Tools & DevOps · Cybersecurity · Enterprise Applications · Vertical Software

The colored dot on each company shows its status: 🟢 public · 🟣 private · 🔴 acquired or owned by PE · 🟠 pending deal or IPO · 🟪 open source · ⚪ part of a larger company.

## Editing (no code needed)

1. Click **Edit** in the top bar.
2. Click any category or company. The side panel becomes a form where you can:
   - change the name, website, status, description or your notes
   - **+ Add company** or **+ Add subcategory** inside the selected category
   - **Move to** another category, or **Delete**
3. Click **Save to GitHub**. The change is committed to this repo and the live site updates in about a minute.

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

Statuses for the major 2025–26 deals were checked in November 2026. Treat the rest as a starting point and verify them before using them in interviews.
