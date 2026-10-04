from django.urls import include, path
from rest_framework.routers import DefaultRouter

from .views import (
    AccountGroupViewSet,
    AccountViewSet,
    BudgetViewSet,
    CategoryViewSet,
    DebtViewSet,
    ExchangeRateViewSet,
    InstallmentPlanViewSet,
    RecurringRuleViewSet,
    ReportViewSet,
    SavingsGoalViewSet,
    TagViewSet,
    TransactionViewSet,
)

router = DefaultRouter()
router.register("account-groups", AccountGroupViewSet)
router.register("accounts", AccountViewSet)
router.register("categories", CategoryViewSet)
router.register("tags", TagViewSet)
router.register("transactions", TransactionViewSet)
router.register("budgets", BudgetViewSet)
router.register("recurring", RecurringRuleViewSet)
router.register("installments", InstallmentPlanViewSet)
router.register("debts", DebtViewSet)
router.register("goals", SavingsGoalViewSet)
router.register("exchange-rates", ExchangeRateViewSet)
router.register("reports", ReportViewSet, basename="report")

urlpatterns = [path("", include(router.urls))]