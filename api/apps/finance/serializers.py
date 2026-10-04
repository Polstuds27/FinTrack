from rest_framework import serializers

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


class UserOwnedModelSerializer(serializers.ModelSerializer):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        request = self.context.get("request")
        if request is not None:
            for _, field in self.fields.items():
                if isinstance(field, serializers.PrimaryKeyRelatedField):
                    try:
                        field.queryset = field.queryset.filter(user=request.user)
                    except Exception:
                        pass


class AccountGroupSerializer(UserOwnedModelSerializer):
    class Meta:
        model = AccountGroup
        fields = ["id", "name", "created_at", "updated_at"]
        read_only_fields = ["id", "created_at", "updated_at"]


class AccountSerializer(UserOwnedModelSerializer):
    class Meta:
        model = Account
        fields = [
            "id",
            "group",
            "name",
            "type",
            "currency",
            "opening_balance",
            "current_balance",
            "credit_limit",
            "statement_day",
            "due_day",
            "archived",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "current_balance", "created_at", "updated_at"]


class CategorySerializer(UserOwnedModelSerializer):
    class Meta:
        model = Category
        fields = ["id", "name", "parent", "type", "icon", "color", "is_custom"]
        read_only_fields = ["id"]


class TagSerializer(serializers.ModelSerializer):
    class Meta:
        model = Tag
        fields = ["id", "name"]
        read_only_fields = ["id"]


class TransactionSerializer(UserOwnedModelSerializer):
    class Meta:
        model = Transaction
        fields = [
            "id",
            "type",
            "amount",
            "currency",
            "fx_rate",
            "from_account",
            "to_account",
            "category",
            "date",
            "notes",
            "is_bookmarked",
            "tags",
            "recurring",
            "installment",
            "savings_goal",
            "debt",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "created_at", "updated_at"]


class BudgetSerializer(UserOwnedModelSerializer):
    class Meta:
        model = Budget
        fields = ["id", "category", "amount", "period", "start_date", "alert_threshold"]
        read_only_fields = ["id"]


class RecurringRuleSerializer(UserOwnedModelSerializer):
    class Meta:
        model = RecurringRule
        fields = [
            "id",
            "type",
            "amount",
            "currency",
            "from_account",
            "to_account",
            "category",
            "frequency",
            "next_run_at",
            "last_run_at",
            "end_at",
            "enabled",
            "notes",
        ]
        read_only_fields = ["id", "last_run_at"]


class InstallmentPlanSerializer(UserOwnedModelSerializer):
    part_amount = serializers.DecimalField(max_digits=14, decimal_places=2, read_only=True)

    class Meta:
        model = InstallmentPlan
        fields = [
            "id",
            "total_amount",
            "parts_count",
            "part_amount",
            "currency",
            "from_account",
            "category",
            "start_date",
            "frequency",
            "generated_at",
            "notes",
        ]
        read_only_fields = ["id", "part_amount", "generated_at"]


class DebtSerializer(serializers.ModelSerializer):
    class Meta:
        model = Debt
        fields = [
            "id",
            "counterparty",
            "direction",
            "original_amount",
            "remaining_amount",
            "currency",
            "due_date",
            "notes",
        ]
        read_only_fields = ["id"]


class SavingsGoalSerializer(UserOwnedModelSerializer):
    class Meta:
        model = SavingsGoal
        fields = ["id", "name", "target_amount", "currency", "target_date", "linked_account"]
        read_only_fields = ["id"]


class ExchangeRateSerializer(serializers.ModelSerializer):
    class Meta:
        model = ExchangeRate
        fields = ["id", "base_currency", "quote_currency", "rate", "date", "source"]
        read_only_fields = ["id"]
