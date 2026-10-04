/**
 * Account editor.
 *
 * Shared by the Accounts page and the account detail screen. Credit-limit and
 * statement fields only appear for card accounts, so the form stays short for
 * the common case.
 */
import { useState, type FormEvent } from "react";
import { X } from "lucide-react";
import { useLiveQuery } from "dexie-react-hooks";
import type { LocalAccount } from "../../db/types";
import { db } from "../../db";
import { CURRENCIES } from "../../design/format";
import {
  AmountInput,
  Button,
  Field,
  Input,
  Overlay,
  Select,
  useToast,
} from "../../components/ui";
import { ACCOUNT_TYPE_LABELS, ACCOUNT_TYPE_GROUPS, accountIcon } from "../../design/icons";
import { useLocalData } from "../analytics/useLocalData";
import {
  createAccount,
  createAccountGroup,
  updateAccount,
} from "../../db/repositories";

const CREDIT_TYPES = new Set(["credit", "debit"]);

export interface AccountFormOverlayProps {
  open: boolean;
  onClose: () => void;
  /** Omit to create a new account. */
  account?: LocalAccount;
  /** Pre-select an account type when creating (e.g. "credit" from /credit-cards/new). */
  defaultType?: LocalAccount["type"];
}

export function AccountFormOverlay({ open, onClose, account, defaultType }: AccountFormOverlayProps) {
  const { lookups } = useLocalData();
  const toast = useToast();
  const editing = Boolean(account);

  const [name, setName] = useState(account?.name ?? "");
  const [type, setType] = useState(account?.type ?? defaultType ?? "bank");
  const [currency, setCurrency] = useState(account?.currency ?? lookups.dataset.baseCurrency);
  const [opening, setOpening] = useState(account ? account.opening_balance : 0);
  const [limit, setLimit] = useState(account?.credit_limit ?? 0);
  const [statementDay, setStatementDay] = useState(account?.statement_day ?? 1);
  const [dueDay, setDueDay] = useState(account?.due_day ?? 20);
  const [groupId, setGroupId] = useState(account?.group_id ?? "");
  const [newGroupName, setNewGroupName] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const groups = useLiveQuery(
    async () =>
      (await db.account_groups.toArray())
        .filter((row) => !row.deleted_at)
        .sort((a, b) => a.name.localeCompare(b.name)),
    [],
    [],
  );
  const groupList = groups ?? [];

  const isCard = CREDIT_TYPES.has(type);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    if (!name.trim()) {
      setError("Give the account a name you will recognise.");
      return;
    }
    setBusy(true);
    try {
      // A group typed inline is created first so the account can reference it.
      let resolvedGroupId = groupId || null;
      const trimmedGroup = newGroupName?.trim();
      if (trimmedGroup) {
        const group = await createAccountGroup(trimmedGroup);
        resolvedGroupId = group.id;
        setGroupId(group.id);
        setNewGroupName(null);
      }

      const payload = {
        name: name.trim(),
        type,
        currency,
        opening_balance: opening,
        credit_limit: isCard && limit > 0 ? limit : null,
        statement_day: isCard ? statementDay : null,
        due_day: isCard ? dueDay : null,
        group_id: resolvedGroupId,
      };

      if (account) {
        await updateAccount(account.id, payload);
        toast.push({ tone: "success", title: "Account updated" });
      } else {
        await createAccount(payload);
        toast.push({
          tone: "success",
          title: "Account added",
          description: "Balances update as soon as you record transactions.",
        });
      }
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't save that account.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Overlay
      open={open}
      onClose={onClose}
      title={editing ? "Edit account" : "Add account"}
      description={editing ? undefined : "Cash, bank, e-wallet, savings, investment or card."}
      variant="sheet"
      size="md"
    >
      <form onSubmit={submit} className="space-y-4" noValidate>
        {error && (
          <p role="alert" className="rounded-lg bg-expense-soft px-3 py-2 text-sm text-expense">
            {error}
          </p>
        )}

        <Input
          label="Account name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. BDO Savings"
          maxLength={60}
          required
          autoFocus
        />

        <Field label="Type" required>
          <div className="grid grid-cols-3 gap-1.5 sm:grid-cols-5">
            {ACCOUNT_TYPE_GROUPS.map((group) => {
              const Icon = accountIcon(group.key);
              const active = type === group.key;
              return (
                <button
                  key={group.key}
                  type="button"
                  aria-pressed={active}
                  onClick={() => setType(group.key)}
                  className={`flex flex-col items-center gap-1 rounded-lg border px-2 py-2 text-[11px] font-medium transition-colors ${
                    active
                      ? "border-primary bg-primary-soft-bg text-primary"
                      : "border-line-strong text-muted hover:text-ink"
                  }`}
                >
                  <Icon aria-hidden="true" className="h-4 w-4" />
                  <span className="truncate">{ACCOUNT_TYPE_LABELS[group.key] ?? group.label}</span>
                </button>
              );
            })}
          </div>
        </Field>

        <div className="grid gap-3 sm:grid-cols-2">
          <Select label="Currency" value={currency} onChange={(e) => setCurrency(e.target.value)}>
            {CURRENCIES.map((code) => (
              <option key={code} value={code}>
                {code}
              </option>
            ))}
          </Select>
          <Field
            label={editing ? "Opening balance" : "Starting balance"}
            htmlFor="acct-opening"
            hint={editing ? "Changing this recalculates history." : undefined}
          >
            <AmountInput
              id="acct-opening"
              value={opening}
              onChange={setOpening}
              currency={currency}
              size="md"
            />
          </Field>
        </div>

        {isCard && (
          <div className="space-y-3 rounded-lg border border-line bg-surface-sunken p-3">
            <p className="text-xs font-semibold tracking-wide text-ink-soft uppercase">
              Card details
            </p>
            <Field label="Credit limit" htmlFor="acct-limit" hint="0 means no limit set.">
              <AmountInput id="acct-limit" value={limit} onChange={setLimit} currency={currency} size="md" />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Input
                label="Statement day"
                type="number"
                min={1}
                max={31}
                value={statementDay}
                onChange={(e) => setStatementDay(Number(e.target.value))}
              />
              <Input
                label="Payment due day"
                type="number"
                min={1}
                max={31}
                value={dueDay}
                onChange={(e) => setDueDay(Number(e.target.value))}
              />
            </div>
          </div>
        )}

        <div>
          <Select
            label="Group"
            value={newGroupName !== null ? "__new__" : groupId}
            onChange={(e) => {
              if (e.target.value === "__new__") {
                setGroupId("");
                setNewGroupName("");
              } else {
                setGroupId(e.target.value);
                setNewGroupName(null);
              }
            }}
            hint="Optional — keeps related accounts together."
          >
            <option value="">No group</option>
            {groupList.map((group) => (
              <option key={group.id} value={group.id}>
                {group.name}
              </option>
            ))}
            <option value="__new__">New group…</option>
          </Select>

          {newGroupName !== null && (
            <div className="mt-2 flex items-end gap-2">
              <Input
                label="New group name"
                value={newGroupName}
                onChange={(e) => setNewGroupName(e.target.value)}
                placeholder="Personal"
                maxLength={50}
                autoFocus
              />
              <Button
                type="button"
                variant="ghost"
                size="sm"
                icon={<X aria-hidden="true" className="h-4 w-4" />}
                onClick={() => setNewGroupName(null)}
              >
                Cancel
              </Button>
            </div>
          )}
        </div>

        <div className="flex gap-2 pt-1">
          <Button type="submit" variant="primary" size="lg" loading={busy} className="flex-1">
            {editing ? "Save account" : "Add account"}
          </Button>
          <Button type="button" variant="ghost" size="lg" onClick={onClose}>
            Cancel
          </Button>
        </div>
      </form>
    </Overlay>
  );
}