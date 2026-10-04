from django.contrib import admin

from .models import (
    Account,
    AccountGroup,
    Budget,
    Category,
    Debt,
    ExchangeRate,
    InstallmentPlan,
    RecurringRule,
    SavingsGoal,
    Tag,
    Transaction,
)


@admin.register(Account)
class AccountAdmin(admin.ModelAdmin):
    list_display = ("name", "user", "type", "currency", "current_balance", "archived")
    list_filter = ("type", "currency", "archived")
    search_fields = ("name", "user__email")


@admin.register(AccountGroup)
class AccountGroupAdmin(admin.ModelAdmin):
    list_display = ("name", "user")
    search_fields = ("name", "user__email")


@admin.register(Category)
class CategoryAdmin(admin.ModelAdmin):
    list_display = ("name", "user", "type", "is_custom")
    list_filter = ("type", "is_custom")
    search_fields = ("name", "user__email")


@admin.register(Tag)
class TagAdmin(admin.ModelAdmin):
    list_display = ("name", "user")
    search_fields = ("name", "user__email")


@admin.register(Transaction)
class TransactionAdmin(admin.ModelAdmin):
    list_display = ("date", "user", "type", "amount", "currency", "category")
    list_filter = ("type", "currency", "is_bookmarked")
    search_fields = ("notes", "user__email", "category__name")
    date_hierarchy = "date"


@admin.register(Budget)
class BudgetAdmin(admin.ModelAdmin):
    list_display = ("category", "user", "amount", "period", "alert_threshold")
    list_filter = ("period",)


@admin.register(RecurringRule)
class RecurringRuleAdmin(admin.ModelAdmin):
    list_display = ("user", "type", "amount", "frequency", "next_run_at", "enabled")
    list_filter = ("frequency", "type", "enabled")


@admin.register(InstallmentPlan)
class InstallmentPlanAdmin(admin.ModelAdmin):
    list_display = ("user", "total_amount", "parts_count", "frequency", "start_date")
    list_filter = ("frequency",)


@admin.register(Debt)
class DebtAdmin(admin.ModelAdmin):
    list_display = ("counterparty", "user", "direction", "remaining_amount", "due_date")
    list_filter = ("direction", "currency")


@admin.register(SavingsGoal)
class SavingsGoalAdmin(admin.ModelAdmin):
    list_display = ("name", "user", "target_amount", "currency", "target_date")


@admin.register(ExchangeRate)
class ExchangeRateAdmin(admin.ModelAdmin):
    list_display = ("base_currency", "quote_currency", "rate", "date", "user")
    list_filter = ("base_currency", "quote_currency", "source")