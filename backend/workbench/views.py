import hashlib
import json
import re
from datetime import date, datetime, time, timedelta
from functools import wraps

from django.conf import settings
from django.contrib.auth import authenticate, get_user_model, login, logout, update_session_auth_hash
from django.contrib.auth.password_validation import validate_password
from django.contrib.sessions.models import Session
from django.core.exceptions import ValidationError
from django.core.paginator import Paginator
from django.db import IntegrityError, connection, transaction
from django.db.models import Count, Q
from django.http import FileResponse, JsonResponse
from django.middleware.csrf import get_token
from django.utils import timezone
from django.utils.dateparse import parse_datetime

from .models import Activity, LoginAttempt, Project, Tag, Task

User = get_user_model()

class APIError(Exception):
    def __init__(self, message, status=400):
        self.message, self.status = message, status

def api(methods, admin=False, anonymous=False):
    def decorate(fn):
        @wraps(fn)
        def wrapped(request, *args, **kwargs):
            if request.method not in methods:
                return JsonResponse({"error": "不支持的请求方式"}, status=405)
            if not anonymous and not request.user.is_authenticated:
                return JsonResponse({"error": "请先登录"}, status=401)
            if admin and not request.user.is_superuser:
                return JsonResponse({"error": "此操作需要管理员权限"}, status=403)
            try:
                return fn(request, *args, **kwargs)
            except APIError as exc:
                return JsonResponse({"error": exc.message}, status=exc.status)
            except ValidationError as exc:
                return JsonResponse({"error": "；".join(exc.messages)}, status=400)
            except IntegrityError:
                return JsonResponse({"error": "名称已存在或关联数据无效"}, status=400)
        return wrapped
    return decorate

def body(request):
    try:
        data = json.loads(request.body or b"{}")
    except (ValueError, UnicodeDecodeError):
        raise APIError("请求必须是有效的 JSON")
    if not isinstance(data, dict):
        raise APIError("请求必须是 JSON 对象")
    return data

def text_field(data, key, maximum, required=False):
    value = data.get(key, "")
    if not isinstance(value, str):
        raise APIError(f"{key} 必须为文字")
    value = value.strip()
    if len(value) > maximum or (required and not value):
        raise APIError(f"{key} 不能为空且不得超过 {maximum} 字" if required else f"{key} 不得超过 {maximum} 字")
    return value

def date_field(value):
    if value is None or value == "":
        return None
    try:
        return date.fromisoformat(value)
    except (TypeError, ValueError):
        raise APIError("日期格式应为 YYYY-MM-DD")

def identifier(value):
    if type(value) is not int or value < 1:
        raise APIError("标识必须为正整数")
    return value

def user_json(user):
    return {"id": user.id, "username": user.username, "name": user.first_name or user.username, "admin": user.is_superuser, "active": user.is_active}

def task_json(task):
    return {
        "id": task.id, "title": task.title, "status": task.status, "priority": task.priority,
        "assignee": task.assignee_id, "project": task.project_id, "tags": [t.id for t in task.tags.all()],
        "due_at": task.due_at.isoformat() if task.due_at else None,
        "planned_date": str(task.planned_date) if task.planned_date else None,
        "focus_week": str(task.focus_week) if task.focus_week else None,
        "next_action": task.next_action, "notes": task.notes, "version": task.version,
        "created_at": task.created_at.isoformat(), "updated_at": task.updated_at.isoformat(),
        "status_since": task.status_since.isoformat(),
        "completed_at": task.completed_at.isoformat() if task.completed_at else None,
        "deleted_at": task.deleted_at.isoformat() if task.deleted_at else None,
    }

def task_set(deleted=False):
    return Task.objects.filter(deleted_at__isnull=not deleted).prefetch_related("tags")

def paginate(request, qs, serializer, size=10):
    try:
        page_num = int(request.GET.get("page", 1))
    except ValueError:
        raise APIError("页码必须是整数")
    page = Paginator(qs, size).get_page(page_num)
    return JsonResponse({"items": [serializer(x) for x in page], "total": page.paginator.count, "pages": page.paginator.num_pages, "page": page.number})

