"""CI: exercise real container startup, persistence, backup and recovery."""
import json
import os
import subprocess
import time
import urllib.request

IMAGE = os.getenv("SMOKE_IMAGE", "workbench:ci")
NAME = "workbench-ci-" + str(os.getpid())
VOLUME = NAME + "-data"
PORT = os.getenv("SMOKE_PORT", "18080")

def docker(*args):
    return subprocess.check_output(["docker", *args], text=True).strip()

def start():
    docker("run", "-d", "--name", NAME, "-p", f"127.0.0.1:{PORT}:8000", "-e", "DEBUG=true", "-v", f"{VOLUME}:/app/data", IMAGE)
    for _ in range(60):
        try:
            with urllib.request.urlopen(f"http://127.0.0.1:{PORT}/api/health/", timeout=2) as response:
                if json.load(response)["status"] == "ok":
                    return
        except (OSError, ValueError):
            time.sleep(1)
    raise RuntimeError(docker("logs", NAME))

def shell(code):
    return docker("exec", NAME, "python", "manage.py", "shell", "-c", code)

try:
    start()
    # Empty production-style database: no demo records or implicit accounts.
    assert "EMPTY 0 0" in shell("from django.contrib.auth import get_user_model; from workbench.models import Task; print('EMPTY', get_user_model().objects.count(), Task.objects.count())")
    shell("from workbench.models import Project; Project.objects.create(name='Persistence check')")
    docker("rm", "-f", NAME)
    start()
    assert "PERSIST 1" in shell("from workbench.models import Project; print('PERSIST', Project.objects.filter(name='Persistence check').count())")
    docker("exec", NAME, "python", "manage.py", "backup", "--output", "/app/data/test-backup.sqlite3")
    assert "PRAGMA_OK ok" in docker("exec", NAME, "python", "-c", "import sqlite3; db=sqlite3.connect('/app/data/test-backup.sqlite3'); print('PRAGMA_OK', db.execute('PRAGMA integrity_check').fetchone()[0])")
    shell("from workbench.models import Project; Project.objects.create(name='After backup')")
    docker("stop", NAME)
    docker("rm", NAME)
    # Restore only inside this disposable CI volume while the app is stopped.
    docker("run", "--rm", "--entrypoint", "python", "-v", f"{VOLUME}:/app/data", IMAGE, "-c", "import pathlib,shutil; root=pathlib.Path('/app/data'); [p.unlink(missing_ok=True) for p in [root/'workbench.sqlite3-wal',root/'workbench.sqlite3-shm']]; shutil.copyfile(root/'test-backup.sqlite3',root/'workbench.sqlite3')")
    start()
    assert "RESTORE 1 0" in shell("from workbench.models import Project; print('RESTORE', Project.objects.filter(name='Persistence check').count(), Project.objects.filter(name='After backup').count())")
    assert docker("inspect", "--format", "{{.Config.User}}", NAME) == "app"
    print("Container startup, non-root, persistence, backup and restore passed")
finally:
    subprocess.run(["docker", "logs", NAME], check=False)
    subprocess.run(["docker", "rm", "-f", NAME], check=False)
    subprocess.run(["docker", "volume", "rm", VOLUME], check=False)
