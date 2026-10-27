// "Update bank account" — add the account settlements are paid into, or ask to change it.
//
// One form, two outcomes, decided by the server (PUT /owner/:rId/payout-account):
//   • no account yet, or one not yet verified → the details replace it and go to review
//   • a verified account → the save is a change REQUEST; payouts keep going to the verified
//     account until Yulo verifies the new one, and the page says so
//
// The rules below mirror ownerPayoutAccountSchema on the server (services/payoutAccount.
// service.js) so a bad value is caught as it's typed; the server is still the authority, and
// its field errors are put back on the fields they concern.
//
// The account number is never prefilled — the API never returns it — so every save re-enters
// it. The proof (a cancelled cheque or statement, document type `bank_statement`) is uploaded
// first, so the save links the account to it.

import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { FileText, Loader2, Upload, X } from "lucide-react";

import { Button } from "@/screens/payments/ui";
import ConfirmDialog from "@/components/ConfirmDialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/components/Toaster";
import {
  ALLOWED_DOCUMENT_TYPES,
  MAX_DOCUMENT_BYTES,
  useDocuments,
  useUploadDocument,
} from "@/hooks/owner/useDocuments";
import {
  payoutAccountKeys,
  useSavePayoutAccount,
} from "@/hooks/owner/usePayoutAccount";
import { cn } from "@/lib/utils";

// Twins of the server's regexes — keep them in step with services/payoutAccount.service.js.
const HOLDER_NAME = /^[A-Za-z0-9][A-Za-z0-9 .,&'()/-]*$/;
const ACCOUNT_NUMBER = /^[0-9]{9,18}$/;
const IFSC = /^[A-Z]{4}0[A-Z0-9]{6}$/;

const ACCOUNT_TYPES = [
  { value: "current", label: "Current" },
  { value: "savings", label: "Savings" },
];

function validate(values) {
  const errors = {};
  const name = values.accountHolderName.trim();
  if (name.length < 2)
    errors.accountHolderName = "Enter the account holder's name";
  else if (name.length > 120)
    errors.accountHolderName =
      "Account holder name must be at most 120 characters";
  else if (!HOLDER_NAME.test(name)) {
    errors.accountHolderName =
      "Use letters, numbers, spaces and . , & ' ( ) / - only, as printed on the cheque";
  }
  if (!ACCOUNT_NUMBER.test(values.accountNumber))
    errors.accountNumber = "Account number must be 9 to 18 digits";
  if (values.confirmAccountNumber !== values.accountNumber) {
    errors.confirmAccountNumber = "Account numbers do not match";
  }
  if (!IFSC.test(values.ifsc))
    errors.ifsc = "Enter a valid 11-character IFSC, e.g. HDFC0001234";
  if (values.bankName.trim().length > 120)
    errors.bankName = "Bank name must be at most 120 characters";
  if (values.branch.trim().length > 120)
    errors.branch = "Branch must be at most 120 characters";
  if (!ACCOUNT_TYPES.some((t) => t.value === values.accountType))
    errors.accountType = "Choose the account type";
  return errors;
}

// zod's flatten() on the server: { fieldErrors: { field: [message, …] } }.
function serverFieldErrors(err) {
  const fieldErrors = err?.details?.fieldErrors ?? {};
  return Object.fromEntries(
    Object.entries(fieldErrors).map(([field, messages]) => [
      field,
      [].concat(messages)[0],
    ]),
  );
}

function Field({ label, htmlFor, error, required, help, children }) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={htmlFor} className="text-xs font-semibold">
        {label}
        {required ? <span className="text-[#b3421e]"> *</span> : null}
      </Label>
      {children}
      {error ? (
        <p role="alert" className="text-[11px] text-[#b3421e]">
          {error}
        </p>
      ) : help ? (
        <p className="text-[11px] text-muted-foreground">{help}</p>
      ) : null}
    </div>
  );
}

