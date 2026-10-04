from decimal import Decimal

from django.core.exceptions import ValidationError
from django.db import models
from django.utils import timezone

from apps.common.models import BaseModel


class AccountGroup(BaseModel):
    name = models.CharField(max_length=100)

    class Meta:
        unique_together = ("user", "name")

    def __str__(self):
        return self.name


ACCOUNT_TYPES = [
    ("cash", "Cash"),
    ("bank", "Bank"),
    ("ewallet", "E-wallet"),
    ("savings", "Savings"),
    ("investment", "Investment"),
    ("credit", "Credit card"),
    ("debit", "Debit card"),
    ("loan", "Loan"),
    ("deposit", "Deposit"),
]


class Account(BaseModel):
    group = models.ForeignKey(AccountGroup, null=True, blank=True, on_delete=models.SET_NULL)
    name = models.CharField(max_length=100)
    type = models.CharField(max_length=20, choices=ACCOUNT_TYPES)
    currency = models.CharField(max_length=3, default="USD")
    opening_balance = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    current_balance = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    credit_limit = models.DecimalField(max_digits=14, decimal_places=2, null=True, blank=True)
    statement_day = models.PositiveSmallIntegerField(null=True, blank=True)
    due_day = models.PositiveSmallIntegerField(null=True, blank=True)
    archived = models.BooleanField(default=False)

    def __str__(self):
        return self.name


class Category(BaseModel):
    name = models.CharField(max_length=100)
    parent = models.ForeignKey(
        "self", null=True, blank=True, on_delete=models.CASCADE, related_name="children"
    )
    type = models.CharField(max_length=10, choices=[("income", "Income"), ("expense", "Expense")])
    icon = models.CharField(max_length=50, blank=True)
    color = models.CharField(max_length=20, blank=True)
    is_custom = models.BooleanField(default=True)

    class Meta:
        unique_together = ("user", "name", "parent", "type")

    def __str__(self):
        return self.name


class Tag(BaseModel):
    name = models.CharField(max_length=50)

    class Meta:
        unique_together = ("user", "name")

    def __str__(self):
        return self.name


class Transaction(BaseModel):
    TYPE_CHOICES = [("income", "Income"), ("expense", "Expense"), ("transfer", "Transfer")]

    type = models.CharField(max_length=10, choices=TYPE_CHOICES)
    amount = models.DecimalField(max_digits=14, decimal_places=2)
    currency = models.CharField(max_length=3, default="USD")
    fx_rate = models.DecimalField(max_digits=14, decimal_places=6, default=1)
    from_account = models.ForeignKey(
        Account, null=True, blank=True, on_delete=models.PROTECT, related_name="outgoing"
    )
    to_account = models.ForeignKey(
        Account, null=True, blank=True, on_delete=models.PROTECT, related_name="incoming"
    )
    category = models.ForeignKey(Category, null=True, blank=True, on_delete=models.SET_NULL)
    date = models.DateTimeField(default=timezone.now)
    notes = models.TextField(blank=True)
    is_bookmarked = models.BooleanField(default=False)
    tags = models.ManyToManyField(Tag, blank=True)
    recurring = models.ForeignKey("RecurringRule", null=True, blank=True, on_delete=models.SET_NULL)
    installment = models.ForeignKey(
        "InstallmentPlan", null=True, blank=True, on_delete=models.SET_NULL
    )
    # Contributions/payments are ordinary ledger entries that additionally carry
    # their goal or debt, so progress and payment history are derived from the
    # same rows the balance engine already trusts.
    savings_goal = models.ForeignKey(
        "SavingsGoal", null=True, blank=True, on_delete=models.SET_NULL, related_name="transactions"
    )
    debt = models.ForeignKey(
        "Debt", null=True, blank=True, on_delete=models.SET_NULL, related_name="transactions"
    )

    class Meta:
        ordering = ["-date", "-created_at"]

    def clean(self):
        if self.type == "transfer":
            if not self.from_account or not self.to_account:
                raise ValidationError("Transfer requires both from_account and to_account")
            if self.from_account_id == self.to_account_id:
                raise ValidationError("Transfer accounts must differ")
        else:
            if not self.from_account and not self.to_account:
                raise ValidationError("Income/expense requires an account")

    def __str__(self):
        return f"{self.type} {self.amount} {self.currency}"


