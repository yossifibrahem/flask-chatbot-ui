"""
Lumen Chatbot UI — Flask backend
"""
from __future__ import annotations

import asyncio
import json
import os
import uuid
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Generator

from flask import Flask, Response, jsonify, render_template, request, stream_with_context
from flask_cors import CORS
from openai import OpenAI

# ── App setup ─────────────────────────────────────────────────────────────────

app = Flask(__name__)
CORS(app)

CONVERSATIONS_DIR = Path("conversations")
CONVERSATIONS_DIR.mkdir(exist_ok=True)

MCP_CONFIG_FILE = Path("mcp.json")

# ── Request helpers ───────────────────────────────────────────────────────────

def _request_body() -> dict:
    """Return the parsed JSON body from the current request, or an empty dict."""
    return request.get_json(silent=True) or {}


def _openai_client_from_body(body: dict) -> OpenAI:
    """Build an OpenAI client from api_key / api_base fields in a request body."""
    return OpenAI(
        api_key=body.get("api_key") or "sk-placeholder",
        base_url=body.get("api_base") or "https://api.openai.com/v1",
    )


def _streaming_response(generator: Generator) -> Response:
    """Wrap a generator in a Server-Sent Events streaming response."""
    return Response(
        stream_with_context(generator),
        mimetype="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


# ── MCP helpers ───────────────────────────────────────────────────────────────

def load_mcp_config() -> dict:
    """Load MCP server configuration from disk, returning an empty config if absent."""
    if MCP_CONFIG_FILE.exists():
        return json.loads(MCP_CONFIG_FILE.read_text())
    return {"mcpServers": {}}


def save_mcp_config(config: dict) -> None:
    """Persist MCP server configuration to disk."""
    MCP_CONFIG_FILE.write_text(json.dumps(config, indent=2))


def _find_mcp_server(server_name: str) -> dict | None:
    """Look up a single MCP server config by name, or return None if not found."""
    return load_mcp_config().get("mcpServers", {}).get(server_name)


def _build_server_params(server_config: dict) -> Any:
    """Construct StdioServerParameters from a server config dict (lazy-imported)."""
    from mcp import StdioServerParameters  # optional dependency
    return StdioServerParameters(
        command=server_config.get("command", ""),
        args=server_config.get("args", []),
        env={**os.environ, **server_config.get("env", {})},
    )


async def fetch_mcp_server_tools(server_name: str, server_config: dict) -> list[dict]:
    """Connect to an MCP server and return its available tool definitions."""
    from mcp import ClientSession
    from mcp.client.stdio import stdio_client

    params = _build_server_params(server_config)
    tools: list[dict] = []
    try:
        async with stdio_client(params) as (reader, writer):
            async with ClientSession(reader, writer) as session:
                await session.initialize()
                for tool in (await session.list_tools()).tools:
                    tools.append({
                        "server": server_name,
                        "name": tool.name,
                        "description": tool.description or "",
                        "inputSchema": getattr(tool, "inputSchema", {}),
                    })
    except Exception as exc:
        print(f"[MCP] Failed to list tools from '{server_name}': {exc}")
    return tools


async def invoke_mcp_tool(
    server_name: str,
    server_config: dict,
    tool_name: str,
    arguments: dict,
) -> str:
    """Call a single MCP tool and return its text output."""
    from mcp import ClientSession
    from mcp.client.stdio import stdio_client

    params = _build_server_params(server_config)
    try:
        async with stdio_client(params) as (reader, writer):
            async with ClientSession(reader, writer) as session:
                await session.initialize()
                result = await session.call_tool(tool_name, arguments)
                return "\n".join(
                    c.text if hasattr(c, "text") else str(c)
                    for c in result.content
                )
    except Exception as exc:
        return f"Error calling tool '{tool_name}': {exc}"


def run_async(coro) -> Any:
    """Run an async coroutine safely from a synchronous (Flask) context.

    Always executes in a dedicated thread to avoid conflicts with any
    existing event loop (e.g. Flask's dev-server reloader).
    """
    with ThreadPoolExecutor(max_workers=1) as pool:
        return pool.submit(asyncio.run, coro).result()


# ── Conversation store ────────────────────────────────────────────────────────

def _conversation_path(conv_id: str) -> Path:
    return CONVERSATIONS_DIR / f"{conv_id}.json"


def list_conversations() -> list[dict]:
    """Return all conversations as summaries, sorted by most-recently modified."""
    results: list[dict] = []
    files = sorted(
        CONVERSATIONS_DIR.glob("*.json"),
        key=lambda p: p.stat().st_mtime,
        reverse=True,
    )
    for path in files:
        try:
            data = json.loads(path.read_text())
            results.append({
                "id": path.stem,
                "title": data.get("title", "Untitled"),
                "updated_at": data.get("updated_at", ""),
                "message_count": len(data.get("messages", [])),
            })
        except Exception:
            pass
    return results


def load_conversation(conv_id: str) -> dict | None:
    path = _conversation_path(conv_id)
    return json.loads(path.read_text()) if path.exists() else None


def save_conversation(conv_id: str, data: dict) -> dict:
    """Stamp updated_at and write the conversation to disk, returning the saved data."""
    data["updated_at"] = datetime.now(timezone.utc).isoformat()
    _conversation_path(conv_id).write_text(json.dumps(data, indent=2))
    return data


def delete_conversation(conv_id: str) -> bool:
    path = _conversation_path(conv_id)
    if path.exists():
        path.unlink()
        return True
    return False


def create_conversation(title: str = "New Conversation") -> dict:
    """Create, persist, and return a blank conversation."""
    conv_id = str(uuid.uuid4())
    data = {
        "id": conv_id,
        "title": title,
        "messages": [],
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    return save_conversation(conv_id, data)


# ── SSE streaming ─────────────────────────────────────────────────────────────

def _sse_event(payload: dict) -> str:
    """Format a dict as a Server-Sent Event string."""
    return f"data: {json.dumps(payload)}\n\n"


def _merge_tool_call_chunk(store: dict[int, dict], chunk) -> None:
    """Accumulate a streaming tool-call delta into *store* (indexed by chunk index)."""
    idx = chunk.index
    if idx not in store:
        store[idx] = {"id": chunk.id or "", "function": {"name": "", "arguments": ""}}
    if chunk.id:
        store[idx]["id"] = chunk.id
    if chunk.function:
        store[idx]["function"]["name"] += chunk.function.name or ""
        store[idx]["function"]["arguments"] += chunk.function.arguments or ""


def stream_chat_completion(
    client: OpenAI,
    model: str,
    messages: list[dict],
    tools: list[dict],
) -> Generator[str, None, None]:
    """Yield SSE strings for a streaming OpenAI chat completion."""
    try:
        request_kwargs: dict[str, Any] = {
            "model": model,
            "messages": messages,
            "stream": True,
        }
        if tools:
            request_kwargs["tools"] = tools
            request_kwargs["tool_choice"] = "auto"

        accumulated_tool_calls: dict[int, dict] = {}

        for chunk in client.chat.completions.create(**request_kwargs):
            delta = chunk.choices[0].delta if chunk.choices else None
            if delta is None:
                continue

            if delta.content:
                yield _sse_event({"type": "text", "content": delta.content})

            if delta.tool_calls:
                for tc in delta.tool_calls:
                    _merge_tool_call_chunk(accumulated_tool_calls, tc)

            finish_reason = chunk.choices[0].finish_reason if chunk.choices else None
            if finish_reason == "tool_calls":
                yield _sse_event({
                    "type": "tool_calls",
                    "calls": list(accumulated_tool_calls.values()),
                })

        yield "data: [DONE]\n\n"

    except Exception as exc:
        yield _sse_event({"type": "error", "message": str(exc)})
        yield "data: [DONE]\n\n"


# ── Routes ────────────────────────────────────────────────────────────────────

@app.route("/")
def index() -> str:
    return render_template("index.html")


# Conversations CRUD

@app.route("/api/conversations", methods=["GET"])
def api_list_conversations():
    return jsonify(list_conversations())


@app.route("/api/conversations", methods=["POST"])
def api_create_conversation():
    title = _request_body().get("title", "New Conversation")
    return jsonify(create_conversation(title)), 201


@app.route("/api/conversations/<conv_id>", methods=["GET"])
def api_get_conversation(conv_id: str):
    data = load_conversation(conv_id)
    if data is None:
        return jsonify({"error": "Not found"}), 404
    return jsonify(data)


@app.route("/api/conversations/<conv_id>", methods=["PUT"])
def api_update_conversation(conv_id: str):
    data = load_conversation(conv_id) or {"id": conv_id}
    data.update(_request_body())
    data["id"] = conv_id  # guard against accidental id override
    return jsonify(save_conversation(conv_id, data))


@app.route("/api/conversations/<conv_id>", methods=["DELETE"])
def api_delete_conversation(conv_id: str):
    if delete_conversation(conv_id):
        return jsonify({"ok": True})
    return jsonify({"error": "Not found"}), 404


# MCP config

@app.route("/api/mcp/config", methods=["GET"])
def api_get_mcp_config():
    return jsonify(load_mcp_config())


@app.route("/api/mcp/config", methods=["POST"])
def api_save_mcp_config():
    save_mcp_config(_request_body())
    return jsonify({"ok": True})


@app.route("/api/mcp/tools", methods=["GET"])
def api_list_mcp_tools():
    servers = load_mcp_config().get("mcpServers", {})
    all_tools: list[dict] = []
    for server_name, server_cfg in servers.items():
        all_tools.extend(run_async(fetch_mcp_server_tools(server_name, server_cfg)))
    return jsonify(all_tools)


@app.route("/api/mcp/call", methods=["POST"])
def api_call_mcp_tool():
    body = _request_body()
    server_name: str = body.get("server", "")
    tool_name: str = body.get("tool", "")
    arguments: dict = body.get("arguments", {})

    server_config = _find_mcp_server(server_name)
    if not server_config:
        return jsonify({"error": f"MCP server '{server_name}' not found"}), 404

    result = run_async(invoke_mcp_tool(server_name, server_config, tool_name, arguments))
    return jsonify({"result": result})


# Streaming chat

@app.route("/api/chat/stream", methods=["POST"])
def api_chat_stream():
    body = _request_body()
    client = _openai_client_from_body(body)
    model: str = body.get("model", "gpt-4o")
    messages: list = body.get("messages", [])
    tools: list = body.get("tools", [])

    return _streaming_response(
        stream_chat_completion(client, model, messages, tools)
    )


# Model listing

@app.route("/api/models", methods=["POST"])
def api_fetch_models():
    body = _request_body()
    client = _openai_client_from_body(body)
    try:
        model_ids = sorted(m.id for m in client.models.list())
        return jsonify({"models": model_ids})
    except Exception as exc:
        return jsonify({"error": str(exc)}), 400


if __name__ == "__main__":
    app.run(debug=True, port=8080, threaded=True)
