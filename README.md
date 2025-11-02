# Set Builder UI

A tiny, framework-free web application that lets you build a mathematical set
from user input. Add values one at a time or in bulk, see them rendered as
removable chips, and copy the resulting set literal to your clipboard.

## Getting started

You can still open `index.html` directly in your browser for the basic set
builder, but to use the AI assistant you now run a small Python backend. The
server hosts the static files and exposes the JSON API consumed by the UI.

```bash
python -m venv .venv
source .venv/bin/activate  # On Windows use `.venv\\Scripts\\activate`
pip install -r requirements.txt
python server.py
```

By default the server runs on <http://localhost:5000> and serves the same UI
alongside a JSON API at `POST /api/build-set`.

### Connecting to an LLM

The backend can proxy your prompt to OpenAI's Chat Completions API when the
following environment variables are defined. You can export them directly or
store them in a `.env` file in this directory—the server loads it automatically
on startup.

```
OPENAI_API_KEY=sk-...
# Optional overrides
OPENAI_MODEL=gpt-4o-mini
OPENAI_API_URL=https://api.openai.com/v1/chat/completions
```

If no API key is provided the server falls back to lightweight, on-device
expansions so you can still exercise the end-to-end flow locally.

## Features

- Prevents duplicate values automatically using the `Set` data structure.
- Supports bulk entry via comma or newline separated values.
- Provides accessible feedback for actions such as add, remove, clear, and copy.
- Generates a formatted set literal that can be copied to the clipboard.
