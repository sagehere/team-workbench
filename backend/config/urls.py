from django.urls import path, re_path
from workbench import views as v

urlpatterns = [
    path("api/health/", v.health), path("api/session/", v.session),
    path("api/login/", v.sign_in), path("api/logout/", v.sign_out), path("api/password/", v.change_password),
    path("api/bootstrap/", v.bootstrap), path("api/overview/", v.overview), path("api/history/", v.history),
    path("api/members/", v.members), path("api/members/<int:pk>/", v.member_detail),
    path("api/projects/", v.projects), path("api/projects/<int:pk>/", v.project_detail),
    path("api/tags/", v.tags), path("api/tags/<int:pk>/", v.tag_detail),
    path("api/tasks/", v.tasks), path("api/tasks/<int:pk>/", v.task_detail), path("api/tasks/<int:pk>/restore/", v.restore),
    re_path(r"^(?!api/|assets/).*$", v.frontend),
]
