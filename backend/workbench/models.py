from django.conf import settings
from django.db import models

class Project(models.Model):
    name = models.CharField(max_length=100, unique=True)
    description = models.TextField(blank=True, max_length=2000)
    color = models.CharField(max_length=7, default="#2d6cdf")

class Tag(models.Model):
    name = models.CharField(max_length=40, unique=True)
    color = models.CharField(max_length=7, default="#2d6cdf")

class Task(models.Model):
    class Status(models.TextChoices):
        PENDING = "pending", "待处理"
        PROGRESS = "in_progress", "进行中"
        WAITING = "waiting", "等待回复"
        BLOCKED = "blocked", "已拖住"
        DONE = "done", "已完成"
    class Priority(models.TextChoices):
        HIGH = "high", "高"
        MEDIUM = "medium", "中"
        LOW = "low", "低"
    title = models.CharField(max_length=200)
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.PENDING)
    priority = models.CharField(max_length=10, choices=Priority.choices, default=Priority.MEDIUM)
    assignee = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.PROTECT)
    project = models.ForeignKey(Project, null=True, blank=True, on_delete=models.PROTECT)
    tags = models.ManyToManyField(Tag, blank=True)
    due_at = models.DateTimeField(null=True, blank=True)
    planned_date = models.DateField(null=True, blank=True)
    focus_week = models.DateField(null=True, blank=True)
    next_action = models.CharField(max_length=300, blank=True)
    notes = models.TextField(blank=True, max_length=10000)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    status_since = models.DateTimeField()
    completed_at = models.DateTimeField(null=True, blank=True)
    deleted_at = models.DateTimeField(null=True, blank=True)
    version = models.PositiveIntegerField(default=1)

    class Meta:
        indexes = [models.Index(fields=["deleted_at", "status"]), models.Index(fields=["planned_date"]), models.Index(fields=["due_at"])]

class Activity(models.Model):
    actor = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, on_delete=models.SET_NULL)
    task = models.ForeignKey(Task, null=True, on_delete=models.SET_NULL)
    action = models.CharField(max_length=30)
    summary = models.CharField(max_length=500)
    changes = models.JSONField(default=dict)
    created_at = models.DateTimeField(auto_now_add=True)

class LoginAttempt(models.Model):
    key = models.CharField(max_length=64, primary_key=True)
    failures = models.PositiveIntegerField(default=0)
    window_start = models.DateTimeField()
