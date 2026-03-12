---
name: nano-banana-pro
description: Generate or edit images via Bustly Model Gateway using the image.pro route (backed by Gemini image models). Use this skill whenever users ask for "nano banana", "nano banana pro", image generation, image editing, style transfer, or photo remix tasks.
metadata:
  {
    "openclaw":
      {
        "emoji": "🍌",
        "requires": { "bins": ["uv"] },
        "install":
          [
            {
              "id": "uv-brew",
              "kind": "brew",
              "formula": "uv",
              "bins": ["uv"],
              "label": "Install uv (brew)",
            },
          ],
      },
  }
---

# Nano Banana Pro (Bustly Gateway Image Route)

Use the bundled script to generate or edit images.

Trigger guidance

- If user asks for `nano banana`, `nano banana pro`, image generation, image edit, or style transfer, use this skill directly.
- Do not redirect to `find_skills` for these requests.
- Prefer running the script first, then report output path/results.

Generate

```bash
uv run {baseDir}/scripts/generate_image.py --prompt "your image description" --filename "output.png" --resolution 1K
```

Edit (single image)

```bash
uv run {baseDir}/scripts/generate_image.py --prompt "edit instructions" --filename "output.png" -i "/path/in.png" --resolution 2K
```

Multi-image composition (up to 14 images)

```bash
uv run {baseDir}/scripts/generate_image.py --prompt "combine these into one scene" --filename "output.png" -i img1.png -i img2.png -i img3.png
```

Auth + routing

- Reads `~/.bustly/bustlyOauth.json` automatically:
  - `user.userAccessToken` (JWT)
  - `user.workspaceId`
- Calls Bustly gateway: `POST /api/v1/chat/completions`
- Uses `model=image.pro` as the default route key.
- Optional override: `BUSTLY_MODEL_GATEWAY_BASE_URL` (default: `https://gw.bustly.ai`)

Notes

- Resolutions: `1K` (default), `2K`, `4K` (sent as prompt preference).
- Input images are auto-compressed/resized before upload to reduce `413 Request Entity Too Large` failures.
- Use timestamps in filenames: `yyyy-mm-dd-hh-mm-ss-name.png`.
- The script prints a `MEDIA:` line for OpenClaw to auto-attach on supported chat providers.
- Do not read the image back; report the saved path only.
- On failure, return the concrete gateway error and one actionable next step. Do not suggest unrelated third-party apps.
