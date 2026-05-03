"""
Lumen Chatbot — Flask entry point.

Wires together the app factory, CORS, and the single Blueprint
that owns all routes. All business logic lives in separate modules.
"""
from flask import Flask
from flask_cors import CORS

from routes import blueprint


def create_app() -> Flask:
    app = Flask(__name__)
    CORS(app)
    app.register_blueprint(blueprint)
    return app


if __name__ == "__main__":
    create_app().run(debug=True, host="0.0.0.0", port=8080, threaded=True)
