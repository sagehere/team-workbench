import os
from datetime import datetime, time, timedelta
from django.conf import settings
from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction
from django.utils import timezone
from workbench.models import Activity, Project, Tag, Task

class Command(BaseCommand):
    help = "仅开发环境：建立可浏览的演示数据，不覆盖现有任务"

    def handle(self, *args, **options):
        if not settings.DEBUG:
            raise CommandError("演示数据仅允许 DEBUG=true 时创建")
        password = os.getenv("DEMO_PASSWORD")
        if not password:
            raise CommandError("请通过 DEMO_PASSWORD 设置开发演示密码")
        if Task.objects.exists():
            self.stdout.write("已存在任务，跳过演示数据")
            return
        User = get_user_model()
        with transaction.atomic():
            admin, created = User.objects.get_or_create(username="demo", defaults={"first_name": "小安", "is_superuser": True, "is_staff": True})
            if created:
                admin.set_password(password); admin.save()
            members = [admin]
            for username, name in [("lin", "小林"), ("chen", "小陈"), ("wen", "小文"), ("zhou", "小周")]:
                member, created = User.objects.get_or_create(username=username, defaults={"first_name": name})
                if created:
                    member.set_password(password); member.save()
                members.append(member)
            projects = [Project.objects.get_or_create(name=name, defaults={"description": desc, "color": color})[0] for name, desc, color in [("官网焕新计划", "从品牌表达出发，打造更清晰的官网体验。", "#5186dc"), ("秋季市场活动", "把好的产品带给更多人，一起做好这个秋天。", "#8e7bc8"), ("客户体验升级", "关注每一次反馈，让服务变得更有温度。", "#58ab92")]]
            tags = [Tag.objects.get_or_create(name=name, defaults={"color": color})[0] for name, color in [("设计", "#8e7bc8"), ("客户沟通", "#5186dc"), ("重点关注", "#d49a4d")]]
            today = timezone.localdate(); now = timezone.now(); week = today - timedelta(days=today.weekday())
            names = ["新产品方案设计", "客户合同审核", "官网改版开发", "市场活动策划", "数据报表整理", "供应商对接", "团队培训安排", "客户需求沟通", "设计稿修改", "活动场地确认", "预算审批流程", "合同条款确认", "首页视觉优化", "用户访谈整理", "产品方案评审", "品牌素材归档", "10月市场活动方案定稿", "客户需求调研报告", "官网首页设计稿", "会议纪要整理", "产品竞品分析", "客户满意度调研", "供应商合同续签", "团队能力提升计划"]
            statuses = ["in_progress", "pending", "in_progress", "pending", "in_progress", "blocked", "pending", "pending", "in_progress", "waiting", "blocked", "waiting", "in_progress", "waiting", "waiting", "blocked", "done", "done", "done", "done", "done", "pending", "waiting", "pending"]
            next_steps = ["完善方案", "发起审核", "开发迭代", "补充资料", "整理数据", "等待反馈", "确认讲师"]
            for i, (name, status) in enumerate(zip(names, statuses)):
                due_day = today + timedelta(days=i % 7 - (1 if i == 1 else 0))
                due = timezone.make_aware(datetime.combine(due_day, time(9 + i % 9, 0)))
                task = Task.objects.create(title=name, status=status, priority=["high", "high", "medium", "medium", "low"][i % 5], assignee=members[i % len(members)], project=projects[i % 3], due_at=due, planned_date=today if i < 6 else due_day, focus_week=week if i in [0, 2, 3, 10, 21, 23] else None, next_action=next_steps[i % 7], notes="同步当前进展，遇到问题及时与团队沟通。", status_since=now - timedelta(days=i % 4 + 1), completed_at=now - timedelta(hours=i) if status == "done" else None)
                task.tags.set([tags[i % 3]])
                Task.objects.filter(pk=task.pk).update(updated_at=now - timedelta(minutes=i))
                Activity.objects.create(actor=admin, task=task, action="create", summary=f"创建任务 {name}")
        self.stdout.write("演示数据已创建；账号 demo，密码使用 DEMO_PASSWORD")
