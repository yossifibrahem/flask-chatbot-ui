import os
import json
import uuid
import asyncio
import threading
from datetime import datetime
from pathlib import Path
from flask import Flask, request, jsonify, Response, render_template, stream_with_context
from flask_cors import CORS

app = Flask(__name__)
CORS(app)

CONVERSATIONS_DIR = Path("conversations")
CONVERSATIONS_DIR.mkdir(exist_ok=True)

MCP_CONFIG_FILE = Path("mcp.json")

# ── MCP helpers ──────────────────────────────────────────────────────────────

def load_mcp_config():
    if MCP_CONFIG_FILE.exists():
        with open(MCP_CONFIG_FILE) as f:
            return json.load(f)
    return {"mcpServers": {}}


def save_mcp_config(config):
    with open(MCP_CONFIG_FILE, "w") as f:
        json.dump(config, f, indent=2)


async def get_mcp_tools(server_name: str, server_config: dict):
    """Connect to an MCP server and list its tools."""
    from mcp import ClientSession, StdioServerParameters
    from mcp.client.stdio import stdio_client

    cmd = server_config.get("command", "")
    args = server_config.get("args", [])
    env_extra = server_config.get("env", {})
    env = {**os.environ, **env_extra}

    params = StdioServerParameters(command=cmd, args=args, env=env)
    tools = []
    try:
        async with stdio_client(params) as (r, w):
            async with ClientSession(r, w) as session:
                await session.initialize()
                result = await session.list_tools()
                for t in result.tools:
                    tools.append({
                        "server": server_name,
                        "name": t.name,
                        "description": t.description or "",
                        "inputSchema": t.inputSchema if hasattr(t, "inputSchema") else {},
                    })
    except Exception as e:
        print(f"[MCP] Error listing tools from {server_name}: {e}")
    return tools


async def call_mcp_tool(server_name: str, server_config: dict, tool_name: str, arguments: dict):
    """Call a tool on an MCP server and return the result."""
    from mcp import ClientSession, StdioServerParameters
    from mcp.client.stdio import stdio_client

    cmd = server_config.get("command", "")
    args = server_config.get("args", [])
    env_extra = server_config.get("env", {})
    env = {**os.environ, **env_extra}

    params = StdioServerParameters(command=cmd, args=args, env=env)
    try:
        async with stdio_client(params) as (r, w):
            async with ClientSession(r, w) as session:
                await session.initialize()
                result = await session.call_tool(tool_name, arguments)
                parts = []
                for c in result.content:
                    if hasattr(c, "text"):
                        parts.append(c.text)
                    else:
                        parts.append(str(c))
                return "\n".join(parts)
    except Exception as e:
        return f"Error calling tool {tool_name}: {e}"


def run_async(coro):
    """Run an async coroutine from sync context."""
    try:
        loop = asyncio.get_event_loop()
        if loop.is_running():
            import concurrent.futures
            with concurrent.futures.ThreadPoolExecutor() as pool:
                future = pool.submit(asyncio.run, coro)
                return future.result()
        else:
            return loop.run_until_complete(coro)
    except RuntimeError:
        return asyncio.run(coro)


# ── Conversation helpers ──────────────────────────────────────────────────────

def list_conversations():
    convs = []
    for f in sorted(CONVERSATIONS_DIR.glob("*.json"), key=lambda x: x.stat().st_mtime, reverse=True):
        try:
            with open(f) as fp:
                data = json.load(fp)
            convs.append({
                "id": f.stem,
                "title": data.get("title", "Untitled"),
                "updated_at": data.get("updated_at", ""),
                "message_count": len(data.get("messages", [])),
            })
        except Exception:
            pass
    return convs


def load_conversation(conv_id: str):
    path = CONVERSATIONS_DIR / f"{conv_id}.json"
    if path.exists():
        with open(path) as f:
            return json.load(f)
    return None


def save_conversation(conv_id: str, data: dict):
    data["updated_at"] = datetime.utcnow().isoformat()
    with open(CONVERSATIONS_DIR / f"{conv_id}.json", "w") as f:
        json.dump(data, f, indent=2)


def delete_conversation(conv_id: str):
    path = CONVERSATIONS_DIR / f"{conv_id}.json"
    if path.exists():
        path.unlink()
        return True
    return False


# ── Routes ────────────────────────────────────────────────────────────────────

@app.route("/")
def index():
    return render_template("index.html")


# Conversations CRUD
@app.route("/api/conversations", methods=["GET"])
def api_list_conversations():
    return jsonify(list_conversations())


@app.route("/api/conversations", methods=["POST"])
def api_create_conversation():
    conv_id = str(uuid.uuid4())
    data = {
        "id": conv_id,
        "title": request.json.get("title", "New Conversation"),
        "messages": [],
        "created_at": datetime.utcnow().isoformat(),
    }
    save_conversation(conv_id, data)
    return jsonify(data)