def csrf_failure(request, reason=""):
    return JsonResponse({"error": "安全校验失败，请刷新页面后重试"}, status=403)

@api(["GET"], anonymous=True)
def health(request):
    with connection.cursor() as cursor:
        cursor.execute("SELECT 1")
    return JsonResponse({"status": "ok"})

@api(["GET"], anonymous=True)
def session(request):
    return JsonResponse({"user": user_json(request.user) if request.user.is_authenticated else None, "csrf": get_token(request)})

@api(["POST"], anonymous=True)
def sign_in(request):
    data = body(request)
    username = text_field(data, "username", 150, True)
    password = data.get("password")
    if not isinstance(password, str) or len(password) > 1000:
        raise APIError("请输入密码")
    now = timezone.now()
    # Separate account and IP limits so changing either cannot bypass the other.
    keys = [hashlib.sha256(v.encode()).hexdigest() for v in ["user:" + username.casefold(), "ip:" + request.META.get("REMOTE_ADDR", "unknown")]]
    with transaction.atomic():
        attempts = []
        for key in keys:
            attempt, _ = LoginAttempt.objects.get_or_create(key=key, defaults={"window_start": now})
            if now - attempt.window_start >= timedelta(minutes=15):
                attempt.failures, attempt.window_start = 0, now
            attempts.append(attempt)
        if any(a.failures >= limit for a, limit in zip(attempts, [5, 30])):
            return JsonResponse({"error": "尝试次数过多，请在 15 分钟后重试"}, status=429)
        user = authenticate(request, username=username, password=password)
        for attempt in attempts:
            attempt.failures = 0 if user else attempt.failures + 1
            attempt.save()
        LoginAttempt.objects.filter(window_start__lt=now - timedelta(days=1)).delete()
    if not user:
        raise APIError("用户名或密码不正确", 401)
    login(request, user)
    return JsonResponse({"user": user_json(user), "csrf": get_token(request)})

@api(["POST"])
def sign_out(request):
    logout(request)
    return JsonResponse({"ok": True})

def revoke_sessions(user):
    for item in Session.objects.filter(expire_date__gt=timezone.now()).iterator():
        if item.get_decoded().get("_auth_user_id") == str(user.pk):
            item.delete()

@api(["POST"])
def change_password(request):
    data = body(request)
    if not request.user.check_password(text_field(data, "current_password", 1000, True)):
        raise APIError("当前密码不正确")
    password = text_field(data, "password", 1000, True)
    validate_password(password, request.user)
    request.user.set_password(password)
    request.user.save()
    revoke_sessions(request.user)
    update_session_auth_hash(request, request.user)
    return JsonResponse({"ok": True})

@api(["GET"])
def bootstrap(request):
    return JsonResponse({
        "users": [user_json(u) for u in User.objects.order_by("id")],
        "projects": list(Project.objects.order_by("id").values("id", "name", "description", "color")),
        "tags": list(Tag.objects.order_by("id").values("id", "name", "color")),
    })

@api(["GET", "POST"], admin=True)
def members(request):
    if request.method == "GET":
        return JsonResponse({"items": [user_json(u) for u in User.objects.order_by("id")]})
    data = body(request)
    username = text_field(data, "username", 150, True)
    name = text_field(data, "name", 150, True)
    password = text_field(data, "password", 1000, True)
    user = User(username=username, first_name=name)
    user.full_clean(exclude=["password"])
    validate_password(password, user)
    user.set_password(password)
    user.save()
    Activity.objects.create(actor=request.user, action="member_create", summary=f"创建成员 {name}")
    return JsonResponse(user_json(user), status=201)

