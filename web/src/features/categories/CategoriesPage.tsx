/**
 * Categories.
 *
 * The taxonomy behind every report. Shown as two short lists (expense, income)
 * rather than one long table, with subcategories indented under their parent so
 * the hierarchy is legible at a glance. Creation and editing live at
 * `/categories/new` and `/categories/:categoryId/edit`.
 */
import { useMemo } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { ArrowDownRight, ArrowUpRight, Pencil, Plus, Tags } from "lucide-react";
import {
  Button,
  Card,
  CardHeader,
  EmptyState,
  LinkButton,
  PageHeader,
  SegmentedControl,
} from "../../components/ui";
import type { LocalCategory } from "../../db/types";
import { categoryIcon } from "../../design/icons";
import { useLocalData } from "../analytics/useLocalData";

type Filter = "expense" | "income" | "all";

interface CategoryNode {
  category: LocalCategory;
  children: CategoryNode[];
  usage: number;
}

export function CategoriesPage() {
  const { dataset, ready } = useLocalData();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const filter = (params.get("type") as Filter) ?? "expense";

  /** Transactions pointing at the category or any of its children. */
  const usageById = useMemo(() => {
    const counts = new Map<string, number>();
    for (const tx of dataset.transactions) {
      if (!tx.category_id) continue;
      counts.set(tx.category_id, (counts.get(tx.category_id) ?? 0) + 1);
    }
    return counts;
  }, [dataset.transactions]);

  const nodes = useMemo(() => {
    const roots = dataset.categories.filter((row) => !row.parent_id);
    const build = (root: LocalCategory): CategoryNode => {
      const children = dataset.categories
        .filter((row) => row.parent_id === root.id)
        .map((child) => build(child));
      const own = usageById.get(root.id) ?? 0;
      const childUsage = children.reduce((sum, child) => sum + child.usage, 0);
      return { category: root, children, usage: own + childUsage };
    };
    return roots.map(build);
  }, [dataset.categories, usageById]);

  const visible = useMemo(
    () => (filter === "all" ? nodes : nodes.filter((node) => node.category.type === filter)),
    [nodes, filter],
  );

  const expenseCount = nodes.filter((node) => node.category.type === "expense").length;
  const incomeCount = nodes.filter((node) => node.category.type === "income").length;

  return (
    <div className="space-y-4">
      <PageHeader
        title="Categories"
        subtitle={`${nodes.length} top level · ${dataset.categories.length} including subcategories`}
        actions={
          <Button variant="primary" size="sm" icon={<Plus className="h-4 w-4" />} onClick={() => navigate("/categories/new")}>
            New category
          </Button>
        }
        tabs={
          <div className="flex flex-wrap items-center gap-2">
            <SegmentedControl
              size="sm"
              options={[
                { id: "expense", label: "Expense", icon: <ArrowDownRight className="h-3.5 w-3.5" /> },
                { id: "income", label: "Income", icon: <ArrowUpRight className="h-3.5 w-3.5" /> },
                { id: "all", label: "All" },
              ]}
              value={filter}
              onChange={(next) => {
                const nextParams = new URLSearchParams(params);
                nextParams.set("type", next);
                setParams(nextParams, { replace: true });
              }}
              ariaLabel="Category type"
            />
            <span className="text-xs text-muted">
              {filter === "income" ? incomeCount : filter === "expense" ? expenseCount : nodes.length} shown
            </span>
          </div>
        }
      />

      {ready && dataset.categories.length === 0 ? (
        <Card>
          <EmptyState
            icon={<Tags className="h-7 w-7" />}
            title="No categories yet"
            description="Categories are what turn a list of transactions into a report: they tell you where the money went and give budgets something to hold onto. Start with a handful of real ones and add more as you go."
            action={
              <Button variant="primary" icon={<Plus className="h-4 w-4" />} onClick={() => navigate("/categories/new")}>
                Create your first category
              </Button>
            }
            secondaryAction={<LinkButton to="/transactions">I'll do this later</LinkButton>}
          />
        </Card>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {(["expense", "income"] as const).map((kind) => {
            const Icon = kind === "expense" ? ArrowDownRight : ArrowUpRight;
            const rows =
              filter === "all" || filter === kind
                ? visible.filter((node) => node.category.type === kind)
                : [];
            if (filter !== "all" && filter !== kind) return null;
            return (
              <section key={kind} className="card overflow-hidden">
                <header className="flex items-center justify-between gap-2 border-b border-line px-4 py-2.5">
                  <h2 className="flex items-center gap-2 text-xs font-semibold tracking-wider text-muted uppercase">
                    <Icon aria-hidden="true" className="h-3.5 w-3.5" />
                    {kind === "expense" ? "Expense categories" : "Income categories"}
                  </h2>
                  <span className="tabular text-xs text-muted">{rows.length}</span>
                </header>

                {rows.length === 0 ? (
                  <EmptyState
                    compact
                    icon={<Tags className="h-6 w-6" />}
                    title={kind === "expense" ? "No expense categories" : "No income categories"}
                    description="Add one so transactions can be classified as they happen."
                    action={
                      <Button
                        variant="secondary"
                        size="sm"
                        icon={<Plus className="h-4 w-4" />}
                        onClick={() => navigate(`/categories/new?type=${kind}`)}
                      >
                        Add {kind} category
                      </Button>
                    }
                  />
                ) : (
                  <ul className="divide-y divide-line">
                    {rows.map((node) => (
                      <CategoryNodeRow key={node.category.id} node={node} depth={0} />
                    ))}
                  </ul>
                )}
              </section>
            );
          })}
        </div>
      )}

      <Card>
        <CardHeader
          title="How categories work"
          subtitle="Three things worth knowing"
          icon={<Tags className="h-4 w-4" />}
        />
        <ul className="space-y-2 px-4 py-3 text-sm text-muted">
          <li>
            <span className="font-medium text-ink">Subcategories roll up.</span> A budget or report
            on a parent covers every child, so you can be as fine-grained as you like.
          </li>
          <li>
            <span className="font-medium text-ink">Deleting is safe.</span> Transactions keep their
            history; they simply become uncategorised until you pick another.
          </li>
          <li>
            <span className="font-medium text-ink">Type matters.</span> Expense and income
            categories are separate so a salary can never land in a spending report.
          </li>
        </ul>
      </Card>
    </div>
  );
}

function CategoryNodeRow({ node, depth }: { node: CategoryNode; depth: number }) {
  const Icon = categoryIcon(node.category.icon, node.category.name);
  return (
    <li>
      <div
        className="row-link flex items-center gap-3 px-4 py-2.5"
        style={{ paddingLeft: `${16 + depth * 20}px` }}
      >
        <span
          aria-hidden="true"
          className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${
            depth > 0 ? "bg-surface text-muted" : "bg-surface-sunken text-ink-soft"
          }`}
        >
          <Icon className="h-4 w-4" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-ink">
            {depth > 0 && <span aria-hidden="true" className="mr-1 text-faint">↳</span>}
            {node.category.name}
          </p>
          <p className="text-xs text-muted">
            {node.usage === 0 ? "Not used yet" : `${node.usage} transaction${node.usage === 1 ? "" : "s"}`}
            {node.children.length > 0 && ` · ${node.children.length} subcategor${node.children.length === 1 ? "y" : "ies"}`}
          </p>
        </div>
        <Link
          to={`/categories/${node.category.id}/edit`}
          aria-label={`Edit ${node.category.name}`}
          className="icon-btn h-8 w-8 text-muted hover:text-ink"
        >
          <Pencil className="h-4 w-4" />
        </Link>
      </div>
      {node.children.length > 0 && (
        <ul className="divide-y divide-line">
          {node.children.map((child) => (
            <CategoryNodeRow key={child.category.id} node={child} depth={depth + 1} />
          ))}
        </ul>
      )}
    </li>
  );
}
