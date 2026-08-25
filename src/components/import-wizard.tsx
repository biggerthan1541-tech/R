"use client";

import { useActionState, useMemo, useState } from "react";
import Link from "next/link";
import { parseCsv } from "@/lib/csv";
import { guessMapping, parseRow, IMPORT_FIELDS, type ColumnMapping, type ImportField } from "@/lib/import";
import type { ImportState } from "@/app/w/[slug]/import/actions";

const PREVIEW_ROWS = 5;

export function ImportWizard({
  action,
  registerHref,
}: {
  action: (state: ImportState, formData: FormData) => Promise<ImportState>;
  registerHref: string;
}) {
  const [csv, setCsv] = useState("");
  const [filename, setFilename] = useState("");
  const [mapping, setMapping] = useState<ColumnMapping>({});
  const [readError, setReadError] = useState("");
  const [state, formAction, pending] = useActionState(action, {});

  const rows = useMemo(() => (csv ? parseCsv(csv) : []), [csv]);
  const headers = rows[0] ?? [];
  const body = rows.slice(1);

  const preview = useMemo(
    () => body.slice(0, PREVIEW_ROWS).map((cells, i) => parseRow(cells, mapping, i + 2)),
    [body, mapping],
  );
  const allProblems = useMemo(
    () => body.map((cells, i) => parseRow(cells, mapping, i + 2)).filter((r) => !r.ok).length,
    [body, mapping],
  );

  async function onFile(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    setReadError("");
    try {
      const text = await file.text();
      const parsed = parseCsv(text);
      if (parsed.length < 2) {
        setReadError("That file needs a header row and at least one data row.");
        return;
      }
      setCsv(text);
      setFilename(file.name);
      setMapping(guessMapping(parsed[0]));
    } catch {
      setReadError("Could not read that file. Export it as CSV and try again.");
    }
  }

  if (state.result) {
    const { imported, skipped, problems } = state.result;
    return (
      <div className="hair p-5">
        <h4 className="mb-1">
          Imported {imported} exception{imported === 1 ? "" : "s"}
          {skipped > 0 && <span className="text-neutral-700"> · {skipped} skipped</span>}
        </h4>
        {problems.length > 0 && (
          <div className="mt-4">
            <div className="kicker mb-2">Rows we could not import</div>
            <ul className="m-0 flex list-none flex-col gap-1 p-0 text-[13px] text-neutral-800">
              {problems.slice(0, 25).map((p) => (
                <li key={p.row}>
                  <span className="num font-semibold">Row {p.row}</span> — {p.errors.join("; ")}
                </li>
              ))}
              {problems.length > 25 && <li>…and {problems.length - 25} more.</li>}
            </ul>
            <p className="mt-3 text-[12px] text-neutral-700">
              Fix them in your spreadsheet and import that file again — nothing here is duplicated
              unless the same rows are re-imported.
            </p>
          </div>
        )}
        <Link href={registerHref} className="btn-primary mt-6 self-start">
          Go to the register
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="hair bg-surface p-5">
        <label className="label" htmlFor="file">
          CSV file
        </label>
        <input
          id="file"
          type="file"
          accept=".csv,text/csv"
          onChange={onFile}
          className="block w-full text-[13px] text-neutral-800 file:mr-4 file:cursor-pointer file:border-0 file:bg-accent file:px-4 file:py-2 file:text-[14px] file:font-extrabold file:text-bg hover:file:bg-accent-600"
        />
        {filename && (
          <p className="hint num">
            {filename} — {body.length} data row{body.length === 1 ? "" : "s"}, {headers.length}{" "}
            column{headers.length === 1 ? "" : "s"}.
          </p>
        )}
        {readError && <p className="err">{readError}</p>}
      </div>

      {csv && (
        <form action={formAction} className="space-y-6">
          <input type="hidden" name="csv" value={csv} />
          <input type="hidden" name="mapping" value={JSON.stringify(mapping)} />

          <fieldset className="hair p-5">
            <legend className="kicker px-1">Column mapping</legend>
            <div className="mt-3 grid gap-3.5 sm:grid-cols-2">
              {IMPORT_FIELDS.map((field) => (
                <div key={field.key}>
                  <label className="label" htmlFor={`map-${field.key}`}>
                    {field.label}
                    {field.required && <span className="ml-1 text-accent">*</span>}
                  </label>
                  <select
                    id={`map-${field.key}`}
                    className="input"
                    value={mapping[field.key] ?? ""}
                    onChange={(e) =>
                      setMapping((m) => {
                        const next = { ...m };
                        if (e.target.value === "") delete next[field.key as ImportField];
                        else next[field.key as ImportField] = Number(e.target.value);
                        return next;
                      })
                    }
                  >
                    <option value="">— not in my file —</option>
                    {headers.map((h, i) => (
                      <option key={i} value={i}>
                        {h || `Column ${i + 1}`}
                      </option>
                    ))}
                  </select>
                </div>
              ))}
            </div>
          </fieldset>

          <div className="hair overflow-hidden">
            <div className="hair-b flex items-center justify-between bg-surface px-5 py-3">
              <span className="kicker">
                Preview — first {Math.min(PREVIEW_ROWS, body.length)} of {body.length}
              </span>
              {allProblems > 0 && (
                <span className="text-[12px] font-semibold text-warn">
                  {allProblems} row{allProblems === 1 ? "" : "s"} will be skipped
                </span>
              )}
            </div>
            <table className="table">
              <thead>
                <tr>
                  <th className="pl-5">Row</th>
                  <th>Title</th>
                  <th>Owner</th>
                  <th>Expiry</th>
                  <th className="pr-5">Type / risk</th>
                </tr>
              </thead>
              <tbody>
                {preview.map((r) =>
                  r.ok ? (
                    <tr key={r.row}>
                      <td className="num pl-5 text-neutral-600">{r.row}</td>
                      <td className="font-semibold">{r.value.title}</td>
                      <td className="text-[13px] text-neutral-800">{r.value.riskOwnerEmail}</td>
                      <td className="num text-[13px]">{r.value.expiryDate}</td>
                      <td className="pr-5 text-[13px] text-neutral-800">
                        {r.value.type} · {r.value.riskLevel}
                      </td>
                    </tr>
                  ) : (
                    <tr key={r.row} className="bg-accent-100">
                      <td className="num pl-5 text-neutral-600">{r.row}</td>
                      <td colSpan={4} className="pr-5 text-[13px] text-accent-800">
                        {r.errors.join("; ")}
                      </td>
                    </tr>
                  ),
                )}
              </tbody>
            </table>
          </div>

          {state.error && (
            <p className="border-l-[3px] border-accent bg-accent-100 px-3 py-2 text-[13px] font-semibold text-accent-800">
              {state.error}
            </p>
          )}

          <button className="btn-primary self-start" disabled={pending || body.length === allProblems}>
            {pending
              ? "Importing…"
              : `Import ${body.length - allProblems} exception${body.length - allProblems === 1 ? "" : "s"}`}
          </button>
        </form>
      )}
    </div>
  );
}