@api(["PATCH"], admin=True)
def member_detail(request, pk):
    data = body(request)
    with transaction.atomic():
        user = User.objects.filter(pk=pk).first()
        if not user:
            raise APIError("成员不存在", 404)
        if "active" in data:
            if type(data["active"]) is not bool:
                raise APIError("active 必须为布尔值")
            if not data["active"] and user.pk == request.user.pk:
                raise APIError("不能停用当前登录账号")
            if not data["active"] and user.is_superuser and User.objects.filter(is_superuser=True, is_active=True).count() <= 1:
                raise APIError("必须保留至少一名启用的管理员")
            user.is_active = data["active"]
        if "name" in data:
            user.first_name = text_field(data, "name", 150, True)
        if "password" in data:
            password = text_field(data, "password", 1000, True)
            validate_password(password, user)
            user.set_password(password)
        user.save()
        if not user.is_active or "password" in data:
            revoke_sessions(user)
        Activity.objects.create(actor=request.user, action="member_update", summary=f"更新成员 {user.first_name or user.username}" + ("（重置密码）" if "password" in data else ""))
    return JsonResponse(user_json(user))

@api(["GET", "POST"])
def projects(request):
    if request.method == "GET":
        rows = Project.objects.annotate(total=Count("task", filter=Q(task__deleted_at__isnull=True)), done=Count("task", filter=Q(task__deleted_at__isnull=True, task__status="done"))).order_by("id")
        return JsonResponse({"items": [{"id": p.id, "name": p.name, "description": p.description, "color": p.color, "total": p.total, "done": p.done} for p in rows]})
    return save_named(request, Project)

@api(["PATCH"])
def project_detail(request, pk):
    return save_named(request, Project, pk)

@api(["GET", "POST"])
def tags(request):
    if request.method == "GET":
        return JsonResponse({"items": list(Tag.objects.annotate(total=Count("task", filter=Q(task__deleted_at__isnull=True))).order_by("id").values("id", "name", "color", "total"))})
    return save_named(request, Tag)

@api(["PATCH"])
def tag_detail(request, pk):
    return save_named(request, Tag, pk)

def save_named(request, model, pk=None):
    data = body(request)
    values = {"name": text_field(data, "name", 100 if model == Project else 40, True), "color": data.get("color", "#2d6cdf")}
    if not isinstance(values["color"], str) or not re.fullmatch(r"#[0-9a-fA-F]{6}", values["color"]):
        raise APIError("颜色格式不正确")
    if model == Project:
        values["description"] = text_field(data, "description", 2000)
    if pk:
        if not model.objects.filter(pk=pk).update(**values):
            raise APIError("记录不存在", 404)
    else:
        pk = model.objects.create(**values).pk
    Activity.objects.create(actor=request.user, action="catalog_update", summary=f"{'更新' if request.method == 'PATCH' else '创建'}{'项目' if model == Project else '标签'} {values['name']}")
    return JsonResponse({"id": pk, **values}, status=200 if request.method == "PATCH" else 201)

def task_values(data, existing=None):
    allowed = {"title", "status", "priority", "assignee", "project", "tags", "due_at", "planned_date", "focus_week", "next_action", "notes", "version"}
    if set(data) - allowed:
        raise APIError("包含不支持的任务字段")
    values = {}
    for key, limit in [("title", 200), ("next_action", 300), ("notes", 10000)]:
        if key in data or not existing:
            values[key] = text_field(data, key, limit, key == "title")
    for key, choices, default in [("status", Task.Status.values, "pending"), ("priority", Task.Priority.values, "medium")]:
        if key in data or not existing:
            value = data.get(key, default)
            if value not in choices:
                raise APIError(f"{key} 无效")
            values[key] = value
    for key, model in [("assignee", User), ("project", Project)]:
        if key in data:
            value = data[key]
            if value is not None:
                identifier(value)
                qs = model.objects.filter(pk=value)
                # Allow retaining an inactive assignee, but never assign a new task to one.
                if model == User and not (existing and existing.assignee_id == value):
                    qs = qs.filter(is_active=True)
                if not qs.exists():
                    raise APIError("负责人未启用或项目不存在")
            values[key + "_id"] = value
    for key in ["planned_date", "focus_week"]:
        if key in data:
            values[key] = date_field(data[key])
    if values.get("focus_week"):
        values["focus_week"] -= timedelta(days=values["focus_week"].weekday())
    if "due_at" in data:
        value = data["due_at"]
        if value is None or value == "":
            values["due_at"] = None
        else:
            try:
                value = parse_datetime(value)
            except (TypeError, ValueError):
                value = None
            if not value or timezone.is_naive(value):
                raise APIError("截止时间必须包含有效的时区")
            values["due_at"] = value
    tag_ids = None
    if "tags" in data:
        tag_ids = data["tags"]
        if not isinstance(tag_ids, list) or len(tag_ids) > 30:
            raise APIError("标签必须为列表且不超过 30 个")
        for value in tag_ids:
            identifier(value)
        tag_ids = list(set(tag_ids))
        if Tag.objects.filter(id__in=tag_ids).count() != len(tag_ids):
            raise APIError("标签不存在")
    return values, tag_ids

