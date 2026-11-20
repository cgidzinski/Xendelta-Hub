import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Alert, Button, IconButton, MenuItem, Stack, TextField } from "@mui/material";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";
import { pagePropertiesSchema, propertyStatuses, propertyTypes, type PageProperty } from "@shared/xennote/properties";
import ResponsiveDialog from "../../../../components/ui/ResponsiveDialog";
import { api } from "../../../../config/api";
import { xennoteKeys } from "../../../../hooks/xennote/keys";
import type { XenNotePageDetail } from "../../../../types/XenNotePage";

type Draft = { id: string; key: string; type: PageProperty["type"]; value: string; options: string };

export default function PagePropertiesDialog({
  pageId,
  properties,
  editable,
  onClose,
}: {
  pageId: string;
  properties: PageProperty[];
  editable: boolean;
  onClose: () => void;
}) {
  const client = useQueryClient();
  const [error, setError] = useState("");
  const [draft, setDraft] = useState<Draft[]>(() =>
    properties.map((p) => ({
      id: crypto.randomUUID(),
      key: p.key,
      type: p.type,
      value: String(p.value),
      options: p.type === "select" ? p.options.join(", ") : "",
    })),
  );
  const patch = (id: string, next: Partial<Draft>) =>
    setDraft((rows) => rows.map((row) => (row.id === id ? { ...row, ...next } : row)));
  const add = () =>
    setDraft((rows) => [...rows, { id: crypto.randomUUID(), key: "", type: "text", value: "", options: "" }]);
  const save = useMutation({
    mutationFn: (properties: PageProperty[]) =>
      api.put<{ properties: PageProperty[] }>(`/api/xennote/pages/${pageId}/properties`, { properties }),
    onSuccess: ({ properties: current }) => {
      client.setQueryData<XenNotePageDetail>(xennoteKeys.page(pageId), (old) =>
        old ? { ...old, properties: current } : old,
      );
      void client.invalidateQueries({ queryKey: xennoteKeys.queries() });
      onClose();
    },
    onError: (failure) => setError(failure.message),
  });
  const submit = () => {
    setError("");
    const parsed = pagePropertiesSchema.safeParse({
      properties: draft.map((row) => ({
        key: row.key,
        type: row.type,
        value: row.type === "number" ? (row.value.trim() ? Number(row.value) : undefined) : row.value,
        options: row.options
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean),
      })),
    });
    if (!parsed.success) return setError(parsed.error.issues[0]?.message ?? "Check the property values.");
    save.mutate(parsed.data.properties);
  };

  return (
    <ResponsiveDialog
      open
      title="Page properties"
      maxWidth="md"
      onClose={onClose}
      actions={
        <>
          <Button onClick={onClose}>{editable ? "Cancel" : "Close"}</Button>
          {editable && (
            <Button variant="contained" onClick={submit} disabled={save.isPending}>
              Save
            </Button>
          )}
        </>
      }
    >
      <Stack spacing={2}>
        {error && <Alert severity="error">{error}</Alert>}
        {draft.map((row) => {
          const options =
            row.type === "select"
              ? row.options
                  .split(",")
                  .map((x) => x.trim())
                  .filter(Boolean)
              : [...propertyStatuses];
          const isChoice = row.type === "status" || row.type === "select";
          return (
            <Stack key={row.id} direction={{ xs: "column", sm: "row" }} spacing={1}>
              <TextField
                label="Property"
                size="small"
                value={row.key}
                disabled={!editable}
                onChange={(e) => patch(row.id, { key: e.target.value })}
              />
              <TextField
                select
                label="Type"
                size="small"
                value={row.type}
                disabled={!editable}
                sx={{ minWidth: 110 }}
                onChange={(e) => patch(row.id, { type: e.target.value as Draft["type"], value: "" })}
              >
                {propertyTypes.map((type) => (
                  <MenuItem key={type} value={type}>
                    {type}
                  </MenuItem>
                ))}
              </TextField>
              {row.type === "select" && (
                <TextField
                  label="Options"
                  helperText="Separate choices with commas"
                  size="small"
                  disabled={!editable}
                  value={row.options}
                  onChange={(e) => patch(row.id, { options: e.target.value, value: "" })}
                />
              )}
              <TextField
                label="Value"
                size="small"
                disabled={!editable}
                select={isChoice}
                sx={{ minWidth: 140, flex: 1 }}
                type={row.type === "number" ? "number" : row.type === "date" ? "date" : "text"}
                slotProps={row.type === "date" ? { inputLabel: { shrink: true } } : undefined}
                value={row.value}
                onChange={(e) => patch(row.id, { value: e.target.value })}
              >
                {isChoice &&
                  [...new Set(options)].map((value) => (
                    <MenuItem key={value} value={value}>
                      {value}
                    </MenuItem>
                  ))}
              </TextField>
              {editable && (
                <IconButton
                  aria-label={`Remove ${row.key || "property"}`}
                  onClick={() => setDraft((rows) => rows.filter((item) => item.id !== row.id))}
                >
                  <DeleteOutlineIcon />
                </IconButton>
              )}
            </Stack>
          );
        })}
        {editable && (
          <Button sx={{ alignSelf: "start" }} onClick={add} disabled={draft.length >= 30}>
            Add property
          </Button>
        )}
      </Stack>
    </ResponsiveDialog>
  );
}
