"""
Routes — one Blueprint containing all HTTP handlers.

Each handler is intentionally thin: parse the request, call a service
module, and return JSON.  No business logic lives here.
"""
from __future__ import annotations

import threading
import uuid

from flask import Blueprint, jsonify, render_template, request
from openai import OpenAI

import mcp_service
import store
import streaming as stream_module

import re

blueprint = Blueprint("main", __name__)

# Maps stream_id → threading.Event so POST /api/chat/cancel can stop generation.
_cancel_events: dict[str, threading.Event] = {}


# ── Request helpers ───────────────────────────────────────────────────────────

def _body() -> dict:
    return request.get_json(silent=True) or {}


def _openai_client(body: dict) -> OpenAI:
    return OpenAI(
        api_key=body.get("api_key") or "sk-placeholder",
        base_url=body.get("api_base") or "https://api.openai.com/v1",
    )


# ── UI ────────────────────────────────────────────────────────────────────────

@blueprint.route("/")
def index():
    return render_template("index.html")


# ── Conversations ─────────────────────────────────────────────────────────────

@blueprint.route("/api/conversations", methods=["GET"])
def list_conversations():
    return jsonify(store.list_all())


@blueprint.route("/api/conversations", methods=["POST"])
def create_conversation():
    return jsonify(store.create(_body().get("title", "New Conversation"))), 201


@blueprint.route("/api/conversations/<conv_id>", methods=["GET"])
def get_conversation(conv_id: str):
    data = store.load(conv_id)
    return jsonify(data) if data else (jsonify({"error": "Not found"}), 404)


@blueprint.route("/api/conversations/<conv_id>", methods=["PUT"])
def update_conversation(conv_id: str):
    data = store.load(conv_id) or {"id": conv_id}
    data.update(_body())
    data["id"] = conv_id  # guard against accidental id override
    return jsonify(store.save(conv_id, data))


@blueprint.route("/api/conversations/<conv_id>", methods=["DELETE"])
def delete_conversation(conv_id: str):
    return jsonify({"ok": True}) if store.delete(conv_id) else (jsonify({"error": "Not found"}), 404)


# ── MCP ───────────────────────────────────────────────────────────────────────

@blueprint.route("/api/mcp/config", methods=["GET"])
def get_mcp_config():
    return jsonify(mcp_service.load_config())


@blueprint.route("/api/mcp/config", methods=["POST"])
def save_mcp_config():
    mcp_service.save_config(_body())
    return jsonify({"ok": True})


@blueprint.route("/api/mcp/tools", methods=["GET"])
def list_mcp_tools():
    servers = mcp_service.load_config().get("mcpServers", {})
    all_tools: list[dict] = []
    for name, cfg in servers.items():
        all_tools.extend(mcp_service.run_async(mcp_service.fetch_tools(name, cfg)))
    return jsonify(all_tools)


@blueprint.route("/api/mcp/call", methods=["POST"])
def call_mcp_tool():
    body = _body()
    server_name: str = body.get("server", "")
    server_config = mcp_service.find_server(server_name)
    if not server_config:
        return jsonify({"error": f"MCP server '{server_name}' not found"}), 404
    result = mcp_service.run_async(
        mcp_service.invoke_tool(server_name, server_config, body.get("tool", ""), body.get("arguments", {}))
    )
    return jsonify({"result": result})


# ── Images ────────────────────────────────────────────────────────────────────

@blueprint.route("/api/images", methods=["POST"])
def upload_image():
    body = _body()
    data_b64   = body.get("data", "")
    media_type = body.get("media_type", "image/png")
    try:
        name = store.save_image(data_b64, media_type)
        return jsonify({"ref": name, "url": f"/api/images/{name}"})
    except Exception as exc:
        return jsonify({"error": str(exc)}), 400


@blueprint.route("/api/images/<name>", methods=["GET"])
def serve_image(name: str):
    from flask import send_file
    path = store.get_image_path(name)
    if not path:
        return jsonify({"error": "Not found"}), 404
    ext  = name.rsplit(".", 1)[-1]
    mime = f"image/{'jpeg' if ext == 'jpeg' else ext}"
    return send_file(path, mimetype=mime)


# ── Title generation ──────────────────────────────────────────────────────────

@blueprint.route("/api/generate-title", methods=["POST"])
def generate_title():
    body = _body()
    client = _openai_client(body)
    messages = body.get("messages", [])
    parsed_messages = ""
    for msg in messages:
        role = msg.get("role", "")
        if role not in {"user", "assistant"}:
            continue
        content = msg.get("content", "")
        ## remove /n/n from content
        content = content.replace("\n\n", "").strip()
        if content == "":
            continue
        if role and content:
            parsed_messages += f"{role}: {content}\n"
        
    
    try:
        response = client.chat.completions.create(
            model=body.get("model", "gpt-4o"),
            messages=[
                {
                    "role": "system",
                    "content": (
                        "Generate a short, concise title (4–6 words) for this conversation. "
                        "Reply with ONLY the title — no quotes, no punctuation at the end. "
                        "Don't overthink it; just give me a quick label that captures the main topic. "
                        "Write the title like this: {Title Here}"
                    ),
                },
                {"role": "user", "content": parsed_messages.strip()},
            ],
            max_tokens=512,
            temperature=0.7,
        )
        title = response.choices[0].message.content.strip()
        # Extract title from the model's response using regex
        match = re.search(r"\{(.+?)\}", title)
        if match:
            title = match.group(1)
        return jsonify({"title": title})
    except Exception as exc:
        return jsonify({"error": str(exc)}), 400


# ── Chat ──────────────────────────────────────────────────────────────────────

@blueprint.route("/api/chat/stream", methods=["POST"])
def chat_stream():
    body = _body()
    client    = _openai_client(body)
    stream_id = body.get("stream_id") or str(uuid.uuid4())

    cancel_event = threading.Event()
    _cancel_events[stream_id] = cancel_event

    def generator_with_cleanup():
        try:
            yield from stream_module.stream_chat_completion(
                client,
                model=body.get("model", "gpt-4o"),
                messages=body.get("messages", []),
                tools=body.get("tools", []),
                cancel_event=cancel_event,
            )
        finally:
            _cancel_events.pop(stream_id, None)

    return stream_module.make_streaming_response(generator_with_cleanup())


@blueprint.route("/api/chat/cancel", methods=["POST"])
def chat_cancel():
    stream_id = _body().get("stream_id", "")
    event = _cancel_events.get(stream_id)
    if event:
        event.set()
        return jsonify({"ok": True})
    return jsonify({"ok": False, "reason": "stream not found"}), 404


# ── Models ────────────────────────────────────────────────────────────────────

@blueprint.route("/api/models", methods=["POST"])
def fetch_models():
    body = _body()
    try:
        models = sorted(m.id for m in _openai_client(body).models.list())
        return jsonify({"models": models})
    except Exception as exc:
        return jsonify({"error": str(exc)}), 400
