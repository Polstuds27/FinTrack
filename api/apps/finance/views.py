from decimal import Decimal, InvalidOperation

from django.db import transaction as db_transaction
from django.http import HttpResponse
from django.utils import timezone
from django_filters.rest_framework import DjangoFilterBackend
from rest_framework import filters, status, viewsets
from rest_framework.decorators import action
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from .csv_io import export_transactions, import_transactions
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
from .serializers import (
    AccountGroupSerializer,
    AccountSerializer,
    BudgetSerializer,
    CategorySerializer,
    DebtSerializer,
    ExchangeRateSerializer,
    InstallmentPlanSerializer,
    RecurringRuleSerializer,
    SavingsGoalSerializer,
    TagSerializer,
    TransactionSerializer,
)
from .services import (
    budget_progress,
    convert,
    generate_installments,
    monthly_series,
    net_worth_series,
    next_occurrence,
    recompute_account_balance,
    refresh_accounts,
    run_due_recurring,
    summary,
    upcoming,
)


class UserOwnedViewSet(viewsets.ModelViewSet):
    permission_classes = [IsAuthenticated]
    filter_backends = [filters.OrderingFilter, filters.SearchFilter, DjangoFilterBackend]
    ordering_fields = ["created_at", "updated_at"]

    def get_queryset(self):
        return self.queryset.filter(user=self.request.user, deleted_at__isnull=True)

    def perform_create(self, serializer):
        serializer.save(user=self.request.user)

    def perform_destroy(self, instance):
        """Soft delete so other devices receive a tombstone instead of a hard delete."""
        instance.deleted_at = timezone.now()
        instance.version += 1
        instance.save(update_fields=["deleted_at", "version", "updated_at"])
        if isinstance(instance, Transaction):
            refresh_accounts(instance)

    def perform_update(self, serializer):
        obj = serializer.instance
        serializer.save(version=obj.version + 1)


class AccountGroupViewSet(UserOwnedViewSet):
    queryset = AccountGroup.objects.all()
    serializer_class = AccountGroupSerializer
    search_fields = ["name"]


class AccountViewSet(UserOwnedViewSet):
    queryset = Account.objects.all()
    serializer_class = AccountSerializer
    search_fields = ["name"]
    filterset_fields = ["type", "archived", "currency"]

    def perform_create(self, serializer):
        account = serializer.save(user=self.request.user)
        recompute_account_balance(account)

    def perform_update(self, serializer):
        account = serializer.save()
        recompute_account_balance(account)

    @action(detail=True, methods=["get"])
    def balance(self, request, pk=None):
        account = self.get_object()
        return Response({"account_id": str(account.id), "current_balance": account.current_balance})

    @action(detail=True, methods=["post"])
    def archive(self, request, pk=None):
        account = self.get_object()
        account.archived = not account.archived
        account.version += 1
        account.save(update_fields=["archived", "version", "updated_at"])
        return Response(self.get_serializer(account).data)


class CategoryViewSet(UserOwnedViewSet):
    queryset = Category.objects.all()
    serializer_class = CategorySerializer
    search_fields = ["name"]
    filterset_fields = ["type"]


class TagViewSet(UserOwnedViewSet):
    queryset = Tag.objects.all()
    serializer_class = TagSerializer
    search_fields = ["name"]


class TransactionViewSet(UserOwnedViewSet):
    queryset = Transaction.objects.all()
    serializer_class = TransactionSerializer
    search_fields = ["notes"]
    filterset_fields = ["type", "from_account", "to_account", "category", "is_bookmarked", "tags"]
    parser_classes = [JSONParser, MultiPartParser, FormParser]

    def perform_create(self, serializer):
        with db_transaction.atomic():
            tx = serializer.save(user=self.request.user)
            refresh_accounts(tx)

    def perform_update(self, serializer):
        with db_transaction.atomic():
            tx = serializer.save()
            refresh_accounts(tx)

    @action(detail=True, methods=["post"])
    def bookmark(self, request, pk=None):
        tx = self.get_object()
        tx.is_bookmarked = not tx.is_bookmarked
        tx.version += 1
        tx.save(update_fields=["is_bookmarked", "version", "updated_at"])
        return Response(self.get_serializer(tx).data)

    @action(detail=False, methods=["get"])
    def export(self, request):
        qs = self.filter_queryset(self.get_queryset())
        csv_text = export_transactions(request.user, qs)
        response = HttpResponse(csv_text, content_type="text/csv")
        stamp = timezone.localtime().strftime("%Y%m%d-%H%M")
        response["Content-Disposition"] = f'attachment; filename="transactions-{stamp}.csv"'
        return response

    @action(
        detail=False,
        methods=["post"],
        parser_classes=[MultiPartParser, FormParser, JSONParser],
    )
    def import_csv(self, request):
        uploaded = request.FILES.get("file")
        if uploaded is not None:
            csv_text = uploaded.read().decode("utf-8-sig", errors="replace")
        else:
            csv_text = request.data.get("csv", "")
        if not csv_text.strip():
            return Response(
                {"detail": "No CSV content supplied."}, status=status.HTTP_400_BAD_REQUEST
            )
        dry_run = str(request.data.get("dry_run", "")).lower() in {"1", "true", "yes"}
        result = import_transactions(request.user, csv_text, dry_run=dry_run)
        return Response(result.as_dict())


class BudgetViewSet(UserOwnedViewSet):
    queryset = Budget.objects.all()
    serializer_class = BudgetSerializer
    filterset_fields = ["period"]

    @action(detail=True, methods=["get"])
    def progress(self, request, pk=None):
        return Response(budget_progress(self.get_object()))


