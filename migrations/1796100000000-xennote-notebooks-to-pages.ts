// Expand XenNote notebooks in place. Originals are held for the contract migration so rollback can
// restore their exact stored shape. Page IDs and file source refs stay stable throughout.
import type { Connection } from "mongoose";
import { ObjectId } from "mongodb";
import { generateKeyBetween } from "fractional-indexing";
import { noteToDoc } from "../src/shared/xennote/convert/v1/noteToDoc";
import type { NoteToDocInput } from "../src/shared/xennote/convert/v1/noteToDoc";
import { deriveFromDoc } from "../src/shared/xennote/deriveFromDoc";
import { normalizeTitle } from "../src/shared/xennote/wikiLinks";
import { normalizeTag } from "../src/shared/xennote/pages";

interface LegacyNote extends NoteToDocInput {
  _id: ObjectId;
  notebook_id: ObjectId;
  owner_id: string;
  title?: string;
  color?: string;
  pinned?: boolean;
  archived?: boolean;
  labels?: string[];
  share?: { enabled?: boolean; token?: string };
  members?: Array<{ user_id: string; role: string }>;
  reminders?: unknown[];
  deleted_at?: Date | null;
  deleted_by?: string | null;
  created_at?: Date;
  updated_at?: Date;
  updated_by?: string;
  images?: { file_id?: ObjectId; gcs_path?: string }[];
}

interface Notebook {
  _id: ObjectId;
  created_at?: Date;
  members?: Array<{ user_id: string; role: string }>;
  notes_migration_section_id?: ObjectId;
  pages_migrated_at?: Date | null;
}

interface LegacyVersion extends NoteToDocInput {
  _id: ObjectId;
  note_id: ObjectId;
  title?: string;
  at: Date;
  by?: string | null;
  captured_at: Date;
}

const stamp = "notebook-pages";

export async function up(connection: Connection): Promise<void> {
  const books = connection.collection<Notebook>("xennotebooks");
  const notes = connection.collection<LegacyNote>("xennotes");
  const backups = connection.collection<LegacyNote>("xennotes_premigration");
  const sections = connection.collection("xennotesections");
  const pages = connection.collection("xennotepages");
  const bodies = connection.collection("xennotepagebodies");
  const oldVersions = connection.collection<LegacyVersion>("xennoteversions");
  const versions = connection.collection("xennotepageversions");
  const files = connection.collection("filerecords");

  await backups.createIndex({ notebook_id: 1, pinned: -1, updated_at: -1, _id: 1 });

  for await (const book of books.find({ pages_migrated_at: null })) {
    let sectionId = book.notes_migration_section_id;
    if (!sectionId) {
      sectionId = new ObjectId();
      await books.updateOne({ _id: book._id }, { $set: { notes_migration_section_id: sectionId } });
    }

    const date = book.created_at ?? book._id.getTimestamp();
    const last = await sections.findOne({ notebook_id: book._id }, { sort: { order: -1 } });
    await sections.updateOne(
      { _id: sectionId },
      {
        $setOnInsert: {
          notebook_id: book._id,
          name: "Notes",
          color: "default",
          kind: "normal",
          order: generateKeyBetween(last?.order ?? null, null),
          created_at: date,
          updated_at: date,
        },
      },
      { upsert: true },
    );

    // Snapshot the notebook first so title resolution and ordering are identical after an interrupted run.
    for await (const note of notes.find({ notebook_id: book._id })) {
      await backups.updateOne({ _id: note._id }, { $setOnInsert: note }, { upsert: true });
    }
    const ordered = () => backups.find({ notebook_id: book._id }).sort({ pinned: -1, updated_at: -1, _id: 1 });
    const byTitle = new Map<string, string>();
    for await (const note of ordered().project<LegacyNote>({ title: 1, deleted_at: 1, archived: 1 })) {
      const title = normalizeTitle(note.title ?? "");
      if (title && !note.deleted_at && !note.archived && !byTitle.has(title)) byTitle.set(title, String(note._id));
    }
    const options = { resolveTitle: (title: string) => byTitle.get(normalizeTitle(title)) ?? null };
    let order: string | null = null;
    for await (const note of ordered()) {
      order = generateKeyBetween(order, null);
      const id = note._id;
      const created = note.created_at ?? id.getTimestamp();
      const updated = note.updated_at ?? created;
      if (note.images?.some((image) => image.gcs_path && !image.file_id)) {
        throw new Error(`XenNote ${id} still has a photo without a file record`);
      }
      const ids = (note.images ?? []).flatMap((image) => (image.file_id ? [image.file_id] : []));
      const allowed = await files
        .find({ _id: { $in: ids }, "space.app": "xennote", "space.ref": String(id) })
        .project({ _id: 1 })
        .toArray();
      const allowedIds = new Set(allowed.map((file) => String(file._id)));
      const doc = noteToDoc(
        { ...note, images: note.images?.filter((image) => allowedIds.has(String(image.file_id))) },
        options,
      );
      const derived = deriveFromDoc(doc);
      const tags = [...new Set((note.labels ?? []).map(normalizeTag).filter(Boolean))];
      const prior = await pages.findOne({ _id: id }, { projection: { migrated_from_note: 1 } });
      if (prior && !prior.migrated_from_note) throw new Error(`XenNote page ID ${id} is already in use`);

      await pages.updateOne(
        { _id: id },
        {
          $setOnInsert: {
            migrated_from_note: true,
            notebook_id: book._id,
            section_id: sectionId,
            parent_id: null,
            order,
            title: note.title ?? "",
            color: note.color ?? "default",
            archived: note.archived ?? false,
            members: note.members ?? [],
            share: note.share ?? { enabled: false },
            reminders: note.reminders ?? [],
            favorited_by: note.pinned ? [note.owner_id] : [],
            aliases: [],
            tags_manual: tags,
            tags_inline: derived.tags,
            ...derived,
            tags: [...new Set([...tags, ...derived.tags])].slice(0, 50),
            links: derived.links.map((link) => new ObjectId(link)),
            files: derived.files.map((file) => new ObjectId(file)),
            rev: 0,
            created_by: note.owner_id,
            updated_by: note.updated_by ?? note.owner_id,
            created_at: created,
            updated_at: updated,
            deleted_at: note.deleted_at ?? null,
            deleted_by: note.deleted_by ?? null,
          },
        },
        { upsert: true },
      );
      await bodies.updateOne(
        { page_id: id },
        {
          $setOnInsert: {
            page_id: id,
            doc,
            rev: 0,
            schema_version: 1,
            updated_at: updated,
          },
        },
        { upsert: true },
      );

      for await (const version of oldVersions.find({ note_id: id }).sort({ captured_at: -1 }).limit(20)) {
        await versions.updateOne(
          { _id: version._id },
          {
            $setOnInsert: {
              page_id: id,
              at: version.at,
              by: version.by ?? null,
              title: version.title ?? "",
              doc: noteToDoc(version, options),
              files: [],
              captured_at: version.captured_at,
              migrated_from_note: true,
            },
          },
          { upsert: true },
        );
      }
      await notes.deleteOne({ _id: id, notebook_id: book._id });
    }
    await books.updateOne({ _id: book._id }, { $set: { pages_migrated_at: new Date() } });
  }
  await connection
    .collection("xennote_migration_state")
    .updateOne({ name: stamp }, { $set: { active: true } }, { upsert: true });
}

