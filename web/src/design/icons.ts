/**
 * Centralised icon registry.
 *
 * Icons are stored on rows as a stable *string id* (e.g. `Category.icon`), never as
 * components, so user data stays portable and safe to render. Everything resolves
 * through this map; unknown ids fall back rather than crashing.
 */
import {
  Armchair,
  Baby,
  Banknote,
  BookOpen,
  Briefcase,
  Building2,
  Bus,
  Car,
  Cat,
  ChevronRight,
  CircleDollarSign,
  Clapperboard,
  Coffee,
  CreditCard,
  Dog,
  Dumbbell,
  Gift,
  GraduationCap,
  HandCoins,
  Heart,
  HeartPulse,
  Home,
  Landmark,
  Laptop,
  Lightbulb,
  Music,
  Package,
  PawPrint,
  Phone,
  PiggyBank,
  Plane,
  Receipt,
  Scissors,
  School,
  Shield,
  ShoppingBag,
  ShoppingCart,
  Smartphone,
  Sparkles,
  Sprout,
  Stethoscope,
  Ticket,
  TrendingUp,
  Trophy,
  Truck,
  Utensils,
  Wallet,
  Wifi,
  Wine,
  Wrench,
  type LucideIcon,
} from "lucide-react";

/** Generic icon ids usable for custom categories. Keyed by the value stored on the row. */
export const CATEGORY_ICONS: Record<string, LucideIcon> = {
  Utensils,
  Coffee,
  Wine,
  ShoppingBag,
  ShoppingCart,
  Car,
  Bus,
  Truck,
  Plane,
  Home,
  Receipt,
  Smartphone,
  Wifi,
  Phone,
  Lightbulb,
  Heart,
  HeartPulse,
  Stethoscope,
  Dumbbell,
  GraduationCap,
  School,
  BookOpen,
  Laptop,
  Package,
  Gift,
  Ticket,
  Clapperboard,
  Music,
  Trophy,
  Sparkles,
  PawPrint,
  Cat,
  Dog,
  Baby,
  Armchair,
  Briefcase,
  HandCoins,
  CircleDollarSign,
  Wrench,
  Scissors,
  Shield,
};

/** Ordered id list used by the category icon picker. */
export const CATEGORY_ICON_IDS = Object.keys(CATEGORY_ICONS);

/** Default icon per built-in category name, so seeded rows are never blank. */
export const CATEGORY_PRESETS: Record<string, string> = {
  Salary: "Briefcase",
  Freelance: "HandCoins",
  "Other Income": "CircleDollarSign",
  Groceries: "ShoppingCart",
  Rent: "Home",
  Utilities: "Lightbulb",
  Transport: "Car",
  Dining: "Utensils",
  Health: "HeartPulse",
  Entertainment: "Clapperboard",
  Shopping: "ShoppingBag",
  Travel: "Plane",
  Education: "GraduationCap",
  Subscriptions: "Receipt",
  "Other Expense": "Package",
};

export function categoryIcon(id: string | null | undefined, name?: string): LucideIcon {
  if (id && id in CATEGORY_ICONS) return CATEGORY_ICONS[id];
  if (name && CATEGORY_PRESETS[name]) return CATEGORY_ICONS[CATEGORY_PRESETS[name]];
  return categoryIconForType("expense");
}

function categoryIconForType(type: "income" | "expense"): LucideIcon {
  return type === "income" ? TrendingUp : Wallet;
}

/* ------------------------------------------------------------------ account types */
export const ACCOUNT_TYPE_ICONS: Record<string, LucideIcon> = {
  cash: Banknote,
  bank: Building2,
  ewallet: Smartphone,
  savings: PiggyBank,
  investment: TrendingUp,
  credit: CreditCard,
  debit: CreditCard,
  loan: Landmark,
  deposit: Sprout,
};

/** Debit cards read better with their own glyph than a generic card. */
export const ACCOUNT_TYPE_LABELS: Record<string, string> = {
  cash: "Cash",
  bank: "Bank",
  ewallet: "E-wallet",
  savings: "Savings",
  investment: "Investment",
  credit: "Credit card",
  debit: "Debit card",
  loan: "Loan",
  deposit: "Deposit",
};

/** Group headings on the Accounts page. */
export const ACCOUNT_TYPE_GROUPS: { key: string; label: string }[] = [
  { key: "cash", label: "Cash" },
  { key: "ewallet", label: "E-wallets" },
  { key: "bank", label: "Bank" },
  { key: "debit", label: "Debit cards" },
  { key: "credit", label: "Credit cards" },
  { key: "savings", label: "Savings" },
  { key: "investment", label: "Investments" },
  { key: "loan", label: "Loans" },
  { key: "deposit", label: "Deposits" },
];

export function accountIcon(type: string): LucideIcon {
  return ACCOUNT_TYPE_ICONS[type] ?? Wallet;
}

/* ------------------------------------------------------------------ chart slices */
export const DONUT_COLORS = [
  "rgb(var(--color-primary))",
  "rgb(var(--color-accent))",
  "rgb(var(--color-info))",
  "rgb(var(--color-warning))",
  "rgb(var(--color-expense))",
  "rgb(var(--color-income))",
  "rgb(var(--color-muted))",
] as const;

/* ---------------------------------------------------------------------- helpers */
export { ChevronRight };