class Budget(BaseModel):
    category = models.ForeignKey(Category, null=True, blank=True, on_delete=models.CASCADE)
    amount = models.DecimalField(max_digits=14, decimal_places=2)
    period = models.CharField(
        max_length=10,
        choices=[("weekly", "Weekly"), ("monthly", "Monthly"), ("yearly", "Yearly")],
        default="monthly",
    )
    start_date = models.DateField()
    alert_threshold = models.PositiveIntegerField(default=80)

    def __str__(self):
        return f"Budget {self.amount} ({self.period})"


class RecurringRule(BaseModel):
    FREQ = [("daily", "Daily"), ("weekly", "Weekly"), ("monthly", "Monthly"), ("yearly", "Yearly")]
    type = models.CharField(max_length=10, choices=Transaction.TYPE_CHOICES)
    amount = models.DecimalField(max_digits=14, decimal_places=2)
    currency = models.CharField(max_length=3, default="USD")
    from_account = models.ForeignKey(
        Account, null=True, blank=True, on_delete=models.SET_NULL, related_name="recurring_out"
    )
    to_account = models.ForeignKey(
        Account, null=True, blank=True, on_delete=models.SET_NULL, related_name="recurring_in"
    )
    category = models.ForeignKey(Category, null=True, blank=True, on_delete=models.SET_NULL)
    frequency = models.CharField(max_length=10, choices=FREQ)
    next_run_at = models.DateTimeField()
    last_run_at = models.DateTimeField(null=True, blank=True)
    end_at = models.DateTimeField(null=True, blank=True)
    enabled = models.BooleanField(default=True)
    notes = models.TextField(blank=True)

    def __str__(self):
        return f"{self.get_frequency_display()} {self.type} {self.amount}"


class InstallmentPlan(BaseModel):
    FREQ = [("weekly", "Weekly"), ("monthly", "Monthly"), ("quarterly", "Quarterly")]
    total_amount = models.DecimalField(max_digits=14, decimal_places=2)
    parts_count = models.PositiveIntegerField()
    currency = models.CharField(max_length=3, default="USD")
    from_account = models.ForeignKey(Account, null=True, blank=True, on_delete=models.SET_NULL)
    category = models.ForeignKey(Category, null=True, blank=True, on_delete=models.SET_NULL)
    start_date = models.DateField()
    frequency = models.CharField(max_length=10, choices=FREQ, default="monthly")
    generated_at = models.DateTimeField(null=True, blank=True)
    notes = models.TextField(blank=True)

    @property
    def part_amount(self):
        return (self.total_amount / self.parts_count).quantize(Decimal("0.01"))

    def __str__(self):
        return f"{self.parts_count}x {self.part_amount} {self.currency}"


class Debt(BaseModel):
    DIRECTION = [("owed_to_me", "Owed to me"), ("i_owe", "I owe")]
    counterparty = models.CharField(max_length=100)
    direction = models.CharField(max_length=12, choices=DIRECTION)
    original_amount = models.DecimalField(max_digits=14, decimal_places=2)
    remaining_amount = models.DecimalField(max_digits=14, decimal_places=2)
    currency = models.CharField(max_length=3, default="USD")
    due_date = models.DateField(null=True, blank=True)
    notes = models.TextField(blank=True)


class SavingsGoal(BaseModel):
    name = models.CharField(max_length=100)
    target_amount = models.DecimalField(max_digits=14, decimal_places=2)
    currency = models.CharField(max_length=3, default="USD")
    target_date = models.DateField(null=True, blank=True)
    linked_account = models.ForeignKey(Account, null=True, blank=True, on_delete=models.SET_NULL)


class ExchangeRate(BaseModel):
    base_currency = models.CharField(max_length=3)
    quote_currency = models.CharField(max_length=3)
    rate = models.DecimalField(max_digits=14, decimal_places=6)
    date = models.DateField()
    source = models.CharField(max_length=50, blank=True)

    class Meta:
        unique_together = ("user", "base_currency", "quote_currency", "date")

    def __str__(self):
        return f"{self.base_currency}/{self.quote_currency} {self.rate}"
