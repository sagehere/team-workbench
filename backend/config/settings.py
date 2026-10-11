import os
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent
DEBUG = os.getenv("DEBUG", "false").lower() == "true"
SECRET_KEY = os.getenv("SECRET_KEY", "")
if not SECRET_KEY and not DEBUG:
    raise RuntimeError("请设置 SECRET_KEY；本地开发可设置 DEBUG=true")
if not DEBUG and (len(SECRET_KEY) < 32 or SECRET_KEY.startswith("replace-")):
    raise RuntimeError("SECRET_KEY 必须为至少 32 位的随机值，不能使用示例占位符")
SECRET_KEY = SECRET_KEY or "development-only-do-not-use-in-production"
ALLOWED_HOSTS = os.getenv("ALLOWED_HOSTS", "localhost,127.0.0.1,testserver" if DEBUG else "").split(",")
CSRF_TRUSTED_ORIGINS = [s for s in os.getenv("CSRF_TRUSTED_ORIGINS", "").split(",") if s]
if DEBUG:
    CSRF_TRUSTED_ORIGINS += ["http://127.0.0.1:5173", "http://localhost:5173"]
INSTALLED_APPS = ["django.contrib.auth", "django.contrib.contenttypes", "django.contrib.sessions", "django.contrib.staticfiles", "workbench.apps.WorkbenchConfig"]
MIDDLEWARE = [
    "django.middleware.security.SecurityMiddleware",
    "whitenoise.middleware.WhiteNoiseMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
]
ROOT_URLCONF = "config.urls"
WSGI_APPLICATION = "config.wsgi.application"
DATA_DIR = Path(os.getenv("DATA_DIR", BASE_DIR.parent / "data"))
DATA_DIR.mkdir(parents=True, exist_ok=True)
DATABASES = {"default": {"ENGINE": "django.db.backends.sqlite3", "NAME": DATA_DIR / "workbench.sqlite3", "OPTIONS": {"timeout": 20, "transaction_mode": "IMMEDIATE"}}}
AUTH_PASSWORD_VALIDATORS = [
    {"NAME": "django.contrib.auth.password_validation.UserAttributeSimilarityValidator"},
    {"NAME": "django.contrib.auth.password_validation.MinimumLengthValidator", "OPTIONS": {"min_length": 10}},
    {"NAME": "django.contrib.auth.password_validation.CommonPasswordValidator"},
    {"NAME": "django.contrib.auth.password_validation.NumericPasswordValidator"},
]
LANGUAGE_CODE = "zh-hans"
TIME_ZONE = "Asia/Shanghai"
USE_TZ = True
DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"
SESSION_COOKIE_HTTPONLY = True
SESSION_COOKIE_SAMESITE = "Lax"
SESSION_COOKIE_AGE = 60 * 60 * 24 * 7
SESSION_COOKIE_SECURE = not DEBUG
CSRF_COOKIE_SECURE = not DEBUG
SECURE_SSL_REDIRECT = not DEBUG
# Only the configured reverse proxy may reach the loopback-bound app port.
SECURE_PROXY_SSL_HEADER = ("HTTP_X_FORWARDED_PROTO", "https")
SECURE_HSTS_SECONDS = 31536000 if not DEBUG else 0
SECURE_CONTENT_TYPE_NOSNIFF = True
CSRF_FAILURE_VIEW = "workbench.views.csrf_failure"
STATIC_URL = "/assets/"
STATIC_ROOT = BASE_DIR / "staticfiles"
FRONTEND_DIST = BASE_DIR.parent / "frontend" / "dist"
STATICFILES_DIRS = [FRONTEND_DIST / "assets"] if (FRONTEND_DIST / "assets").exists() else []
STORAGES = {"staticfiles": {"BACKEND": "whitenoise.storage.CompressedStaticFilesStorage"}}
WHITENOISE_MAX_AGE = 31536000
SECURE_REDIRECT_EXEMPT = [r"^api/health/$"]
DATA_UPLOAD_MAX_MEMORY_SIZE = 1024 * 1024
