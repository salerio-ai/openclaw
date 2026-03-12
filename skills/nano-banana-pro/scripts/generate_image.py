#!/usr/bin/env python3
# /// script
# requires-python = ">=3.10"
# dependencies = [
#   "pillow>=10.0.0",
# ]
# ///
"""
Generate/edit images through Bustly Model Gateway (image.pro route by default).

Usage:
    uv run generate_image.py --prompt "your image description" --filename "output.png" [--resolution 1K|2K|4K]

Multi-image edit/composition (up to 14 images):
    uv run generate_image.py --prompt "combine these images" --filename "output.png" -i img1.png -i img2.png -i img3.png
"""

import argparse
import base64
import json
import mimetypes
import os
import sys
from io import BytesIO
from pathlib import Path
from urllib.error import HTTPError
from urllib.request import Request, urlopen

DEFAULT_GATEWAY_BASE_URL = os.environ.get("BUSTLY_MODEL_GATEWAY_BASE_URL", "https://gw.bustly.ai").strip()
DEFAULT_ROUTE_MODEL = os.environ.get("BUSTLY_MODEL_GATEWAY_IMAGE_ROUTE", "image.pro").strip() or "image.pro"
DEFAULT_USER_AGENT = os.environ.get("BUSTLY_MODEL_GATEWAY_USER_AGENT", "OpenClaw/CLI").strip() or "OpenClaw/CLI"
DEFAULT_STATE_DIR = ".bustly"
MAX_INPUT_IMAGES = 14
MAX_IMAGE_BYTES = int(os.environ.get("NANO_BANANA_MAX_IMAGE_BYTES", str(700 * 1024)))
MAX_TOTAL_IMAGE_BYTES = int(os.environ.get("NANO_BANANA_MAX_TOTAL_IMAGE_BYTES", str(1400 * 1024)))
MAX_IMAGE_DIM = int(os.environ.get("NANO_BANANA_MAX_IMAGE_DIM", "1536"))
MIN_IMAGE_DIM = int(os.environ.get("NANO_BANANA_MIN_IMAGE_DIM", "640"))
JPEG_QUALITIES = (88, 80, 72, 64, 56, 48, 40)


def resolve_state_dir() -> Path:
    override = os.environ.get("OPENCLAW_STATE_DIR", "").strip()
    if override:
        return Path(os.path.expanduser(override)).resolve()
    return (Path.home() / DEFAULT_STATE_DIR).resolve()


def load_bustly_oauth_config() -> dict:
    config_path = resolve_state_dir() / "bustlyOauth.json"
    if not config_path.exists():
        raise RuntimeError(
            f"Missing auth config: {config_path}. Please log in from Bustly desktop first."
        )
    try:
        payload = json.loads(config_path.read_text(encoding="utf-8"))
    except Exception as exc:
        raise RuntimeError(f"Failed to parse {config_path}: {exc}") from exc
    if not isinstance(payload, dict):
        raise RuntimeError(f"Invalid auth config format in {config_path}.")
    return payload


def resolve_auth(args: argparse.Namespace) -> tuple[str, str]:
    if args.jwt and args.workspace_id:
        return args.jwt.strip(), args.workspace_id.strip()

    oauth = load_bustly_oauth_config()
    user = oauth.get("user")
    if not isinstance(user, dict):
        raise RuntimeError("Invalid bustlyOauth.json: missing user object.")

    jwt = (args.jwt or user.get("userAccessToken") or "").strip()
    workspace_id = (args.workspace_id or user.get("workspaceId") or "").strip()

    if not jwt:
        raise RuntimeError("Missing user.userAccessToken in bustlyOauth.json.")
    if not workspace_id:
        raise RuntimeError("Missing user.workspaceId in bustlyOauth.json.")
    return jwt, workspace_id


def chat_url(base_url: str) -> str:
    base = (base_url or "").strip().rstrip("/")
    if not base:
        raise RuntimeError("Gateway base URL is empty.")
    if base.endswith("/api/v1"):
        return f"{base}/chat/completions"
    return f"{base}/api/v1/chat/completions"


def prompt_with_resolution(prompt: str, resolution: str) -> str:
    return f"{prompt}\n\nOutput preference: {resolution}."


def _jpeg_data_url(raw: bytes) -> str:
    return f"data:image/jpeg;base64,{base64.b64encode(raw).decode('ascii')}"


def _encode_jpeg_bytes(image) -> tuple[bytes, int]:
    best_data: bytes | None = None
    best_quality = JPEG_QUALITIES[-1]
    for quality in JPEG_QUALITIES:
        out = BytesIO()
        image.save(out, format="JPEG", quality=quality, optimize=True, progressive=True)
        data = out.getvalue()
        if best_data is None or len(data) < len(best_data):
            best_data = data
            best_quality = quality
        if len(data) <= MAX_IMAGE_BYTES:
            return data, quality
    if best_data is None:
        raise RuntimeError("Failed to encode input image as JPEG.")
    return best_data, best_quality


