import json
from datetime import datetime, timedelta
from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.contrib.sessions.models import Session
from django.test import Client, TestCase, override_settings
from django.utils import timezone

from .models import Activity, Project, Tag, Task

User = get_user_model()

@override_settings(DEBUG=True, SECURE_SSL_REDIRECT=False, SESSION_COOKIE_SECURE=False, CSRF_COOKIE_SECURE=False)
class WorkbenchTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.admin = User.objects.create_superuser("admin", password="Complex-admin-password-91")
        cls.member = User.objects.create_user("member", password="Complex-member-password-82", first_name="小林")
        cls.other = User.objects.create_user("other", password="Complex-other-password-73")
        cls.project = Project.objects.create(name="官网改版")
        cls.tag = Tag.objects.create(name="设计")

    def setUp(self):
        self.client.force_login(self.member)

    def send(self, path, data, method="post", client=None):
        return getattr(client or self.client, method)("/api/" + path, data=json.dumps(data), content_type="application/json")

    def create_task(self, **kwargs):
        response = self.send("tasks/", {"title": "客户合同审核", "assignee": self.member.id, "project": self.project.id, "tags": [self.tag.id], **kwargs})
        self.assertEqual(response.status_code, 201, response.content)
        return response.json()

    def test_shared_task_and_atomic_conflict(self):
        task = self.create_task()
        second = Client(); second.force_login(self.other)
        self.assertEqual(second.get(f"/api/tasks/{task['id']}/").json()["title"], task["title"])
        response = self.send(f"tasks/{task['id']}/", {"version": 1, "status": "in_progress"}, "patch", second)
        self.assertEqual(response.status_code, 200)
        stale = self.send(f"tasks/{task['id']}/", {"version": 1, "notes": "不能覆盖其他人"}, "patch")
        self.assertEqual(stale.status_code, 409)
        current = Task.objects.get(pk=task["id"])
        self.assertEqual(current.status, "in_progress")
        self.assertEqual(current.notes, "")
        self.assertEqual(Activity.objects.filter(task=current).count(), 2)

    def test_permissions_soft_delete_and_restore(self):
        task = self.create_task()
        self.assertEqual(self.send(f"tasks/{task['id']}/", {"version": 1}, "delete").status_code, 403)
        self.assertEqual(self.client.get("/api/tasks/?deleted=true").status_code, 403)
        self.assertEqual(self.send("members/", {"username": "x"}).status_code, 403)
        self.client.force_login(self.admin)
        self.assertEqual(self.send(f"tasks/{task['id']}/", {"version": 1}, "delete").status_code, 200)
        self.assertEqual(self.client.get("/api/tasks/").json()["total"], 0)
        self.assertEqual(self.client.get("/api/overview/").json()["counts"]["total"], 0)
        self.assertEqual(self.client.get("/api/tasks/?deleted=true").json()["total"], 1)
        self.assertEqual(self.send(f"tasks/{task['id']}/restore/", {"version": 2}).status_code, 200)
        self.assertEqual(self.client.get("/api/tasks/").json()["total"], 1)

    def test_disable_and_reset_revoke_all_sessions(self):
        device = Client(); device.force_login(self.member)
        device2 = Client(); device2.force_login(self.member)
        self.client.force_login(self.admin)
        self.assertEqual(self.send(f"members/{self.member.id}/", {"active": False}, "patch").status_code, 200)
        self.assertEqual(device.get("/api/bootstrap/").status_code, 401)
        self.assertEqual(device2.get("/api/bootstrap/").status_code, 401)
        self.send(f"members/{self.member.id}/", {"active": True}, "patch")
        device.force_login(self.member)
        self.assertEqual(self.send(f"members/{self.member.id}/", {"password": "A-new-complex-password-64"}, "patch").status_code, 200)
        self.assertEqual(device.get("/api/bootstrap/").status_code, 401)
        self.assertFalse(Session.objects.filter(session_key=device.session.session_key).exists())
        activities = str(list(Activity.objects.values("changes", "summary")))
        self.assertNotIn("A-new-complex-password", activities)

    def test_dates_week_boundaries_and_counts(self):
        zone = timezone.get_current_timezone()
        today = datetime(2026, 10, 11, 12, tzinfo=zone)
        task = self.create_task(planned_date="2026-10-11", focus_week="2026-10-11", due_at="2026-10-12T10:00:00+08:00", priority="high", status="waiting")
        self.create_task(due_at="2026-10-10T10:00:00+08:00", status="blocked")
        self.create_task(title="无截止日期")
        done = self.create_task(status="done")
        Task.objects.filter(pk=done["id"]).update(completed_at=today)
        with patch("workbench.views.timezone.now", return_value=today):
            result = self.client.get("/api/overview/?date=2026-10-11").json()
            self.assertEqual(result["counts"]["total"], 4)
            self.assertEqual(result["counts"]["today"], 1)
            self.assertEqual(result["counts"]["high_today"], 1)
            self.assertEqual(result["counts"]["overdue"], 1)
            self.assertEqual(result["counts"]["week_done"], 1)
            self.assertEqual(result["week"], "2026-10-05")
            self.assertEqual(result["focus"][0]["id"], task["id"])
            self.assertEqual(len(result["upcoming"]), 1)
            next_week = self.client.get("/api/overview/?date=2026-10-12").json()
            self.assertEqual(next_week["counts"]["today"], 0)
            self.assertEqual(next_week["counts"]["week_done"], 0)
            self.assertEqual(next_week["focus"], [])
        self.assertEqual(self.client.get("/api/tasks/?view=calendar&date=2026-10-12").json()["total"], 1)
        project = self.client.get("/api/projects/").json()["items"][0]
        self.assertEqual((project["done"], project["total"]), (1, 4))

    def test_filters_sort_pagination_and_validation(self):
        for i in range(12):
            self.create_task(title=f"设计任务 {i:02}")
        self.assertEqual(self.client.get("/api/tasks/?page=2").json()["page"], 2)
        self.assertEqual(len(self.client.get("/api/tasks/?page=2").json()["items"]), 2)
        self.assertEqual(self.client.get(f"/api/tasks/?q=小林&tag={self.tag.id}&project={self.project.id}").json()["total"], 12)
        self.assertEqual(self.client.get("/api/tasks/?sort=title").json()["items"][0]["title"], "设计任务 00")
        self.assertEqual(self.send("tasks/", {"title": "", "status": "bad"}).status_code, 400)
        self.assertEqual(self.send("tasks/", {"title": "测试", "due_at": "2026-10-11T10:00"}).status_code, 400)
        self.assertEqual(self.send("tasks/", {"title": "测试", "tags": [999]}).status_code, 400)
        self.assertEqual(self.client.get("/api/tasks/?date=wrong").status_code, 400)
        User.objects.filter(pk=self.other.pk).update(is_active=False)
        self.assertEqual(self.send("tasks/", {"title": "测试", "assignee": self.other.pk}).status_code, 400)

    def test_login_rate_limit_and_password_rules(self):
        self.client.logout()
        for _ in range(5):
            self.assertEqual(self.send("login/", {"username": "member", "password": "bad"}).status_code, 401)
        self.assertEqual(self.send("login/", {"username": "member", "password": "Complex-member-password-82"}).status_code, 429)
        self.client.force_login(self.admin)
        self.assertEqual(self.send("members/", {"username": "fresh", "name": "新成员", "password": "1234567890"}).status_code, 400)
        self.assertEqual(self.send(f"members/{self.admin.pk}/", {"active": False}, "patch").status_code, 400)

    def test_csrf_and_empty_state(self):
        protected = Client(enforce_csrf_checks=True)
        self.assertEqual(protected.post("/api/login/", {"username": "member", "password": "wrong"}).status_code, 403)
        response = protected.get("/api/session/")
        self.assertIn("csrf", response.json())
        self.assertEqual(self.client.get("/api/overview/").json()["counts"]["total"], 0)
        self.assertEqual(self.client.get("/api/health/").json(), {"status": "ok"})

    def test_change_own_password_preserves_current_session(self):
        other_device = Client(); other_device.force_login(self.member)
        response = self.send("password/", {"current_password": "Complex-member-password-82", "password": "New-member-password-64"})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(self.client.get("/api/bootstrap/").status_code, 200)
        self.assertEqual(other_device.get("/api/bootstrap/").status_code, 401)

    def test_reopen_done_task_clears_completion(self):
        task = self.create_task(status="done")
        self.assertIsNotNone(task["completed_at"])
        response = self.send(f"tasks/{task['id']}/", {"version": 1, "status": "pending"}, "patch")
        self.assertIsNone(response.json()["completed_at"])

    def test_upcoming_includes_exactly_seven_calendar_days(self):
        self.create_task(due_at="2026-10-17T23:59:00+08:00")
        self.create_task(due_at="2026-10-18T00:00:00+08:00")
        self.assertEqual(self.client.get("/api/tasks/?view=upcoming&date=2026-10-11").json()["total"], 1)
        result = self.client.get("/api/overview/?date=2026-10-11").json()
        self.assertEqual(result["counts"]["upcoming"], 1)