export default function BankAccountForm({
  open,
  restaurantId,
  account,
  onClose,
}) {
  const toast = useToast();
  const qc = useQueryClient();
  const save = useSavePayoutAccount(restaurantId);
  const upload = useUploadDocument(restaurantId);
  const { data: documents = [] } = useDocuments(restaurantId);
  const isChange = account?.status === "verified";
  // Changing a verified account: its proof stays as the verified account's evidence, and the
  // new account's proof is its own document (`bank_statement_change`), uploaded once the
  // change request exists — it becomes the account's bank_statement when Yulo verifies it.
  const proofType = isChange ? "bank_statement_change" : "bank_statement";
  const proofDoc = documents.find((d) => d.type === proofType) ?? null;
  // A verified proof is settled evidence — the documents API refuses a replacement (409), so
  // the picker isn't offered for it.
  const proofLocked = proofDoc?.status === "verified";
  // Prefill from what Yulo holds — the pending request if there is one, else the account —
  // except the number, which is never sent back.
  const source = account?.pendingChange ?? account ?? {};
  const initial = () => ({
    accountHolderName: source.accountHolderName ?? "",
    accountNumber: "",
    confirmAccountNumber: "",
    ifsc: source.ifsc ?? "",
    bankName: source.bankName ?? "",
    branch: source.branch ?? "",
    accountType: source.accountType ?? "current",
  });

  const [values, setValues] = useState(initial);
  const [touched, setTouched] = useState({});
  const [submitted, setSubmitted] = useState(false);
  const [serverErrors, setServerErrors] = useState({});
  const [proofFile, setProofFile] = useState(null);
  const [proofError, setProofError] = useState("");
  // Validated details waiting on the "send payouts here?" confirm.
  const [confirming, setConfirming] = useState(false);
  const fileRef = useRef(null);

  // Fresh form every time it opens — a half-typed number from a cancelled attempt must not
  // still be sitting there.
  useEffect(() => {
    if (!open) return;
    setValues(initial());
    setTouched({});
    setSubmitted(false);
    setServerErrors({});
    setProofFile(null);
    setProofError("");
    setConfirming(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  const errors = validate(values);
  const errorFor = (key) =>
    (submitted || touched[key] ? errors[key] : undefined) ?? serverErrors[key];
  const set = (key, value) => {
    setValues((v) => ({ ...v, [key]: value }));
    setTouched((t) => ({ ...t, [key]: true }));
    setServerErrors((e) => (key in e ? { ...e, [key]: undefined } : e));
  };
  const busy = save.isPending || upload.isPending;

  function pickProof(e) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (!ALLOWED_DOCUMENT_TYPES.includes(file.type)) {
      setProofError("Upload a JPG, PNG, WebP or PDF");
      return;
    }
    if (file.size > MAX_DOCUMENT_BYTES) {
      setProofError("The file must be under 5 MB");
      return;
    }
    setProofError("");
    setProofFile(file);
  }

  // Validates, then asks: where settlements are paid is the one thing on this form a typo
  // turns into money sent to the wrong account.
  function submit(e) {
    e.preventDefault();
    setSubmitted(true);
    setServerErrors({});
    if (Object.keys(errors).length > 0) return;
    setConfirming(true);
  }

  async function commit() {
    try {
      await persist();
    } finally {
      setConfirming(false);
    }
  }

  async function persist() {
    // A first account's proof goes up before the details (so review starts with it); a
    // change's proof can only be uploaded once the request exists, so it goes up after.
    const uploadProof = async () => {
      if (!proofFile) return true;
      try {
        await upload.mutateAsync({ type: proofType, file: proofFile });
        // The change request now points at this proof — show it on the account card.
        if (isChange)
          qc.invalidateQueries({
            queryKey: payoutAccountKeys.account(restaurantId),
          });
        return true;
      } catch (err) {
        toast.error(
          err,
          "Couldn't upload the proof document. Please try again.",
        );
        return false;
      }
    };
    if (!isChange && !(await uploadProof())) return;

    try {
      const result = await save.mutateAsync({
        accountHolderName: values.accountHolderName.trim(),
        accountNumber: values.accountNumber,
        confirmAccountNumber: values.confirmAccountNumber,
        ifsc: values.ifsc,
        // Optional on the server; omitted when blank so "no bank name" stays null there.
        ...(values.bankName.trim() ? { bankName: values.bankName.trim() } : {}),
        ...(values.branch.trim() ? { branch: values.branch.trim() } : {}),
        accountType: values.accountType,
      });
      // The request exists now (or already did), so the new account's proof can attach to it.
      if (isChange && result.changeRequested && !(await uploadProof())) return;
      toast.success(
        result.changed
          ? result.message
          : proofFile
            ? "Proof uploaded for your change request"
            : "No changes — these are the details already on file",
      );
      onClose();
    } catch (err) {
      const fieldErrors = serverFieldErrors(err);
      if (Object.keys(fieldErrors).length > 0) setServerErrors(fieldErrors);
      toast.error(
        err.code === "ENCRYPTION_NOT_CONFIGURED"
          ? "Bank details can't be saved right now. Please try again later or contact Yulo support."
          : err,
        "Couldn't save the bank account. Please try again.",
      );
    }
  }

  return (
    <div
      className="pay-scope fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/60 p-3 sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-labelledby="bank-account-form-title"
    >
      <form
        onSubmit={submit}
        noValidate
        className="my-auto w-full max-w-xl rounded-2xl bg-white shadow-xl"
      >
        <div className="flex items-start justify-between gap-4 border-b border-[#e3dfd4] px-6 py-4">
          <div>
            <h2 id="bank-account-form-title" className="text-lg font-bold">
              {isChange
                ? "Request a bank account change"
                : account?.status === "not_added"
                  ? "Add bank account"
                  : "Update bank account"}
            </h2>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {isChange
                ? "Your verified account keeps receiving payouts until Yulo verifies the new one."
                : "Yulo verifies the account against the proof you upload before the first payout."}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="grid grid-cols-1 gap-4 px-6 py-5 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Field
              label="Account holder name"
              htmlFor="bank-holder"
              required
              error={errorFor("accountHolderName")}
              help="Exactly as printed on the cheque or statement."
            >
              <Input
                id="bank-holder"
                value={values.accountHolderName}
                maxLength={120}
                autoComplete="off"
                onChange={(e) => set("accountHolderName", e.target.value)}
                aria-invalid={!!errorFor("accountHolderName")}
              />
            </Field>
          </div>
          <Field
            label="Account number"
            htmlFor="bank-number"
            required
            error={errorFor("accountNumber")}
          >
            <Input
              id="bank-number"
              value={values.accountNumber}
              inputMode="numeric"
              autoComplete="off"
              maxLength={18}
              onChange={(e) =>
                set("accountNumber", e.target.value.replace(/\D/g, ""))
              }
              aria-invalid={!!errorFor("accountNumber")}
            />
          </Field>
          <Field
            label="Confirm account number"
            htmlFor="bank-confirm"
            required
            error={errorFor("confirmAccountNumber")}
          >
            <Input
              id="bank-confirm"
              value={values.confirmAccountNumber}
              inputMode="numeric"
              autoComplete="off"
              maxLength={18}
              // Typed twice on purpose: a pasted number defeats the point of confirming it.
              onPaste={(e) => e.preventDefault()}
              onChange={(e) =>
                set("confirmAccountNumber", e.target.value.replace(/\D/g, ""))
              }
              aria-invalid={!!errorFor("confirmAccountNumber")}
            />
          </Field>
          <Field
            label="IFSC"
            htmlFor="bank-ifsc"
            required
            error={errorFor("ifsc")}
          >
            <Input
              id="bank-ifsc"
              value={values.ifsc}
              maxLength={11}
              autoComplete="off"
              placeholder="HDFC0001234"
              onChange={(e) =>
                set(
                  "ifsc",
                  e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ""),
                )
              }
              aria-invalid={!!errorFor("ifsc")}
              className="uppercase tracking-widest"
            />
          </Field>
          <Field
            label="Account type"
            htmlFor="bank-type"
            required
            error={errorFor("accountType")}
          >
            <div id="bank-type" role="radiogroup" className="flex gap-2">
              {ACCOUNT_TYPES.map((t) => (
                <button
                  key={t.value}
                  type="button"
                  role="radio"
                  aria-checked={values.accountType === t.value}
                  onClick={() => set("accountType", t.value)}
                  className={cn(
                    "h-9 flex-1 rounded-md border text-sm font-medium transition-colors",
                    values.accountType === t.value
                      ? "border-[#14594a] bg-[#e0efea] text-[#14594a]"
                      : "border-input bg-background hover:bg-muted",
                  )}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </Field>
          <Field
            label="Bank name"
            htmlFor="bank-name"
            error={errorFor("bankName")}
          >
            <Input
              id="bank-name"
              value={values.bankName}
              maxLength={120}
              onChange={(e) => set("bankName", e.target.value)}
            />
          </Field>
          <Field
            label="Branch"
            htmlFor="bank-branch"
            error={errorFor("branch")}
          >
            <Input
              id="bank-branch"
              value={values.branch}
              maxLength={120}
              onChange={(e) => set("branch", e.target.value)}
            />
          </Field>

          {/* Proof — the document Yulo checks the account against. */}
          <div className="sm:col-span-2">
            <p className="text-xs font-semibold">Proof of account</p>
            <p className="mt-0.5 text-[11px] text-muted-foreground">
              A cancelled cheque or a recent statement showing the account
              number and holder name. JPG, PNG, WebP or PDF, up to 5 MB.
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-3 rounded-lg border border-[#e3dfd4] bg-[#efece4] px-3 py-2.5">
              <FileText className="h-4 w-4 text-[#14594a]" />
              <span className="flex-1 truncate text-sm">
                {proofFile
                  ? proofFile.name
                  : proofDoc
                    ? `Current proof · ${proofDoc.status === "verified" ? "verified" : proofDoc.status === "rejected" ? "rejected" : "in review"}`
                    : "No proof uploaded yet"}
              </span>
              {proofLocked ? null : (
                <>
                  <input
                    ref={fileRef}
                    type="file"
                    accept={ALLOWED_DOCUMENT_TYPES.join(",")}
                    className="hidden"
                    onChange={pickProof}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => fileRef.current?.click()}
                  >
                    <Upload /> {proofFile || proofDoc ? "Replace" : "Upload"}
                  </Button>
                </>
              )}
            </div>
            {proofFile ? (
              <button
                type="button"
                onClick={() => setProofFile(null)}
                className="mt-1 text-[11px] font-semibold text-[#b3421e] hover:underline"
              >
                Remove this file
              </button>
            ) : null}
            {proofError ? (
              <p role="alert" className="mt-1 text-[11px] text-[#b3421e]">
                {proofError}
              </p>
            ) : isChange ? (
              <p className="mt-1 text-[11px] text-muted-foreground">
                Upload a cheque or statement of the <strong>new</strong>{" "}
                account. Your verified account&apos;s proof stays on file until
                Yulo verifies the change.
              </p>
            ) : null}
          </div>
        </div>

        <div className="flex items-center justify-end gap-3 border-t border-[#e3dfd4] px-6 py-4">
          <Button
            type="button"
            variant="outline"
            onClick={onClose}
            disabled={busy}
          >
            Cancel
          </Button>
          <Button type="submit" disabled={busy} className="h-10 px-6">
            {busy ? <Loader2 className="animate-spin" /> : null}
            {isChange ? "Request change" : "Save bank account"}
          </Button>
        </div>
      </form>

      <ConfirmDialog
        open={confirming}
        title={isChange ? "Request this bank account change?" : "Send payouts to this account?"}
        confirmLabel={isChange ? "Request change" : "Save bank account"}
        pendingLabel="Saving…"
        pending={busy}
        onConfirm={commit}
        onCancel={() => setConfirming(false)}
      >
        <p>
          <span className="font-bold text-foreground">
            {values.accountHolderName.trim()} · A/c ending {values.accountNumber.slice(-4)} ·{" "}
            {values.ifsc}
          </span>
        </p>
        <p>
          {isChange
            ? "Once Yulo verifies it, every settlement is paid into this account instead of your current one. Until then payouts keep going to the verified account."
            : "Once Yulo verifies it, your settlements are paid into this account."}{" "}
          Money sent to a wrong account can't be pulled back — check the number and IFSC.
        </p>
      </ConfirmDialog>
    </div>
  );
}
