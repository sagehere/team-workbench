#!/bin/sh
set -eu
if [ -f /app/data/workbench.sqlite3 ]; then
  python manage.py backup
fi
python manage.py migrate --noinput
exec gunicorn config.wsgi:application --bind 0.0.0.0:8000 --workers 1 --threads 4 --timeout 60 --access-logfile - --error-logfile -