def _load_and_prepare_image(path: Path):
    try:
        from PIL import Image
    except Exception as exc:
        raise RuntimeError(f"Pillow import failed: {exc}") from exc

    with Image.open(path) as src:
        img = src.convert("RGBA")
    if img.mode == "RGBA":
        bg = Image.new("RGBA", img.size, (255, 255, 255, 255))
        bg.paste(img, (0, 0), img)
        img = bg.convert("RGB")
    else:
        img = img.convert("RGB")

    width, height = img.size
    max_dim = max(width, height)
    if max_dim > MAX_IMAGE_DIM:
        scale = MAX_IMAGE_DIM / float(max_dim)
        img = img.resize((max(1, int(width * scale)), max(1, int(height * scale))), Image.Resampling.LANCZOS)
    return img


def image_file_to_data_url(image_path: str) -> tuple[str, str]:
    from PIL import Image as PILImage

    path = Path(image_path).expanduser().resolve()
    if not path.exists():
        raise RuntimeError(f"Input image not found: {path}")

    original_size = path.stat().st_size
    image = _load_and_prepare_image(path)
    used_quality = JPEG_QUALITIES[-1]
    attempt = 0
    while True:
        data, used_quality = _encode_jpeg_bytes(image)
        if len(data) <= MAX_IMAGE_BYTES:
            ratio = 100.0 * len(data) / max(1, original_size)
            note = (
                f"{path.name}: {original_size/1024:.0f}KB -> {len(data)/1024:.0f}KB "
                f"(q={used_quality}, {image.size[0]}x{image.size[1]}, {ratio:.1f}% of original)"
            )
            return _jpeg_data_url(data), note

        width, height = image.size
        if max(width, height) <= MIN_IMAGE_DIM:
            raise RuntimeError(
                f"Input image '{path.name}' is still too large after compression "
                f"({len(data)/1024:.0f}KB). Please provide a smaller image."
            )

        attempt += 1
        shrink = 0.82
        image = image.resize(
            (max(1, int(width * shrink)), max(1, int(height * shrink))),
            PILImage.Resampling.LANCZOS,
        )
        if attempt > 8:
            raise RuntimeError(
                f"Failed to reduce '{path.name}' under upload limit after multiple compression attempts."
            )


def build_payload(args: argparse.Namespace) -> dict:
    prompt_text = prompt_with_resolution(args.prompt, args.resolution)
    if args.input_images:
        if len(args.input_images) > MAX_INPUT_IMAGES:
            raise RuntimeError(
                f"Too many input images ({len(args.input_images)}). Maximum is {MAX_INPUT_IMAGES}."
            )
        content = [{"type": "text", "text": prompt_text}]
        total_bytes = 0
        for image_path in args.input_images:
            data_url, note = image_file_to_data_url(image_path)
            payload_bytes = len(data_url)
            total_bytes += payload_bytes
            if total_bytes > MAX_TOTAL_IMAGE_BYTES:
                raise RuntimeError(
                    "Combined input images are too large after compression "
                    f"({total_bytes/1024:.0f}KB > {MAX_TOTAL_IMAGE_BYTES/1024:.0f}KB). "
                    "Please reduce image count or source resolution."
                )
            print(f"Prepared input image: {note}")
            content.append(
                {
                    "type": "image_url",
                    "image_url": {"url": data_url},
                }
            )
        messages = [{"role": "user", "content": content}]
    else:
        messages = [{"role": "user", "content": prompt_text}]

    return {
        "model": (args.model or DEFAULT_ROUTE_MODEL).strip() or DEFAULT_ROUTE_MODEL,
        "stream": False,
        "messages": messages,
    }


def call_gateway(gateway_base_url: str, jwt: str, workspace_id: str, payload: dict) -> dict:
    target = chat_url(gateway_base_url)
    body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
    req = Request(
        target,
        data=body,
        method="POST",
        headers={
            "Authorization": f"Bearer {jwt}",
            "X-Workspace-Id": workspace_id,
            "Content-Type": "application/json",
            "Accept": "application/json",
            "User-Agent": DEFAULT_USER_AGENT,
        },
    )
    try:
        with urlopen(req, timeout=180) as resp:
            text = resp.read().decode("utf-8", errors="replace")
            return json.loads(text)
    except HTTPError as exc:
        raw = exc.read().decode("utf-8", errors="replace")
        message = raw
        try:
            err_payload = json.loads(raw)
            if isinstance(err_payload, dict):
                err_obj = err_payload.get("error")
                if isinstance(err_obj, dict):
                    message = str(err_obj.get("message") or message)
                else:
                    message = str(err_payload.get("message") or message)
        except Exception:
            pass
        raise RuntimeError(f"Gateway request failed ({exc.code}): {message}") from exc
    except Exception as exc:
        raise RuntimeError(f"Gateway request failed: {exc}") from exc