class RecurringRuleViewSet(UserOwnedViewSet):
    queryset = RecurringRule.objects.all()
    serializer_class = RecurringRuleSerializer
    filterset_fields = ["frequency", "type", "enabled"]

    @action(detail=False, methods=["post"])
    def run_due(self, request):
        return Response({"created": run_due_recurring()})

    @action(detail=True, methods=["post"])
    def preview(self, request, pk=None):
        rule = self.get_object()
        nxt = rule.next_run_at
        occurrences = []
        for _ in range(3):
            nxt = next_occurrence(rule, nxt)
            occurrences.append(nxt.date().isoformat())
        return Response({"next_dates": occurrences})


class InstallmentPlanViewSet(UserOwnedViewSet):
    queryset = InstallmentPlan.objects.all()
    serializer_class = InstallmentPlanSerializer
    filterset_fields = ["frequency"]

    def perform_create(self, serializer):
        plan = serializer.save(user=self.request.user)
        if str(self.request.query_params.get("generate", "")).lower() in {"1", "true", "yes"}:
            generate_installments(plan)

    @action(detail=True, methods=["post"])
    def generate(self, request, pk=None):
        plan = self.get_object()
        regenerate = str(request.data.get("regenerate", "")).lower() in {"1", "true", "yes"}
        created = generate_installments(plan, regenerate=regenerate)
        return Response({"created": created})


class DebtViewSet(UserOwnedViewSet):
    queryset = Debt.objects.all()
    serializer_class = DebtSerializer
    search_fields = ["counterparty"]
    filterset_fields = ["direction"]


class SavingsGoalViewSet(UserOwnedViewSet):
    queryset = SavingsGoal.objects.all()
    serializer_class = SavingsGoalSerializer
    search_fields = ["name"]


class ExchangeRateViewSet(UserOwnedViewSet):
    queryset = ExchangeRate.objects.all()
    serializer_class = ExchangeRateSerializer
    filterset_fields = ["base_currency", "quote_currency"]
    ordering_fields = ["date", "rate"]

    @action(detail=False, methods=["get"])
    def convert(self, request):
        try:
            amount = Decimal(request.query_params.get("amount", "1"))
            base = request.query_params.get("base", "").upper()
            quote = request.query_params.get("quote", "").upper()
        except (TypeError, ValueError):
            return Response({"detail": "Invalid query."}, status=status.HTTP_400_BAD_REQUEST)
        if len(base) != 3 or len(quote) != 3:
            return Response(
                {"detail": "base and quote must be 3 letter codes."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        return Response(
            {
                "amount": str(amount.quantize(Decimal("0.01"))),
                "base": base,
                "quote": quote,
                "result": str(convert(request.user, amount, base, quote)),
            }
        )

    @action(detail=False, methods=["post"])
    def bulk_upsert(self, request):
        """Body: {rates: [{base_currency, quote_currency, rate, date}]}"""
        payload = request.data.get("rates") or []
        created, updated = 0, 0
        for item in payload:
            try:
                base = str(item["base_currency"]).upper()[:3]
                quote = str(item["quote_currency"]).upper()[:3]
                rate = Decimal(str(item["rate"]))
                when = timezone.datetime.strptime(item["date"], "%Y-%m-%d").date()
            except (KeyError, ValueError, InvalidOperation) as exc:
                return Response(
                    {"detail": f"Invalid rate entry: {exc}"}, status=status.HTTP_400_BAD_REQUEST
                )
            _, was_created = ExchangeRate.objects.update_or_create(
                user=request.user,
                base_currency=base,
                quote_currency=quote,
                date=when,
                defaults={"rate": rate, "source": str(item.get("source", ""))[:50]},
            )
            created += int(was_created)
            updated += int(not was_created)
        return Response({"created": created, "updated": updated})


class ReportViewSet(viewsets.ViewSet):
    """Read-only analytics derived from the ledger."""

    permission_classes = [IsAuthenticated]

    def _as_of(self, request):
        raw = request.query_params.get("as_of")
        if not raw:
            return timezone.localdate()
        try:
            return timezone.datetime.strptime(raw, "%Y-%m-%d").date()
        except ValueError:
            return timezone.localdate()

    @action(detail=False, methods=["get"])
    def summary(self, request):
        return Response(summary(request.user, self._as_of(request)))

    @action(detail=False, methods=["get"])
    def monthly(self, request):
        try:
            months = min(max(int(request.query_params.get("months", 12)), 1), 60)
        except ValueError:
            months = 12
        return Response({"series": monthly_series(request.user, months, self._as_of(request))})

    @action(detail=False, methods=["get"], url_path="net-worth")
    def net_worth(self, request):
        try:
            months = min(max(int(request.query_params.get("months", 12)), 1), 60)
        except ValueError:
            months = 12
        return Response({"series": net_worth_series(request.user, months, self._as_of(request))})

    @action(detail=False, methods=["get"])
    def upcoming(self, request):
        try:
            days = min(max(int(request.query_params.get("days", 14)), 1), 180)
        except ValueError:
            days = 14
        return Response({"items": upcoming(request.user, days)})

    @action(detail=False, methods=["get"], url_path="year-in-review")
    def year_in_review(self, request):
        year = self._as_of(request).year
        return Response(
            {
                "year": year,
                "series": monthly_series(request.user, 12, timezone.datetime(year, 1, 1).date()),
                "upcoming": upcoming(request.user, 30),
            }
        )