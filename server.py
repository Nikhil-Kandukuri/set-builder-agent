"""Flask backend for the Set Builder UI.

This module exposes an API endpoint that expands a short natural language
prompt into a list of items by either calling OpenAI's Chat Completions API or
falling back to local heuristics. The same application also serves the static
frontend assets from the repository root so the UI and backend can be launched
with a single command.
"""
from __future__ import annotations

import json
import logging
import os
import re
from pathlib import Path
from typing import Iterable, List

import requests
from dotenv import load_dotenv
from flask import Flask, jsonify, request, send_from_directory

PRESET_SETS = {
    "ppe": [
        "N95 respirator",
        "Face shield",
        "Disposable gloves",
        "Protective gown",
        "Medical goggles",
        "Hand sanitizer",
    ],
    "first aid": [
        "Adhesive bandages",
        "Sterile gauze pads",
        "Medical tape",
        "Antiseptic wipes",
        "Elastic bandage",
        "Tweezers",
    ],
    "camping": [
        "Tent",
        "Sleeping bag",
        "Camping stove",
        "Water purifier",
        "Headlamp",
        "First aid kit",
    ],
}

load_dotenv()

APP_ROOT = Path(__file__).resolve().parent
STATIC_DIR = APP_ROOT

PORT = int(os.environ.get("PORT", "5000"))
OPENAI_API_KEY = os.environ.get("OPENAI_API_KEY")
OPENAI_MODEL = os.environ.get("OPENAI_MODEL", "gpt-4o-mini")
OPENAI_API_URL = os.environ.get(
    "OPENAI_API_URL", "https://api.openai.com/v1/chat/completions"
)

app = Flask(__name__, static_folder=str(STATIC_DIR), static_url_path="")
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("set-builder")


@app.post("/api/build-set")
def build_set() -> tuple[dict, int]:
    data = request.get_json(silent=True) or {}
    prompt = str(data.get("prompt", "")).strip()
    if not prompt:
        return jsonify({"error": "A prompt describing the set is required."}), 400

    try:
        items = get_set_items(prompt)
    except requests.HTTPError as exc:
        logger.exception("Language model request failed")
        status = exc.response.status_code if exc.response is not None else 500
        if status == 401:
            message = (
                "The language model rejected the request. "
                "Check your API key and permissions."
            )
        else:
            if exc.response is not None:
                try:
                    error_json = exc.response.json()
                    message = error_json.get("error") or error_json.get("message")
                except ValueError:
                    message = exc.response.text
                message = (
                    f"Language model request failed with status {status}: "
                    f"{message or 'unknown error'}"
                )
            else:
                message = str(exc)
        return jsonify({"error": message}), 500
    except requests.RequestException as exc:
        logger.exception("Failed to reach the language model service")
        return (
            jsonify(
                {
                    "error": "Could not reach the language model service. "
                    "Check your network connection and try again.",
                }
            ),
            500,
        )
    except ValueError as exc:
        logger.exception("Language model response was invalid")
        return jsonify({"error": str(exc)}), 500
    except Exception as exc:  # pragma: no cover - defensive fallback
        logger.exception("Failed to generate set items")
        return jsonify({"error": str(exc) or "Failed to generate set items."}), 500

    return jsonify({"items": items}), 200


@app.get("/")
def index() -> str:
    return send_from_directory(STATIC_DIR, "index.html")


@app.get("/<path:asset>")
def static_assets(asset: str):
    # Allow the browser to fetch assets (CSS/JS) directly.
    return send_from_directory(STATIC_DIR, asset)


def get_set_items(prompt: str) -> List[str]:
    if OPENAI_API_KEY:
        return fetch_from_openai(prompt)
    return build_mock_items(prompt)


def fetch_from_openai(prompt: str) -> List[str]:
    headers = {
        "Content-Type": "application/json",
        "Authorization": f"Bearer {OPENAI_API_KEY}",
    }
    payload = {
        "model": OPENAI_MODEL,
        "messages": [
            {
                "role": "system",
                "content": (
                    "You expand short descriptions of kits or collections into "
                    "exhaustive lists. Always respond with JSON in the shape "
                    "{\"items\": [ ... ]}. Include only plain strings."
                ),
            },
            {"role": "user", "content": prompt},
        ],
        "response_format": {"type": "json_object"},
    }

    response = requests.post(OPENAI_API_URL, headers=headers, json=payload, timeout=30)
    response.raise_for_status()

    payload = response.json()
    raw_content = (
        payload.get("choices", [{}])[0]
        .get("message", {})
        .get("content")
    )
    if not raw_content:
        raise ValueError("Language model returned an empty response.")

    try:
        parsed = json.loads(raw_content)
    except json.JSONDecodeError as exc:
        raise ValueError("Language model response was not valid JSON.") from exc

    items = parsed.get("items")
    if not isinstance(items, list) or not items:
        raise ValueError("Language model response did not include any items.")

    return normalize_items(items)


def build_mock_items(prompt: str) -> List[str]:
    lowered = prompt.lower()
    for keyword, items in PRESET_SETS.items():
        if keyword in lowered:
            return normalize_items(items)

    derived = [
        value.strip()
        for value in split_candidates(prompt)
        if value.strip()
    ]
    if derived:
        return normalize_items(derived)

    return normalize_items(
        [
            "example item",
            "another example item",
            "refine your prompt for better results",
        ]
    )


def split_candidates(prompt: str) -> Iterable[str]:
    parts = re.split(r"[\n,]", prompt)
    return parts if len(parts) > 1 else [prompt]


def normalize_items(items: Iterable[str]) -> List[str]:
    cleaned = []
    seen = set()
    for item in items:
        if not isinstance(item, str):
            continue
        normalized = " ".join(item.split()).strip()
        if not normalized or normalized in seen:
            continue
        seen.add(normalized)
        cleaned.append(normalized)
    return cleaned


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=PORT, debug=False)
