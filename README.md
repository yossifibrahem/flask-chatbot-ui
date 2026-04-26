# Lumen — Flask AI Chatbot

A sleek, feature-rich AI chatbot with streaming, Markdown/LaTeX rendering, MCP tool calling, and persistent conversations.

## Quick Start

```bash
# 1. Install dependencies
pip install -r requirements.txt

# 2. Run
python app.py
# → Open http://localhost:5000
```

## Features

| Feature | Details |
|---|---|
| **Streaming** | Real-time token-by-token response via SSE |
| **Markdown + LaTeX** | Full GitHub Flavored Markdown + KaTeX math rendering |
| **Code Highlighting** | Syntax highlighting via highlight.js with copy button |
| **OpenAI-compatible** | Works with OpenAI, Ollama, LM Studio, Groq, Together, etc. |
| **Model Fetch** | Auto-fetch available models from any API endpoint |
| **Persistent Conversations** | Saved as JSON files in `./conversations/` |
| **MCP Tool Calling** | Configure MCP servers in `mcp.json` |
| **Tool Confirmation** | Every tool call shows name + arguments; requires user approval |

## Settings

Go to **Settings** tab:
- Set your **API Base URL** (e.g., `http://localhost:11434/v1` for Ollama)
- Enter your **API Key**
- Click **Fetch Models** to auto-discover available models
- Click a model chip to select it
- Optionally set a **System Prompt**

## MCP Tool Calling

Edit `mcp.json` or use the **MCP** tab in the UI:

```json
{
  "mcpServers": {
    "filesystem": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-filesystem", "/tmp"],
      "env": {}
    },
    "brave-search": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-brave-search"],
      "env": {
        "BRAVE_API_KEY": "your-key-here"
      }
    }
  }
}
```

Click **Reload Tools** to connect and list available tools. When the model requests a tool, you'll see a confirmation card with the tool name and arguments before anything executes.

## File Structure

```
chatbot/
├── app.py              # Flask backend
├── mcp.json            # MCP server configuration
├── requirements.txt
├── conversations/      # Saved conversations (auto-created)
└── templates/
    └── index.html      # Full UI
```

## Compatible APIs

- **OpenAI** → `https://api.openai.com/v1`
- **Ollama** → `http://localhost:11434/v1`
- **LM Studio** → `http://localhost:1234/v1`
- **Groq** → `https://api.groq.com/openai/v1`
- **Together AI** → `https://api.together.xyz/v1`
- **Anthropic (via proxy)** → any OpenAI-compatible proxy
