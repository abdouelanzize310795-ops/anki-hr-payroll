import { useState } from "react";
import { Check, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { adminReviewCompany } from "@/modules/admin/admin.functions";

type Props = {
  companyId: string;
  approvalStatus: string;
  /** Compact = boutons seuls ; full = + champ motif refus */
  variant?: "compact" | "full";
  onDone?: () => void;
  onError?: (message: string) => void;
};

export function CompanyApprovalActions({
  companyId,
  approvalStatus,
  variant = "compact",
  onDone,
  onError,
}: Props) {
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");

  const canReview =
    approvalStatus === "pending_approval" || approvalStatus === "pending_payment";

  if (!canReview) return null;

  const review = async (action: "approve" | "reject") => {
    setBusy(true);
    try {
      const result = await adminReviewCompany({
        data: {
          companyId,
          action,
          note: action === "reject" ? note.trim() || null : null,
        },
      });
      if (!result.ok) {
        onError?.(result.message);
        return;
      }
      setNote("");
      onDone?.();
    } catch (err) {
      onError?.(err instanceof Error ? err.message : "Action impossible");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={variant === "full" ? "space-y-2" : "flex flex-wrap items-center gap-2"}>
      <div className="flex flex-wrap gap-2">
        <Button size="sm" disabled={busy} onClick={() => void review("approve")}>
          <Check className="mr-1 h-4 w-4" />
          Valider
        </Button>
        <Button
          size="sm"
          variant="outline"
          disabled={busy}
          onClick={() => void review("reject")}
        >
          <X className="mr-1 h-4 w-4" />
          Refuser
        </Button>
      </div>
      {variant === "full" && (
        <Input
          placeholder="Motif de refus (optionnel)"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          disabled={busy}
        />
      )}
    </div>
  );
}
