import { useState, type ReactNode } from "react";
import { useSnackbar } from "notistack";
import type {
    RuleInput, XenBudgetBook, XenBudgetRule,
} from "../../../../../hooks/xenbudget/types";
import { useXenBudgetRules } from "../../../../../hooks/xenbudget/useRules";
import RuleForm from "../RuleForm";

/**
 * One rule dialog per page, opened either on a new rule for a merchant or on an existing
 * rule to edit.
 *
 * A hook holding an element rather than a component per row, because RuleForm carries
 * around twenty pieces of state: mounting one per merchant row — twenty-five of them,
 * closed, doing nothing — would be waste. The page renders `dialog` once.
 *
 * Deliberately NOT the same as the review queue's rule form, which sweeps immediately
 * after saving. A rule written from a report is about what gets imported next; rewriting
 * months of history from a chart is not what that button promised. The Tagging tab's
 * "Re-apply" stays the deliberate way to do that.
 */
export function useRuleEditor(book: XenBudgetBook) {
    const { enqueueSnackbar } = useSnackbar();
    const {
        createRuleAsync, isCreatingRule, updateRuleAsync, isUpdatingRule, deleteRuleAsync,
    } = useXenBudgetRules(book._id);

    const [open, setOpen] = useState(false);
    // Either a saved rule (carries _id, so saving updates) or a prefilled draft (creates).
    const [editing, setEditing] = useState<XenBudgetRule | RuleInput | null>(null);

    /** A new rule matching one merchant, prefilled with the category its items already use. */
    const openForMerchant = (merchant: string, categories: string[]) => {
        setEditing({
            name: merchant.slice(0, 100),
            match: {
                mode: "all",
                conditions: [{ field: "description", op: "contains", value: merchant }],
            },
            // One category, not all of them: the others are what this merchant has been
            // filed under historically, which is a list to choose from, not an instruction
            // to split every future purchase across them.
            actions: { set_categories: categories.slice(0, 1) },
        });
        setOpen(true);
    };

    /**
     * An existing rule, by id. Resolved from the book the page already holds — the same
     * lookup ItemPreviewModal does — so this costs no request. Returns false when the id
     * no longer resolves (deleted since the payload was cached), letting the caller fall
     * back rather than open an empty form.
     */
    const openExistingRule = (ruleId: string): boolean => {
        const rule = book.rules.find((r) => r._id === ruleId);
        if (!rule) return false;
        setEditing(rule);
        setOpen(true);
        return true;
    };

    // A saved rule has an _id; a prefilled draft does not. That is the whole distinction
    // between updating and creating here.
    const existingId = editing && "_id" in editing ? editing._id : null;

    const dialog: ReactNode = (
        <RuleForm
            open={open}
            onClose={() => setOpen(false)}
            book={book}
            rule={editing}
            isSubmitting={isCreatingRule || isUpdatingRule}
            onDelete={existingId ? async () => {
                await deleteRuleAsync(existingId);
                enqueueSnackbar("Rule deleted — re-apply rules to undo its effects", {
                    variant: "success",
                });
            } : undefined}
            onSubmit={async (input) => {
                if (existingId) {
                    await updateRuleAsync({ ruleId: existingId, input });
                    enqueueSnackbar("Rule updated — existing items are unchanged until you re-apply", {
                        variant: "success",
                    });
                } else {
                    await createRuleAsync(input);
                    enqueueSnackbar("Rule saved — it will tag items from now on", {
                        variant: "success",
                    });
                }
            }}
        />
    );

    return { openForMerchant, openExistingRule, dialog };
}