export async function down(connection: Connection): Promise<void> {
  const books = connection.collection<Notebook>("xennotebooks");
  const notes = connection.collection<LegacyNote>("xennotes");
  const backups = connection.collection<LegacyNote>("xennotes_premigration");
  const sections = connection.collection("xennotesections");
  const pages = connection.collection("xennotepages");
  const bodies = connection.collection("xennotepagebodies");
  const versions = connection.collection("xennotepageversions");

  // A rollback can be retried without reintroducing stale legacy rows or removing unrelated notebook pages.
  for await (const book of books.find({ notes_migration_section_id: { $exists: true } })) {
    const sectionId = book.notes_migration_section_id;
    for await (const note of backups.find({ notebook_id: book._id })) {
      const migrated = await pages.findOne({ _id: note._id, migrated_from_note: true });
      if (migrated) {
        const body = await bodies.findOne({ page_id: note._id });
        const archive = connection.collection("xennote_pages_rollback");
        const batch = new ObjectId();
        await archive.insertOne({ batch, page: migrated, body, at: new Date() });
        for await (const version of versions.find({ page_id: note._id })) {
          await archive.insertOne({ batch, version });
        }
        await pages.updateMany({ parent_id: note._id }, { $set: { parent_id: null } });
        await versions.deleteMany({ page_id: note._id });
        await bodies.deleteOne({ page_id: note._id });
        await pages.deleteOne({ _id: note._id, migrated_from_note: true });
      }
      await notes.updateOne({ _id: note._id }, { $setOnInsert: note }, { upsert: true });
      await backups.deleteOne({ _id: note._id });
    }
    if (!(await pages.findOne({ section_id: sectionId }))) await sections.deleteOne({ _id: sectionId });
    await books.updateOne({ _id: book._id }, { $unset: { notes_migration_section_id: "", pages_migrated_at: "" } });
  }
  await connection.collection("xennote_migration_state").deleteOne({ name: stamp });
}
