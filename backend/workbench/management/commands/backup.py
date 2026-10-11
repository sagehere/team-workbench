import sqlite3
from datetime import datetime
from pathlib import Path
from django.conf import settings
from django.core.management.base import BaseCommand, CommandError

class Command(BaseCommand):
    help = "使用 SQLite 在线备份 API 创建一致性备份"

    def add_arguments(self, parser):
        parser.add_argument("--output", default=None)

    def handle(self, *args, **options):
        source = Path(settings.DATABASES["default"]["NAME"])
        target = Path(options["output"]) if options["output"] else settings.DATA_DIR / "backups" / f"workbench-{datetime.now().strftime('%Y%m%d-%H%M%S-%f')}.sqlite3"
        if not source.exists():
            raise CommandError("数据库尚不存在，请先运行迁移")
        if source.resolve() == target.resolve() or target.exists():
            raise CommandError("备份目标不能是现有文件或正在使用的数据库")
        target.parent.mkdir(parents=True, exist_ok=True)
        with sqlite3.connect(f"file:{source.as_posix()}?mode=ro", uri=True) as src, sqlite3.connect(target) as dst:
            src.backup(dst)
            if dst.execute("PRAGMA integrity_check").fetchone()[0] != "ok":
                raise CommandError("备份完整性校验失败")
        self.stdout.write(str(target))
