#!/usr/bin/env python3
"""MiniMax T2A API - Text to Speech."""

import argparse
import json
import os
import sys
from urllib.request import Request, urlopen
from urllib.error import HTTPError


def main():
    parser = argparse.ArgumentParser(description="MiniMax Text-to-Speech")
    parser.add_argument("text", help="Text to convert to speech")
    parser.add_argument("--voice", default="male-qn-qingse",
                        choices=["male-qn-qingse", "female-shaonv", "female-yujie",
                                "male-qn-jingying", "presenter_male", "presenter_female"],
                        help="Voice ID")
    parser.add_argument("--emotion",
                        choices=["happy", "sad", "angry", "fearful", "disgusted", "surprised", "calm", "whisper"],
                        help="Emotion")
    parser.add_argument("--speed", type=float, default=1.0,
                        help="Speed 0.5-2.0")
    parser.add_argument("--output", "-o", default="tts_output.mp3",
                        help="Output file")
    parser.add_argument("--model", default="speech-2.8-hd",
                        help="Model version")

    args = parser.parse_args()

    api_key = os.environ.get("MINIMAX_API_KEY")
    if not api_key:
        print("ERROR: MINIMAX_API_KEY environment variable not set")
        sys.exit(1)

    if not args.text.strip():
        print("ERROR: Empty text provided")
        sys.exit(1)

    # Build payload
    voice_setting = {
        "voice_id": args.voice,
        "speed": args.speed,
        "vol": 1.0,
        "pitch": 0,
    }
    if args.emotion:
        voice_setting["emotion"] = args.emotion

    payload = {
        "model": args.model,
        "text": args.text,
        "stream": False,
        "voice_setting": voice_setting,
        "audio_setting": {
            "sample_rate": 32000,
            "bitrate": 128000,
            "format": "mp3",
            "channel": 1,
        },
    }

    # Make request
    req = Request(
        "https://api.minimaxi.com/v1/t2a_v2",
        data=json.dumps(payload).encode("utf-8"),
        headers={
            "Content-Type": "application/json",
            "Authorization": f"Bearer {api_key}",
        },
        method="POST",
    )

    try:
        with urlopen(req, timeout=60) as resp:
            data = json.loads(resp.read().decode("utf-8"))
    except HTTPError as e:
        print(f"ERROR: API returned {e.code}")
        print(e.read().decode("utf-8"))
        sys.exit(1)

    # Check response
    status_code = data.get("base_resp", {}).get("status_code", -1)
    if status_code != 0:
        print(f"ERROR: {data.get('base_resp', {}).get('status_msg', 'Unknown error')}")
        sys.exit(1)

    # Decode and save audio
    audio_hex = data["data"]["audio"]
    audio_bytes = bytes.fromhex(audio_hex)

    with open(args.output, "wb") as f:
        f.write(audio_bytes)

    # Output result
    extra = data.get("extra_info", {})
    print(f"SUCCESS: Audio saved to {os.path.abspath(args.output)}")
    print(f"Duration: {extra.get('audio_length', 0)} ms")
    print(f"Size: {extra.get('audio_size', 0)} bytes")
    print(f"Characters: {extra.get('usage_characters', 0)}")


if __name__ == "__main__":
    main()
