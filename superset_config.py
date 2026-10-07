DEBUG = True
LOG_LEVEL = "DEBUG"

TEMPLATES_AUTO_RELOAD = True

ALLOWED_EXTENSIONS = {"csv", "tsv", "txt", "json"}
ALLOW_DATA_UPLOAD = True

ENABLE_CORS = True
CORS_OPTIONS = {
    "supports_credentials": True,
    "allow_headers": ["*"],
    "resources": {"*": {"origins": "*"}},
}

PREVENT_UNSAFE_DB_CONNECTIONS = False

WTF_CSRF_ENABLED = False

FEATURE_FLAGS = {
    "DASHBOARD_NATIVE_FILTERS": True,
    "DASHBOARD_CROSS_FILTERING": True,
    "ALLOW_DATA_UPLOAD": True,
}

SUPERSET_WEBSERVER_TIMEOUT = 300
