FROM node:24-bookworm-slim AS frontend
WORKDIR /build
COPY frontend/package*.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

FROM python:3.13-slim-bookworm AS runtime
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 DATA_DIR=/app/data
WORKDIR /app/backend
COPY backend/requirements.lock ./
RUN pip install --no-cache-dir -r requirements.lock && useradd --uid 10001 --create-home app
COPY backend/ ./
COPY --from=frontend /build/dist /app/frontend/dist
RUN SECRET_KEY=build-only-static-collection-not-a-runtime-secret ALLOWED_HOSTS=localhost python manage.py collectstatic --noinput \
    && mkdir -p /app/data && chown -R app:app /app/data \
    && chmod +x entrypoint.sh
USER app
EXPOSE 8000
HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 CMD python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8000/api/health/', timeout=4)"
ENTRYPOINT ["./entrypoint.sh"]