def extract_data_urls(response_payload: dict) -> list[str]:
    urls: list[str] = []
    choices = response_payload.get("choices")
    if not isinstance(choices, list):
        return urls

    for choice in choices:
        if not isinstance(choice, dict):
            continue
        message = choice.get("message")
        if not isinstance(message, dict):
            continue

        # OpenRouter image generation format (preferred)
        images = message.get("images")
        if isinstance(images, list):
            for item in images:
                if not isinstance(item, dict):
                    continue
                image_url = item.get("image_url")
                if isinstance(image_url, dict):
                    url = image_url.get("url")
                else:
                    url = image_url
                if isinstance(url, str) and url.startswith("data:"):
                    urls.append(url)

        # Fallback: content array may include image_url
        content = message.get("content")
        if isinstance(content, list):
            for item in content:
                if not isinstance(item, dict):
                    continue
                image_url = item.get("image_url")
                if isinstance(image_url, dict):
                    url = image_url.get("url")
                else:
                    url = image_url
                if isinstance(url, str) and url.startswith("data:"):
                    urls.append(url)

    return urls


def decode_data_url(data_url: str) -> tuple[str, bytes]:
    if not data_url.startswith("data:") or "," not in data_url:
        raise RuntimeError("Unsupported image payload format.")
    header, encoded = data_url.split(",", 1)
    if ";base64" not in header:
        raise RuntimeError("Unsupported image payload format (non-base64).")
    mime = header[5:].split(";")[0] or "image/png"
    try:
        raw = base64.b64decode(encoded)
    except Exception as exc:
        raise RuntimeError(f"Failed to decode image payload: {exc}") from exc
    return mime, raw


def save_first_image(data_url: str, output_path: Path) -> Path:
    mime, raw = decode_data_url(data_url)
    output = output_path
    if not output.suffix:
        guessed = mimetypes.guess_extension(mime) or ".png"
        output = output.with_suffix(guessed)
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_bytes(raw)
    return output


def main():
    parser = argparse.ArgumentParser(
        description="Generate/edit images using Bustly Model Gateway image routes"
    )
    parser.add_argument(
        "--prompt", "-p",
        required=True,
        help="Image description/prompt"
    )
    parser.add_argument(
        "--filename", "-f",
        required=True,
        help="Output filename (e.g., sunset-mountains.png)"
    )
    parser.add_argument(
        "--input-image", "-i",
        action="append",
        dest="input_images",
        metavar="IMAGE",
        help="Input image path(s) for editing/composition. Can be specified multiple times (up to 14 images)."
    )
    parser.add_argument(
        "--resolution", "-r",
        choices=["1K", "2K", "4K"],
        default="1K",
        help="Output preference hint: 1K (default), 2K, or 4K"
    )
    parser.add_argument(
        "--model", "-m",
        default=DEFAULT_ROUTE_MODEL,
        help=f"Gateway model route key (default: {DEFAULT_ROUTE_MODEL})"
    )
    parser.add_argument(
        "--gateway-base-url",
        default=DEFAULT_GATEWAY_BASE_URL,
        help=f"Gateway base URL (default: {DEFAULT_GATEWAY_BASE_URL})"
    )
    parser.add_argument(
        "--jwt",
        help="Bustly user JWT (optional; defaults to bustlyOauth.json user.userAccessToken)"
    )
    parser.add_argument(
        "--workspace-id",
        help="Workspace UUID (optional; defaults to bustlyOauth.json user.workspaceId)"
    )

    args = parser.parse_args()

    try:
        jwt, workspace_id = resolve_auth(args)
        payload = build_payload(args)
        response_payload = call_gateway(args.gateway_base_url, jwt, workspace_id, payload)
        data_urls = extract_data_urls(response_payload)
        if not data_urls:
            model_text = ""
            choices = response_payload.get("choices")
            if isinstance(choices, list) and choices and isinstance(choices[0], dict):
                message = choices[0].get("message")
                if isinstance(message, dict):
                    content = message.get("content")
                    if isinstance(content, str):
                        model_text = content
            warning = response_payload.get("bustly_warning")
            warning_text = ""
            if isinstance(warning, dict):
                warning_text = f" warning={warning.get('code') or warning.get('type')}"
            raise RuntimeError(
                "No image returned by gateway."
                + (f" Model message: {model_text}" if model_text else "")
                + warning_text
            )

        output_path = Path(args.filename).expanduser().resolve()
        saved = save_first_image(data_urls[0], output_path)
        print(f"Image saved: {saved}")
        print(f"MEDIA: {saved}")
    except Exception as exc:
        print(f"Error generating image: {exc}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