@api(["GET", "POST"])
def tasks(request):
    if request.method == "POST":
        data = body(request)
        values, tag_ids = task_values(data)
        now = timezone.now()
        values.update(status_since=now, completed_at=now if values.get("status") == "done" else None)
        with transaction.atomic():
            task = Task.objects.create(**values)
            task.tags.set(tag_ids or [])
            Activity.objects.create(actor=request.user, task=task, action="create", summary=f"创建任务 {task.title}")
        return JsonResponse(task_json(task), status=201)
    deleted = request.GET.get("deleted") == "true"
    if deleted and not request.user.is_superuser:
        raise APIError("回收站仅管理员可查看", 403)
    qs = task_set(deleted)
    search = request.GET.get("q", "").strip()[:200]
    if search:
        qs = qs.filter(Q(title__icontains=search) | Q(notes__icontains=search) | Q(next_action__icontains=search) | Q(project__name__icontains=search) | Q(assignee__first_name__icontains=search) | Q(assignee__username__icontains=search))
    for field in ["status", "priority", "assignee", "project"]:
        value = request.GET.get(field)
        if value:
            if field in ["assignee", "project"]:
                try:
                    value = int(value)
                except ValueError:
                    raise APIError("筛选标识无效")
            qs = qs.filter(**{field: value})
    if request.GET.get("tag"):
        try:
            qs = qs.filter(tags__id=int(request.GET["tag"]))
        except ValueError:
            raise APIError("标签标识无效")
    selected = date_field(request.GET.get("date")) or timezone.localdate()
    view = request.GET.get("view")
    if view == "today":
        qs = qs.filter(planned_date=selected).exclude(status="done")
    elif view == "upcoming":
        qs = qs.exclude(status="done").filter(due_at__date__gte=selected, due_at__date__lt=selected + timedelta(days=7))
    elif view == "overdue":
        qs = qs.exclude(status="done").filter(due_at__lt=timezone.now())
    elif view == "focus":
        qs = qs.filter(focus_week=selected - timedelta(days=selected.weekday()))
    elif view == "calendar":
        qs = qs.filter(Q(planned_date=selected) | Q(due_at__date=selected))
    elif view == "recent":
        qs = qs.filter(status="done")
    sort = request.GET.get("sort", "-updated_at")
    if sort not in ["due_at", "-due_at", "title", "-updated_at", "-completed_at", "priority"]:
        raise APIError("排序方式无效")
    return paginate(request, qs.order_by(sort, "id"), task_json)