@app.route("/api/conversations/<conv_id>", methods=["GET"])
def api_get_conversation(conv_id):
    data = load_conversation(conv_id)
    if data is None:
        return jsonify({"error": "Not found"}), 404
    return jsonify(data)


@app.route("/api/conversations/<conv_id>", methods=["PUT"])
def api_update_conversation(conv_id):
    data = load_conversation(conv_id) or {}
    body = request.json or {}
    data.update(body)
    data["id"] = conv_id
    save_conversation(conv_id, data)
    return jsonify(data)


@app.route("/api/conversations/<conv_id>", methods=["DELETE"])
def api_delete_conversation(conv_id):
    if delete_conversation(conv_id):
        return jsonify({"ok": True})
    return jsonify({"error": "Not found"}), 404


# MCP config
@app.route("/api/mcp/config", methods=["GET"])
def api_get_mcp_config():
    return jsonify(load_mcp_config())


@app.route("/api/mcp/config", methods=["POST"])
def api_save_mcp_config():
    save_mcp_config(request.json)
    return jsonify({"ok": True})


@app.route("/api/mcp/tools", methods=["GET"])
def api_list_mcp_tools():
    config = load_mcp_config()
    all_tools = []
    for name, srv in config.get("mcpServers", {}).items():
        tools = run_async(get_mcp_tools(name, srv))
        all_tools.extend(tools)
    return jsonify(all_tools)


@app.route("/api/mcp/call", methods=["POST"])
def api_call_mcp_tool():
    body = request.json or {}
    server_name = body.get("server")
    tool_name = body.get("tool")
    arguments = body.get("arguments", {})

    config = load_mcp_config()
    server_config = config.get("mcpServers", {}).get(server_name)
    if not server_config:
        return jsonify({"error": f"Server '{server_name}' not found"}), 404

    result = run_async(call_mcp_tool(server_name, server_config, tool_name, arguments))
    return jsonify({"result": result})


# Streaming chat
@app.route("/api/chat/stream", methods=["POST"])
def api_chat_stream():
    body = request.json or {}
    api_base = body.get("api_base", "https://api.openai.com/v1")
    api_key = body.get("api_key", "")
    model = body.get("model", "gpt-4o")
    messages = body.get("messages", [])
    tools_payload = body.get("tools", [])  # already-formatted tool definitions

    from openai import OpenAI

    client = OpenAI(api_key=api_key or "sk-placeholder", base_url=api_base)

    def generate():
        try:
            kwargs = dict(model=model, messages=messages, stream=True)
            if tools_payload:
                kwargs["tools"] = tools_payload
                kwargs["tool_choice"] = "auto"

            stream = client.chat.completions.create(**kwargs)

            collected_tool_calls = {}
            collected_content = []

            for chunk in stream:
                delta = chunk.choices[0].delta if chunk.choices else None
                if delta is None:
                    continue

                # Text content
                if delta.content:
                    collected_content.append(delta.content)
                    yield f"data: {json.dumps({'type': 'text', 'content': delta.content})}\n\n"

                # Tool call accumulation
                if delta.tool_calls:
                    for tc in delta.tool_calls:
                        idx = tc.index
                        if idx not in collected_tool_calls:
                            collected_tool_calls[idx] = {
                                "id": tc.id or "",
                                "function": {"name": "", "arguments": ""},
                            }
                        if tc.id:
                            collected_tool_calls[idx]["id"] = tc.id
                        if tc.function:
                            if tc.function.name:
                                collected_tool_calls[idx]["function"]["name"] += tc.function.name
                            if tc.function.arguments:
                                collected_tool_calls[idx]["function"]["arguments"] += tc.function.arguments

                finish = chunk.choices[0].finish_reason if chunk.choices else None
                if finish == "tool_calls":
                    calls = list(collected_tool_calls.values())
                    yield f"data: {json.dumps({'type': 'tool_calls', 'calls': calls})}\n\n"

            yield "data: [DONE]\n\n"
        except Exception as e:
            yield f"data: {json.dumps({'type': 'error', 'message': str(e)})}\n\n"
            yield "data: [DONE]\n\n"

    return Response(stream_with_context(generate()), mimetype="text/event-stream",
                    headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"})


# Model fetch
@app.route("/api/models", methods=["POST"])
def api_fetch_models():
    body = request.json or {}
    api_base = body.get("api_base", "https://api.openai.com/v1")
    api_key = body.get("api_key", "")

    from openai import OpenAI
    client = OpenAI(api_key=api_key or "sk-placeholder", base_url=api_base)
    try:
        models = [m.id for m in client.models.list()]
        return jsonify({"models": sorted(models)})
    except Exception as e:
        return jsonify({"error": str(e)}), 400


if __name__ == "__main__":
    app.run(debug=True, port=5000, threaded=True)