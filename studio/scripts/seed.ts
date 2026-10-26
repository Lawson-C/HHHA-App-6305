/**
 * Loads the app's demo content (src/lib/api/mock-data.ts) into the dataset so a fresh
 * project has something to show. Idempotent: skips documents whose type + title already exist.
 * Never overwrites staff edits.
 *
 *   npm run seed        (runs `sanity exec scripts/seed.ts --with-user-token`)
 */
import {getCliClient} from 'sanity/cli'

import * as demo from '../../src/lib/api/mock-data'

const client = getCliClient({apiVersion: '2026-10-19'})

const key = () => Math.random().toString(36).slice(2, 12)

/** The small Markdown subset used by demo articles → Portable Text blocks. */
function toPortableText(markdown: string | null) {
  if (!markdown) return undefined
  const blocks: unknown[] = []
  const span = (text: string) => ({_type: 'span', _key: key(), text, marks: []})
  for (const chunk of markdown.split(/\n{2,}/).map((c) => c.trim()).filter(Boolean)) {
    if (chunk.startsWith('## ')) {
      blocks.push({_type: 'block', _key: key(), style: 'h2', markDefs: [], children: [span(chunk.slice(3))]})
      continue
    }
    const lines = chunk.split('\n')
    if (lines.every((l) => /^[-*] /.test(l))) {
      for (const l of lines) {
        blocks.push({
          _type: 'block', _key: key(), style: 'normal', listItem: 'bullet', level: 1,
          markDefs: [], children: [span(l.slice(2))],
        })
      }
      continue
    }
    blocks.push({_type: 'block', _key: key(), style: 'normal', markDefs: [], children: [span(chunk)]})
  }
  return blocks
}

const docs: {_type: string; title?: string; [k: string]: unknown}[] = [
  ...demo.alerts.map(({documentId: _, ...a}) => ({_type: 'alert', ...a})),
  ...demo.events.map(({documentId: _, hasReminder: __, reminderId: ___, ...e}) => ({
    _type: 'event',
    ...e,
  })),
  ...demo.housingResources.map(({documentId: _, ...h}) => ({
    _type: 'housingProgram',
    ...h,
    highlights: h.highlights.map((x) => ({_type: 'highlight', _key: key(), ...x})),
  })),
  ...demo.housingListings.map(({documentId: _, imageUrl: __, ...l}) => ({_type: 'housingListing', ...l})),
  ...demo.libraryResources.map(({documentId: _, body, ...r}) => ({
    _type: 'libraryResource',
    ...r,
    body: toPortableText(body),
  })),
]

async function main() {
  let created = 0
  let skipped = 0
  const tx = client.transaction()
  for (const doc of docs) {
    // Drop nulls so optional fields are simply absent.
    const clean = Object.fromEntries(Object.entries(doc).filter(([, v]) => v !== null && v !== undefined))
    const exists = await client.fetch<number>('count(*[_type == $type && title == $title])', {
      type: doc._type,
      title: doc.title,
    })
    if (exists) {
      skipped++
      continue
    }
    tx.create(clean as {_type: string})
    created++
  }
  // The app-text singleton is created empty-but-present so staff can find it; the app falls
  // back to built-in wording for empty fields.
  tx.createIfNotExists({_id: 'appCopy', _type: 'appCopy'})
  await tx.commit()
  console.log(`Seed done: created ${created}, skipped ${skipped} existing.`)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
