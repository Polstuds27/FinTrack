/**
 * Category editor.
 *
 * Routed rather than stateful: `/categories/new` and `/categories/:categoryId/edit`
 * render the same overlay, so the URL is shareable, the browser Back button
 * closes it, and a stale link lands on "category not found" instead of a blank
 * editor.
 */
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { paramId } from "../../app/routeParams";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "../../db";
import { createCategory, deleteCategory, updateCategory } from "../../db/repositories";
import {
  Button,
  ConfirmOverlay,
  Field,
  Input,
  Overlay,
  SegmentedControl,
  Select,
  useToast,
} from "../../components/ui";
import {
  CATEGORY_ICON_IDS,
  CATEGORY_ICONS,
  categoryIcon,
} from "../../design/icons";
import { useLocalData } from "../analytics/useLocalData";

type CategoryType = "income" | "expense";

export function CategoryEditor() {
  const navigate = useNavigate();
  const toast = useToast();
  const { categoryId: rawCategoryId } = useParams<{ categoryId: string }>();
  const categoryId = paramId(rawCategoryId);
  const editing = categoryId !== undefined;
  const { ready } = useLocalData();

  const category = useLiveQuery(
    async () => (categoryId ? db.categories.get(categoryId) : undefined),
    [categoryId],
    undefined,
  );

  const parents = useLiveQuery(
    async () => (await db.categories.toArray()).filter((row) => !row.deleted_at && !row.parent_id),
    [],
    [],
  );

  const [name, setName] = useState("");
  const [type, setType] = useState<CategoryType>("expense");
  const [icon, setIcon] = useState<string | null>(null);
  const [parentId, setParentId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  // Seed the form once the row (or "new") resolves.
  useEffect(() => {
    if (!editing || !category) return;
    setName(category.name);
    setType(category.type);
    setIcon(category.icon);
    setParentId(category.parent_id ?? "");
  }, [editing, category]);

  const siblings = useMemo(
    () => (parents ?? []).filter((row) => row.id !== categoryId && row.type === type),
    [parents, categoryId, type],
  );

  async function save() {
    setError(null);
    if (!name.trim()) {
      setError("Give the category a name.");
      return;
    }
    setBusy(true);
    try {
      if (editing && category) {
        await updateCategory(category.id, {
          name: name.trim(),
          type,
          icon,
          parent_id: parentId || null,
        });
        toast.push({ tone: "success", title: "Category updated" });
      } else {
        await createCategory({
          name: name.trim(),
          type,
          icon,
          parent_id: parentId || null,
        });
        toast.push({
          tone: "success",
          title: "Category created",
          description: "Pick it from the category list next time you record a transaction.",
        });
      }
      navigate("/categories");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't save that category.");
    } finally {
      setBusy(false);
    }
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    void save();
  }

  async function remove() {
    if (!categoryId) return;
    setBusy(true);
    try {
      await deleteCategory(categoryId);
      toast.push({
        tone: "success",
        title: "Category deleted",
        description: "Transactions that used it are now uncategorised, not removed.",
      });
      navigate("/categories");
    } catch (err) {
      toast.push({
        tone: "error",
        title: "Couldn't delete category",
        description: err instanceof Error ? err.message : undefined,
      });
    } finally {
      setBusy(false);
      setConfirmDelete(false);
    }
  }

  if (editing && !category && ready) {
    return (
      <Overlay
        open
        onClose={() => navigate("/categories")}
        title="Category not found"
        description="It may have been deleted on another device."
        variant="sheet"
        size="sm"
        footer={
          <Button variant="primary" onClick={() => navigate("/categories")}>
            Back to categories
          </Button>
        }
      >
        <p className="text-sm text-muted">
          The link you followed points at a category that no longer exists.
        </p>
      </Overlay>
    );
  }

  return (
    <>
      <Overlay
        open
        onClose={() => navigate("/categories")}
        title={editing ? "Edit category" : "New category"}
        description={
          editing
            ? "Changes apply to future transactions; history keeps its original label."
            : "Categories keep your ledger readable and power budgets and reports."
        }
        variant="sheet"
        size="md"
        footer={
          <>
            {editing && (
              <Button variant="danger" onClick={() => setConfirmDelete(true)}>
                Delete
              </Button>
            )}
            <Button variant="ghost" onClick={() => navigate("/categories")}>
              Cancel
            </Button>
            <Button variant="primary" loading={busy} onClick={() => void save()}>
              {editing ? "Save changes" : "Create category"}
            </Button>
          </>
        }
      >
        <form onSubmit={submit} className="space-y-4" noValidate>
          {error && (
            <p role="alert" className="rounded-lg bg-expense-soft px-3 py-2 text-sm text-expense">
              {error}
            </p>
          )}

          <Input
            label="Name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="e.g. Groceries"
            maxLength={60}
            required
            autoFocus={!editing}
          />

          <Field label="Type" required>
            <SegmentedControl
              options={[
                { id: "expense", label: "Expense" },
                { id: "income", label: "Income" },
              ]}
              value={type}
              onChange={(next) => {
                setType(next as CategoryType);
                setParentId("");
              }}
              ariaLabel="Category type"
            />
          </Field>

          <Field label="Icon">
            <div className="flex flex-wrap gap-1.5">
              {CATEGORY_ICON_IDS.map((id) => {
                const Icon = CATEGORY_ICONS[id];
                const active = icon === id;
                return (
                  <button
                    key={id}
                    type="button"
                    aria-label={`Use the ${id} icon`}
                    aria-pressed={active}
                    onClick={() => setIcon(active ? null : id)}
                    className={`flex h-9 w-9 items-center justify-center rounded-lg border transition-colors ${
                      active
                        ? "border-primary bg-primary-soft-bg text-primary"
                        : "border-line text-muted hover:text-ink"
                    }`}
                  >
                    <Icon className="h-4 w-4" />
                  </button>
                );
              })}
            </div>
            <p className="field-hint">
              Leave it unset to inherit an icon from the category name.
            </p>
          </Field>

          <Select
            label="Parent category"
            value={parentId}
            onChange={(event) => setParentId(event.target.value)}
            hint="Optional — subcategories roll up into their parent in reports."
          >
            <option value="">None — top level</option>
            {siblings.map((row) => (
              <option key={row.id} value={row.id}>
                {row.name}
              </option>
            ))}
          </Select>

          <div className="flex items-center gap-3 border-t border-line pt-4">
            <span
              aria-hidden="true"
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-surface-sunken text-ink-soft"
            >
              {(() => {
                const Icon = categoryIcon(icon, name || undefined);
                return <Icon className="h-5 w-5" />;
              })()}
            </span>
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-ink">{name || "Preview"}</p>
              <p className="text-xs text-muted">{type === "income" ? "Income" : "Expense"}</p>
            </div>
          </div>

          {/* Submitting through the form keeps Enter working inside inputs. */}
          <button type="submit" className="sr-only">
            Save
          </button>
        </form>
      </Overlay>

      <ConfirmOverlay
        open={confirmDelete}
        busy={busy}
        tone="danger"
        onClose={() => setConfirmDelete(false)}
        onConfirm={() => void remove()}
        title="Delete this category?"
        confirmLabel="Delete category"
        message="Transactions tagged with it stay in your history and become uncategorised. Budgets using it will need a new category."
      />
    </>
  );
}