@api(["GET", "PATCH", "DELETE"])
def task_detail(request, pk):
    task = task_set().filter(pk=pk).first()
    if not task:
        raise APIError("任务不存在或已删除", 404)
    if request.method == "GET":
        return JsonResponse(task_json(task))
    if request.method == "DELETE" and not request.user.is_superuser:
        raise APIError("仅管理员可以删除任务", 403)
    data = body(request)
    version = identifier(data.get("version"))
    before = task_json(task)
    values, tag_ids = task_values(data, task)
    now = timezone.now()
    if request.method == "DELETE":
        values = {"deleted_at": now}
        tag_ids = None
    elif values.get("status", task.status) != task.status:
        values["status_since"] = now
        values["completed_at"] = now if values["status"] == "done" else None
    values.update(version=version + 1, updated_at=now)
    with transaction.atomic():
        # Version predicate makes the write atomic even with competing browser sessions.
        if not Task.objects.filter(pk=pk, version=version, deleted_at__isnull=True).update(**values):
            raise APIError("任务已被其他成员更新。你的输入已保留，请先查看最新版本。", 409)
        task.refresh_from_db()
        if tag_ids is not None:
            task.tags.set(tag_ids)
        after = task_json(task)
        changes = {key: {"from": before[key], "to": after[key]} for key in before if before[key] != after[key] and key not in ["version", "updated_at", "status_since"]}
        action = "delete" if request.method == "DELETE" else "status" if "status" in changes else "update"
        Activity.objects.create(actor=request.user, task=task, action=action, summary=f"{'删除' if action == 'delete' else '更新'}任务 {task.title}", changes=changes)
    return JsonResponse(after)

@api(["POST"], admin=True)
def restore(request, pk):
    version = identifier(body(request).get("version"))
    with transaction.atomic():
        if not Task.objects.filter(pk=pk, version=version, deleted_at__isnull=False).update(deleted_at=None, version=version + 1, updated_at=timezone.now()):
            raise APIError("任务已更新或已恢复", 409)
        task = task_set().get(pk=pk)
        Activity.objects.create(actor=request.user, task=task, action="restore", summary=f"恢复任务 {task.title}")
    return JsonResponse(task_json(task))

@api(["GET"])
def overview(request):
    selected = date_field(request.GET.get("date")) or timezone.localdate()
    week = selected - timedelta(days=selected.weekday())
    qs = task_set()
    now = timezone.now()
    active = qs.exclude(status="done")
    today = active.filter(planned_date=selected)
    waiting = active.filter(status="waiting")
    blocked = active.filter(status="blocked")
    completed = qs.filter(status="done")
    due = active.filter(due_at__date__gte=selected, due_at__date__lt=selected + timedelta(days=7))
    overdue = active.filter(due_at__lt=now)
    counts = {status: qs.filter(status=status).count() for status in Task.Status.values}
    counts.update(total=qs.count(), today=today.count(), high_today=today.filter(priority="high").count(), overdue=overdue.count(), week_done=completed.filter(completed_at__date__gte=week, completed_at__date__lt=week + timedelta(days=7)).count())
    counts.update(upcoming=due.count(), focus=qs.filter(focus_week=week).count())
    pick = lambda rows: [task_json(t) for t in rows[:6]]
    return JsonResponse({"counts": counts, "today": pick(today.order_by("due_at", "id")), "waiting": pick(waiting.order_by("status_since")), "blocked": pick(blocked.order_by("status_since")), "upcoming": pick(due.order_by("due_at")), "overdue": pick(overdue.order_by("due_at")), "focus": pick(qs.filter(focus_week=week).order_by("due_at", "id")), "recent": pick(completed.order_by("-completed_at")), "date": str(selected), "week": str(week)})

@api(["GET"])
def history(request):
    qs = Activity.objects.select_related("actor", "task").order_by("-created_at", "-id")
    if request.GET.get("task"):
        try:
            qs = qs.filter(task_id=int(request.GET["task"]))
        except ValueError:
            raise APIError("任务标识无效")
    return paginate(request, qs, lambda a: {"id": a.id, "actor": (a.actor.first_name or a.actor.username) if a.actor else "已移除成员", "task": a.task_id, "action": a.action, "summary": a.summary, "changes": a.changes, "created_at": a.created_at.isoformat()}, 20)

def frontend(request):
    index = settings.FRONTEND_DIST / "index.html"
    if not index.exists():
        return JsonResponse({"error": "前端尚未构建。本地开发请访问 Vite 服务。"}, status=503)
    response = FileResponse(index.open("rb"), content_type="text/html")
    response["Cache-Control"] = "no-cache"
    response["X-Frame-Options"] = "DENY"
    return response
